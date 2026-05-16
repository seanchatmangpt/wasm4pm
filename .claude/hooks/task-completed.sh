#!/bin/bash
# TaskCompleted: Proof Pack Presence Check
#
# Fires when a TodoWrite task completes. For tasks related to proof, testing,
# harness, or conformance work, warns if no proof pack exists on disk.
#
# Non-blocking (exits 0) — advisory only. The Stop hook is the enforcement gate.

INPUT=$(cat)

TASK_TITLE=$(echo "$INPUT" | jq -r '.task.title // empty' 2>/dev/null)
TASK_CONTENT=$(echo "$INPUT" | jq -r '.task.content // empty' 2>/dev/null)
COMBINED="${TASK_TITLE} ${TASK_CONTENT}"

# Only check proof-related tasks
PROOF_KEYWORDS='proof|test|harness|conformance|anti.fake|evidence|route.driven|powl|anti_fake|receipt|verdict'
if ! echo "$COMBINED" | grep -qiE "$PROOF_KEYWORDS"; then
  exit 0
fi

RUST_TARGET="${CLAUDE_PROJECT_DIR}/wasm4pm/target"
PACKS_DIR="${RUST_TARGET}/proof-packs"
AUDIT_FILE="${RUST_TARGET}/audits/route-driven-tdd-independent-verification.json"

# Warn if no proof packs exist for a proof-related task
if [ ! -d "$PACKS_DIR" ] || [ -z "$(ls -A "$PACKS_DIR" 2>/dev/null)" ]; then
  echo "WARN: Task '${TASK_TITLE}' completed but no proof packs found at ${PACKS_DIR}" >&2
  echo "WARN: Run 'wpm proof collect' to generate evidence before claiming done" >&2
  exit 0
fi

# If audit file exists, report its verdict
if [ -f "$AUDIT_FILE" ]; then
  VERDICT=$(jq -r '.final_verdict // "unknown"' "$AUDIT_FILE" 2>/dev/null || echo "unknown")
  if [ "$VERDICT" != "Accepted" ]; then
    echo "WARN: Task '${TASK_TITLE}' completed but proof audit verdict is: ${VERDICT}" >&2
    echo "WARN: Run 'wpm proof audit' to regenerate verified artifacts" >&2
  fi
fi

exit 0
