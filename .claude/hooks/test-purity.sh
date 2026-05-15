#!/bin/bash
# PostToolUse Test Purity Enforcement — Gemba principle: no mocks in integration tests
# Fires after Edit/Write on test files; blocks if integration tests contain mocks.
# Returns {"decision":"block","reason":"..."} on violation. Non-blocking for non-test files.

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null) || TOOL_NAME=""
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null) || FILE_PATH=""

# Only fire for file edits
case "$TOOL_NAME" in Edit|Write) ;; *) exit 0 ;; esac

# Only fire for test files
echo "$FILE_PATH" | grep -qE '\.test\.(ts|js)|\.spec\.(ts|js)|__tests__/' || exit 0

# Only enforce on integration tests (not unit tests)
# Integration tests: files NOT in src/__tests__/unit/ and NOT named *.unit.test.*
if echo "$FILE_PATH" | grep -qE 'unit/|\.unit\.test\.'; then
  exit 0
fi

# Check for forbidden mock patterns in the edited file
ABS_PATH="${CLAUDE_PROJECT_DIR:-.}/$FILE_PATH"
[ -f "$ABS_PATH" ] || ABS_PATH="$FILE_PATH"
[ -f "$ABS_PATH" ] || exit 0

VIOLATIONS=$(grep -nE \
  "vi\.mock\(|jest\.mock\(|sinon\.stub\(|mockReturnValue\(|mockImplementation\(|jest\.fn\(\)" \
  "$ABS_PATH" 2>/dev/null | head -5)

if [ -n "$VIOLATIONS" ]; then
  VIOLATION_COUNT=$(echo "$VIOLATIONS" | wc -l | tr -d ' ')
  echo "TEST PURITY VIOLATION: $VIOLATION_COUNT mock(s) found in integration test: $FILE_PATH"
  echo "$VIOLATIONS"
  echo ""
  echo "Gemba principle: Integration tests must use real dependencies, not mocks."
  echo "Use unit tests (packages/*/src/__tests__/unit/) for mock-based tests."
  # Block via Claude Code PostToolUse block mechanism
  printf '{"decision":"block","reason":"Test purity violation: %s mock(s) found in integration test %s — use unit tests for mocks"}\n' \
    "$VIOLATION_COUNT" "$FILE_PATH"
  exit 2
fi

exit 0
