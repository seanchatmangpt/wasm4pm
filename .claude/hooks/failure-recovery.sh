#!/bin/bash
# PostToolUseFailure Hook: pictl Recovery Injection
#
# Injects recovery suggestions when tools fail.
# CRITICAL: Must provide actionable guidance. Fails loudly if input is invalid.

set -e

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
if [ -z "$TOOL_NAME" ]; then
  echo "ERROR: Cannot parse tool name from hook input" >&2
  exit 1
fi

TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input // {}' 2>/dev/null)
ERROR_MESSAGE=$(echo "$INPUT" | jq -r '.error_message // ""' 2>/dev/null)

# Determine recovery suggestion
RECOVERY=""

if [ "$TOOL_NAME" = "Bash" ]; then
  COMMAND=$(echo "$TOOL_INPUT" | jq -r '.command // ""' 2>/dev/null)

  if echo "$COMMAND" | grep -q "npm\|pnpm"; then
    RECOVERY="npm/pnpm command failed: try 'pnpm install && pnpm build'"
  elif echo "$COMMAND" | grep -q "wasm\|cargo"; then
    RECOVERY="WASM build command failed: try 'cd wasm4pm && npm run build && cd ..'"
  elif echo "$COMMAND" | grep -q "tsc\|typescript"; then
    RECOVERY="TypeScript check failed: try 'pnpm lint' or check 'apps/pmctl/tsconfig.json'"
  elif echo "$COMMAND" | grep -q "test\|vitest"; then
    RECOVERY="Test failed: run single-shot 'pnpm test --run' instead of watch mode"
  elif echo "$COMMAND" | grep -q "git"; then
    RECOVERY="Git command failed: check git state with 'git status' and 'git log --oneline -5'"
  else
    RECOVERY="Run 'pictl doctor' to check environment health"
  fi
fi

if [ -z "$RECOVERY" ]; then
  RECOVERY="Tool '$TOOL_NAME' failed. Run 'pictl doctor' to check environment."
fi

# Output recovery suggestion to stderr (Claude sees this as feedback)
{
  echo "[pictl recovery] $TOOL_NAME failed"
  if [ -n "$ERROR_MESSAGE" ] && [ ${#ERROR_MESSAGE} -gt 0 ]; then
    echo "  Error: ${ERROR_MESSAGE:0:100}"
  fi
  echo "  Action: $RECOVERY"
} >&2

exit 0
