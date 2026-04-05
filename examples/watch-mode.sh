#!/bin/bash
# Watch mode example for continuous process mining
# Monitors a directory for new event logs and automatically processes them

set -e

# Configuration
DATA_DIR="${1:-.}"
OUTPUT_DIR="${2:-./results}"
ALGORITHM="${3:-dfg}"
PROFILE="${4:-balanced}"

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

echo "Watch Mode: Continuous Process Mining"
echo "========================================"
echo "Data directory:     $DATA_DIR"
echo "Output directory:   $OUTPUT_DIR"
echo "Algorithm:          $ALGORITHM"
echo "Profile:            $PROFILE"
echo ""
echo "Watching for new .xes files..."
echo "Press Ctrl+C to stop"
echo ""

# Use pmctl watch mode
pmctl watch "$DATA_DIR" \
  --algorithm "$ALGORITHM" \
  --profile "$PROFILE" \
  --output "$OUTPUT_DIR" \
  --pattern "*.xes" \
  --poll 5000 \
  --verbose

# Alternative: Manual polling with inotifywait (Linux)
# if command -v inotifywait &> /dev/null; then
#   inotifywait -m -e close_write -r "$DATA_DIR" --include '\.xes$' |
#   while read -r directory action filename; do
#     logfile="$directory$filename"
#     echo "Processing: $logfile"
#     pmctl run "$logfile" \
#       --algorithm "$ALGORITHM" \
#       --profile "$PROFILE" \
#       --output "$OUTPUT_DIR/$(basename "$logfile" .xes)-result.json"
#   done
# fi
