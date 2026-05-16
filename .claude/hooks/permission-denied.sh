#!/bin/bash
# PermissionDenied Hook: Denied Permission Audit Logger
# Fires when auto mode classifier denies a tool use.
# Logs to audit trail. Return {"retry": true} to allow model to retry.
# Default: allow retry (non-blocking).

INPUT=$(cat)
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

AUDIT_DIR=".wasm4pm/audit"
mkdir -p "$AUDIT_DIR" 2>/dev/null || true

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
GIT_HEAD=$(git rev-parse --short HEAD 2>/dev/null) || GIT_HEAD="unknown"

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null) || TOOL_NAME=""
TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}' 2>/dev/null) || TOOL_INPUT="{}"
DENY_REASON=$(echo "$INPUT" | jq -r '.deny_reason // ""' 2>/dev/null) || DENY_REASON=""

RECORD=$(jq -n \
  --arg ts "$TIMESTAMP" \
  --arg tool "$TOOL_NAME" \
  --argjson tool_input "$TOOL_INPUT" \
  --arg reason "$DENY_REASON" \
  --arg git_head "$GIT_HEAD" \
  '{
    timestamp: $ts,
    event: "permission_denied",
    tool_name: $tool,
    tool_input: $tool_input,
    deny_reason: $reason,
    git_head: $git_head
  }')

echo "$RECORD" >> "$AUDIT_DIR/permission-denied.jsonl" 2>/dev/null || true
echo "Permission denied: $TOOL_NAME — $DENY_REASON"

exit 0
