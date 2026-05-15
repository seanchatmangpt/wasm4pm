#!/bin/bash
# UserPromptSubmit WIP Check — warn if concurrent PRs exceed WIP limit
# Advisory only (exit 0 always). Warns in output if limit exceeded.

WIP_CONFIG="${CLAUDE_PROJECT_DIR:-.}/.wasm4pm/wip-config.json"
MAX_PRS=3

if [ -f "$WIP_CONFIG" ]; then
  ENABLED=$(jq -r '.enabled // true' "$WIP_CONFIG" 2>/dev/null) || ENABLED="true"
  [ "$ENABLED" = "false" ] && exit 0
  MAX_PRS=$(jq -r '.max_concurrent_prs // 3' "$WIP_CONFIG" 2>/dev/null) || MAX_PRS=3
  EXCLUDE_DRAFTS=$(jq -r '.exclude_drafts // true' "$WIP_CONFIG" 2>/dev/null) || EXCLUDE_DRAFTS="true"
fi

# Skip if gh not available or no git remote
command -v gh &>/dev/null || exit 0
git -C "${CLAUDE_PROJECT_DIR:-.}" remote get-url origin &>/dev/null 2>&1 || exit 0

DRAFT_FLAG=""
[ "$EXCLUDE_DRAFTS" = "true" ] && DRAFT_FLAG="--draft=false"

OPEN_PRS=$(gh pr list --state open $DRAFT_FLAG --json number 2>/dev/null | jq 'length' 2>/dev/null) || exit 0
[ -z "$OPEN_PRS" ] && exit 0

if [ "$OPEN_PRS" -gt "$MAX_PRS" ]; then
  echo "⚠️  WIP LIMIT EXCEEDED: $OPEN_PRS open PRs (limit: $MAX_PRS)"
  echo "   Consider closing or merging PRs before starting new work."
  echo "   Run: gh pr list --state open"
fi

exit 0
