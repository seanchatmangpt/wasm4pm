#!/bin/bash
# PostToolUse: Tool Evidence Capture with BLAKE3 Hash Chain
#
# Records each tool use into a tamper-evident session evidence log at:
#   wasm4pm/target/agent-runs/YYYYMMDD/tool-events.jsonl
#
# Each entry carries:
#   event_hash  — BLAKE3 (or sha256 fallback) of the event JSON before chaining
#   chain_hash  — BLAKE3(prev_chain_hash || event_hash) — ordering proof
#   hash_algo   — "blake3" | "sha256" (indicates which tool was used)
#
# Non-blocking — always exits 0.

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
[ -z "$TOOL_NAME" ] && exit 0

TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
RUN_DIR="${CLAUDE_PROJECT_DIR}/wasm4pm/target/agent-runs/$(date -u +%Y%m%d)"
mkdir -p "$RUN_DIR" 2>/dev/null || exit 0

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null | head -c 200)
EXIT_CODE=$(echo "$INPUT" | jq -r '.tool_result.exit_code // empty' 2>/dev/null)

# Build base event JSON (no hash fields yet)
EVENT_JSON=$(jq -cn \
  --arg ts "$TIMESTAMP" \
  --arg tool "$TOOL_NAME" \
  --arg fp "$FILE_PATH" \
  --arg cmd "$COMMAND" \
  --arg ec "$EXIT_CODE" \
  '{timestamp: $ts, tool: $tool, file_path: (if $fp != "" then $fp else null end), command: (if $cmd != "" then $cmd else null end), exit_code: (if $ec != "" then ($ec | tonumber) else null end)}' 2>/dev/null) || exit 0

# Compute event hash (BLAKE3 preferred, sha256 fallback)
if command -v b3sum &>/dev/null; then
  EVENT_HASH=$(printf '%s' "$EVENT_JSON" | b3sum --no-names 2>/dev/null | tr -d ' \n')
  ALGO="blake3"
else
  EVENT_HASH=$(printf '%s' "$EVENT_JSON" | sha256sum 2>/dev/null | awk '{print $1}')
  ALGO="sha256"
fi

# Read previous chain hash from last entry in log
PREV_CHAIN=""
if [ -f "$RUN_DIR/tool-events.jsonl" ]; then
  PREV_CHAIN=$(tail -1 "$RUN_DIR/tool-events.jsonl" | jq -r '.chain_hash // empty' 2>/dev/null)
fi
# Genesis entry uses 64 zero bytes as the previous chain hash
[ -z "$PREV_CHAIN" ] && PREV_CHAIN="0000000000000000000000000000000000000000000000000000000000000000"

# Chain hash = hash(prev_chain_hash || event_hash) — makes ordering tamper-evident
if command -v b3sum &>/dev/null; then
  CHAIN_HASH=$(printf '%s%s' "$PREV_CHAIN" "$EVENT_HASH" | b3sum --no-names 2>/dev/null | tr -d ' \n')
else
  CHAIN_HASH=$(printf '%s%s' "$PREV_CHAIN" "$EVENT_HASH" | sha256sum 2>/dev/null | awk '{print $1}')
fi

jq -cn \
  --arg ts "$TIMESTAMP" \
  --arg tool "$TOOL_NAME" \
  --arg fp "$FILE_PATH" \
  --arg cmd "$COMMAND" \
  --arg ec "$EXIT_CODE" \
  --arg eh "$EVENT_HASH" \
  --arg ch "$CHAIN_HASH" \
  --arg algo "$ALGO" \
  '{timestamp: $ts, tool: $tool, file_path: (if $fp != "" then $fp else null end), command: (if $cmd != "" then $cmd else null end), exit_code: (if $ec != "" then ($ec | tonumber) else null end), event_hash: $eh, chain_hash: $ch, hash_algo: $algo}' \
  >> "$RUN_DIR/tool-events.jsonl" 2>/dev/null || true

# Update CHAIN_HEAD — external anchor for full-rewrite tamper detection
printf '%s' "$CHAIN_HASH" > "$RUN_DIR/CHAIN_HEAD" 2>/dev/null || true

exit 0
