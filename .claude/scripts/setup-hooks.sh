#!/bin/bash

# setup-hooks.sh — Install git hooks for WIP limit enforcement
# Run this after cloning: bash .claude/scripts/setup-hooks.sh
# This script installs the pre-push hook that enforces WIP limits

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="${REPO_ROOT}/.git/hooks"
HOOK_SRC="${REPO_ROOT}/.claude/hooks"

echo "Setting up git hooks for WIP limit enforcement..."
echo ""

# Create hooks directory if needed
mkdir -p "$HOOKS_DIR"

# Install pre-push hook
PRE_PUSH_HOOK="${HOOKS_DIR}/pre-push"
cat > "$PRE_PUSH_HOOK" << 'HOOK_EOF'
#!/bin/bash

# Pre-push Hook — Run checks before allowing push
# Runs WIP limit check to prevent context thrashing per TPS principles

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOK_DIR="${REPO_ROOT}/.claude/hooks"

# Run WIP check
if [ -f "${HOOK_DIR}/wip-check.sh" ]; then
  bash "${HOOK_DIR}/wip-check.sh"
  WIP_EXIT=$?

  if [ $WIP_EXIT -ne 0 ]; then
    echo ""
    echo "❌ Pre-push hook failed (WIP limit exceeded)"
    echo "📖 See .pictl/wip-config.json for configuration"
    exit $WIP_EXIT
  fi
fi

exit 0
HOOK_EOF

chmod +x "$PRE_PUSH_HOOK"
echo "✅ Created: $PRE_PUSH_HOOK"

# Verify wip-check.sh exists and is executable
if [ ! -x "${HOOK_SRC}/wip-check.sh" ]; then
  echo "⚠️ Warning: ${HOOK_SRC}/wip-check.sh not found or not executable"
  echo "Run: chmod +x ${HOOK_SRC}/wip-check.sh"
  exit 1
fi

echo ""
echo "✅ Git hooks installed successfully"
echo ""
echo "Installed hooks:"
echo "  • pre-push: WIP limit check"
echo ""
echo "Configuration: .pictl/wip-config.json"
echo ""
echo "Test the hook:"
echo "  git push origin <branch>"
echo ""
