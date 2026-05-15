#!/usr/bin/env bash
# cognition-doctor.sh
# Diagnostic tool for the cognition no-stub gate environment.
# Reports on required tools, directories, and gate health.
#
# Run: make cognition-doctor
# or:  bash scripts/cognition-doctor.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PASS=0
WARN=0
FAIL=0

ok()   { echo "  [OK]   $*"; PASS=$((PASS + 1)); }
warn() { echo "  [WARN] $*"; WARN=$((WARN + 1)); }
fail() { echo "  [FAIL] $*"; FAIL=$((FAIL + 1)); }

echo "=== Cognition Doctor ==="
echo "Repository root: ${REPO_ROOT}"
echo ""

# ── Required CLI tools ────────────────────────────────────────────────────────
echo "--- Required tools ---"

if command -v grep >/dev/null 2>&1; then
  ok "grep found: $(grep --version 2>&1 | head -1)"
else
  fail "grep not found — required for lexicon scan"
fi

if command -v find >/dev/null 2>&1; then
  ok "find found"
else
  fail "find not found — required for directory traversal"
fi

if command -v awk >/dev/null 2>&1; then
  ok "awk found"
else
  fail "awk not found — required for structural scan"
fi

if command -v cargo >/dev/null 2>&1; then
  ok "cargo found: $(cargo --version 2>&1)"
else
  warn "cargo not found — Layer 3 semantic scan (cargo test) will not run"
fi

if command -v actionlint >/dev/null 2>&1; then
  ok "actionlint found: $(actionlint --version 2>&1 | head -1)"
else
  warn "actionlint not found — install with: brew install actionlint  (CI YAML validation)"
fi

if command -v yamllint >/dev/null 2>&1; then
  ok "yamllint found"
else
  warn "yamllint not found — install with: pip install yamllint  (fallback YAML validation)"
fi

echo ""

# ── Gate script health ────────────────────────────────────────────────────────
echo "--- Gate script health ---"

SCAN_SCRIPT="${REPO_ROOT}/scripts/cognition-no-stub-scan.sh"
if [[ -f "${SCAN_SCRIPT}" ]]; then
  if [[ -x "${SCAN_SCRIPT}" ]]; then
    ok "scripts/cognition-no-stub-scan.sh exists and is executable"
  else
    warn "scripts/cognition-no-stub-scan.sh exists but is not executable — run: chmod +x ${SCAN_SCRIPT}"
  fi
else
  fail "scripts/cognition-no-stub-scan.sh missing"
fi

DOCTOR_SCRIPT="${REPO_ROOT}/scripts/cognition-doctor.sh"
if [[ -f "${DOCTOR_SCRIPT}" ]] && [[ -x "${DOCTOR_SCRIPT}" ]]; then
  ok "scripts/cognition-doctor.sh exists and is executable"
else
  warn "scripts/cognition-doctor.sh not executable"
fi

echo ""

# ── Cognition source directories ──────────────────────────────────────────────
echo "--- Cognition source directories ---"

declare -A SCAN_DIRS=(
  ["crates/wasm4pm-cognition/src"]="Rust breed implementations (W1)"
  ["apps/wasm4pm/src/commands/cognition"]="CLI command handlers (W4)"
  ["packages/cognition/src"]="TypeScript cognition package (W5)"
)

for dir in "${!SCAN_DIRS[@]}"; do
  full_path="${REPO_ROOT}/${dir}"
  desc="${SCAN_DIRS[$dir]}"
  if [[ -d "${full_path}" ]]; then
    file_count=$(find "${full_path}" -type f \( -name "*.rs" -o -name "*.ts" \) 2>/dev/null | wc -l | tr -d ' ')
    ok "${dir} — ${desc} (${file_count} source files)"
  else
    warn "${dir} — ${desc} — directory does not exist yet (gate will skip until created)"
  fi
done

echo ""

# ── Build script (defense-in-depth) ──────────────────────────────────────────
echo "--- Rust build script ---"

BUILD_RS="${REPO_ROOT}/crates/wasm4pm-cognition/build.rs"
if [[ -f "${BUILD_RS}" ]]; then
  ok "crates/wasm4pm-cognition/build.rs present"
else
  warn "crates/wasm4pm-cognition/build.rs not yet present — will exist once W1 scaffolds the crate"
fi

echo ""

# ── CI workflow ───────────────────────────────────────────────────────────────
echo "--- CI workflow ---"

WORKFLOW="${REPO_ROOT}/.github/workflows/cognition-no-stub.yml"
if [[ -f "${WORKFLOW}" ]]; then
  ok ".github/workflows/cognition-no-stub.yml present"
  if command -v actionlint >/dev/null 2>&1; then
    if actionlint "${WORKFLOW}" >/dev/null 2>&1; then
      ok "actionlint: workflow YAML is valid"
    else
      fail "actionlint: workflow YAML has errors — run: actionlint ${WORKFLOW}"
    fi
  fi
else
  fail ".github/workflows/cognition-no-stub.yml missing"
fi

echo ""

# ── Pre-commit hook ───────────────────────────────────────────────────────────
echo "--- Pre-commit hook ---"

HOOK="${REPO_ROOT}/.git/hooks/pre-commit-cognition.sh"
if [[ -f "${HOOK}" ]]; then
  if [[ -x "${HOOK}" ]]; then
    ok ".git/hooks/pre-commit-cognition.sh present and executable"
  else
    warn ".git/hooks/pre-commit-cognition.sh present but not executable"
  fi
else
  warn ".git/hooks/pre-commit-cognition.sh not installed — run: bash scripts/cognition-no-stub-scan.sh to check manually"
fi

echo ""

# ── Documentation ─────────────────────────────────────────────────────────────
echo "--- Documentation ---"

DOCS="${REPO_ROOT}/docs/cognition-no-stub-law.md"
if [[ -f "${DOCS}" ]]; then
  ok "docs/cognition-no-stub-law.md present"
else
  fail "docs/cognition-no-stub-law.md missing"
fi

echo ""

# ── Summary ───────────────────────────────────────────────────────────────────
TOTAL=$((PASS + WARN + FAIL))
echo "=== Summary: ${PASS}/${TOTAL} OK, ${WARN} warnings, ${FAIL} failures ==="

if [[ ${FAIL} -gt 0 ]]; then
  echo ""
  echo "DOCTOR STATUS: UNHEALTHY — ${FAIL} critical issue(s) must be resolved."
  exit 1
elif [[ ${WARN} -gt 0 ]]; then
  echo ""
  echo "DOCTOR STATUS: DEGRADED — gate is functional but ${WARN} item(s) need attention."
  exit 0
else
  echo ""
  echo "DOCTOR STATUS: HEALTHY — all checks passed."
  exit 0
fi
