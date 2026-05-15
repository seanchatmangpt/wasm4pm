#!/bin/bash
# StopFailure Hook: API Error Audit Logger
# Fires when the turn ends due to an API error (rate limit, auth failure, etc.).
# Logs the error to the audit trail and emits a recovery suggestion. Non-blocking.

INPUT=$(cat)
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

AUDIT_DIR=".wasm4pm/audit"
mkdir -p "$AUDIT_DIR" 2>/dev/null || true

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
GIT_HEAD=$(git rev-parse --short HEAD 2>/dev/null) || GIT_HEAD="unknown"

ERROR_TYPE=$(echo "$INPUT" | jq -r '.error_type // "unknown"' 2>/dev/null) || ERROR_TYPE="unknown"
ERROR_MSG=$(echo "$INPUT" | jq -r '.error_message // ""' 2>/dev/null) || ERROR_MSG=""
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""' 2>/dev/null) || SESSION_ID=""

RECORD=$(jq -n \
  --arg ts "$TIMESTAMP" \
  --arg error_type "$ERROR_TYPE" \
  --arg error_msg "$ERROR_MSG" \
  --arg session_id "$SESSION_ID" \
  --arg git_head "$GIT_HEAD" \
  '{
    timestamp: $ts,
    event: "stop_failure",
    error_type: $error_type,
    error_message: $error_msg,
    session_id: $session_id,
    git_head: $git_head
  }')

echo "$RECORD" >> "$AUDIT_DIR/stop-failures.jsonl" 2>/dev/null || true

echo "⚠️  StopFailure: $ERROR_TYPE — $ERROR_MSG"
echo "   Logged to $AUDIT_DIR/stop-failures.jsonl"

case "$ERROR_TYPE" in
  *rate_limit*|*overloaded*)
    echo "   Recovery: wait 60s then retry (rate limit)"
    ;;
  *auth*|*unauthorized*)
    echo "   Recovery: check ANTHROPIC_API_KEY is valid"
    ;;
  *timeout*)
    echo "   Recovery: break task into smaller chunks"
    ;;
esac

exit 0
