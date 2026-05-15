#!/bin/bash
# InstructionsLoaded Hook: CLAUDE.md / rules file load tracker
# Fires when CLAUDE.md or .claude/rules/*.md files are loaded into context.
# Logs to audit trail so changes to instructions are visible. Non-blocking.

INPUT=$(cat)
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

AUDIT_DIR=".wasm4pm/audit"
mkdir -p "$AUDIT_DIR" 2>/dev/null || true

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
GIT_HEAD=$(git rev-parse --short HEAD 2>/dev/null) || GIT_HEAD="unknown"

FILE_PATH=$(echo "$INPUT" | jq -r '.file_path // ""' 2>/dev/null) || FILE_PATH=""
FILE_TYPE=$(echo "$INPUT" | jq -r '.file_type // ""' 2>/dev/null) || FILE_TYPE=""

RECORD=$(jq -n \
  --arg ts "$TIMESTAMP" \
  --arg file_path "$FILE_PATH" \
  --arg file_type "$FILE_TYPE" \
  --arg git_head "$GIT_HEAD" \
  '{
    timestamp: $ts,
    event: "instructions_loaded",
    file_path: $file_path,
    file_type: $file_type,
    git_head: $git_head
  }')

echo "$RECORD" >> "$AUDIT_DIR/instructions-loaded.jsonl" 2>/dev/null || true

exit 0
