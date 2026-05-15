#!/bin/bash
# PostToolUse Config Change Auditor — logs changes to configuration files
# Fires on any PostToolUse; internally filters to Edit/Write on config paths.
# Non-blocking (exit 0 always).

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null) || TOOL_NAME=""
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null) || FILE_PATH=""

# Only care about file-modification tools
case "$TOOL_NAME" in Edit|Write) ;; *) exit 0 ;; esac

# Only care about config and policy files
if ! echo "$FILE_PATH" | grep -qE '\.(toml|json|yaml|yml|env)$|CLAUDE\.md|settings\.json|wip-config'; then
  exit 0
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
AUDIT_DIR="${CLAUDE_PROJECT_DIR:-.}/.wasm4pm/audit"
mkdir -p "$AUDIT_DIR" 2>/dev/null || true

GIT_HEAD=$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --short HEAD 2>/dev/null) || GIT_HEAD="unknown"

RECORD=$(jq -n \
  --arg ts "$TIMESTAMP" \
  --arg tool "$TOOL_NAME" \
  --arg path "$FILE_PATH" \
  --arg git_head "$GIT_HEAD" \
  '{
    timestamp: $ts,
    event: "config_change",
    tool: $tool,
    file_path: $path,
    git_head: $git_head
  }')

echo "$RECORD" >> "$AUDIT_DIR/config-changes.jsonl" 2>/dev/null || true
echo "Config change audited: $FILE_PATH"
exit 0
