#!/bin/bash
#
# cognition-test-gate.sh — PostToolUse gate for cognition edits
#
# After any edit to cognition files, runs the relevant test suite.
# Runs async (non-blocking) with asyncRewake so Claude sees failures
# as a system reminder without being blocked mid-edit.
#
# Prevents: tests passing only because all WASM paths are mocked.
# Prevents: real regression when cognition wrappers are changed.
#
# Additionally checks for FM-5 violations: files where vi.mock('../init.js')
# is the ONLY way tests pass (i.e., no non-mocked test exists at all).

set -e

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
if [ -z "$TOOL_NAME" ]; then
  exit 0
fi

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

# Only trigger for cognition files
IS_COGNITION=false
if [[ "$FILE_PATH" == *"packages/cognition/src"* ]] || \
   [[ "$FILE_PATH" == *"commands/cognition"* ]] || \
   [[ "$FILE_PATH" == *"cognition-"* && "$FILE_PATH" == *".test.ts"* ]]; then
  IS_COGNITION=true
fi

if ! $IS_COGNITION; then
  exit 0
fi

# ── FM-5 Detector ─────────────────────────────────────────────────────────────
# If the edited file is a test file that contains vi.mock('../init.js'),
# verify there is at least one OTHER test file in the package that does NOT
# mock init.js (otherwise 100% of WASM coverage is fabricated).

if [[ "$FILE_PATH" == *"__tests__"* ]] && [[ "$FILE_PATH" == *"packages/cognition"* ]]; then
  TEST_DIR="$(dirname "$FILE_PATH")"

  # Count test files that mock init.js
  MOCKED_COUNT=$(grep -l "vi\.mock.*init" "$TEST_DIR"/*.ts 2>/dev/null | wc -l | tr -d ' ')
  TOTAL_COUNT=$(ls "$TEST_DIR"/*.ts 2>/dev/null | wc -l | tr -d ' ')
  REAL_COUNT=$((TOTAL_COUNT - MOCKED_COUNT))

  if [ "$REAL_COUNT" -eq 0 ] && [ "$TOTAL_COUNT" -gt 0 ]; then
    cat >&2 << 'EOF'
COGNITION TEST GATE — FM-5 VIOLATION DETECTED

Every test file in packages/cognition/src/__tests__/ mocks init.js.
This means 100% of WASM wrapper paths are tested against a fake binary.
Deleting the real WASM binary would not cause any test to fail.

To fix: Create at least one integration test that imports from '../contract/*.js'
WITHOUT vi.mock('../init.js'). This test will fail until the WASM is built —
which is exactly the right signal.

Audit finding: CRITICAL-3
EOF
    exit 2
  fi
fi

# ── Run cognition tests ───────────────────────────────────────────────────────
# Determine which test suite to run based on the file being edited

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

if [[ "$FILE_PATH" == *"packages/cognition"* ]]; then
  cd "$PROJECT_DIR/packages/cognition"
  if ! pnpm test -- --run 2>&1 | tee /tmp/cognition-test-output.log; then
    echo "packages/cognition tests failed after editing: $FILE_PATH" >&2
    echo "" >&2
    grep -E "FAIL|✗|×|Error:" /tmp/cognition-test-output.log | head -10 >&2
    exit 2
  fi

elif [[ "$FILE_PATH" == *"commands/cognition"* ]] || \
     [[ "$FILE_PATH" == *"cognition-"* && "$FILE_PATH" == *".test.ts"* ]]; then
  cd "$PROJECT_DIR/apps/wasm4pm"
  if ! pnpm test -- src/__tests__/cognition --run 2>&1 | tee /tmp/cognition-cli-test-output.log; then
    echo "Cognition CLI tests failed after editing: $FILE_PATH" >&2
    echo "" >&2
    grep -E "FAIL|✗|×|Error:" /tmp/cognition-cli-test-output.log | head -10 >&2
    exit 2
  fi
fi

exit 0
