#!/bin/bash

# WIP Limit Check — Local Pre-Push Hook
# Prevents pushing when WIP (work-in-progress) limit exceeded
# Usage: Called automatically by pre-push hook
# Exit: 0 = OK to push, 1 = block push

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
WIP_CONFIG="${REPO_ROOT}/.pictl/wip-config.json"

# Exit gracefully if config doesn't exist
if [ ! -f "$WIP_CONFIG" ]; then
  echo "⚠️ WIP config not found: $WIP_CONFIG"
  exit 0
fi

# Load config
MAX_PRS=$(jq -r '.max_concurrent_prs // 3' "$WIP_CONFIG")
ENABLED=$(jq -r '.enabled // true' "$WIP_CONFIG")

if [ "$ENABLED" != "true" ]; then
  echo "ℹ️ WIP limit check disabled"
  exit 0
fi

# Verify gh CLI installed
if ! command -v gh &> /dev/null; then
  echo "⚠️ GitHub CLI (gh) not found. Skipping WIP check."
  exit 0
fi

# Get current user
CURRENT_USER=$(gh api user --jq '.login' 2>/dev/null || echo "")
if [ -z "$CURRENT_USER" ]; then
  echo "⚠️ Could not determine GitHub user. Skipping WIP check."
  exit 0
fi

# Get repo owner/name
REPO_OWNER=$(git config --get remote.origin.url | sed -E 's|.*/([^/]+)/([^/]+)(\.git)?$|\1|')
REPO_NAME=$(git config --get remote.origin.url | sed -E 's|.*/([^/]+)/([^/]+)(\.git)?$|\2|' | sed 's/\.git$//')
REPO="${REPO_OWNER}/${REPO_NAME}"

# Query open PRs by current user (exclude drafts)
OPEN_PRS=$(gh pr list \
  --author "$CURRENT_USER" \
  --state open \
  --search "is:pr -draft" \
  --repo "$REPO" \
  --limit 100 \
  --json number \
  --jq 'length' 2>/dev/null || echo "0")

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  WIP Limit Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  User: $CURRENT_USER"
echo "  Repo: $REPO"
echo "  Open PRs: $OPEN_PRS / $MAX_PRS"
echo ""

# Check limit
if [ "$OPEN_PRS" -ge "$MAX_PRS" ]; then
  echo "  ❌ WIP LIMIT EXCEEDED"
  echo ""
  echo "  You have $OPEN_PRS open PRs (max: $MAX_PRS)."
  echo ""
  echo "  Per Toyota Production System (TPS) principles, WIP limits prevent"
  echo "  context thrashing and ensure serial task completion."
  echo ""
  echo "  🔧 ACTION REQUIRED:"
  echo "     Merge or close an existing PR to bring open count to <$MAX_PRS"
  echo ""
  echo "  📋 List open PRs:"
  echo "     gh pr list --author @me --state open"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  exit 1
fi

# Warning if close to limit
REMAINING=$((MAX_PRS - OPEN_PRS))
if [ "$REMAINING" -le 1 ]; then
  echo "  ⚠️ WARNING: Close to WIP limit"
  echo "     You have $REMAINING slot(s) remaining ($OPEN_PRS/$MAX_PRS PRs open)"
  echo ""
fi

echo "  ✅ WIP limit check passed"
echo "  $OPEN_PRS open PRs (limit: $MAX_PRS)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

exit 0
