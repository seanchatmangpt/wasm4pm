#!/bin/bash
# PermissionRequest Hook: Audit log + dangerous pattern blocking
#
# Logs every permission request to .wasm4pm/audit/permissions.jsonl.
# Blocks specific dangerous patterns per TPS safety rules.
# Returns {"hookSpecificOutput": {"permissionDecision": "deny"}} to block.
# Default: allow everything else (non-blocking).

INPUT=$(cat)

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
AUDIT_DIR="${CLAUDE_PROJECT_DIR:-.}/.wasm4pm/audit"
mkdir -p "$AUDIT_DIR" 2>/dev/null || true

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null) || TOOL_NAME=""
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null) || COMMAND=""
PERMISSION=$(echo "$INPUT" | jq -r '.permission // empty' 2>/dev/null) || PERMISSION=""

DECISION="allow"
DENY_REASON=""

# Block: filesystem wipe patterns
if echo "$COMMAND" | grep -qE 'rm\s+-rf\s+/[^/]|rm\s+-rf\s+"/"'; then
  DECISION="deny"
  DENY_REASON="Filesystem wipe blocked by TPS safety gate"
fi

# Block: force push to protected branches
if echo "$COMMAND" | grep -qE 'git\s+push\s+(--force|-f)\b.*(main|master)'; then
  DECISION="deny"
  DENY_REASON="Force push to main/master blocked by TPS safety gate"
fi

# Block: hard reset (use revert instead per git workflow rules)
if echo "$COMMAND" | grep -qE 'git\s+reset\s+--hard'; then
  DECISION="deny"
  DENY_REASON="git reset --hard blocked by TPS safety gate — use git revert to fix forward"
fi

# Block: SQL destructive operations in Bash
if echo "$COMMAND" | grep -qiE 'DROP\s+TABLE|DROP\s+DATABASE|TRUNCATE\s+TABLE'; then
  DECISION="deny"
  DENY_REASON="Destructive SQL blocked by TPS safety gate"
fi

# Log the decision
RECORD=$(jq -n \
  --arg ts "$TIMESTAMP" \
  --arg tool "$TOOL_NAME" \
  --arg permission "$PERMISSION" \
  --arg command "$COMMAND" \
  --arg decision "$DECISION" \
  --arg reason "$DENY_REASON" \
  '{
    timestamp: $ts,
    tool: $tool,
    permission: $permission,
    command: $command,
    decision: $decision,
    deny_reason: (if $reason == "" then null else $reason end)
  }')

echo "$RECORD" >> "$AUDIT_DIR/permissions.jsonl" 2>/dev/null || true

if [ "$DECISION" = "deny" ]; then
  printf '{"hookSpecificOutput": {"permissionDecision": "deny", "reason": "%s"}}\n' "$DENY_REASON"
fi

exit 0
