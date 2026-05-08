#!/bin/bash
#
# cognition-wasm-gate.sh — PreToolUse + Stop guard
#
# Blocks edits to packages/cognition wrappers if the WASM binary has not been built.
# A wrapper with no binary is not an implementation — it is a stub.
#
# Also blocks editing runContract/verifyContract/etc. if they send the wrong JSON
# shape to cognition_run (BreedInput directly instead of { breed, contract, options }).
#
# CRITICAL findings this prevents:
#   CRITICAL-3: wasm4pm-cognition/pkg/ does not exist — all real paths dead
#   CRITICAL-4: runContract sends BreedInput directly; Rust expects { breed, contract, options }

set -e

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
if [ -z "$TOOL_NAME" ]; then
  exit 0
fi

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
NEW_STRING=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty' 2>/dev/null)
CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty' 2>/dev/null)
EDIT_CONTENT="${NEW_STRING}${CONTENT}"

PKG_DIR="${CLAUDE_PROJECT_DIR}/crates/wasm4pm-cognition/pkg"

# ── Guard 1: Block wrapper edits when WASM is not built ──────────────────────
# If editing any packages/cognition wrapper file, the pkg/ directory must exist.
# Without it, every real execution path throws ERR_MODULE_NOT_FOUND.

IS_WRAPPER=false
if [[ "$FILE_PATH" == *"packages/cognition/src/contract"* ]] || \
   [[ "$FILE_PATH" == *"packages/cognition/src/system"* ]] || \
   [[ "$FILE_PATH" == *"packages/cognition/src/receipt"* ]] || \
   [[ "$FILE_PATH" == *"packages/cognition/src/init.ts"* ]]; then
  IS_WRAPPER=true
fi

if $IS_WRAPPER && [ ! -d "$PKG_DIR" ]; then
  cat >&2 << 'EOF'
COGNITION WASM GATE — BLOCKED

You are editing a WASM wrapper but crates/wasm4pm-cognition/pkg/ does not exist.
Editing the wrapper without the binary produces untestable dead code.

Build the WASM first:
  cd crates/wasm4pm-cognition
  wasm-pack build --target nodejs --out-dir pkg

Then add to packages/cognition/package.json:
  "dependencies": { "wasm4pm-cognition": "file:../../crates/wasm4pm-cognition/pkg" }

Audit finding: CRITICAL-3
EOF
  exit 2
fi

# ── Guard 2: runContract must wrap input as { breed, contract, options } ─────
# Rust ValidatedRunInput requires breed: String at the top level.
# Sending BreedInput directly always fails with "missing field 'breed'".

if [[ "$FILE_PATH" == *"packages/cognition/src/contract/run.ts"* ]]; then

  # Block: JSON.stringify(input) sent directly without wrapping
  # Pattern: cognition_run(JSON.stringify(input)) where input is BreedInput directly
  if echo "$EDIT_CONTENT" | grep -qE 'cognition_run\s*\(\s*JSON\.stringify\s*\(\s*input\s*\)'; then
    cat >&2 << 'EOF'
COGNITION WASM GATE — BLOCKED

cognition_run receives a bare BreedInput but Rust expects { breed, contract, options }.

Rust struct:
  struct ValidatedRunInput {
    breed: String,      // REQUIRED
    contract: BreedInput,
    options: ValidatedRunOptions,
  }

Use instead:
  const inputJson = JSON.stringify({ breed, contract: input });
  const raw = wasm.cognition_run(inputJson);

This requires adding a 'breed: string' parameter to runContract().

Reference: crates/wasm4pm-cognition/src/wasm.rs:118-124
Audit finding: CRITICAL-4
EOF
    exit 2
  fi

fi

# ── Guard 3: VerifyResult status mismatch ────────────────────────────────────
# Rust returns "has_findings", not "rejected". Any code checking === 'rejected' is dead.

if [[ "$FILE_PATH" == *"packages/cognition/src"* ]]; then
  if echo "$EDIT_CONTENT" | grep -qE "=== ['\"]rejected['\"]|== ['\"]rejected['\"]"; then
    cat >&2 << 'EOF'
COGNITION WASM GATE — BLOCKED

Rust cognition_verify returns status "has_findings" when detectors fire, not "rejected".

The check === 'rejected' will never be true.

Use instead:
  result.status === 'has_findings'

And update VerifyResult type:
  status: 'verified' | 'has_findings' | string;

Reference: crates/wasm4pm-cognition/src/wasm.rs:226-228
Audit finding: MEDIUM-4
EOF
    exit 2
  fi
fi

exit 0
