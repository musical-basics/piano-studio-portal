#!/usr/bin/env bash
# Installs (or updates) the Personal Dashboard's studio supplier (Lionel's #1311):
# launchd agent com.musicalbasics.studio-dashboard runs scripts/dashboard_studio_agent.py
# at 00:10 and 07:00 (the Mac's clock, Eastern) and at login, writing today's lessons to
# ~/.config/lionel-dashboard/studio/<date>.json. Re-run after editing that script:
# launchd runs a COPY kept outside ~/Documents (macOS denies launchd agents reads there).
# The service key comes from the login Keychain (service "studio-backup", the same item
# the backup and the family watch use); the plist holds no keys.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.musicalbasics.studio-dashboard"
AGENT_DIR="$HOME/Library/Application Support/studio-manager"
LOG="$HOME/Library/Logs/studio-dashboard.log"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

get() { grep "^$1=" "$ROOT/.env.local" | head -1 | cut -d= -f2- \
        | tr -d '[:space:]' | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/' || true; }
SUPABASE_URL="$(get NEXT_PUBLIC_SUPABASE_URL)"
[ -n "$SUPABASE_URL" ] || { echo "no NEXT_PUBLIC_SUPABASE_URL in .env.local" >&2; exit 1; }
security find-generic-password -s studio-backup -a SUPABASE_SERVICE_KEY >/dev/null 2>&1 \
  || { echo "no SUPABASE_SERVICE_KEY in the Keychain (service studio-backup): run scripts/install_family_watch_agent.sh first" >&2; exit 1; }

mkdir -p "$AGENT_DIR" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cp "$ROOT/scripts/dashboard_studio_agent.py" "$AGENT_DIR/dashboard_studio_agent.py"

( umask 077
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>${AGENT_DIR}/dashboard_studio_agent.py</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>STUDIO_SUPABASE_URL</key><string>${SUPABASE_URL}</string>
    <key>PYTHONUNBUFFERED</key><string>1</string>
  </dict>
  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Hour</key><integer>0</integer><key>Minute</key><integer>10</integer></dict>
    <dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
  </array>
  <key>RunAtLoad</key><true/>
  <key>Nice</key><integer>19</integer>
  <key>LowPriorityIO</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>${LOG}</string>
  <key>StandardErrorPath</key><string>${LOG}</string>
</dict>
</plist>
EOF
)

uid="$(id -u)"
launchctl bootout "gui/$uid/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$uid" "$PLIST"
launchctl enable "gui/$uid/$LABEL"
echo "installed $LABEL: 00:10 and 07:00 daily and at login (log: $LOG)"
