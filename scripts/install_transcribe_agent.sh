#!/usr/bin/env bash
# Installs (or updates) the overnight lesson transcripts (Lionel's #953) as a
# macOS launchd agent: com.musicalbasics.studio-transcribe, nightly at 1:30am,
# scripts/transcribe_lessons.py (what it does is at the top of that file).
#
#   - whisper.cpp from Homebrew (whisper-cli, Metal) and its ggml small.en
#     model (466 MB, the official whisper.cpp model repo on Hugging Face,
#     checked against its published SHA-1) in
#     ~/Library/Application Support/studio-manager/models
#   - a COPY of the script in ~/Library/Application Support/studio-manager
#     (macOS denies launchd agents any read under ~/Documents): re-run this
#     after ANY edit to scripts/transcribe_lessons.py
#   - the keys in the login Keychain (service "studio-backup", the same items
#     the backup uses); any missing one is copied from .env.local. The plist
#     holds no keys.
#   - lowest priority: Nice 19, low-priority disk, background process type.
#
# If the Mac is asleep at 1:30am, launchd runs it on wake; the script itself
# starts nothing after 5:50am. Log: ~/Library/Logs/studio-transcribe.log
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.musicalbasics.studio-transcribe"
AGENT_DIR="$HOME/Library/Application Support/studio-manager"
MODEL_DIR="$AGENT_DIR/models"
MODEL="$MODEL_DIR/ggml-small.en.bin"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin"
MODEL_SHA1="db8a495a91d927739e50b3fc1cc4c6b8f6c2d022"
LOG="$HOME/Library/Logs/studio-transcribe.log"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
KEYCHAIN_SERVICE="studio-backup"
BREW=/opt/homebrew/bin/brew

# whisper.cpp and ffmpeg
for tool in whisper-cli:whisper.cpp ffmpeg:ffmpeg; do
  bin="${tool%%:*}" formula="${tool##*:}"
  if [ ! -x "/opt/homebrew/bin/$bin" ]; then
    echo "  installing $formula (Homebrew)"
    nice -n 19 "$BREW" install "$formula"
  fi
done
echo "  whisper.cpp: $("$BREW" list --versions whisper.cpp)"

# The model, checked against the whisper.cpp project's published SHA-1.
mkdir -p "$MODEL_DIR"
if [ ! -f "$MODEL" ] || [ "$(shasum -a 1 "$MODEL" | cut -d' ' -f1)" != "$MODEL_SHA1" ]; then
  echo "  downloading the small.en model (466 MB)"
  nice -n 19 curl -sSL --fail -o "$MODEL.part" "$MODEL_URL"
  [ "$(shasum -a 1 "$MODEL.part" | cut -d' ' -f1)" = "$MODEL_SHA1" ] \
    || { rm -f "$MODEL.part"; echo "the model download does not match its SHA-1" >&2; exit 1; }
  mv "$MODEL.part" "$MODEL"
fi
echo "  model: $MODEL (checked)"

# Keys: the backup's Keychain items; copy any that are missing from .env.local.
get() { grep "^$1=" "$ROOT/.env.local" 2>/dev/null | head -1 | cut -d= -f2- \
        | tr -d '[:space:]' | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/' || true; }
for k in SUPABASE_SERVICE_KEY DROPBOX_REFRESH_TOKEN DROPBOX_CLIENT_ID DROPBOX_CLIENT_SECRET; do
  if security find-generic-password -s "$KEYCHAIN_SERVICE" -a "$k" >/dev/null 2>&1; then
    echo "  keychain: $k already there (shared with the backup)"
  else
    value="$(get "$k")"
    [ -n "$value" ] || { echo "no $k in the Keychain or .env.local: the transcripts cannot run" >&2; exit 1; }
    security add-generic-password -U -s "$KEYCHAIN_SERVICE" -a "$k" -w "$value" -T /usr/bin/security \
      -j "studio backup, family watch and lesson transcripts" >/dev/null
    echo "  keychain: $k stored"
  fi
done

mkdir -p "$AGENT_DIR" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cp "$ROOT/scripts/transcribe_lessons.py" "$AGENT_DIR/transcribe_lessons.py"

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
    <string>${AGENT_DIR}/transcribe_lessons.py</string>
  </array>
  <!-- settings only: the keys are in the Keychain (service studio-backup) -->
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>PYTHONUNBUFFERED</key><string>1</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>1</integer><key>Minute</key><integer>30</integer></dict>
  <key>RunAtLoad</key><false/>
  <!-- heavy runs share the Mac (command center rules 1.11/1.12): lowest CPU and disk priority -->
  <key>Nice</key><integer>19</integer>
  <key>LowPriorityIO</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>${LOG}</string>
  <key>StandardErrorPath</key><string>${LOG}</string>
</dict>
</plist>
EOF
)
chmod 600 "$PLIST"

uid="$(id -u)"
launchctl bootout "gui/$uid/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$uid" "$PLIST"
launchctl enable "gui/$uid/$LABEL"
echo "installed $LABEL: nightly 1:30am, newest recordings first, nothing new after 5:50am"
echo "  runs:   $AGENT_DIR/transcribe_lessons.py (re-run this after edits)"
echo "  log:    $LOG"
echo "  left:   /usr/bin/python3 \"$AGENT_DIR/transcribe_lessons.py\" --plan"
