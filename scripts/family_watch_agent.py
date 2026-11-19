#!/usr/bin/env python3
"""The family-message watch as its own background job (Lionel's #776).

Every family message to Lionel (portal chat, email reply or text: they all land
in `messages`) must get a drafted reply filed for his sign-off in the command
center. The studio manager's Claude session drafts those, but the WATCH used to
run inside that session, so a Mac restart or a closed session stopped it with
nothing said. This job does the watching instead:

  - launchd keeps it running (KeepAlive) and starts it at login; it survives
    the manager session ending and restarts itself if it crashes.
  - Every minute it asks the portal's database for new messages to Lionel and
    appends each one from a student or prospect to a queue file:
        ~/.cache/studio-manager/family-queue.jsonl   (one JSON object per line)
    Its place is kept in msg-watch-state.json next to it, so nothing is missed
    or repeated across restarts. Names stay in that local file only.
  - Every 10 minutes it checks in with the portal (cron_heartbeats
    'family-watch'). The portal's daily watchdog (/api/cron/backup-watchdog)
    emails the studio inbox when that check-in is over 36 hours old, the same
    rule as the nightly backup.

The manager session reads the queue with `node scripts/watch_family_messages.cjs`
(it blocks until a new queued message, prints it, exits).

Install or update: scripts/install_family_watch_agent.sh. launchd runs a COPY
outside ~/Documents (macOS blocks launchd agents from reading there), and the
service key comes from the login Keychain item the backup already uses
(service 'studio-backup', account SUPABASE_SERVICE_KEY). Read-only on the
database except the one heartbeat row.
"""
import datetime
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

STATE_DIR = os.path.expanduser("~/.cache/studio-manager")
STATE = os.path.join(STATE_DIR, "msg-watch-state.json")
QUEUE = os.path.join(STATE_DIR, "family-queue.jsonl")
ALIVE = os.path.join(STATE_DIR, "family-watch-alive.json")
FAMILY = ("student", "prospect")
POLL_SECONDS = 60
HEARTBEAT_SECONDS = 600
HEARTBEAT_JOB = "family-watch"
KEYCHAIN_SERVICE = "studio-backup"


def log(msg):
    stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"{stamp} {msg}", flush=True)


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def keychain(name):
    try:
        r = subprocess.run(["/usr/bin/security", "find-generic-password", "-s", KEYCHAIN_SERVICE,
                            "-a", name, "-w"], capture_output=True, text=True, timeout=30)
        return r.stdout.strip() if r.returncode == 0 else None
    except Exception:
        return None


def config():
    url = (os.environ.get("STUDIO_SUPABASE_URL") or "").rstrip("/")
    key = (os.environ.get("SUPABASE_SERVICE_KEY") or "").strip() or keychain("SUPABASE_SERVICE_KEY")
    if not url or not key:
        missing = "STUDIO_SUPABASE_URL" if not url else "SUPABASE_SERVICE_KEY (Keychain service studio-backup)"
        log(f"FATAL: {missing} is missing; re-run scripts/install_family_watch_agent.sh")
        sys.exit(78)  # EX_CONFIG: launchd will retry after its throttle interval
    return url, key


URL, KEY = config()
HEADERS = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}


def rest(path, params=None, method="GET", body=None, prefer=None):
    q = ("?" + urllib.parse.urlencode(params, safe=",.()*:")) if params else ""
    headers = dict(HEADERS)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(f"{URL}/rest/v1/{path}{q}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def admin_id():
    rows = rest("profiles", {"select": "id", "role": "eq.admin", "order": "created_at.desc", "limit": "1"})
    if not rows:
        raise RuntimeError("no admin profile found")
    return rows[0]["id"]


def one_line(s):
    return " ".join((s or "").split())[:300]


def read_since():
    try:
        with open(STATE) as f:
            return json.load(f)["since"]
    except Exception:
        return now_iso()


def write_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f)
    os.replace(tmp, path)


def heartbeat():
    try:
        rest("cron_heartbeats", {"on_conflict": "job"}, method="POST",
             body=[{"job": HEARTBEAT_JOB, "last_run_at": now_iso()}],
             prefer="resolution=merge-duplicates,return=minimal")
        return True
    except Exception as e:
        log(f"heartbeat not written ({e}); the portal may report the watch as quiet")
        return False


def poll(admin, since):
    """New family messages to Lionel after `since`, appended to the queue.
    Returns the new `since` (the newest message seen, family or not)."""
    msgs = rest("messages", {
        "select": "id,sender_id,content,attachments,created_at",
        "recipient_id": f"eq.{admin}",
        "created_at": f"gt.{since}",
        "deleted_at": "is.null",
        "order": "created_at.asc",
    })
    if not msgs:
        return since
    ids = sorted({m["sender_id"] for m in msgs})
    people = rest("profiles", {"select": "id,name,role", "id": f"in.({','.join(ids)})"}) or []
    who = {p["id"]: p for p in people}
    fam = [m for m in msgs if (who.get(m["sender_id"]) or {}).get("role") in FAMILY]
    if fam:
        with open(QUEUE, "a") as f:
            for m in fam:
                p = who[m["sender_id"]]
                f.write(json.dumps({
                    "message": m["id"], "at": m["created_at"], "family": p.get("name"), "role": p.get("role"),
                    "sender_id": m["sender_id"], "files": len(m.get("attachments") or []),
                    "text": one_line(m.get("content")), "queued_at": now_iso(),
                }) + "\n")
        log(f"queued {len(fam)} family message(s)")
    return msgs[-1]["created_at"]


def main():
    os.makedirs(STATE_DIR, exist_ok=True)
    since = read_since()
    write_json(STATE, {"since": since})
    log(f"family watch started (pid {os.getpid()}), messages after {since}")
    admin = None
    last_beat = 0.0
    failures = 0
    while True:
        try:
            if admin is None:
                admin = admin_id()
            since = poll(admin, since)
            write_json(STATE, {"since": since})
            write_json(ALIVE, {"last_poll_at": now_iso(), "pid": os.getpid()})
            if failures:
                log(f"polling works again after {failures} failed attempt(s)")
            failures = 0
            if time.time() - last_beat >= HEARTBEAT_SECONDS and heartbeat():
                last_beat = time.time()
        except Exception as e:
            failures += 1
            # One line per failure for the first few, then hourly, so a long
            # network outage doesn't fill the log.
            if failures <= 3 or failures % 60 == 0:
                detail = e.read().decode()[:200] if isinstance(e, urllib.error.HTTPError) else str(e)
                log(f"poll failed ({failures} in a row): {detail}")
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
