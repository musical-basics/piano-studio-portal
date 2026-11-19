#!/usr/bin/env bash
# Installs (or updates) the family-message watch as a macOS launchd agent
# (Lionel's #776): com.musicalbasics.studio-family-watch, see
# scripts/family_watch_agent.py for what it does. Re-run after ANY edit to that
# script: launchd runs a COPY kept outside ~/Documents, because macOS denies
# launchd agents any read under ~/Documents.
#
# The service key is read at run time from the login Keychain item the backup
# already uses (service "studio-backup", account SUPABASE_SERVICE_KEY, put there
# by scripts/install_backup_agent.sh). If it isn't there yet, this copies it
# from .env.local the same way. The plist holds no keys.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.musicalbasics.studio-family-watch"
AGENT_DIR="$HOME/Library/Application Support/studio-manager"
LOG="$HOME/Library/Logs/studio-family-watch.log"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
KEYCHAIN_SERVICE="studio-backup"

get() { grep "^$1=" "$ROOT/.env.local" | head -1 | cut -d= -f2- \
        | tr -d '[:space:]' | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/' || true; }

SUPABASE_URL="$(get NEXT_PUBLIC_SUPABASE_URL)"
[ -n "$SUPABASE_URL" ] || { echo "no NEXT_PUBLIC_SUPABASE_URL in .env.local" >&2; exit 1; }

if security find-generic-password -s "$KEYCHAIN_SERVICE" -a SUPABASE_SERVICE_KEY >/dev/null 2>&1; then
  echo "  keychain: SUPABASE_SERVICE_KEY already there (shared with the backup)"
else
  value="$(get SUPABASE_SERVICE_KEY)"
  [ -n "$value" ] || value="$(get SUPABASE_SERVICE_ROLE_KEY)"
  [ -n "$value" ] || { echo "no SUPABASE_SERVICE_KEY in .env.local or the Keychain" >&2; exit 1; }
  security add-generic-password -U -s "$KEYCHAIN_SERVICE" -a SUPABASE_SERVICE_KEY -w "$value" \
    -T /usr/bin/security -j "studio database backup and family watch" >/dev/null
  echo "  keychain: SUPABASE_SERVICE_KEY stored"
fi

mkdir -p "$AGENT_DIR" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs" "$HOME/.cache/studio-manager"
cp "$ROOT/scripts/family_watch_agent.py" "$AGENT_DIR/family_watch_agent.py"

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
    <string>${AGENT_DIR}/family_watch_agent.py</string>
  </array>
  <!-- settings only: the service key is in the Keychain (service studio-backup) -->
  <key>EnvironmentVariables</key>
  <dict>
    <key>STUDIO_SUPABASE_URL</key><string>${SUPABASE_URL}</string>
    <key>PYTHONUNBUFFERED</key><string>1</string>
  </dict>
  <!-- start at login and restart whenever it exits (crash, network trouble at boot) -->
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>60</integer>
  <!-- a light poll, but background work on the Mac stays at the lowest priority (rules 1.11/1.12) -->
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
echo "installed $LABEL (log: $LOG)"
