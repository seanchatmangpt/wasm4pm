#!/bin/bash
# UserPromptSubmit: Work Order Recording
#
# Records each user prompt as a timestamped work order in the session evidence log.
# Non-blocking — always exits 0.
#
# Output: wasm4pm/target/agent-runs/YYYYMMDD/prompts.jsonl

INPUT=$(cat)

TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
RUN_DIR="${CLAUDE_PROJECT_DIR}/wasm4pm/target/agent-runs/$(date -u +%Y%m%d)"
mkdir -p "$RUN_DIR" 2>/dev/null || exit 0

PROMPT=$(echo "$INPUT" | jq -r '.prompt // .message // empty' 2>/dev/null)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)

if [ -n "$PROMPT" ]; then
  jq -cn \
    --arg ts "$TIMESTAMP" \
    --arg sid "$SESSION_ID" \
    --arg p "$PROMPT" \
    '{timestamp: $ts, type: "work_order", session_id: $sid, prompt: ($p | .[0:500])}' \
    >> "$RUN_DIR/prompts.jsonl" 2>/dev/null || true
fi

# Scan for anti-patterns in the prompt (advisory, non-blocking)
if echo "$PROMPT" | grep -qiE 'FM-5|mock init\.js|isWasmAvailable|silent fallback|skip.?receipt|--no-verify'; then
  echo "WARN: Prompt contains known anti-pattern keywords — review before proceeding" >&2
fi

exit 0
