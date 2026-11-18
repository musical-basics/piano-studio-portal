#!/usr/bin/env bash
# Installs the nightly studio database backup (scripts/backup_studio_db.py) as a
# macOS launchd agent at 03:30. If the Mac is asleep then, launchd runs it when
# the Mac wakes. Re-run this after ANY edit to backup_studio_db.py: the agent
# runs a COPY kept outside ~/Documents, because macOS denies launchd agents any
# read under ~/Documents (Ultimate Pianist's backup lost two weeks to exactly
# that). Its secrets go in the plist for the same reason (.env.local is under
# ~/Documents). The Management API token is NOT copied: the script reads the
# Supabase CLI's login from the keychain at run time.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.musicalbasics.studio-backup"
BACKUP_DIR="$HOME/Backups/piano-studio"
AGENT_DIR="$BACKUP_DIR/agent"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$BACKUP_DIR/backup.log"

mkdir -p "$AGENT_DIR" "$HOME/Library/LaunchAgents"
chmod 700 "$BACKUP_DIR"
cp "$ROOT/scripts/backup_studio_db.py" "$AGENT_DIR/backup_studio_db.py"

# tr strips whitespace, sed strips surrounding quotes (a quoted key passed
# through verbatim is refused and looks like a dead key).
get() { grep "^$1=" "$ROOT/.env.local" | head -1 | cut -d= -f2- \
        | tr -d '[:space:]' | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'; }
SERVICE_KEY="$(get SUPABASE_SERVICE_KEY)"
RESEND="$(get RESEND_API_KEY)"
[ -n "$SERVICE_KEY" ] || { echo "missing SUPABASE_SERVICE_KEY in .env.local" >&2; exit 1; }
[ -n "$RESEND" ] || echo "warning: no RESEND_API_KEY, runs will not email" >&2

umask 077
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>${AGENT_DIR}/backup_studio_db.py</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>SUPABASE_SERVICE_KEY</key><string>${SERVICE_KEY}</string>
    <key>RESEND_API_KEY</key><string>${RESEND}</string>
    <key>STUDIO_BACKUP_DIR</key><string>${BACKUP_DIR}</string>
    <!-- off = no "Studio backup OK" email; failures and PARTIAL still email -->
    <key>STUDIO_BACKUP_SUCCESS_MAIL</key><string>on</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>3</integer><key>Minute</key><integer>30</integer></dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>${LOG}</string>
  <key>StandardErrorPath</key><string>${LOG}</string>
</dict>
</plist>
EOF
chmod 600 "$PLIST"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed: nightly studio backup at 03:30"
echo "  runs:   $AGENT_DIR/backup_studio_db.py (a copy: re-run this after edits)"
echo "  output: $BACKUP_DIR/  (log: $LOG)"
echo "run it once now:  launchctl kickstart gui/$(id -u)/$LABEL   then look for 'backup ok' in the log"
