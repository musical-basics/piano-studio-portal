#!/usr/bin/env python3
"""Nightly backup of the studio's Supabase database (lessons.musicalbasics.com).

Why it exists: the studio's Supabase project is on the free plan, which keeps
NO backups, and the Mac-wide pg_dump script (~/scripts/backup_supabase.sh)
never produced one: this network blocks outbound database ports 5432/6543.
Everything here goes over HTTPS (443), which works. Decision #420 (2026-11-18):
a nightly copy on the Mac, kept grandfather/father/son like Ultimate Pianist's
backup (its tools/backup_db.py is the model for this file).

Each run writes
    ~/Backups/piano-studio/piano-studio-YYYY-MM-DD-HHMM[-PARTIAL].tar.gz
holding every public table as JSON (rows via PostgREST with the service key,
so RLS-hidden rows are included), the sign-in tables (auth.users with password
hashes, so families can still sign in after a restore, and auth.identities),
and a schema snapshot (columns, constraints, indexes, functions, policies,
grants, triggers) so the rows can be put back into a rebuilt database. Storage
files are mirrored incrementally to ~/Backups/piano-studio/storage/.

Retention (prune): one archive a day for 7 days, one a week for the 4 weeks
before that, one a month for the 12 months before that, one a year forever.

Second copy (decision #536): the archives, kept by the same rules, and the
storage mirror also go to Dropbox, "/Studio Backups" in the Dropbox the lesson
recordings use (STUDIO_BACKUP_DROPBOX_DIR for another folder,
STUDIO_BACKUP_DROPBOX=off to skip). A Dropbox failure leaves the run OK and
the email says so.

If the Management API token is refused, the rows are still dumped (they need
only the service key) from the table list remembered from the last good run,
and the archive is named -PARTIAL so it can never pass for a whole one. Every
run emails OK or FAILED to the studio inbox (the admin profile's email), and
every finished run (OK or PARTIAL) stamps cron_heartbeats 'studio-backup', which
the portal's daily watchdog checks (decision #438).

Secrets: the environment (manual and test runs), then the macOS Keychain
(service 'studio-backup', written by install_backup_agent.sh; the launchd plists
hold no keys), then the repo's .env.local. The Management API token comes from
SUPABASE_PAT or, failing that, the Supabase CLI's login in the Keychain. The
launchd agent runs a COPY of this file outside ~/Documents (macOS denies
launchd agents reads there); re-run scripts/install_backup_agent.sh after
editing it.

    python3 scripts/backup_studio_db.py                 # run a backup now
    python3 scripts/backup_studio_db.py --prune-dry-run # what retention would delete
"""
import base64
import datetime
import json
import os
import pathlib
import re
import shutil
import socket
import subprocess
import sys
import tarfile
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
PROJECT_REF = "glexdzzmdkqpfbqqffyw"
SUPABASE_URL = f"https://{PROJECT_REF}.supabase.co"
BACKUP_ROOT = pathlib.Path(
    os.environ.get("STUDIO_BACKUP_DIR") or pathlib.Path.home() / "Backups" / "piano-studio")
STORAGE_ROOT = BACKUP_ROOT / "storage"
PREFIX = "piano-studio"
PAGE = 1000

DAILY_DAYS = 7
WEEKLY_DAYS = DAILY_DAYS + 4 * 7
MONTHLY_DAYS = WEEKLY_DAYS + 365

ALERT_FROM = "Piano Studio backup <notifications@updates.musicalbasics.com>"
FALLBACK_TO = "support@musicalbasics.com"

SCHEMA_QUERIES = {
    "columns": """
        select table_schema, table_name, ordinal_position, column_name,
               data_type, udt_name, is_nullable, column_default
        from information_schema.columns
        where table_schema in ('public','storage')
           or (table_schema = 'auth' and table_name in ('users','identities'))
        order by table_schema, table_name, ordinal_position""",
    # Which tables have row-level security on. Without it a rebuilt database
    # would leave every table open to the public (anon) key.
    "rls": """
        select c.relname as table, c.relrowsecurity as enabled, c.relforcerowsecurity as forced
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by 1""",
    "constraints": """
        select n.nspname as schema, c.relname as table, con.conname as name,
               con.contype as type, pg_get_constraintdef(con.oid) as def
        from pg_constraint con
        join pg_class c on c.oid = con.conrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
        order by 1,2,3""",
    "indexes": """
        select schemaname as schema, tablename as table, indexname as name,
               indexdef as def
        from pg_indexes where schemaname = 'public'
        order by 1,2,3""",
    "functions": """
        select n.nspname as schema, p.proname as name,
               pg_get_functiondef(p.oid) as def
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f'
        order by 1,2""",
    "policies": """
        select schemaname as schema, tablename as table, policyname as name,
               permissive, roles::text, cmd, qual, with_check
        from pg_policies where schemaname in ('public','storage')
        order by 1,2,3""",
    "grants": """
        select table_schema as schema, table_name as table, grantee,
               string_agg(privilege_type, ',' order by privilege_type) as privs
        from information_schema.role_table_grants
        where table_schema = 'public'
        group by 1,2,3 order by 1,2,3""",
    "triggers": """
        select n.nspname as schema, c.relname as table, t.tgname as name,
               pg_get_triggerdef(t.oid) as def
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in ('public','auth') and not t.tgisinternal
        order by 1,2,3""",
    "buckets": "select id, name, public, file_size_limit, allowed_mime_types, created_at from storage.buckets order by id",
}

# Sign-in tables, read through the Management API (PostgREST can't reach auth).
AUTH_TABLES = ("users", "identities")


# ---------------------------------------------------------------- secrets ---

def env_file_value(name):
    for fname in (".env.local", ".env"):
        f = ROOT / fname
        if not f.exists():
            continue
        for line in f.read_text().splitlines():
            if line.startswith(f"{name}="):
                v = line.split("=", 1)[1].strip()
                if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
                    v = v[1:-1]
                return v
    return None


KEYCHAIN_SERVICE = "studio-backup"
_secrets = {}


def keychain_secret(name):
    """A key stored by install_backup_agent.sh in the login Keychain (service
    'studio-backup', account = the key's name). Readable under launchd."""
    try:
        r = subprocess.run(["/usr/bin/security", "find-generic-password", "-s", KEYCHAIN_SERVICE,
                            "-a", name, "-w"], capture_output=True, text=True, timeout=30)
        return r.stdout.strip() if r.returncode == 0 else None
    except Exception:
        return None


def secret(name, required=True):
    """The environment (manual and test runs), then the Keychain (the launchd
    agents: no key is kept in their plists), then the repo's .env.local."""
    if name not in _secrets:
        _secrets[name] = ((os.environ.get(name) or "").strip() or keychain_secret(name)
                          or env_file_value(name))
    v = _secrets[name]
    if not v and required:
        die(f"{name} is missing from the Keychain (service {KEYCHAIN_SERVICE}); "
            f"re-run scripts/install_backup_agent.sh")
    return v


def keychain_token():
    try:
        raw = subprocess.run(
            ["/usr/bin/security", "find-generic-password", "-s", "Supabase CLI", "-w"],
            capture_output=True, text=True, timeout=20).stdout.strip()
        if raw.startswith("go-keyring-base64:"):
            raw = base64.b64decode(raw.split(":", 1)[1]).decode()
        return raw.strip() or None
    except Exception:
        return None


def management_token():
    """The first Management API token that works: SUPABASE_PAT from the
    environment, then .env.local, then the Supabase CLI's keychain login. Each
    is tried because a stale one is easy to leave behind (the repo's .env.local
    held a dead PAT on 2026-11-18). Raises with every refusal if none works."""
    tried = []
    for source, get in (("environment", lambda: (os.environ.get("SUPABASE_PAT") or "").strip()),
                        (".env.local", lambda: env_file_value("SUPABASE_PAT")),
                        ("keychain", keychain_token)):
        pat = get()
        if not pat or pat in [p for _, p in tried]:
            continue
        try:
            mgmt_query(pat, "select 1 as ok")
            return pat
        except Exception as e:
            tried.append((f"{source}: {str(e)[:80]}", pat))
    raise RuntimeError("no working Management API token (" + "; ".join(s for s, _ in tried or [("none found", "")]) + ")")


# ----------------------------------------------------------------- alerts ---

def http_json(url, *, data=None, headers=None, timeout=60):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read() or b"null")


def alert_recipient():
    to = (os.environ.get("BACKUP_ALERT_TO") or "").strip()
    if to:
        return to
    key = secret("SUPABASE_SERVICE_KEY", required=False)
    if key:
        try:
            rows = http_json(f"{SUPABASE_URL}/rest/v1/profiles?select=email&role=eq.admin&limit=1",
                             headers={"apikey": key, "Authorization": f"Bearer {key}"}, timeout=20)
            if rows and rows[0].get("email"):
                return rows[0]["email"]
        except Exception:
            pass
    return FALLBACK_TO


def newest_backup_line():
    try:
        tars = sorted((t for t in BACKUP_ROOT.glob(f"{PREFIX}-*.tar.gz") if "PARTIAL" not in t.name),
                      key=lambda p: p.stat().st_mtime, reverse=True)
        if not tars:
            return "Newest good backup: NONE ON DISK"
        hrs = (datetime.datetime.now() - datetime.datetime.fromtimestamp(tars[0].stat().st_mtime)).total_seconds() / 3600
        return f"Newest good backup: {tars[0].name} ({hrs:.1f} h old, {tars[0].stat().st_size / 1e6:.1f} MB)"
    except Exception as e:
        return f"Newest good backup: could not tell ({e})"


def alert(subject, body):
    """Never raises: an unreachable mailer must not hide the error it reports.
    STUDIO_BACKUP_MAIL=off silences every email (test runs)."""
    if os.environ.get("STUDIO_BACKUP_MAIL", "on").lower() in ("off", "0", "no"):
        print(f"(mail off) {subject}")
        return
    api = secret("RESEND_API_KEY", required=False)
    if not api:
        print("WARNING: no RESEND_API_KEY, this run goes unannounced", file=sys.stderr)
        return
    try:
        res = subprocess.run(
            ["curl", "-sS", "-X", "POST", "https://api.resend.com/emails",
             "-H", f"Authorization: Bearer {api}", "-H", "Content-Type: application/json",
             "-d", json.dumps({"from": ALERT_FROM, "to": [alert_recipient()], "subject": subject, "text": body})],
            capture_output=True, text=True, timeout=30)
        reply = json.loads(res.stdout or "{}")
        print(f"alert emailed (id={reply['id']})" if reply.get("id")
              else f"WARNING: alert NOT sent: {res.stdout.strip()[:200]}")
    except Exception as e:
        print(f"WARNING: could not send alert: {e}", file=sys.stderr)


def alert_body(reason):
    return "\n".join([
        reason.strip(), "",
        f"Host: {socket.gethostname()}",
        f"When: {datetime.datetime.now().isoformat(timespec='seconds')}",
        newest_backup_line(), "",
        f"Log: {BACKUP_ROOT / 'backup.log'}",
    ])


HEARTBEAT_JOB = "studio-backup"


def write_heartbeat(key):
    """Stamps cron_heartbeats.last_run_at for HEARTBEAT_JOB, so the portal's
    daily watchdog (app/api/cron/backup-watchdog, decision #438) can email when
    the Mac stops backing up. Never raises: a missed stamp costs at most one
    false "backup is late" email, never the backup itself."""
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/cron_heartbeats?on_conflict=job",
            data=json.dumps([{"job": HEARTBEAT_JOB, "last_run_at": now}]).encode(),
            headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json",
                     "Prefer": "resolution=merge-duplicates,return=minimal"},
            method="POST")
        with urllib.request.urlopen(req, timeout=30):
            pass
        print(f"heartbeat: {HEARTBEAT_JOB} at {now}")
    except Exception as e:
        print(f"WARNING: heartbeat not written ({e}); the portal may report the backup as late",
              file=sys.stderr)


def die(msg):
    print(f"backup FAILED: {msg}", file=sys.stderr)
    alert(f"Studio backup FAILED: {msg[:70]}", alert_body(f"The studio database backup failed: {msg}"))
    sys.exit(1)


# ------------------------------------------------------------- database ---

def mgmt_query(pat, sql):
    """Management API SQL, through curl: api.supabase.com sits behind Cloudflare,
    which can refuse urllib's fingerprint with a 403 that looks like a bad token."""
    res = subprocess.run(
        ["curl", "-s", "-w", "\n%{http_code}", "-X", "POST",
         f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
         "-H", f"Authorization: Bearer {pat}", "-H", "Content-Type: application/json",
         "-d", json.dumps({"query": sql})],
        capture_output=True, text=True, timeout=180)
    body, _, code = res.stdout.rpartition("\n")
    if not code.startswith("2"):
        raise RuntimeError(f"HTTP {code}: {body[:300]}")
    return json.loads(body) if body.strip() else []


TABLE_CACHE = "table-list.json"
MANIFEST = "manifest.json"


def discover_tables(pat):
    """Every public base table with its primary key (pagination needs a stable order)."""
    rows = mgmt_query(pat, """
        select c.relname as tbl, string_agg(a.attname, ',' order by k.ord) as pk
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        left join pg_constraint con on con.conrelid = c.oid and con.contype = 'p'
        left join lateral unnest(con.conkey) with ordinality as k(attnum, ord) on true
        left join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
        where n.nspname = 'public' and c.relkind = 'r'
        group by 1 order by 1""")
    tables = []
    for r in rows:
        if not r["pk"]:
            print(f"WARNING: public.{r['tbl']} has no primary key, ordered by all columns", file=sys.stderr)
        tables.append((r["tbl"], r["pk"] or ""))
    try:
        (BACKUP_ROOT / TABLE_CACHE).write_text(json.dumps(tables))
    except Exception as e:
        print(f"WARNING: could not remember the table list: {e}", file=sys.stderr)
    return tables


def cached_tables():
    try:
        return [tuple(t) for t in json.loads((BACKUP_ROOT / TABLE_CACHE).read_text())]
    except Exception:
        return None


def fetch_table(table, order, key, dest):
    """Stream one table to disk a page at a time; returns the row count."""
    total = 0
    q = f"select=*&order={urllib.parse.quote(order)}" if order else "select=*"
    with dest.open("w") as f:
        f.write("[")
        while True:
            page = http_json(f"{SUPABASE_URL}/rest/v1/{urllib.parse.quote(table)}?{q}", headers={
                "apikey": key, "Authorization": f"Bearer {key}",
                "Range-Unit": "items", "Range": f"{total}-{total + PAGE - 1}",
            }, timeout=120)
            for row in page:
                f.write(("," if total else "") + "\n " + json.dumps(row))
                total += 1
            if len(page) < PAGE:
                break
        f.write("\n]\n")
    return total


def fetch_auth_table(pat, table, dest):
    total, rows = 0, []
    while True:
        page = mgmt_query(pat, f"""
            select coalesce(json_agg(x), '[]'::json) as j
            from (select * from auth.{table} order by id offset {total} limit 500) x""")[0]["j"]
        rows += page
        total += len(page)
        if len(page) < 500:
            break
    dest.write_text(json.dumps(rows, indent=0, default=str))
    return total


def live_counts(pat, tables):
    parts = [f"select '{t}' as t, count(*)::int as n from public.\"{t}\"" for t, _ in tables]
    parts += [f"select 'auth.{t}' as t, count(*)::int as n from auth.{t}" for t in AUTH_TABLES]
    return {r["t"]: r["n"] for r in mgmt_query(pat, " union all ".join(parts))}


def dump_schema(pat, dest):
    snap = {name: mgmt_query(pat, sql) for name, sql in SCHEMA_QUERIES.items()}
    (dest / "schema.json").write_text(json.dumps(snap, indent=1, default=str))
    lines = [f"-- Piano Studio schema snapshot {datetime.date.today()}", ""]
    for section in ("functions", "indexes", "triggers"):
        lines.append(f"-- ===== {section.upper()} =====")
        lines += [r["def"].rstrip().rstrip(";") + ";" for r in snap[section]]
        lines.append("")
    (dest / "schema.sql").write_text("\n".join(lines))
    return sum(len(v) for v in snap.values())


def mirror_storage(pat, key):
    """Incremental copy of every Storage file (sheet music, lesson materials, attachments)."""
    objects = mgmt_query(pat, """
        select b.id as bucket, o.name as path, o.updated_at, o.metadata->>'size' as size
        from storage.objects o join storage.buckets b on b.id = o.bucket_id
        order by 1,2""")
    manifest_path = STORAGE_ROOT / ".manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    fetched = skipped = 0
    for o in objects:
        okey = f"{o['bucket']}/{o['path']}"
        stamp = {"updated_at": str(o["updated_at"]), "size": o["size"]}
        dest = STORAGE_ROOT / o["bucket"] / o["path"]
        if manifest.get(okey) == stamp and dest.exists():
            skipped += 1
            continue
        url = f"{SUPABASE_URL}/storage/v1/object/{o['bucket']}/" + urllib.parse.quote(o["path"])
        req = urllib.request.Request(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
        with urllib.request.urlopen(req, timeout=300) as res:
            data = res.read()
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        manifest[okey] = stamp
        fetched += 1
    STORAGE_ROOT.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=1, sort_keys=True))
    return fetched, skipped, len(manifest)


# ---------------------------------------------------------- dropbox copy ---
#
# Decision #536: a dead Mac or disk must not take every backup with it, so each
# run also copies the archives and the storage mirror to the Dropbox the lesson
# recordings use (the portal's Dropbox app). A Dropbox failure never fails the
# backup: the run stays OK locally and the email says what went wrong. Whatever
# a failed night missed is sent the next night (both sides are compared).

DROPBOX_ROOT = (os.environ.get("STUDIO_BACKUP_DROPBOX_DIR") or "/Studio Backups").rstrip("/")
DROPBOX_KEYS = ("DROPBOX_REFRESH_TOKEN", "DROPBOX_CLIENT_ID", "DROPBOX_CLIENT_SECRET")
DROPBOX_CHUNK = 64 * 1024 * 1024  # files/upload takes up to 150 MB; bigger ones go in sessions
DROPBOX_SENT = ".dropbox-sent.json"


class Dropbox:
    def __init__(self):
        missing = [k for k in DROPBOX_KEYS if not secret(k, required=False)]
        if missing:
            raise RuntimeError(f"{', '.join(missing)} missing from the Keychain (service {KEYCHAIN_SERVICE})")
        body = urllib.parse.urlencode({
            "grant_type": "refresh_token", "refresh_token": secret("DROPBOX_REFRESH_TOKEN"),
            "client_id": secret("DROPBOX_CLIENT_ID"), "client_secret": secret("DROPBOX_CLIENT_SECRET"),
        }).encode()
        try:
            self.token = http_json("https://api.dropboxapi.com/oauth2/token", data=body, timeout=30,
                                   headers={"Content-Type": "application/x-www-form-urlencoded"})["access_token"]
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"Dropbox refused the refresh token (HTTP {e.code} "
                               f"{e.read().decode(errors='replace')[:120]})") from None

    def _call(self, url, data, headers, timeout=300):
        """Retries rate limits (Dropbox answers 429 to bursts of writes) and 5xx."""
        for attempt in range(5):
            req = urllib.request.Request(url, data=data, headers={"Authorization": f"Bearer {self.token}", **headers})
            try:
                with urllib.request.urlopen(req, timeout=timeout) as res:
                    return json.loads(res.read() or b"null")
            except urllib.error.HTTPError as e:
                detail = e.read().decode(errors="replace")[:200]
                if (e.code == 429 or e.code >= 500) and attempt < 4:
                    time.sleep(min(60, int(float(e.headers.get("Retry-After") or 2 ** (attempt + 1)))))
                    continue
                raise RuntimeError(f"HTTP {e.code} {detail}") from None
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                if attempt < 4:
                    time.sleep(2 ** (attempt + 1))
                    continue
                raise RuntimeError(f"network: {e}") from None

    def rpc(self, endpoint, args):
        return self._call(f"https://api.dropboxapi.com/2/{endpoint}", json.dumps(args).encode(),
                          {"Content-Type": "application/json"}, timeout=60)

    def _content(self, endpoint, args, data):
        # ensure_ascii keeps the header ASCII, which Dropbox-API-Arg requires.
        return self._call(f"https://content.dropboxapi.com/2/{endpoint}", data, {
            "Content-Type": "application/octet-stream", "Dropbox-API-Arg": json.dumps(args, ensure_ascii=True)})

    def upload(self, src, dest):
        commit = {"path": dest, "mode": "overwrite", "mute": True}
        size = src.stat().st_size
        with src.open("rb") as f:
            if size <= DROPBOX_CHUNK:
                return self._content("files/upload", commit, f.read())
            session = self._content("files/upload_session/start", {"close": False}, f.read(DROPBOX_CHUNK))["session_id"]
            offset = DROPBOX_CHUNK
            while size - offset > DROPBOX_CHUNK:
                self._content("files/upload_session/append_v2",
                              {"cursor": {"session_id": session, "offset": offset}, "close": False},
                              f.read(DROPBOX_CHUNK))
                offset += DROPBOX_CHUNK
            return self._content("files/upload_session/finish",
                                 {"cursor": {"session_id": session, "offset": offset}, "commit": commit}, f.read())

    def files_in(self, folder):
        """{name: size} of the files directly in folder ({} if it doesn't exist yet)."""
        try:
            res = self.rpc("files/list_folder", {"path": folder, "limit": 2000})
        except RuntimeError as e:
            if "not_found" in str(e):
                return {}
            raise
        entries = res["entries"]
        while res.get("has_more"):
            res = self.rpc("files/list_folder/continue", {"cursor": res["cursor"]})
            entries += res["entries"]
        return {e["name"]: e.get("size") for e in entries if e.get(".tag") == "file"}

    def delete(self, path):
        self.rpc("files/delete_v2", {"path": path})


def dropbox_safe(path):
    """Dropbox refuses a name ending in a space or a dot (Storage has a
    'sheet_music ' folder next to 'sheet_music'), so on Dropbox those
    characters, and leading spaces, become '_'. The local mirror keeps the
    real names."""
    def fix(part):
        core = part.rstrip(" .")
        body = core.lstrip(" ")
        return "_" * (len(core) - len(body)) + body + "_" * (len(part) - len(core))
    return "/".join(fix(p) for p in path.split("/"))


def dropbox_copy():
    """Sends the archives and new storage files; prunes the Dropbox archives
    with the same keep-rules (gfs_plan) as the local ones. Returns a summary
    line. Raises with the reason when anything could not be copied."""
    dbx = Dropbox()
    remote = dbx.files_in(DROPBOX_ROOT)
    local = {p.name: p for p, _, _ in restore_points(BACKUP_ROOT)}
    points = []
    for name in set(remote) | set(local):
        m = ARCHIVE_RE.fullmatch(name)
        if m:
            points.append((name, datetime.datetime.fromisoformat(f"{m[1]}T{m[2]}:{m[3]}"), not m[4]))
    keep = gfs_plan(points, datetime.date.today())
    sent = pruned = 0
    for name in sorted(local):
        if name in keep and remote.get(name) != local[name].stat().st_size:
            dbx.upload(local[name], f"{DROPBOX_ROOT}/{name}")
            sent += 1
    for name in sorted(remote):
        if ARCHIVE_RE.fullmatch(name) and name not in keep:
            dbx.delete(f"{DROPBOX_ROOT}/{name}")
            pruned += 1

    # Storage files: what the local mirror holds that Dropbox doesn't have yet,
    # remembered per Dropbox folder so a test folder can't mark files as sent.
    mirror_path, sent_path = STORAGE_ROOT / ".manifest.json", STORAGE_ROOT / DROPBOX_SENT
    mirror = json.loads(mirror_path.read_text()) if mirror_path.exists() else {}
    record = json.loads(sent_path.read_text()) if sent_path.exists() else {}
    done = record.get("files", {}) if record.get("folder") == DROPBOX_ROOT else {}
    files = nbytes = 0
    failed = []
    try:
        for okey, stamp in sorted(mirror.items()):
            src = STORAGE_ROOT / okey
            if done.get(okey) == stamp or not src.exists():
                continue
            try:
                dbx.upload(src, f"{DROPBOX_ROOT}/storage/{dropbox_safe(okey)}")
                done[okey] = stamp
                files += 1
                nbytes += src.stat().st_size
            except Exception as e:
                failed.append(f"{okey}: {e}")
    finally:
        sent_path.write_text(json.dumps({"folder": DROPBOX_ROOT, "files": done}, indent=1, sort_keys=True))
    on_dropbox = len([n for n in keep if n in remote or n in local])
    summary = (f"{sent} archive{'s' * (sent != 1)} sent, {pruned} pruned, {on_dropbox} kept there; "
               f"{files} storage file{'s' * (files != 1)} sent ({nbytes / 1e6:.1f} MB), {len(done)} there in all")
    if failed:
        raise RuntimeError(f"{len(failed)} storage file(s) not sent, first: {failed[0][:150]} ({summary})")
    return summary


# -------------------------------------------------------------- retention ---

ARCHIVE_RE = re.compile(rf"{PREFIX}-(\d{{4}}-\d{{2}}-\d{{2}})-(\d{{2}})(\d{{2}})(-PARTIAL)?\.tar\.gz")


def restore_points(root):
    points = []
    for p in (root.iterdir() if root.exists() else ()):
        m = ARCHIVE_RE.fullmatch(p.name)
        if not m:
            continue
        try:
            points.append((p, datetime.datetime.fromisoformat(f"{m[1]}T{m[2]}:{m[3]}"), not m[4]))
        except ValueError:
            pass
    return points


def gfs_plan(points, today):
    """{path: tier} for the archives to KEEP: the newest (complete beats PARTIAL)
    per day, ISO week, month and year inside each tier's age window. A week's
    keeper is always some day's keeper, so tiers hand over without a gap."""
    tiers = (
        ("daily", 0, DAILY_DAYS, lambda d: d),
        ("weekly", DAILY_DAYS, WEEKLY_DAYS, lambda d: d.isocalendar()[:2]),
        ("monthly", WEEKLY_DAYS, MONTHLY_DAYS, lambda d: (d.year, d.month)),
        ("yearly", MONTHLY_DAYS, None, lambda d: d.year),
    )
    keep = {}
    for tier, lo, hi, bucket_of in tiers:
        best = {}
        for path, when, complete in points:
            age = (today - when.date()).days
            if age < lo or (hi is not None and age >= hi):
                continue
            b = bucket_of(when.date())
            if b not in best or (complete, when) > best[b][1:]:
                best[b] = (path, complete, when)
        for path, _, _ in best.values():
            keep[path] = tier
    return keep


def prune(dry_run=False):
    points = restore_points(BACKUP_ROOT)
    keep = gfs_plan(points, datetime.date.today())
    for path, _, _ in sorted(points, key=lambda p: p[1]):
        if path in keep:
            if dry_run:
                print(f"keep   {keep[path]:8} {path.name}")
            continue
        print(f"{'would delete' if dry_run else 'pruned'} {path.name}")
        if not dry_run:
            path.unlink()
    kept = {t: 0 for t in ("daily", "weekly", "monthly", "yearly")}
    for tier in keep.values():
        kept[tier] += 1
    return kept


# ------------------------------------------------------------------- main ---

def verify_archive(path, expected):
    """Re-open the archive and count every table's rows against what was written."""
    with tarfile.open(path, "r:gz") as tar:
        for m in tar.getmembers():
            name = pathlib.Path(m.name).name
            if name in expected:
                n = len(json.load(tar.extractfile(m)))
                if n != expected[name]:
                    raise RuntimeError(f"{name}: archive holds {n} rows, expected {expected[name]}")


def main():
    started = datetime.datetime.now()
    BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
    os.chmod(BACKUP_ROOT, 0o700)
    key = secret("SUPABASE_SERVICE_KEY")
    stamp = started.strftime("%Y-%m-%d-%H%M")
    tmp = BACKUP_ROOT / f".tmp-{stamp}"
    tmp.mkdir(exist_ok=True)

    degraded = ""
    pat = None
    try:
        pat = management_token()
        tables = discover_tables(pat)
    except Exception as e:
        degraded = str(e)
        pat = None
        tables = cached_tables()
        if not tables:
            shutil.rmtree(tmp, ignore_errors=True)
            die(f"Management API unavailable and no remembered table list: {degraded}")
        print(f"WARNING: {degraded}; using the remembered list of {len(tables)} tables", file=sys.stderr)

    expected, total = {}, 0
    for t, order in tables:
        try:
            n = fetch_table(t, order, key, tmp / f"public.{t}.json")
        except Exception as e:
            shutil.rmtree(tmp, ignore_errors=True)
            die(f"public.{t}: {e}")
        expected[f"public.{t}.json"] = n
        total += n
        print(f"public.{t}: {n} rows")

    storage = None
    live = {}
    if pat:
        try:
            for t in AUTH_TABLES:
                n = fetch_auth_table(pat, t, tmp / f"auth.{t}.json")
                expected[f"auth.{t}.json"] = n
                print(f"auth.{t}: {n} rows")
            print(f"schema snapshot: {dump_schema(pat, tmp)} objects")
            # Compare against the live counts. Rows can arrive mid-run (a new
            # message), so only a real gap is an error.
            written = {t: expected[f"public.{t}.json"] for t, _ in tables}
            written.update({f"auth.{t}": expected[f"auth.{t}.json"] for t in AUTH_TABLES})
            live = live_counts(pat, tables)
            short = [f"{t}: {written[t]} of {n}" for t, n in live.items()
                     if t in written and n - written[t] > 5]
            if short:
                raise RuntimeError("rows missing against the live count: " + "; ".join(short))
        except Exception as e:
            shutil.rmtree(tmp, ignore_errors=True)
            die(f"sign-in tables / schema: {e}")

    # The archive's own record of what it holds, which the monthly restore test
    # (scripts/restore_test_studio_db.py) checks the rebuilt database against.
    (tmp / MANIFEST).write_text(json.dumps({
        "made": started.isoformat(timespec="seconds"), "host": socket.gethostname(),
        "partial": bool(degraded), "rows": expected, "live_counts": live,
    }, indent=1))

    tag = "-PARTIAL" if degraded else ""
    out = BACKUP_ROOT / f"{PREFIX}-{stamp}{tag}.tar.gz"
    with tarfile.open(out, "w:gz") as tar:
        for f in sorted(tmp.iterdir()):
            tar.add(f, arcname=f"{PREFIX}-{stamp}/{f.name}")
    shutil.rmtree(tmp)
    os.chmod(out, 0o600)
    try:
        verify_archive(out, expected)
    except Exception as e:
        die(f"archive check: {e}")

    if pat:
        try:
            storage = mirror_storage(pat, key)
            print(f"storage: {storage[0]} fetched, {storage[1]} unchanged, {storage[2]} files mirrored")
        except Exception as e:
            die(f"storage mirror: {e}")

    size_mb = out.stat().st_size / 1e6
    kept = prune()  # may remove this very archive: a PARTIAL loses to a complete one from the same day
    write_heartbeat(key)  # a PARTIAL still checks in: it emails its own warning
    print(f"backup ok -> {out} ({len(tables)} tables, {total} rows)")

    dropbox_failed = None
    dropbox_line = "Dropbox: off for this run (STUDIO_BACKUP_DROPBOX=off)"
    if os.environ.get("STUDIO_BACKUP_DROPBOX", "on").lower() not in ("off", "0", "no"):
        try:
            dropbox_line = f"Dropbox: {dropbox_copy()} ({DROPBOX_ROOT})"
            print(dropbox_line)
        except Exception as e:
            dropbox_failed = str(e)
            dropbox_line = f"Dropbox copy failed: {e}"
            print(f"WARNING: {dropbox_line}", file=sys.stderr)
    secs = (datetime.datetime.now() - started).total_seconds()

    lines = [
        f"Backed up {len(tables)} tables, {total:,} rows"
        + (f", {expected.get('auth.users.json', 0)} sign-ins." if not degraded else "."),
        "",
        f"Archive: {out.name} ({size_mb:.1f} MB), checked after writing"
        + ("" if out.exists() else "; not kept, a complete copy from today already exists"),
    ]
    if storage:
        lines.append(f"Files:   {storage[2]} mirrored ({storage[0]} new or changed this run)")
    if dropbox_failed:
        lines[0:0] = [f"Dropbox copy failed: {dropbox_failed}",
                      "The backup on the Mac is fine; the second copy in Dropbox is behind until a night "
                      "where it works (it then catches up by itself).", ""]
    else:
        lines.append(dropbox_line)
    lines += [
        f"Kept:    {sum(kept.values())} archives ({kept['daily']} daily, {kept['weekly']} weekly, "
        f"{kept['monthly']} monthly, {kept['yearly']} yearly)",
        f"Where:   {BACKUP_ROOT} on {socket.gethostname()}",
        f"Took:    {secs:.0f}s",
    ]
    if degraded:
        alert("Studio backup PARTIAL: rows saved, sign-ins and schema missing", alert_body(
            f"The Management API token was refused ({degraded}).\n\nAll table rows were saved from the "
            f"remembered table list, but this archive has no sign-in tables, no schema snapshot and no "
            f"file mirror, and misses any table added since the last good run. Sign in again with the "
            f"Supabase CLI (supabase login) to refresh the token.\n\n" + "\n".join(lines)))
    elif dropbox_failed:  # mailed even with success mail off: nobody would notice otherwise
        alert(f"Studio backup OK, but the Dropbox copy failed: {dropbox_failed[:60]}", "\n".join(lines))
    elif os.environ.get("STUDIO_BACKUP_SUCCESS_MAIL", "on").lower() not in ("off", "0", "no"):
        alert(f"Studio backup OK: {len(tables)} tables, {total:,} rows", "\n".join(lines))


if __name__ == "__main__":
    if "--prune-dry-run" in sys.argv:
        print(prune(dry_run=True))
        sys.exit(0)
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:
        traceback.print_exc()
        die(f"unhandled {type(e).__name__}: {e}")
