#!/usr/bin/env bash
# Installs the studio database backup's two macOS launchd agents:
#   com.musicalbasics.studio-backup        nightly at 03:30   scripts/backup_studio_db.py
#   com.musicalbasics.studio-restore-test  the 1st at 04:30   scripts/restore_test_studio_db.py
# If the Mac is asleep then, launchd runs them when the Mac wakes. Re-run this
# after ANY edit to either script: the agents run COPIES kept outside
# ~/Documents, because macOS denies launchd agents any read under ~/Documents
# (Ultimate Pianist's backup lost two weeks to exactly that). For the same
# reason they can't read .env.local, so this copies its keys into the macOS
# login Keychain (service "studio-backup", one item per key name), where the
# scripts read them at run time. The plists hold no keys (decision #421). The
# Management API token is not copied: the scripts read the Supabase CLI's own
# Keychain login.
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
        | tr -d '[:space:]' | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/' || true; }
KEYCHAIN_SERVICE="studio-backup"
# store NAME: copies .env.local's NAME into the Keychain (never echoed). -T lets
# /usr/bin/security read it without a prompt, which is how the scripts read it.
store() {
  local value
  value="$(get "$1")"
  if [ -z "$value" ]; then
    echo "warning: no $1 in .env.local, the Keychain keeps whatever it had" >&2
    return 1
  fi
  security add-generic-password -U -s "$KEYCHAIN_SERVICE" -a "$1" -w "$value" -T /usr/bin/security \
    -j "studio database backup (scripts/install_backup_agent.sh)" >/dev/null
  echo "  keychain: $1 stored"
}
store SUPABASE_SERVICE_KEY || { echo "missing SUPABASE_SERVICE_KEY: the backup cannot run" >&2; exit 1; }
store RESEND_API_KEY || echo "warning: no RESEND_API_KEY, runs will not email" >&2
# The portal's Dropbox app (same as the lesson recordings): the second copy in "/Studio Backups".
for k in DROPBOX_REFRESH_TOKEN DROPBOX_CLIENT_ID DROPBOX_CLIENT_SECRET; do
  store "$k" || echo "warning: no $k, the Dropbox copy will report itself failed" >&2
done

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
  <!-- settings only: the keys are in the Keychain (service studio-backup) -->
  <key>EnvironmentVariables</key>
  <dict>
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
