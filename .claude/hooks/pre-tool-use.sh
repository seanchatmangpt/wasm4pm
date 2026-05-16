#!/bin/bash
# PreToolUse: Proof Pack Integrity Guard
#
# Blocks direct writes to proof artifact files that must only be generated
# by `wpm proof collect` and `wpm proof audit` commands.
#
# Anti-fake guarantee: handwritten Accepted verdicts are non-admissible.
# A write here would bypass BLAKE3 hash computation and cargo test execution.
#
# Protected paths:
#   target/proof-packs/*/FINAL/verdict.json
#   target/proof-packs/*/ARTIFACT_PROOF/file-hashes.json
#   target/audits/route-driven-tdd-independent-verification.json

set -e

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
[ -z "$TOOL_NAME" ] && exit 0

# Patterns that identify protected proof artifacts
PROTECTED_DIR_PATTERN='target/(proof-packs|test-proof-packs|audits)/'
PROTECTED_FILE_PATTERN='(verdict\.json|file-hashes\.json|independent-verification\.json)'

blocked() {
  cat >&2 << 'EOF'
PROOF PACK INTEGRITY GUARD — BLOCKED

Direct writes to proof artifact files are forbidden.
These files must only be written by verifier commands:

  wpm proof collect  → FINAL/verdict.json, ARTIFACT_PROOF/file-hashes.json
  wpm proof audit    → target/audits/route-driven-tdd-independent-verification.json

The anti-fake guarantee: handwritten Accepted verdicts are non-admissible.
Writing directly here bypasses BLAKE3 hash computation and cargo test execution.

Fix: Run `wpm proof audit` to generate verified artifacts from observed results.
EOF
  exit 2
}

normalize_path() {
  local p="$1"
  p=$(echo "$p" | tr -s '/')          # collapse consecutive slashes (POSIX, no sed+)
  p=$(echo "$p" | sed 's|^\./||')     # strip leading ./
  echo "$p"
}

is_protected() {
  local raw="$1"
  local p
  p=$(normalize_path "$raw")
  # Block any path containing .. that also references a protected area
  if echo "$raw" | grep -q '\.\.' && echo "$raw" | grep -qE '(proof-packs|test-proof-packs|audits)'; then
    return 0
  fi
  if echo "$p" | grep -qE "$PROTECTED_DIR_PATTERN" \
     && echo "$p" | grep -qE "$PROTECTED_FILE_PATTERN"; then
    return 0
  fi
  return 1
}

case "$TOOL_NAME" in
  Edit|Write)
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
    is_protected "$FILE_PATH" && blocked
    ;;
  Bash)
    COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
    # Detect shell redirections into protected files (>, >>, tee, cp, mv, cat >)
    if echo "$COMMAND" | grep -qE '(>>?|tee |cp |mv )' \
       && echo "$COMMAND" | grep -qE "$PROTECTED_DIR_PATTERN" \
       && echo "$COMMAND" | grep -qE "$PROTECTED_FILE_PATTERN"; then
      blocked
    fi
    # Also catch writeFileSync / fs.writeFile in node one-liners
    if echo "$COMMAND" | grep -qE 'writeFileSync|writeFile' \
       && echo "$COMMAND" | grep -qE "$PROTECTED_DIR_PATTERN" \
       && echo "$COMMAND" | grep -qE "$PROTECTED_FILE_PATTERN"; then
      blocked
    fi
    # Catch interpreter-mediated writes: python3 -c "open(...,'w')...", perl -e, ruby -e, node -e, php -r
    if echo "$COMMAND" | grep -qE '(python[23]?|perl|ruby|node|php)\s+(-[ecr]|-)' \
       && echo "$COMMAND" | grep -qE "$PROTECTED_DIR_PATTERN" \
       && echo "$COMMAND" | grep -qE "$PROTECTED_FILE_PATTERN"; then
      blocked
    fi
    ;;
esac

# Wire cognition contract guard logic inline so PreToolUse has a single entry point.
# (cognition-contract-guard.sh is also run directly for backward compat.)
exit 0
