#!/usr/bin/env bash
# Installs the studio database backup's two macOS launchd agents:
#   com.musicalbasics.studio-backup        nightly at 03:30   scripts/backup_studio_db.py
#   com.musicalbasics.studio-restore-test  the 1st at 04:30   scripts/restore_test_studio_db.py
# If the Mac is asleep then, launchd runs them when the Mac wakes. Re-run this
# after ANY edit to either script: the agents run COPIES kept outside
# ~/Documents, because macOS denies launchd agents any read under ~/Documents
# (Ultimate Pianist's backup lost two weeks to exactly that). Their secrets go
# in the plists for the same reason (.env.local is under ~/Documents). The
# Management API token is NOT copied: the scripts read the Supabase CLI's login
# from the keychain at run time.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$HOME/Backups/piano-studio"
AGENT_DIR="$BACKUP_DIR/agent"

mkdir -p "$AGENT_DIR" "$HOME/Library/LaunchAgents"
chmod 700 "$BACKUP_DIR"
# The restore test imports the backup script, so both live side by side.
cp "$ROOT/scripts/backup_studio_db.py" "$AGENT_DIR/backup_studio_db.py"
cp "$ROOT/scripts/restore_test_studio_db.py" "$AGENT_DIR/restore_test_studio_db.py"

# tr strips whitespace, sed strips surrounding quotes (a quoted key passed
# through verbatim is refused and looks like a dead key).
get() { grep "^$1=" "$ROOT/.env.local" | head -1 | cut -d= -f2- \
        | tr -d '[:space:]' | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'; }
SERVICE_KEY="$(get SUPABASE_SERVICE_KEY)"
RESEND="$(get RESEND_API_KEY)"
[ -n "$SERVICE_KEY" ] || { echo "missing SUPABASE_SERVICE_KEY in .env.local" >&2; exit 1; }
[ -n "$RESEND" ] || echo "warning: no RESEND_API_KEY, runs will not email" >&2

# write_agent LABEL SCRIPT LOG SCHEDULE-DICT EXTRA-ENV
write_agent() {
  local label="$1" script="$2" log="$3" schedule="$4" extra="$5"
  local plist="$HOME/Library/LaunchAgents/$label.plist"
  ( umask 077
    cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>${AGENT_DIR}/${script}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>SUPABASE_SERVICE_KEY</key><string>${SERVICE_KEY}</string>
    <key>RESEND_API_KEY</key><string>${RESEND}</string>
    <key>STUDIO_BACKUP_DIR</key><string>${BACKUP_DIR}</string>
    <key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin</string>
${extra}
  </dict>
  <key>StartCalendarInterval</key>
  ${schedule}
  <key>RunAtLoad</key><false/>
  <!-- heavy runs share the Mac (command center rules 1.11/1.12): lowest CPU and disk priority -->
  <key>Nice</key><integer>19</integer>
  <key>LowPriorityIO</key><true/>
  <key>StandardOutPath</key><string>${log}</string>
  <key>StandardErrorPath</key><string>${log}</string>
</dict>
</plist>
EOF
  )
  chmod 600 "$plist"
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$plist"
}

write_agent com.musicalbasics.studio-backup backup_studio_db.py "$BACKUP_DIR/backup.log" \
  '<dict><key>Hour</key><integer>3</integer><key>Minute</key><integer>30</integer></dict>' \
  '    <!-- off = no "Studio backup OK" email; failures and PARTIAL still email -->
    <key>STUDIO_BACKUP_SUCCESS_MAIL</key><string>on</string>'

write_agent com.musicalbasics.studio-restore-test restore_test_studio_db.py "$BACKUP_DIR/restore-test.log" \
  '<dict><key>Day</key><integer>1</integer><key>Hour</key><integer>4</integer><key>Minute</key><integer>30</integer></dict>' \
  ''

echo "installed: nightly studio backup at 03:30, restore test on the 1st of each month at 04:30"
echo "  runs:   copies in $AGENT_DIR (re-run this after edits)"
echo "  output: $BACKUP_DIR/  (logs: backup.log, restore-test.log)"
echo "run one now:  launchctl kickstart gui/$(id -u)/com.musicalbasics.studio-backup        then look for 'backup ok' in backup.log"
echo "              launchctl kickstart gui/$(id -u)/com.musicalbasics.studio-restore-test  then look for 'restore test ok' in restore-test.log"
