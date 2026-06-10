#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../../" && pwd)"

# Detect wpm
WPM=""
if command -v wpm &>/dev/null; then
  WPM="wpm"
elif [[ -f "$REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js" ]]; then
  WPM="node $REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
else
  echo "ERROR: wpm not found in PATH and not at $REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js" >&2
  exit 1
fi

echo "Using wpm: $WPM"
echo ""

STAGES=(
  "0-eliza:eliza"
  "1-autoinstinct_semantics:autoinstinct_semantics"
  "2-autoinstinct_neurosis:autoinstinct_neurosis"
  "3-mycin:mycin"
  "4-gps:gps"
  "5-strips:strips"
  "6-cbr:cbr"
)

TOTAL=${#STAGES[@]}
PASSED=0

cd "$SCRIPT_DIR"

TMPFILE=$(mktemp /tmp/wpm-chain-XXXXXX.json)
trap 'rm -f "$TMPFILE"' EXIT

for entry in "${STAGES[@]}"; do
  STAGE_DIR="${entry%%:*}"
  BREED="${entry##*:}"
  STAGE_NUM="${STAGE_DIR%%-*}"
  STAGE_PATH="stages/$STAGE_DIR"

  mkdir -p "$STAGE_PATH"

  # If not stage 0, run transform to produce intent.json from previous result
  if [[ "$STAGE_NUM" != "0" ]]; then
    PREV_NUM=$((STAGE_NUM - 1))
    PREV_DIR=$(ls -d stages/${PREV_NUM}-* 2>/dev/null | head -1)
    if [[ -z "$PREV_DIR" || ! -f "$PREV_DIR/result.json" ]]; then
      echo "Stage $STAGE_NUM [$BREED]: FAIL (previous result not found at $PREV_DIR/result.json)" >&2
      exit 1
    fi
    python3 "$STAGE_PATH/transform.py" < "$PREV_DIR/result.json" > "$STAGE_PATH/intent.json"
  fi

  # Run cognition — write output to temp file to avoid shell variable truncation
  # Redirect stderr to /dev/null to exclude Node.js ExperimentalWarning lines
  WPM_EXIT=0
  $WPM cognition run --contract "$BREED" --input "$STAGE_PATH/intent.json" --format json > "$TMPFILE" 2>/dev/null || WPM_EXIT=$?
  # If failed, re-run capturing stderr to show error
  if [[ $WPM_EXIT -ne 0 ]]; then
    $WPM cognition run --contract "$BREED" --input "$STAGE_PATH/intent.json" --format json > "$TMPFILE" 2>&1 || true
  fi

  if [[ $WPM_EXIT -ne 0 ]]; then
    echo "Stage $STAGE_NUM [$BREED]: FAIL (wpm exited $WPM_EXIT)" >&2
    # Print the error message from JSON
    python3 -c "
import sys, json
try:
    d = json.load(open('$TMPFILE'))
    print('  Error:', d.get('message','')[:300])
except Exception as e:
    print('  (could not parse output:', e, ')')
" >&2
    exit 1
  fi

  # Compact the JSON and save as result.json
  python3 -c "
import json, sys
with open('$TMPFILE') as f:
    d = json.load(f)
with open('$STAGE_PATH/result.json', 'w') as f:
    json.dump(d, f)
print(json.dumps(d))
" > /dev/null
  cp "$TMPFILE" "$STAGE_PATH/result.json"

  # Extract status and output_hash from result.json
  read STATUS OUTPUT_HASH < <(python3 -c "
import json, sys
d = json.load(open('$STAGE_PATH/result.json'))
pl = d.get('payload') or {}
status = d.get('status') or pl.get('status') or 'unknown'
h = pl.get('output_hash') or d.get('output_hash') or ''
print(status, h[:16] if h else 'none')
" 2>/dev/null || echo "unknown none")

  if [[ "$STATUS" == "ok" || "$STATUS" == "success" ]]; then
    echo "Stage $STAGE_NUM [$BREED]: ok / hash=$OUTPUT_HASH"
    PASSED=$((PASSED + 1))
  else
    echo "Stage $STAGE_NUM [$BREED]: FAIL (status=$STATUS, hash=$OUTPUT_HASH)" >&2
    python3 -c "
import json
d = json.load(open('$STAGE_PATH/result.json'))
print('  message:', str(d.get('message',''))[:300])
" >&2
    exit 1
  fi
done

echo ""
echo "=== Chain complete: $PASSED/$TOTAL stages ok ==="
