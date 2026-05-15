#!/bin/bash
# SubagentStop Hook: Evidence tracking for subagent completions
#
# Appends a summary record to .wasm4pm/sessions/subagents.jsonl when any
# subagent completes. Builds an audit trail of agent activity.
# Non-blocking (exit 0 always).

INPUT=$(cat)

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
SESSIONS_DIR="${CLAUDE_PROJECT_DIR:-.}/.wasm4pm/sessions"
mkdir -p "$SESSIONS_DIR" 2>/dev/null || true

AGENT_TYPE=$(echo "$INPUT" | jq -r '.subagent_type // "unknown"' 2>/dev/null) || AGENT_TYPE="unknown"
AGENT_ID=$(echo "$INPUT" | jq -r '.subagent_id // ""' 2>/dev/null) || AGENT_ID=""
DURATION_MS=$(echo "$INPUT" | jq -r '.duration_ms // null' 2>/dev/null) || DURATION_MS="null"
STATUS=$(echo "$INPUT" | jq -r '.status // "unknown"' 2>/dev/null) || STATUS="unknown"
TOOL_USES=$(echo "$INPUT" | jq -r '.tool_uses // null' 2>/dev/null) || TOOL_USES="null"

RECORD=$(jq -n \
  --arg ts "$TIMESTAMP" \
  --arg agent_type "$AGENT_TYPE" \
  --arg agent_id "$AGENT_ID" \
  --arg status "$STATUS" \
  --argjson duration_ms "${DURATION_MS:-null}" \
  --argjson tool_uses "${TOOL_USES:-null}" \
  '{
    timestamp: $ts,
    agent_type: $agent_type,
    agent_id: $agent_id,
    status: $status,
    duration_ms: $duration_ms,
    tool_uses: $tool_uses
  }')

echo "$RECORD" >> "$SESSIONS_DIR/subagents.jsonl" 2>/dev/null || true

exit 0
