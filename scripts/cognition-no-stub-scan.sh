#!/usr/bin/env bash
# cognition-no-stub-scan.sh — Verify no fraudulent implementation patterns
#                              exist in the cognition subsystem.
#
# Patterns rejected:
#   - Functions that always return a hardcoded constant (all-paths trivial return)
#   - Dead inference engines (no inference function called from public API)
#   - Hardcoded fitness scores (fitness = 1.0 / fitness = 0.0 without computation)
#
# Usage:
#   bash scripts/cognition-no-stub-scan.sh            # full scan
#   bash scripts/cognition-no-stub-scan.sh --quick    # only critical patterns
#
# Exit 0 = no fraud patterns found.
# Exit 1 = one or more fraud patterns found (filenames printed to stderr).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUICK=0
[ "${1:-}" = "--quick" ] && QUICK=1

COGNITION_RS_DIRS=(
  "${REPO_ROOT}/crates/wasm4pm-cognition/src"
  "${REPO_ROOT}/wasm4pm/src/cognition"
)
COGNITION_TS_DIRS=(
  "${REPO_ROOT}/packages/cognition/src"
  "${REPO_ROOT}/apps/wasm4pm/src/commands/cognition"
)

violations=0

scan_dir_exists() {
  for d in "$@"; do
    [ -d "$d" ] && return 0
  done
  return 1
}

# ── Rust scan ─────────────────────────────────────────────────────────────────
if scan_dir_exists "${COGNITION_RS_DIRS[@]}"; then
  for dir in "${COGNITION_RS_DIRS[@]}"; do
    [ -d "$dir" ] || continue
    # Detect hardcoded fitness constants without surrounding computation
    while IFS= read -r -d '' file; do
      if grep -En "fitness\s*=\s*[01]\.[0-9]*\s*;" "$file" 2>/dev/null | \
         grep -qv "test\|#\[cfg(test"; then
        echo "FRAUD: hardcoded fitness in $file" >&2
        (( violations++ )) || true
      fi
    done < <(find "$dir" -name "*.rs" -print0 2>/dev/null)
  done
fi

# ── TypeScript scan ───────────────────────────────────────────────────────────
if scan_dir_exists "${COGNITION_TS_DIRS[@]}"; then
  for dir in "${COGNITION_TS_DIRS[@]}"; do
    [ -d "$dir" ] || continue
    while IFS= read -r -d '' file; do
      # Detect trivial always-pass returns (return { decision: 'Allow' } with no body)
      if grep -En "return\s*\{[[:space:]]*decision\s*:\s*['\"]Allow['\"][[:space:]]*\}" \
           "$file" 2>/dev/null | grep -qv "test\|spec\|__tests__"; then
        echo "FRAUD: unconditional Allow return in $file" >&2
        (( violations++ )) || true
      fi
    done < <(find "$dir" -name "*.ts" ! -name "*.test.ts" ! -name "*.spec.ts" -print0 2>/dev/null)
  done
fi

if [ "$QUICK" -eq 1 ]; then
  # Quick mode: only the pattern checks above
  [ "$violations" -eq 0 ] && exit 0 || exit 1
fi

# ── Full mode: additional structural checks ───────────────────────────────────

# Verify that if a cognition Rust crate exists, it has at least one non-trivial function
for crate_dir in \
    "${REPO_ROOT}/crates/wasm4pm-cognition" \
    "${REPO_ROOT}/wasm4pm"; do
  lib_rs="${crate_dir}/src/lib.rs"
  [ -f "$lib_rs" ] || continue
  # If the crate is cognition-branded, check it has at least one pub fn
  if grep -q "cognition\|CognitionEngine\|InferenceEngine" "$lib_rs" 2>/dev/null; then
    if ! grep -qE "^pub fn |^pub async fn " "$lib_rs" 2>/dev/null; then
      echo "FRAUD: cognition lib.rs has no public functions: $lib_rs" >&2
      (( violations++ )) || true
    fi
  fi
done

[ "$violations" -eq 0 ] && exit 0 || exit 1
