#!/bin/bash
# Stop Hook: Proof Pack Gate
#
# Prevents Claude from stopping after a consequential coding turn unless
# `wpm proof audit` independently verifies disk proof.
#
# A "consequential turn" is one that modified any critical testing file.
# If no critical files are modified, the stop is allowed (read-only / explanatory turn).
#
# Doctrine: Agent narration has no authority. Disk proof is authority.
# This hook embodies that doctrine: "done" requires independent verification.

INPUT=$(cat)

# Prevent hook loop (Claude Code passes stop_hook_active=true on re-entry)
HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)
if [ "$HOOK_ACTIVE" = "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

# Critical files: any modification to these files requires proof audit before stop.
CRITICAL_FILES=(
  "wasm4pm/src/testing/conformance.rs"
  "wasm4pm/src/testing/harness.rs"
  "wasm4pm/src/testing/proof_pack.rs"
  "wasm4pm/src/testing/mod.rs"
  "wasm4pm/tests/proof_pack_tests.rs"
  "wasm4pm/tests/route_driven_tdd_tests.rs"
  "wasm4pm/tests/self_conformance_tests.rs"
  "wasm4pm/tests/anti_fake_tests.rs"
  "wasm4pm/tests/powl_macro_tests.rs"
  "apps/wasm4pm/src/commands/proof.ts"
)

# Check for uncommitted changes in critical files
MODIFIED_OUTPUT=$(git status --short -- "${CRITICAL_FILES[@]}" 2>/dev/null)

if [ -z "$MODIFIED_OUTPUT" ]; then
  # No critical testing files changed — non-consequential turn, allow stop.
  exit 0
fi

# Critical files are modified. Locate wpm CLI.
WPM_BIN=""
if [ -f "apps/wasm4pm/dist/bin/wpm.js" ]; then
  WPM_BIN="node apps/wasm4pm/dist/bin/wpm.js"
fi

if [ -z "$WPM_BIN" ]; then
  # Verifier unavailable with dirty critical files — must block, not allow.
  REASON_JSON=$(printf 'PROOF GATE BLOCKED: wpm proof audit is unavailable (apps/wasm4pm/dist/bin/wpm.js not found).\nCritical testing files are modified: cannot allow stop without independent verification.\nFix: cd apps/wasm4pm && npm run build\nThen run: wpm proof audit' | jq -Rs .)
  echo "{\"decision\":\"block\",\"reason\":$REASON_JSON}"
  exit 0
fi

# Run proof audit. This internally runs cargo test — it takes ~30s.
# That is intentional: the proof gate must be expensive to make fake routes costly.
AUDIT_TMP=$(mktemp /tmp/proof-audit-XXXXXX.json)
trap 'rm -f "$AUDIT_TMP"' EXIT

AUDIT_EXIT=0
$WPM_BIN proof audit --format json --quiet > "$AUDIT_TMP" 2>&1 || AUDIT_EXIT=$?

if [ $AUDIT_EXIT -eq 0 ]; then
  # Validate the output actually contains an Accepted verdict — exit 0 alone is not enough.
  AUDIT_VERDICT=$(jq -r '.payload.final_verdict // empty' "$AUDIT_TMP" 2>/dev/null)
  if [ "$AUDIT_VERDICT" = "Accepted" ]; then
    exit 0
  fi
  # Exit 0 but no valid Accepted verdict — suspicious (forged or invalid output).
  REASON_JSON=$(printf 'wpm proof audit exited 0 but final_verdict is not "Accepted" (got: %s).\nCannot allow stop without a verified Accepted verdict.\nRun: wpm proof audit --verbose' "$AUDIT_VERDICT" | jq -Rs .)
  echo "{\"decision\":\"block\",\"reason\":$REASON_JSON}"
  exit 0
fi

# Audit returned AndonPull (exit code 3) or error. Parse reason.
VERDICT=$(jq -r '.payload.final_verdict // "AndonPull(Unknown)"' "$AUDIT_TMP" 2>/dev/null || echo "AndonPull(ParseError)")
REASON=$(jq -r '.payload.verdict_reason // "Proof gate failed — run wpm proof audit --verbose for details"' "$AUDIT_TMP" 2>/dev/null || echo "Cannot parse audit output")
GATES_FAILED=$(jq -r '.payload.gates_failed // "?"' "$AUDIT_TMP" 2>/dev/null || echo "?")
GATES_PASSED=$(jq -r '.payload.gates_passed // "?"' "$AUDIT_TMP" 2>/dev/null || echo "?")

BLOCK_REASON="wpm proof audit: ${VERDICT}
Gates: ${GATES_PASSED} passed, ${GATES_FAILED} failed
Reason: ${REASON}

This stop is blocked because critical testing files have uncommitted changes
and the independent proof audit did not return Accepted.

Remediation:
  1. Run: cargo test --test route_driven_tdd_tests --test anti_fake_tests --features browser
  2. Run: wpm proof audit --verbose
  3. Fix any failing gates, then stop again.

The agent cannot claim 'done' without disk proof."

REASON_JSON=$(echo "$BLOCK_REASON" | jq -Rs .)
echo "{\"decision\":\"block\",\"reason\":$REASON_JSON}"
exit 0
