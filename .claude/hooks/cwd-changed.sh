#!/bin/bash
# CwdChanged Hook: Working Directory Change Tracker
# Fires when the working directory changes (reactive env management).
# Validates that cwd is within project root. Advisory only.

INPUT=$(cat)
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

NEW_CWD=$(echo "$INPUT" | jq -r '.new_cwd // ""' 2>/dev/null) || NEW_CWD=""
OLD_CWD=$(echo "$INPUT" | jq -r '.old_cwd // ""' 2>/dev/null) || OLD_CWD=""

# Warn if cwd leaves project root
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
if [ -n "$NEW_CWD" ] && [ -n "$PROJECT_ROOT" ]; then
  case "$NEW_CWD" in
    "${PROJECT_ROOT}"*) ;; # Within project — OK
    *) echo "⚠️  CwdChanged: leaving project root ($NEW_CWD is outside $PROJECT_ROOT)" ;;
  esac
fi

exit 0
