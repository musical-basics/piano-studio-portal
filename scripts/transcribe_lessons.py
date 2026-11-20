#!/usr/bin/env python3
"""Overnight lesson transcripts on the Mac (Lionel's #953), searched in admin (#954).

Every lesson recording in Dropbox ("/Lesson Recordings/<student folder>/...")
gets a plain-text transcript, made locally and free with whisper.cpp (Homebrew
"whisper.cpp", the ggml small.en model) and saved next to the recording:

    "<video name> - transcript.txt"     next to a "YYYY-MM-DD - Lesson.mp4"
                                        or a classroom copy
    "transcript.txt"                    inside a Zoom meeting folder

with a [mm:ss] stamp per line. The same lines go into the database
(lesson_transcripts, supabase/migrations/20261119100000_lesson_transcripts.sql),
which the admin search reads (Recordings tab).

One recording is transcribed ONCE: a Zoom meeting folder is one recording (its
audio_only .m4a is what gets heard, the shared-screen .mp4 is what plays), the
same file in two formats is one recording (the smaller is heard), and copies
of the same file (same Dropbox content_hash) are one recording. Recordings
under 5 minutes are no-shows and are skipped, as everywhere in the studio.

A night's run (launchd, scripts/install_transcribe_agent.sh) starts at 1:30am,
newest recordings first, one at a time: download to a private temp folder,
ffmpeg to 16 kHz mono, whisper (Metal, 4 threads, lowest priority), upload the
transcript, store the row, delete the temp files. It starts no new recording
after 5:50am and stops at 6:00am (the Mac's clock, which is on Eastern). If the
Mac was asleep at 1:30am, launchd starts it on wake; past 6am it does nothing
until the next night. Only one run at a time (a lock file). Each run records
itself on cron_heartbeats 'lesson-transcripts' for /admin/jobs. A recording
that fails 3 nights running is left alone (transcribe-skips.json) and named in
the jobs page detail.

Secrets: the environment, then the login Keychain (service 'studio-backup',
put there by install_backup_agent.sh / install_transcribe_agent.sh), then the
repo's .env.local. launchd runs a COPY of this file outside ~/Documents (macOS
denies launchd agents reads there); re-run scripts/install_transcribe_agent.sh
after editing it.

    python3 scripts/transcribe_lessons.py                 # a night's run (outside 1:30-6am: nothing)
    python3 scripts/transcribe_lessons.py --plan          # what is left; transcribes nothing
    python3 scripts/transcribe_lessons.py --only "<dropbox path>" [--only ...]
        # just these recordings (a media file or a meeting folder), any time of day
    python3 scripts/transcribe_lessons.py --anytime --limit 2   # the next 2, any time of day
"""
import collections
import datetime
import fcntl
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

ROOT = pathlib.Path(__file__).resolve().parent.parent
SUPABASE_URL = "https://glexdzzmdkqpfbqqffyw.supabase.co"
RECORDINGS_ROOT = "/Lesson Recordings"
STUDIO_TZ = ZoneInfo("America/New_York")

HOME_DIR = pathlib.Path(os.environ.get("STUDIO_TRANSCRIBE_DIR")
                        or pathlib.Path.home() / "Library" / "Application Support" / "studio-manager")
MODEL = HOME_DIR / "models" / "ggml-small.en.bin"
MODEL_NAME = "whisper.cpp small.en"
WORK = HOME_DIR / "transcribe-tmp"
SKIPS = HOME_DIR / "transcribe-skips.json"
LOCK = HOME_DIR / "transcribe.lock"

BREW = pathlib.Path("/opt/homebrew/bin")
WHISPER = BREW / "whisper-cli"
FFMPEG = BREW / "ffmpeg"
FFPROBE = BREW / "ffprobe"
THREADS = int(os.environ.get("TRANSCRIBE_THREADS") or 4)

NIGHT_START = datetime.time(1, 30)
NIGHT_END = datetime.time(6, 0)
LAST_START_MINUTES = 10  # no new recording in the last 10 minutes before the end

MIN_SECONDS = 5 * 60          # under 5 minutes = a no-show, ignored everywhere in the studio
MIN_AUDIO_BYTES = 3_000_000   # Zoom's audio_only.m4a runs about 0.75 MB a minute
MIN_VIDEO_BYTES = 20_000_000  # a video under 20 MB is never a real lesson
MAX_TRIES = 3

AUDIO_EXTS = (".m4a", ".mp3", ".wav", ".aac")
VIDEO_EXTS = (".mp4", ".mov", ".m4v", ".webm", ".mkv")
HEARTBEAT_JOB = "lesson-transcripts"
RECORDING = {"on": True}  # off for --plan and --only: only real runs show on /admin/jobs


def log(msg):
    print(f"{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')} {msg}", flush=True)


# ---------------------------------------------------------------- secrets ---
# Same lookup as scripts/backup_studio_db.py (copied, not imported, so this
# agent runs on its own).

KEYCHAIN_SERVICE = "studio-backup"
_secrets = {}


def env_file_value(name):
    for fname in (".env.local", ".env"):
        f = ROOT / fname
        try:
            lines = f.read_text().splitlines()
        except OSError:
            continue
        for line in lines:
            if line.startswith(f"{name}="):
                v = line.split("=", 1)[1].strip()
                if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
                    v = v[1:-1]
                return v
    return None


def keychain_secret(name):
    try:
        r = subprocess.run(["/usr/bin/security", "find-generic-password", "-s", KEYCHAIN_SERVICE,
                            "-a", name, "-w"], capture_output=True, text=True, timeout=30)
        return r.stdout.strip() if r.returncode == 0 else None
    except Exception:
        return None


def secret(name):
    if name not in _secrets:
        _secrets[name] = ((os.environ.get(name) or "").strip() or keychain_secret(name)
                          or env_file_value(name))
    if not _secrets[name]:
        raise RuntimeError(f"{name} is missing from the Keychain (service {KEYCHAIN_SERVICE}); "
                           f"re-run scripts/install_transcribe_agent.sh")
    return _secrets[name]


# ------------------------------------------------------------- database ---

def http_json(url, *, data=None, headers=None, method=None, timeout=60):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        body = res.read()
        return json.loads(body) if body.strip() else None


def rest(path, params=None, *, body=None, method=None, prefer=None, extra=None, timeout=60):
    """PostgREST with the service key. Retries network trouble and 5xx."""
    key = secret("SUPABASE_SERVICE_KEY")
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, safe=",.()*:")
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    headers.update(extra or {})
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(4):
        try:
            return http_json(url, data=data, headers=headers, method=method, timeout=timeout)
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")[:300]
            if e.code >= 500 and attempt < 3:
                time.sleep(2 ** (attempt + 1))
                continue
            raise RuntimeError(f"database: HTTP {e.code} {detail}") from None
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            if attempt < 3:
                time.sleep(2 ** (attempt + 1))
                continue
            raise RuntimeError(f"database: {e}") from None


def rest_all(path, params):
    rows, page = [], 1000
    while True:
        got = rest(path, params, extra={"Range-Unit": "items", "Range": f"{len(rows)}-{len(rows) + page - 1}"})
        rows += got or []
        if not got or len(got) < page:
            return rows


def record_run(ok, detail):
    """Stamps cron_heartbeats 'lesson-transcripts' (when, whether it worked, one
    line) for /admin/jobs. Never raises."""
    if not RECORDING["on"]:
        log(f"(not recorded for the jobs page) {'ok' if ok else 'FAILED'}: {detail}")
        return
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    row = {"job": HEARTBEAT_JOB, "last_finished_at": now, "last_ok": ok, "last_detail": detail[:500]}
    if ok:
        row["last_run_at"] = now
    try:
        rest("cron_heartbeats", {"on_conflict": "job"}, body=[row], method="POST",
             prefer="resolution=merge-duplicates,return=minimal")
        log(f"recorded for the jobs page: {'ok' if ok else 'FAILED'}: {detail}")
    except Exception as e:
        log(f"WARNING: run not recorded for the jobs page ({e})")


# ---------------------------------------------------------------- dropbox ---

class DropboxAuthError(RuntimeError):
    """Dropbox refused our sign-in, not the recording: stops the night's run
    without counting a try against any recording."""


class Dropbox:
    def __init__(self):
        self._refresh_body = urllib.parse.urlencode({
            "grant_type": "refresh_token", "refresh_token": secret("DROPBOX_REFRESH_TOKEN"),
            "client_id": secret("DROPBOX_CLIENT_ID"), "client_secret": secret("DROPBOX_CLIENT_SECRET"),
        }).encode()
        self._refresh()

    def _refresh(self):
        """A fresh short-lived access token. Dropbox's last about 4 hours and a
        night's run is up to 4.5, so _call renews it on a 401 (2026-11-20: the
        token ran out at 5:36am and the other 354 recordings all failed)."""
        try:
            self.token = http_json("https://api.dropboxapi.com/oauth2/token", data=self._refresh_body, timeout=30,
                                   headers={"Content-Type": "application/x-www-form-urlencoded"})["access_token"]
        except urllib.error.HTTPError as e:
            raise DropboxAuthError(f"Dropbox refused the refresh token (HTTP {e.code})") from None

    def _call(self, url, data, headers, timeout=300, sink=None):
        """Retries rate limits (429) and 5xx, and renews the access token once on
        a 401. With sink (a path), the body is a download written there and the
        file's metadata is returned."""
        renewed = False
        for attempt in range(5):
            req = urllib.request.Request(url, data=data, headers={"Authorization": f"Bearer {self.token}", **headers})
            try:
                with urllib.request.urlopen(req, timeout=timeout) as res:
                    if sink is not None:
                        with open(sink, "wb") as f:
                            shutil.copyfileobj(res, f, 1 << 20)
                        return json.loads(res.headers.get("Dropbox-API-Result") or "null")
                    return json.loads(res.read() or b"null")
            except urllib.error.HTTPError as e:
                detail = e.read().decode(errors="replace")[:200]
                if e.code == 401:
                    if not renewed:
                        renewed = True
                        self._refresh()
                        continue
                    raise DropboxAuthError(f"Dropbox: HTTP 401 after a fresh token: {detail}") from None
                if (e.code == 429 or e.code >= 500) and attempt < 4:
                    time.sleep(min(60, int(float(e.headers.get("Retry-After") or 2 ** (attempt + 1)))))
                    continue
                raise RuntimeError(f"Dropbox: HTTP {e.code} {detail}") from None
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                if attempt < 4:
                    time.sleep(2 ** (attempt + 1))
                    continue
                raise RuntimeError(f"Dropbox: network: {e}") from None

    def rpc(self, endpoint, args):
        return self._call(f"https://api.dropboxapi.com/2/{endpoint}", json.dumps(args).encode(),
                          {"Content-Type": "application/json"}, timeout=60)

    def upload_bytes(self, data, dest):
        # ensure_ascii keeps the header ASCII, which Dropbox-API-Arg requires.
        return self._call("https://content.dropboxapi.com/2/files/upload", data, {
            "Content-Type": "application/octet-stream",
            "Dropbox-API-Arg": json.dumps({"path": dest, "mode": "overwrite", "mute": True}, ensure_ascii=True)})

    def download(self, path, dest):
        return self._call("https://content.dropboxapi.com/2/files/download", b"", {
            "Content-Type": "application/octet-stream",
            "Dropbox-API-Arg": json.dumps({"path": path}, ensure_ascii=True)}, timeout=600, sink=dest)

    def files(self, folder):
        """Every file entry under folder, recursively."""
        res = self.rpc("files/list_folder", {"path": folder, "recursive": True, "limit": 2000})
        entries = res["entries"]
        while res.get("has_more"):
            res = self.rpc("files/list_folder/continue", {"cursor": res["cursor"]})
            entries += res["entries"]
        return [e for e in entries if e.get(".tag") == "file"]


# --------------------------------------------------------------- planning ---

def ext_of(name):
    return os.path.splitext(name)[1].lower()


def stem_of(name):
    return os.path.splitext(name)[0]


# Zoom names one recording's files by kind; with the kind taken out, the audio
# and the video of the same part share a key ("audio_only_1" ~ "..._view_1").
KIND_RE = re.compile(r"\(?(audio_only|shared_screen_with_gallery_view|shared_screen_with_speaker_view|"
                     r"gallery_view|speaker_view|active_speaker)\)?|_gallery_\d+x\d+|_\d+x\d+", re.I)
COPY_MARK_RE = re.compile(r" \(\d+\)(\.[^.]+)?$")


def part_key(name):
    return KIND_RE.sub("", stem_of(name)).strip().lower()


def best_video(src, videos, parts):
    """The video to play for the audio src: the same part, gallery view first.
    A meeting recorded in several parts may have no video for this one: then
    nothing (the audio plays), never another part's video (wrong times)."""
    key = part_key(src["name"])
    same = [v for v in videos if part_key(v["name"]) == key] or (videos if parts == 1 else [])
    if not same:
        return None
    return sorted(same, key=lambda v: ("gallery" not in v["name"].lower(), ext_of(v["name"]) != ".mp4",
                                       -v["size"]))[0]


def parse_when(text):
    """(studio date, aware start time or None) from a recording's file or folder name."""
    # Zoom stamps these in UTC: "GMT20260416-235958", "2025-09-22 23.30.07 GMT",
    # "2026_04_16_23:59:58" (its newer names), and the old classroom's
    # "..._2026-03-13T00-34-55-911Z_part5".
    m = re.search(r"GMT(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})", text)
    if not m:
        m = re.search(r"(\d{4})-(\d{2})-(\d{2})[ T](\d{2})[.:-](\d{2})[.:-](\d{2})(?:-\d+Z| GMT)", text)
    if not m:
        m = re.search(r"(\d{4})_(\d{2})_(\d{2})_(\d{2}):(\d{2}):(\d{2})", text)
    if m:
        y, mo, d, h, mi, s = (int(x) for x in m.groups())
        try:
            at = datetime.datetime(y, mo, d, h, mi, s, tzinfo=datetime.timezone.utc).astimezone(STUDIO_TZ)
            return at.date(), at
        except ValueError:
            pass
    m = re.search(r"(\d{4})[-_](\d{2})[-_](\d{2})", text)
    if m:
        try:
            return datetime.date(*(int(x) for x in m.groups())), None
        except ValueError:
            pass
    return None, None


def make_unit(src, video, transcript, folder, context):
    names = " ".join(x for x in (context, src["name"]) if x)
    day, at = parse_when(src["name"])
    if not day and context:
        day, at = parse_when(context)
    if not day:
        modified = datetime.datetime.fromisoformat((src.get("client_modified") or src["server_modified"]).replace("Z", "+00:00"))
        day = modified.astimezone(STUDIO_TZ).date()
    return {
        "path": src["path_display"], "lower": src["path_lower"], "name": src["name"], "size": src["size"],
        "hash": src.get("content_hash"), "video": video["path_display"] if video else None,
        "video_name": video["name"] if video else None, "transcript": transcript, "folder": folder,
        "context": names, "day": day, "at": at, "modified": src.get("client_modified") or "",
        "audio": ext_of(src["name"]) in AUDIO_EXTS,
    }


def plan(entries):
    """Every recording under RECORDINGS_ROOT, once each, newest first."""
    by_parent = collections.defaultdict(list)
    for e in entries:
        parts = e["path_display"].split("/")
        if len(parts) < 4 or ext_of(e["name"]) not in AUDIO_EXTS + VIDEO_EXTS:
            continue  # not inside a student folder, or not a recording
        by_parent[e["path_display"].rsplit("/", 1)[0]].append(e)

    units, meeting_videos = [], set()
    for parent, fs in by_parent.items():
        parts = parent.split("/")
        folder = parts[2]
        context = parts[-1] if len(parts) > 3 else ""
        audios = [f for f in fs if ext_of(f["name"]) in AUDIO_EXTS]
        videos = [f for f in fs if ext_of(f["name"]) in VIDEO_EXTS]
        if len(parts) > 3 and audios:
            # A Zoom meeting folder: one recording, heard from its biggest audio part.
            src = max(audios, key=lambda f: f["size"])
            name = "transcript.txt" if len(audios) == 1 else f"{stem_of(src['name'])} - transcript.txt"
            units.append(make_unit(src, best_video(src, videos, len(audios)), f"{parent}/{name}", folder, context))
            meeting_videos.update(v.get("content_hash") for v in videos)
            continue
        by_stem = collections.defaultdict(list)
        for f in fs:
            by_stem[stem_of(f["name"]).lower()].append(f)
        for group in by_stem.values():
            src = min(group, key=lambda f: f["size"])
            vids = sorted((g for g in group if ext_of(g["name"]) in VIDEO_EXTS),
                          key=lambda g: ext_of(g["name"]) != ".mp4")
            units.append(make_unit(src, vids[0] if vids else None,
                                   f"{parent}/{stem_of(src['name'])} - transcript.txt", folder, context))

    # Copies of one file are one recording: keep the plainest name. A loose
    # video that is also in a meeting folder belongs to that meeting.
    by_hash = collections.defaultdict(list)
    for u in units:
        by_hash[u["hash"] or u["lower"]].append(u)
    meeting_videos.discard(None)
    kept = []
    for group in by_hash.values():
        group.sort(key=lambda u: (bool(COPY_MARK_RE.search(u["name"])), len(u["path"]), u["path"]))
        u = group[0]
        if not u["audio"] and u["hash"] in meeting_videos:
            continue
        u["copies"] = [c["lower"] for c in group[1:]]
        kept.append(u)
    kept.sort(key=lambda u: (u["day"], u["at"].isoformat() if u["at"] else "", u["modified"]), reverse=True)
    return kept


def too_small(u):
    return u["size"] < (MIN_AUDIO_BYTES if u["audio"] else MIN_VIDEO_BYTES)


# ---------------------------------------------------------------- lessons ---

class Lessons:
    """Which student and which lesson a recording belongs to."""

    def __init__(self):
        self.by_folder = collections.defaultdict(list)
        for p in rest_all("profiles", {"select": "id,dropbox_recording_folder",
                                       "dropbox_recording_folder": "not.is.null"}):
            self.by_folder[p["dropbox_recording_folder"].strip().lower()].append(p["id"])
        self.copy_urls = {}
        for c in rest_all("classroom_recording_dropbox_copies", {"select": "dropbox_path,url",
                                                                 "dropbox_path": "not.is.null"}):
            self.copy_urls[c["dropbox_path"].lower()] = c["url"]
        self._lessons = {}

    def lessons_of(self, student_id):
        if student_id not in self._lessons:
            self._lessons[student_id] = rest_all("lessons", {
                "select": "id,student_id,date,time,video_url,zoom_meeting_id,status",
                "student_id": f"eq.{student_id}", "order": "date.asc,time.asc"})
        return self._lessons[student_id]

    def match(self, u):
        """(student_id, lesson row or None) for the unit."""
        ids = self.by_folder.get(u["folder"].strip().lower(), [])
        lessons = [l for sid in ids for l in self.lessons_of(sid)]
        lesson = self._match_lesson(u, lessons)
        student = lesson["student_id"] if lesson else (ids[0] if len(ids) == 1 else None)
        return student, lesson

    def _match_lesson(self, u, lessons):
        if not lessons:
            return None
        flat = lambda s: re.sub(r"\s+", "", s or "").lower()
        names = {flat(n) for n in (u["name"], u["video_name"]) if n}
        copy_url = self.copy_urls.get((u["video"] or u["path"]).lower())
        for l in lessons:
            v = l.get("video_url") or ""
            last = urllib.parse.unquote(v.split("?")[0].rsplit("/", 1)[-1]).lower()
            if (copy_url and v == copy_url) or (last and last in names):
                return l

        def start(l):
            try:
                t = (l.get("time") or "00:00:00")[:8]
                return datetime.datetime.fromisoformat(f"{l['date']}T{t}").replace(tzinfo=STUDIO_TZ)
            except ValueError:
                return None

        if u["at"]:
            near = [(abs((start(l) - u["at"]).total_seconds()), l) for l in lessons if start(l)]
            near = [x for x in near if x[0] <= 3 * 3600]
            if near:
                return min(near, key=lambda x: x[0])[1]
        day = u["day"]
        near = [l for l in lessons if abs((datetime.date.fromisoformat(l["date"]) - day).days) <= 1]
        meeting_ids = set(re.findall(r"(?<!\d)(\d{9,11})(?!\d)", u["context"]))
        if meeting_ids:
            same = [l for l in near if re.sub(r"\D", "", l.get("zoom_meeting_id") or "") in meeting_ids]
            near = same or near
        # Same day first, then the day before (Zoom names files by the UTC day), then the day after.
        rank = {0: 0, -1: 1, 1: 2}
        near.sort(key=lambda l: (rank[(datetime.date.fromisoformat(l["date"]) - day).days],
                                 l.get("status") != "completed", l.get("time") or ""))
        return near[0] if near else None


# ----------------------------------------------------------- transcribing ---

def run(cmd, timeout):
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError(f"{pathlib.Path(cmd[0]).name} failed ({r.returncode}): {(r.stderr or r.stdout).strip()[-300:]}")
    return r.stdout


def media_seconds(path):
    out = run([str(FFPROBE), "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], 120)
    try:
        return float(out.strip().splitlines()[0])
    except (ValueError, IndexError):
        raise RuntimeError(f"ffprobe could not read the length of {path.name}") from None


# Whisper fills music with these; a lesson has a lot of music.
NOISE_RE = re.compile(r"^\W*(you|thank you|thanks for watching|bye|okay)?\W*$", re.I)
BRACKETS_RE = re.compile(r"[\[\(][^\]\)]*[\]\)]|\*[^*]*\*|♪+")


def clean_segments(raw):
    out = []
    for s in raw:
        t = re.sub(r"\s+", " ", BRACKETS_RE.sub("", s.get("text") or "")).strip()
        if not t or NOISE_RE.match(t):
            continue
        start = round(s["offsets"]["from"] / 1000, 1)
        end = round(s["offsets"]["to"] / 1000, 1)
        if out and t.lower() == out[-1]["t"].lower():
            out[-1]["e"] = end  # a repeat loop: keep the line once
            continue
        out.append({"s": start, "e": end, "t": t})
    return out


def stamp(seconds):
    seconds = int(seconds)
    return f"{seconds // 60:02d}:{seconds % 60:02d}"


def render(u, segments, seconds):
    head = [
        f"Lesson transcript ({stamp(seconds)}), made on the studio Mac with {MODEL_NAME} "
        f"on {datetime.date.today().isoformat()}.",
        f"Heard from: {u['name']}",
        "Times are from the start of the recording. Music is left out and words can be misheard.",
        "",
    ]
    lines = [f"[{stamp(s['s'])}] {s['t']}" for s in segments] or ["(no speech found)"]
    return "\n".join(head + lines) + "\n"


def transcribe(dbx, u, work):
    """Downloads, converts and transcribes u. Returns (segments, seconds, timings)
    or None when it is too short to be a lesson."""
    timings = {}
    src = work / f"media{ext_of(u['name'])}"
    t = time.time()
    dbx.download(u["path"], src)
    timings["download"] = time.time() - t
    wav = work / "audio.wav"
    t = time.time()
    run([str(FFMPEG), "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
         "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(wav)], timeout=3600)
    src.unlink()
    timings["ffmpeg"] = time.time() - t
    # The sound's own length, not the file header's: some classroom files carry
    # 40 minutes of picture over a minute and a half of sound.
    seconds = media_seconds(wav)
    if seconds < MIN_SECONDS:
        return None, seconds, timings
    t = time.time()
    # Tested on a real lesson (2026-11-19): greedy decoding (-bs 1) with no text
    # carried between windows (-mc 0) heard the most words, with punctuation,
    # at about 60x real time. Beam search turned music into endless "."; with
    # context carried, whisper dropped most of what was said after the first
    # long stretch of piano; Silero VAD was 10x slower and heard less. -sns
    # drops non-speech tokens. Metal is used by default.
    run([str(WHISPER), "-m", str(MODEL), "-f", str(wav), "-l", "en", "-t", str(THREADS),
         "-bs", "1", "-bo", "1", "-mc", "0", "-sns", "-np", "-oj", "-of", str(work / "whisper")],
        timeout=int(seconds) + 900)
    timings["whisper"] = time.time() - t
    raw = json.loads((work / "whisper.json").read_text(errors="replace"))["transcription"]
    return clean_segments(raw), seconds, timings


def save(dbx, u, segments, seconds, student_id, lesson, took):
    dbx.upload_bytes(render(u, segments, seconds).encode("utf-8"), u["transcript"])
    row = {
        "dropbox_path": u["path"], "video_path": u["video"], "transcript_path": u["transcript"],
        "content_hash": u["hash"], "student_folder": u["folder"], "student_id": student_id,
        "recorded_on": lesson["date"] if lesson else u["day"].isoformat(),
        "lesson_id": lesson["id"] if lesson else None, "duration_seconds": int(round(seconds)),
        "segments": segments, "model": MODEL_NAME, "transcribe_seconds": int(round(took)),
    }
    rest("lesson_transcripts", {"on_conflict": "dropbox_path"}, body=[row], method="POST",
         prefer="resolution=merge-duplicates,return=minimal", timeout=120)


def load_skips():
    try:
        return json.loads(SKIPS.read_text())
    except (OSError, ValueError):
        return {}


def save_skips(skips):
    tmp = SKIPS.with_suffix(".tmp")
    tmp.write_text(json.dumps(skips, indent=1, sort_keys=True))
    tmp.replace(SKIPS)


def hours(seconds):
    return f"{seconds / 3600:.1f} h"


def fmt_secs(s):
    s = int(s)
    return f"{s // 60}m{s % 60:02d}s" if s >= 60 else f"{s}s"


# ------------------------------------------------------------------- main ---

def window_deadline(args, now):
    """When to stop starting new recordings, or None if this is not the time."""
    if args.anytime or args.only:
        return now + datetime.timedelta(hours=args.hours) if args.hours else None
    start = datetime.datetime.combine(now.date(), NIGHT_START) - datetime.timedelta(minutes=5)
    end = datetime.datetime.combine(now.date(), NIGHT_END)
    if not (start <= now < end):
        return False
    return end - datetime.timedelta(minutes=LAST_START_MINUTES)


def parse_args(argv):
    import argparse
    p = argparse.ArgumentParser(description="Overnight lesson transcripts (#953)")
    p.add_argument("--plan", action="store_true", help="say what is left, transcribe nothing")
    p.add_argument("--only", action="append", default=[], help="a Dropbox media path or meeting folder (repeatable)")
    p.add_argument("--anytime", action="store_true", help="ignore the 1:30-6am window")
    p.add_argument("--limit", type=int, default=0, help="at most this many recordings")
    p.add_argument("--hours", type=float, default=0, help="with --anytime: stop starting new ones after this long")
    return p.parse_args(argv)


def main(argv):
    args = parse_args(argv)
    RECORDING["on"] = not (args.plan or args.only)
    HOME_DIR.mkdir(parents=True, exist_ok=True)
    lock = open(LOCK, "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        log("another transcribe run is going; this one does nothing")
        return 0

    now = datetime.datetime.now()
    deadline = window_deadline(args, now)
    if deadline is False and not args.plan:
        log(f"started at {now:%H:%M}, outside the night window "
            f"({NIGHT_START:%H:%M}-{NIGHT_END:%H:%M}): nothing transcribed until the next night")
        record_run(True, f"Started at {now:%-I:%M%p}".replace("AM", "am").replace("PM", "pm")
                   + ", outside the 1:30-6am window (the Mac was likely asleep at 1:30am): nothing transcribed")
        return 0

    for tool in (WHISPER, FFMPEG, FFPROBE, MODEL):
        if not tool.exists() and not args.plan:
            raise RuntimeError(f"{tool} is missing; re-run scripts/install_transcribe_agent.sh")

    dbx = Dropbox()
    entries = dbx.files(RECORDINGS_ROOT)
    listed = {e["path_lower"] for e in entries}
    units = plan(entries)
    done_rows = rest_all("lesson_transcripts", {"select": "dropbox_path,content_hash,transcript_path"})
    done_paths = {r["dropbox_path"].lower() for r in done_rows}
    done_hashes = {r["content_hash"] for r in done_rows if r.get("content_hash")}
    skips = load_skips()

    def state(u):
        if u["lower"] in done_paths or (u["hash"] and u["hash"] in done_hashes) \
                or any(c in done_paths for c in u.get("copies", [])):
            return "done"
        if too_small(u) or skips.get(u["lower"], {}).get("reason") == "short":
            return "short"
        if skips.get(u["lower"], {}).get("tries", 0) >= MAX_TRIES:
            return "gave up"
        return "todo"

    if args.only:
        wanted = [o.rstrip("/").lower() for o in args.only]
        todo = [u for u in units if any(u["lower"] == w or u["lower"].startswith(w + "/") for w in wanted)]
        missing = [o for o, w in zip(args.only, wanted) if not any(u["lower"] == w or u["lower"].startswith(w + "/") for u in units)]
        if missing:
            raise RuntimeError(f"not a recording in {RECORDINGS_ROOT}: {', '.join(missing)}")
    else:
        todo = [u for u in units if state(u) == "todo"]

    counts = collections.Counter(state(u) for u in units)
    left_bytes = sum(u["size"] for u in todo)
    log(f"{len(units)} recordings in Dropbox: {counts['done']} transcribed, {counts['todo']} to do "
        f"({left_bytes / 1e9:.1f} GB to download), {counts['short']} under 5 minutes, {counts['gave up']} given up")

    if args.plan:
        for u in todo[:15]:
            log(f"  next: {u['day']}  {u['size'] / 1e6:7.1f} MB  {u['path'][len(RECORDINGS_ROOT) + 1:]}")
        return 0

    # A transcript row whose text file went missing from Dropbox: put it back (no whisper needed).
    repaired = 0
    by_lower = {u["lower"]: u for u in units}
    for r in done_rows:
        tp = r.get("transcript_path")
        u = by_lower.get(r["dropbox_path"].lower())
        if tp and u and tp.lower() not in listed:
            try:
                full = rest("lesson_transcripts", {"select": "segments,duration_seconds",
                                                   "dropbox_path": f"eq.{r['dropbox_path']}"})[0]
                dbx.upload_bytes(render(u, full["segments"], full["duration_seconds"] or 0).encode("utf-8"), tp)
                repaired += 1
            except Exception as e:
                log(f"WARNING: could not put back {tp}: {e}")
    if repaired:
        log(f"put back {repaired} transcript file(s) missing from Dropbox")

    lessons = Lessons()
    done = failed = short = 0
    auth_stop = None
    audio_secs = 0.0
    errors = []
    started = time.time()
    try:
        for u in todo:
            if args.limit and done + failed >= args.limit:
                break
            if deadline and datetime.datetime.now() >= deadline:
                log(f"{NIGHT_END:%H:%M} is close: no new recording started")
                break
            if too_small(u) and not args.only:
                continue
            shutil.rmtree(WORK, ignore_errors=True)
            WORK.mkdir(mode=0o700, parents=True)
            short_name = u["path"][len(RECORDINGS_ROOT) + 1:]
            log(f"transcribing {short_name} ({u['size'] / 1e6:.0f} MB)")
            t0 = time.time()
            try:
                segments, seconds, timings = transcribe(dbx, u, WORK)
                if segments is None:
                    skips[u["lower"]] = {"reason": "short", "seconds": round(seconds), "at": now.isoformat(timespec="seconds")}
                    save_skips(skips)
                    short += 1
                    log(f"  only {stamp(seconds)} of sound, under 5 minutes: skipped for good")
                    continue
                student_id, lesson = lessons.match(u)
                save(dbx, u, segments, seconds, student_id, lesson, time.time() - t0)
                skips.pop(u["lower"], None)
                save_skips(skips)
                done += 1
                audio_secs += seconds
                log(f"  done: {stamp(seconds)} of audio in {fmt_secs(time.time() - t0)} "
                    f"(download {fmt_secs(timings['download'])}, convert {fmt_secs(timings['ffmpeg'])}, "
                    f"whisper {fmt_secs(timings['whisper'])}), {len(segments)} lines, "
                    f"{'lesson ' + lesson['date'] if lesson else 'no lesson matched'} -> {u['transcript'][len(RECORDINGS_ROOT) + 1:]}")
            except DropboxAuthError as e:
                # Not this recording's fault: no try counted, the rest wait for the next night.
                auth_stop = str(e)
                log(f"  STOPPED: {e} (no try counted; the rest wait for the next night)")
                break
            except Exception as e:
                failed += 1
                entry = skips.get(u["lower"], {})
                skips[u["lower"]] = {"reason": "failed", "tries": entry.get("tries", 0) + 1,
                                     "error": str(e)[:300], "at": now.isoformat(timespec="seconds")}
                save_skips(skips)
                errors.append(f"{u['name']}: {e}")
                log(f"  FAILED (try {skips[u['lower']]['tries']} of {MAX_TRIES}): {e}")
    finally:
        shutil.rmtree(WORK, ignore_errors=True)

    left = max(0, len(todo) - done - short) if not args.only else counts["todo"] - done
    gave_up = sum(1 for v in skips.values() if v.get("reason") == "failed" and v.get("tries", 0) >= MAX_TRIES)
    parts = [f"{done} recording{'s' * (done != 1)} transcribed ({hours(audio_secs)} of audio in "
             f"{hours(time.time() - started)})" if done else "Nothing new transcribed",
             f"{left} left" if left else "all caught up"]
    if failed:
        parts.append(f"{failed} failed, first: {errors[0][:120]}")
    if gave_up:
        parts.append(f"{gave_up} given up after {MAX_TRIES} tries (transcribe-skips.json on the Mac)")
    if auth_stop:
        parts.append(f"stopped early: {auth_stop[:120]}")
    detail = ", ".join(parts)
    log(detail)
    bad = bool(auth_stop) or (failed and not done)
    record_run(not bad, detail)
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except SystemExit:
        raise
    except Exception as e:
        traceback.print_exc()
        record_run(False, f"{type(e).__name__}: {e}")
        sys.exit(1)
