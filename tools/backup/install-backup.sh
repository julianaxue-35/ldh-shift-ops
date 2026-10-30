#!/bin/zsh
# Sets up the monthly backup: asks for the LDH code once (typing is hidden; it is stored only on this Mac, readable only by you),
# then schedules backup-export.mjs for 7:00 am on the 1st of every month (if the Mac is asleep it runs when it wakes).
# To remove it later:  launchctl bootout gui/$(id -u)/au.ldh.backup && rm ~/Library/LaunchAgents/au.ldh.backup.plist
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
NODE="$(command -v node)"
mkdir -p ~/.ldh-backup && chmod 700 ~/.ldh-backup
if [ ! -s ~/.ldh-backup/code ]; then
  printf "LDH access code (hidden): "; read -s CODE; echo
  printf '%s' "$CODE" > ~/.ldh-backup/code; chmod 600 ~/.ldh-backup/code
fi
cat > ~/Library/LaunchAgents/au.ldh.backup.plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>au.ldh.backup</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$DIR/backup-export.mjs</string></array>
  <key>StartCalendarInterval</key><dict><key>Day</key><integer>1</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$HOME/.ldh-backup/last-run.log</string>
  <key>StandardErrorPath</key><string>$HOME/.ldh-backup/last-run.log</string>
</dict></plist>
PLIST
launchctl bootout gui/$(id -u)/au.ldh.backup 2>/dev/null || true
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/au.ldh.backup.plist
echo "Scheduled. Running one backup now to check it works..."
"$NODE" "$DIR/backup-export.mjs"
