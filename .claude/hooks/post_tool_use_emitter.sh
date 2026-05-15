#!/bin/bash
# PostToolUse Evidence Emitter — records each tool invocation as a work unit
# Reads Claude Code PostToolUse JSON from stdin. Non-blocking (exit 0 always).

INPUT=$(cat)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EVIDENCE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/evidence"
mkdir -p "$EVIDENCE_DIR" 2>/dev/null || true

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"' 2>/dev/null) || TOOL_NAME="unknown"
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null) || FILE_PATH=""
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null) || CMD=""
WORK_UNIT_ID="wu-$(date -u +%Y%m%d%H%M%S)-$$-${RANDOM}"

GIT_HEAD=$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --short HEAD 2>/dev/null) || GIT_HEAD="unknown"

RECORD=$(jq -n \
  --arg wuid "$WORK_UNIT_ID" \
  --arg ts "$TIMESTAMP" \
  --arg tool "$TOOL_NAME" \
  --arg path "$FILE_PATH" \
  --arg cmd "$CMD" \
  --arg git_head "$GIT_HEAD" \
  '{
    work_unit_id: $wuid,
    timestamp: $ts,
    tool_name: $tool,
    file_path: (if $path != "" then $path else null end),
    command_preview: (if $cmd != "" then ($cmd | .[0:80]) else null end),
    git_head: $git_head
  }')

echo "$RECORD" >> "$EVIDENCE_DIR/events.jsonl" 2>/dev/null || true
exit 0
