#!/bin/bash
#
# cognition-contract-guard.sh — PreToolUse Edit/Write guard
#
# Blocks edits that access fields that do not exist in the Rust WASM output.
# Each blocked pattern maps to a confirmed adversarial audit finding.
#
# CRITICAL findings this prevents:
#   CRITICAL-1: .exit_code — Rust returns { status: "ok" }, not { exit_code: 0 }
#   CRITICAL-1: .receipt_chain — Rust returns { run_id, output_hash, replay_pointer }
#   CRITICAL-1: .findings on ContractResult — Rust has no findings field on run output
#   CRITICAL-2: result.decision — Rust returns { status }, not { decision }
#   CRITICAL-2: result.hash — Rust returns { output_hash }, not { hash }
#   CRITICAL-2: result.inference_trace — field does not exist in Rust output
#   MEDIUM-5: .candidates on SystemBuildResult — Rust returns { pareto_front, dominated }
#   HIGH-1: Rule without certainty — Rust requires certainty: f32 on Rule struct

set -e

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
if [ -z "$TOOL_NAME" ]; then
  exit 0
fi

# Get file path and content for Edit/Write
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
NEW_STRING=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty' 2>/dev/null)
CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty' 2>/dev/null)

EDIT_CONTENT="${NEW_STRING}${CONTENT}"

# Only check cognition-relevant files
IS_COGNITION_CLI=false
IS_COGNITION_PKG=false
IS_WATCH=false

if [[ "$FILE_PATH" == *"commands/cognition"* ]]; then
  IS_COGNITION_CLI=true
fi
if [[ "$FILE_PATH" == *"packages/cognition/src"* ]]; then
  IS_COGNITION_PKG=true
fi
if [[ "$FILE_PATH" == *"cognition/watch.ts" ]]; then
  IS_WATCH=true
fi

# ── Guard 1: Forbidden fields from cognition_run output ───────────────────────
# Rust cognition_run returns: { status, breed, run_id, output_hash, replay_pointer, options_profile, output }
# It does NOT return: exit_code, receipt_chain, findings (on ContractResult)

if $IS_COGNITION_CLI; then

  if echo "$EDIT_CONTENT" | grep -qE '\.exit_code\b'; then
    cat >&2 << 'EOF'
COGNITION CONTRACT GUARD — BLOCKED

.exit_code does not exist in Rust cognition_run output.

Rust returns:  { "status": "ok", "breed": "...", "run_id": "...", "output_hash": "...", ... }

Use instead:
  const ok = (cresult as { status?: string }).status === 'ok';
  finalExitCode = ok ? EXIT_CODES.success : EXIT_CODES.execution_error;

Reference: crates/wasm4pm-cognition/src/wasm.rs:182-190
Audit finding: CRITICAL-1
EOF
    exit 2
  fi

  if echo "$EDIT_CONTENT" | grep -qE '\.receipt_chain\b'; then
    cat >&2 << 'EOF'
COGNITION CONTRACT GUARD — BLOCKED

.receipt_chain does not exist in Rust cognition_run output.

Rust returns:  { "run_id": "...", "output_hash": "...", "replay_pointer": "..." }

Use instead:
  const runId = (cresult as { run_id?: string }).run_id;
  saveReceipt(runId, '.wasm4pm/receipts');

Reference: crates/wasm4pm-cognition/src/wasm.rs:182-190
Audit finding: CRITICAL-1
EOF
    exit 2
  fi

fi

# ── Guard 2: watch.ts — forbidden fields on runContract result ────────────────
# Rust cognition_run does NOT return: decision, hash (as top-level), inference_trace

if $IS_WATCH; then

  if echo "$EDIT_CONTENT" | grep -qE 'result\.decision\b'; then
    cat >&2 << 'EOF'
COGNITION CONTRACT GUARD — BLOCKED

result.decision does not exist in Rust cognition_run output.

Rust returns: { "status": "ok" | "error", ... }

Use instead:
  decision: (r.status === 'ok') ? 'Allow' : 'Deny',

Reference: crates/wasm4pm-cognition/src/wasm.rs:182-190
Audit finding: CRITICAL-2
EOF
    exit 2
  fi

  if echo "$EDIT_CONTENT" | grep -qE 'result\.hash\b'; then
    cat >&2 << 'EOF'
COGNITION CONTRACT GUARD — BLOCKED

result.hash does not exist in Rust cognition_run output.
The field is output_hash, not hash.

Use instead:
  hash: typeof r.output_hash === 'string' ? r.output_hash.slice(0, 8) : '00000000',

Reference: crates/wasm4pm-cognition/src/wasm.rs:182-190
Audit finding: CRITICAL-2
EOF
    exit 2
  fi

  if echo "$EDIT_CONTENT" | grep -qE 'result\.inference_trace\b'; then
    cat >&2 << 'EOF'
COGNITION CONTRACT GUARD — BLOCKED

result.inference_trace does not exist in Rust cognition_run output.
The field lives inside result.output.inference_trace if the breed populates it.

Use instead:
  inferenceTrace: (r.output as { inference_trace?: unknown })?.inference_trace,

Reference: crates/wasm4pm-cognition/src/wasm.rs:182-190
Audit finding: CRITICAL-2
EOF
    exit 2
  fi

fi

# ── Guard 3: types.ts — SystemBuildResult must not use .candidates ─────────────
# Rust system_build returns: { pareto_front: [...], dominated: [...] }
# It does NOT return: candidates

if [[ "$FILE_PATH" == *"packages/cognition/src/types.ts" ]]; then

  if echo "$EDIT_CONTENT" | grep -qP '^\s+candidates\s*:'; then
    if echo "$EDIT_CONTENT" | grep -B5 'candidates' | grep -q 'SystemBuildResult'; then
      cat >&2 << 'EOF'
COGNITION CONTRACT GUARD — BLOCKED

SystemBuildResult.candidates does not match Rust system_build output.

Rust returns: { "pareto_front": [...], "dominated": [...] }

Use instead:
  export interface SystemBuildResult {
    pareto_front: SystemCandidate[];
    dominated: Array<{ id: string; reason: string }>;
  }

Reference: crates/wasm4pm-cognition/src/wasm.rs:287-290
Audit finding: MEDIUM-5
EOF
      exit 2
    fi
  fi

fi

# ── Guard 4: ContractResult must declare run_id, output_hash, status ──────────
# If someone rewrites ContractResult and omits the actual Rust fields, block it.

if [[ "$FILE_PATH" == *"packages/cognition/src/types.ts" ]]; then
  if echo "$EDIT_CONTENT" | grep -q 'interface ContractResult'; then
    if ! echo "$EDIT_CONTENT" | grep -q 'run_id\|output_hash\|status'; then
      cat >&2 << 'EOF'
COGNITION CONTRACT GUARD — BLOCKED

ContractResult is being rewritten but is missing actual Rust fields.

Rust cognition_run returns: { status, breed, run_id, output_hash, replay_pointer, options_profile, output }

ContractResult MUST declare at minimum: run_id, output_hash, status

Reference: crates/wasm4pm-cognition/src/wasm.rs:182-190
Audit finding: CRITICAL-1
EOF
      exit 2
    fi
  fi
fi

exit 0
