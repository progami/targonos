#!/bin/bash
# Weekly Manual Sources — Monday Cron
# Runs claude -p --chrome to collect Account Health screenshots,
# Category Insights text, and POE CSV from Seller Central.
#
# Prerequisites:
#   - Chrome running with Claude extension connected
#   - Seller Central session active (keepalive.sh handles this)
#   - claude CLI installed at ~/.local/bin/claude

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="/tmp/weekly-manual-sources"
mkdir -p "$LOG_DIR"

TIMESTAMP=$(date '+%Y-%m-%d_%H%M%S')
LOG_FILE="$LOG_DIR/run_${TIMESTAMP}.log"

CLAUDE="$HOME/.local/bin/claude"

echo "=== Weekly Manual Sources Run ===" > "$LOG_FILE"
echo "Started: $(date)" >> "$LOG_FILE"

# Check Chrome is running
if ! pgrep -x "Google Chrome" > /dev/null 2>&1; then
  MSG="Weekly Manual Sources ABORTED: Chrome is not running"
  echo "$MSG" >> "$LOG_FILE"
  osascript -e "display notification \"$MSG\" with title \"Weekly Manual Sources\""
  exit 1
fi

# Run Claude with the manual sources prompt
"$CLAUDE" -p --chrome "Run the manual portion of the weekly-listing-performance skill. Collect ONLY these 3 manual sources for the latest complete BA week (1 week):

1. Account Health screenshots (SOURCE 22): Dashboard + VoC Overview + VoC Details
2. Category Insights text extraction (SOURCE 21): Painting Drop Cloths Plastic Sheeting
3. Product Opportunity Explorer CSV (SOURCE 20): plastic drop cloth niche

IMPORTANT — Auth check first:
Navigate to https://sellercentral.amazon.com/home. If it redirects to a login page, send a macOS notification saying 'Seller Central session expired — manual login required' and abort. Do NOT attempt to enter credentials.

If auth is valid, proceed with all 3 sources. Follow the exact browser steps, file naming (WNN_YYYY-MM-DD format), and Google Drive destinations documented in the weekly-listing-performance skill SKILL.md (specifically SKILL_MANUAL.md for manual sources).

After completion, copy all files from ~/Downloads to the correct Google Drive subfolders and create a short verification summary." >> "$LOG_FILE" 2>&1

EXIT_CODE=$?

echo "" >> "$LOG_FILE"
echo "Finished: $(date)" >> "$LOG_FILE"
echo "Exit code: $EXIT_CODE" >> "$LOG_FILE"

if [ $EXIT_CODE -eq 0 ]; then
  osascript -e 'display notification "Weekly manual sources collection complete" with title "Weekly Manual Sources"'
else
  osascript -e 'display notification "Weekly manual sources FAILED — check logs" with title "Weekly Manual Sources"'
fi

# Trim old logs (keep last 10 runs)
ls -t "$LOG_DIR"/run_*.log 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null

exit $EXIT_CODE
