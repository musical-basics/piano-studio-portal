#!/usr/bin/env python3
"""Today's lessons for Lionel's Personal Dashboard (his #1311, brief #1846).

Writes ~/.config/lionel-dashboard/studio/<YYYY-MM-DD>.json for the current
studio day (Eastern): how many lessons, when the first starts and the last ends,
teaching minutes, Zoom vs classroom, and each lesson's time and length. Numbers
and short labels only: never a family's name, email or link. The folder stays
on this Mac (never git, never the hub).

Runs from launchd (com.musicalbasics.studio-dashboard, scripts/install_dashboard_agent.sh)
soon after midnight Eastern and again at 7am, so a lesson booked overnight shows.
It is not a live view: a lesson moved later in the day shows on the next run.
Checks in as cron_heartbeats 'studio-dashboard' so the admin Jobs page shows it.

    python3 scripts/dashboard_studio_agent.py              # today
    python3 scripts/dashboard_studio_agent.py --date 2026-11-22
    python3 scripts/dashboard_studio_agent.py --print      # print, write nothing
"""
import datetime
import json
import os
import pathlib
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

STUDIO_TZ = ZoneInfo("America/New_York")
KEYCHAIN_SERVICE = "studio-backup"
OUT_DIR = pathlib.Path.home() / ".config" / "lionel-dashboard" / "studio"
HEARTBEAT_JOB = "studio-dashboard"
TEST_STUDENT = "3a7b64a1-67bd-4d16-a921-9215046da9c5"


def log(msg):
    print(f"{datetime.datetime.now():%Y-%m-%d %H:%M:%S} {msg}", flush=True)


def keychain(name):
    try:
        r = subprocess.run(["/usr/bin/security", "find-generic-password", "-s", KEYCHAIN_SERVICE,
                            "-a", name, "-w"], capture_output=True, text=True, timeout=30)
        return r.stdout.strip() if r.returncode == 0 else None
    except Exception:
        return None


URL = (os.environ.get("STUDIO_SUPABASE_URL") or "").rstrip("/")
KEY = (os.environ.get("SUPABASE_SERVICE_KEY") or "").strip() or keychain("SUPABASE_SERVICE_KEY")
if not URL or not KEY:
    log("FATAL: STUDIO_SUPABASE_URL or the Keychain key is missing; re-run scripts/install_dashboard_agent.sh")
    sys.exit(78)


def rest(path, params=None, method="GET", body=None, prefer=None):
    q = ("?" + urllib.parse.urlencode(params, safe=",.()*:")) if params else ""
    headers = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if prefer:
        headers["Prefer"] = prefer
    for attempt in range(4):
        try:
            req = urllib.request.Request(f"{URL}/rest/v1/{path}{q}", data=data, headers=headers, method=method)
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read()
                return json.loads(raw) if raw else None
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 ** (attempt + 1))


def clock(hhmm):
    h, m = int(hhmm[:2]), int(hhmm[3:5])
    return f"{h % 12 or 12}:{m:02d}{'pm' if h >= 12 else 'am'}"


def build(day):
    lessons = rest("lessons", {
        "select": "student_id,time,duration,status",
        "date": f"eq.{day}",
        "status": "neq.cancelled",   # a no-show is 'cancelled'; a cancelled booking is deleted
        "order": "time.asc",
    }) or []
    ids = sorted({l["student_id"] for l in lessons})
    venue = {}
    if ids:
        for p in rest("profiles", {"select": "id,lesson_venue", "id": f"in.({','.join(ids)})"}) or []:
            venue[p["id"]] = (p.get("lesson_venue") or "zoom").lower()
    rows = []
    for l in lessons:
        if l["student_id"] == TEST_STUDENT:
            continue
        start = str(l["time"])[:5]
        minutes = int(l.get("duration") or 30)
        end_dt = datetime.datetime.strptime(start, "%H:%M") + datetime.timedelta(minutes=minutes)
        rows.append({
            "time": clock(start),
            "ends": clock(end_dt.strftime("%H:%M")),
            "minutes": minutes,
            "where": "Classroom" if venue.get(l["student_id"]) == "classroom" else "Zoom",
        })
    tz = datetime.datetime.strptime(day, "%Y-%m-%d").replace(hour=12, tzinfo=STUDIO_TZ).strftime("%Z")
    return {
        "as_of": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "date": day,
        "label": "Today's lessons",
        "time_zone": tz,
        "lessons_today": len(rows),
        "first_lesson": rows[0]["time"] if rows else None,
        "last_lesson_ends": rows[-1]["ends"] if rows else None,
        "teaching_minutes": sum(r["minutes"] for r in rows),
        "on_zoom": sum(1 for r in rows if r["where"] == "Zoom"),
        "in_classroom": sum(1 for r in rows if r["where"] == "Classroom"),
        "lessons": rows,
    }


def main(argv):
    day = datetime.datetime.now(STUDIO_TZ).strftime("%Y-%m-%d")
    if "--date" in argv:
        day = argv[argv.index("--date") + 1]
    data = build(day)
    if "--print" in argv:
        print(json.dumps(data, indent=2))
        return 0
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(OUT_DIR, 0o700)
    tmp = OUT_DIR / f".{day}.json.tmp"
    tmp.write_text(json.dumps(data, indent=2) + "\n")
    os.chmod(tmp, 0o600)
    tmp.replace(OUT_DIR / f"{day}.json")
    detail = f"{data['lessons_today']} lessons on {day} written for the dashboard"
    log(detail)
    try:
        now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
        rest("cron_heartbeats", {"on_conflict": "job"}, method="POST",
             body=[{"job": HEARTBEAT_JOB, "last_run_at": now, "last_finished_at": now, "last_ok": True, "last_detail": detail}],
             prefer="resolution=merge-duplicates,return=minimal")
    except Exception as e:
        log(f"heartbeat not written ({e})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
