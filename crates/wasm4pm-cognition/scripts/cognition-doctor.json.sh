#!/usr/bin/env bash
# cognition-doctor.json.sh — 11-check cognition capability probe (JSON output)
#
# Emits a machine-canonical JSON object to stdout.
# Exit code: 0 if all checks pass, 1 if any check fails.
#
# Schema:
#   { "doctor_version": 1, "checks": [...], "summary": { ... } }
#
# This script is the JSON companion to cognition-doctor.sh.
# It runs the same 9 checks but emits structured JSON so the TypeScript
# `wpm cognition doctor` verb can parse pass/fail per check without screen-scraping.

set -euo pipefail

# ── Locate workspace root (script lives in crates/wasm4pm-cognition/scripts/) ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

# ── Helpers ───────────────────────────────────────────────────────────────────

OVERALL_PASS=0   # becomes 1 on first failure

json_string() {
  # Minimal JSON string escaping (backslash, double-quote, control chars)
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

# ── Check runner ──────────────────────────────────────────────────────────────
# Each check function appends one JSON object to CHECKS_JSON and updates
# OVERALL_PASS.

CHECKS_JSON=""
CHECK_IDX=0
PASSED_COUNT=0
FAILED_COUNT=0
ms_now() {
  # Portable millisecond timestamp: try perl (reliable cross-platform),
  # fall back to seconds×1000 via date.
  if command -v perl >/dev/null 2>&1; then
    perl -MTime::HiRes=time -e 'printf "%d\n", time()*1000'
  else
    echo $(( $(date +%s) * 1000 ))
  fi
}
TOTAL_START_MS=$(ms_now)

# Usage: run_check <id> <name> <command_or_test> [detail_on_fail]
# The third argument is evaluated as a bash expression; if it returns 0 the
# check passes.  A subshell is used so a failing check does not abort the
# script.
run_check() {
  local check_id="$1"
  local check_name="$2"
  local check_expr="$3"
  local detail_pass="${4:-}"
  local detail_fail="${5:-}"

  local t0
  t0=$(ms_now)

  local status="ok"
  local detail=""

  if eval "$check_expr" >/dev/null 2>&1; then
    status="ok"
    detail="${detail_pass}"
    PASSED_COUNT=$((PASSED_COUNT + 1))
  else
    status="fail"
    detail="${detail_fail}"
    FAILED_COUNT=$((FAILED_COUNT + 1))
    OVERALL_PASS=1
  fi

  local t1
  t1=$(ms_now)
  local duration_ms=$((t1 - t0))

  local comma=""
  if [ "${CHECK_IDX}" -gt 0 ]; then
    comma=","
  fi

  local escaped_name
  escaped_name=$(json_string "$check_name")
  local escaped_detail
  escaped_detail=$(json_string "$detail")

  CHECKS_JSON="${CHECKS_JSON}${comma}
    {
      \"id\": ${check_id},
      \"name\": \"${escaped_name}\",
      \"status\": \"${status}\",
      \"detail\": \"${escaped_detail}\",
      \"duration_ms\": ${duration_ms}
    }"

  CHECK_IDX=$((CHECK_IDX + 1))
}

# ── The 9 checks ─────────────────────────────────────────────────────────────
#
# Check 1: Cargo workspace root is reachable (Cargo.toml present)
run_check 1 \
  "workspace Cargo.toml present" \
  "[ -f '${WORKSPACE_ROOT}/Cargo.toml' ]" \
  "${WORKSPACE_ROOT}/Cargo.toml found" \
  "Cargo.toml not found at ${WORKSPACE_ROOT}"

# Check 2: wasm4pm crate directory exists
run_check 2 \
  "wasm4pm crate directory present" \
  "[ -d '${WORKSPACE_ROOT}/wasm4pm/src' ]" \
  "wasm4pm/src directory found" \
  "wasm4pm/src not found under ${WORKSPACE_ROOT}"

# Check 3: apps/wasm4pm CLI source present
run_check 3 \
  "CLI app source present (apps/wasm4pm/src/cli.ts)" \
  "[ -f '${WORKSPACE_ROOT}/apps/wasm4pm/src/cli.ts' ]" \
  "apps/wasm4pm/src/cli.ts found" \
  "apps/wasm4pm/src/cli.ts not found"

# Check 4: packages/ monorepo directory exists with at least 3 packages
run_check 4 \
  "packages/ monorepo has at least 3 entries" \
  "[ \$(find '${WORKSPACE_ROOT}/packages' -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l) -ge 3 ]" \
  "packages/ contains ≥3 directories" \
  "packages/ missing or has fewer than 3 sub-directories"

# Check 5: @wasm4pm/contracts dist is present (leaf package, no deps)
run_check 5 \
  "@wasm4pm/contracts dist built (packages/contracts/dist/index.js)" \
  "[ -f '${WORKSPACE_ROOT}/packages/contracts/dist/index.js' ]" \
  "packages/contracts/dist/index.js found" \
  "packages/contracts/dist/index.js not found — run pnpm build"

# Check 6: CLI dist binary is present (apps/wasm4pm/dist/bin/wpm.js)
run_check 6 \
  "CLI dist binary present (apps/wasm4pm/dist/bin/wpm.js)" \
  "[ -f '${WORKSPACE_ROOT}/apps/wasm4pm/dist/bin/wpm.js' ]" \
  "dist/bin/wpm.js found" \
  "dist/bin/wpm.js not found — run pnpm build in apps/wasm4pm"

# Check 7: WASM build artefact present (wasm4pm/pkg/wasm4pm.js OR wasm4pm/pkg/package.json)
run_check 7 \
  "WASM pkg artefact present (wasm4pm/pkg/package.json)" \
  "[ -f '${WORKSPACE_ROOT}/wasm4pm/pkg/package.json' ] || [ -f '${WORKSPACE_ROOT}/wasm4pm/pkg/wasm4pm.js' ]" \
  "WASM pkg artefact found" \
  "wasm4pm/pkg/ not found — run npm run build:nodejs in wasm4pm/"

# Check 8: node_modules present for apps/wasm4pm
run_check 8 \
  "apps/wasm4pm node_modules present" \
  "[ -d '${WORKSPACE_ROOT}/apps/wasm4pm/node_modules' ]" \
  "apps/wasm4pm/node_modules found" \
  "apps/wasm4pm/node_modules not found — run pnpm install"

# Check 9: exit-codes.ts defines all 5 standard codes (smoke-test source)
run_check 9 \
  "exit-codes.ts defines success + execution_error + system_error" \
  "grep -q 'execution_error' '${WORKSPACE_ROOT}/apps/wasm4pm/src/exit-codes.ts' && grep -q 'system_error' '${WORKSPACE_ROOT}/apps/wasm4pm/src/exit-codes.ts'" \
  "exit-codes.ts contains expected constants" \
  "exit-codes.ts missing expected constants"

# Check 10: Node.js >= 18 available
run_check 10 \
  "Node.js >= 18 available" \
  "command -v node >/dev/null && node --version 2>/dev/null | grep -qE '^v(1[89]|[2-9][0-9])\.'" \
  "$(node --version 2>/dev/null)" \
  "Node.js not found or version < 18"

# Check 11: wpm --version emits CalVer pattern
run_check 11 \
  "wpm --version emits CalVer (YY.MM.DD[a-z]?)" \
  "[ -f '${WORKSPACE_ROOT}/apps/wasm4pm/dist/bin/wpm.js' ] && node '${WORKSPACE_ROOT}/apps/wasm4pm/dist/bin/wpm.js' --version 2>/dev/null | grep -qE '^[0-9]{2}\.(1[0-2]|[1-9])\.([12][0-9]|3[01]|[1-9])[a-z]?$'" \
  "wpm version: $(node '${WORKSPACE_ROOT}/apps/wasm4pm/dist/bin/wpm.js' --version 2>/dev/null || echo 'N/A')" \
  "wpm --version failed or output does not match CalVer pattern"

# ── Summary ───────────────────────────────────────────────────────────────────

TOTAL_END_MS=$(ms_now)
TOTAL_DURATION_MS=$((TOTAL_END_MS - TOTAL_START_MS))
TOTAL_COUNT=$((PASSED_COUNT + FAILED_COUNT))

# ── Emit JSON ─────────────────────────────────────────────────────────────────

printf '{
  "doctor_version": 1,
  "checks": [%s
  ],
  "summary": {
    "passed": %d,
    "failed": %d,
    "total": %d,
    "duration_ms": %d
  }
}\n' \
  "${CHECKS_JSON}" \
  "${PASSED_COUNT}" \
  "${FAILED_COUNT}" \
  "${TOTAL_COUNT}" \
  "${TOTAL_DURATION_MS}"

exit ${OVERALL_PASS}
