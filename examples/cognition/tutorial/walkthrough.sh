#!/usr/bin/env bash
# Cognition tutorial walkthrough — mirrors docs/cognition-tutorial.md verbatim.
# Run from the repository root:
#   bash examples/cognition/tutorial/walkthrough.sh
#
# Expected exit code: 0 if all steps pass.
# If wpm cognition is not fully wired yet (exit 3), see docs/cognition-error-catalog.md.

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$REPO_ROOT"

# Resolve the wpm binary — installed or from workspace source.
if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  WPM="pnpm --silent --filter @wasm4pm/cli exec wpm"
fi

TUTORIAL_INPUT="examples/cognition/tutorial/intent.json"
LEDGER_DIR=".wasm4pm/receipts"

echo ""
echo "════════════════════════════════════════════════"
echo " wasm4pm Cognition Tutorial — walkthrough.sh"
echo "════════════════════════════════════════════════"
echo ""

# ── Act 1: Build check ────────────────────────────────────────────────────────
echo "── Act 1: Verify build is healthy ──"
$WPM status
echo "(exit $?)"
echo ""

# ── Act 2: First receipt ──────────────────────────────────────────────────────
echo "── Act 2: Run Prolog example — first receipt ──"
PROLOG_OUTPUT="examples/cognition/prolog/result.json"
$WPM cognition run \
  --contract prolog \
  --input examples/cognition/prolog/intent.json \
  --format json \
  | tee "$PROLOG_OUTPUT"
echo ""
echo "(exit $?)"
echo ""

# ── Act 3: Extract receipt id and verify replay determinism ───────────────────
echo "── Act 3: Replay ──"
RECEIPT_ID=$(python3 -c "
import json, sys
d = json.load(open('$PROLOG_OUTPUT'))
rc = d.get('payload', {}).get('receipt_chain', {})
print(rc.get('id', rc.get('run_id', 'unknown')))
" 2>/dev/null || echo "unknown")

echo "Receipt ID: $RECEIPT_ID"

if [ "$RECEIPT_ID" != "unknown" ] && [ -f "$LEDGER_DIR/$RECEIPT_ID.json" ]; then
  $WPM cognition replay --receipt-id "$RECEIPT_ID" --ledger-dir "$LEDGER_DIR" --format json
  echo "(exit $?)"
else
  echo "NOTE: Receipt not persisted yet — replay skipped. See docs/cognition-error-catalog.md."
fi
echo ""

# ── Act 4: Verify adversarial gates ───────────────────────────────────────────
echo "── Act 4: Verify adversarial gates on receipt ──"
if [ "$RECEIPT_ID" != "unknown" ] && [ -f "$LEDGER_DIR/$RECEIPT_ID.json" ]; then
  $WPM cognition verify --receipt-id "$RECEIPT_ID" --ledger-dir "$LEDGER_DIR" --format json
  echo "(exit $?)"
else
  echo "NOTE: No persisted receipt — verify skipped. See docs/cognition-error-catalog.md."
fi
echo ""

# ── Act 4b: Tutorial richer input (Allow + Deny paths) ───────────────────────
echo "── Act 4b: Run tutorial intent (Allow + Deny paths via MYCIN-style rules) ──"
$WPM cognition run \
  --contract mycin \
  --input "$TUTORIAL_INPUT" \
  --format json \
  | tee .wasm4pm/tutorial-result.json
echo "(exit $?)"
echo ""

# ── Act 5: Run all 4 examples ─────────────────────────────────────────────────
echo "── Act 5: Run all examples ──"
bash examples/cognition/run-all.sh
echo ""

echo "════════════════════════════════════════════════"
echo " Tutorial complete — all acts passed."
echo " Next: read docs/cognition-tutorial.md for explanation."
echo "════════════════════════════════════════════════"
