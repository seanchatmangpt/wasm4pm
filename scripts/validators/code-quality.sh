#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Module: code-quality.sh
# Purpose: Code style, documentation, dependency, API surface quality (10 items)
# ---------------------------------------------------------------------------
set -euo pipefail

RESULTS_FILE="${1:-/tmp/code-quality.json}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WASM_DIR="$REPO_ROOT/wasm4pm"

items='[]'
add_item() {
  local id="$1" status="$2" detail="$3"
  items=$(python3 -c "
import json, sys
items = json.loads('''$items''')
items.append({'id': '$id', 'status': '$status', 'detail': '$detail'})
print(json.dumps(items))
")
}

# CQ-1: rustfmt check on all Rust sources
FMT_OUT=$(cargo fmt --manifest-path "$WASM_DIR/Cargo.toml" -- --check 2>&1 || true)
FMT_DIFFS=$(echo "$FMT_OUT" | grep -c "^Diff in" 2>/dev/null || true)
if [ "$FMT_DIFFS" -gt 0 ]; then
  DIFFED_FILES=$(echo "$FMT_OUT" | grep "^Diff in" | sed 's/^Diff in //;s/:.*//' | head -5 | tr '\n' ',')
  add_item "CQ-1" "FAIL" "$FMT_DIFFS files need rustfmt: $DIFFED_FILES — run 'cargo fmt'"
else
  add_item "CQ-1" "PASS" "All Rust sources pass rustfmt check"
fi

# CQ-2: Public API documented (doc comments on public items)
PUB_ITEMS=$(grep -rn "^pub fn\|^pub struct\|^pub enum\|^pub trait" "$WASM_DIR/src/" 2>/dev/null | wc -l | tr -d ' ')
DOC_ITEMS=$(grep -rn "^/// \|^///$" "$WASM_DIR/src/" 2>/dev/null | wc -l | tr -d ' ')
DOC_RATIO=0
if [ "$PUB_ITEMS" -gt 0 ]; then
  DOC_RATIO=$(python3 -c "print(round($DOC_ITEMS / max($PUB_ITEMS, 1) * 100, 1))")
fi
if python3 -c "import sys; sys.exit(0 if $DOC_RATIO >= 30 else 1)" 2>/dev/null; then
  add_item "CQ-2" "PASS" "Documentation coverage: $DOC_ITEMS doc lines for $PUB_ITEMS public items ($DOC_RATIO%)"
else
  add_item "CQ-2" "WARN" "Low documentation: $DOC_ITEMS doc lines for $PUB_ITEMS public items ($DOC_RATIO%) — aim for >30%"
fi

# CQ-3: Error handling — no unwrap() in production hot paths
UNWRAP_HOT=$(grep -rn "\.unwrap()" "$WASM_DIR/src/hot_kernels.rs" "$WASM_DIR/src/fast_discovery.rs" "$WASM_DIR/src/discovery.rs" 2>/dev/null | wc -l | tr -d ' ')
if [ "$UNWRAP_HOT" -gt 0 ]; then
  add_item "CQ-3" "WARN" "$UNWRAP_HOT .unwrap() calls in hot-path files — prefer .expect() with context or proper error handling"
else
  add_item "CQ-3" "PASS" "No .unwrap() in hot-path discovery files"
fi

# CQ-4: Dependency count reasonable (no excessive bloat)
DEP_COUNT=$(grep -c "^[a-zA-Z]" "$WASM_DIR/Cargo.toml" 2>/dev/null || true)
PROD_DEPS=$(grep -A 50 "^\[dependencies\]" "$WASM_DIR/Cargo.toml" | grep -c "^[a-z]" 2>/dev/null || true)
if [ "$PROD_DEPS" -le 30 ]; then
  add_item "CQ-4" "PASS" "Dependency count: $PROD_DEPS production dependencies (within 30 limit)"
else
  add_item "CQ-4" "WARN" "$PROD_DEPS production dependencies (>30 — review for bloat)"
fi

# CQ-5: No TODO/FIXME/HACK in public API surface
TECH_DEBT=$(grep -rn "TODO\|FIXME\|HACK\|XXX" "$WASM_DIR/src/" 2>/dev/null | grep -v "^.*//.*TODO\|test\|#\[allow" | wc -l | tr -d ' ')
if [ "$TECH_DEBT" -gt 10 ]; then
  add_item "CQ-5" "WARN" "$TECH_DEBT TODO/FIXME/HACK comments in src/ — track and resolve"
elif [ "$TECH_DEBT" -gt 0 ]; then
  add_item "CQ-5" "PASS" "$TECH_DEBT minor tech debt markers (acceptable)"
else
  add_item "CQ-5" "PASS" "No TODO/FIXME/HACK in source"
fi

# CQ-6: Crate version is CalVer format (vYY.M.D)
CRATE_VERSION=$(grep "^version" "$WASM_DIR/Cargo.toml" | head -1 | sed 's/version = "//;s/"//')
if echo "$CRATE_VERSION" | python3 -c "
import re, sys
v = sys.stdin.read().strip()
# CalVer: YY.M.D where YY>=26, M in 1-12, D in 1-31
m = re.match(r'^(\d{2})\.(\d{1,2})\.(\d{1,2})[a-z]?$', v)
if m:
    yy, mo, day = int(m.group(1)), int(m.group(2)), int(m.group(3))
    sys.exit(0 if (yy >= 26 and 1 <= mo <= 12 and 1 <= day <= 31) else 1)
else:
    sys.exit(1)
" 2>/dev/null; then
  add_item "CQ-6" "PASS" "CalVer format correct: v$CRATE_VERSION"
else
  add_item "CQ-6" "FAIL" "Version '$CRATE_VERSION' does not match CalVer format (vYY.M.D)"
fi

# CQ-7: License files present
MIT_LIC=$([ -f "$REPO_ROOT/LICENSE-MIT" ] && echo "1" || echo "0")
APACHE_LIC=$([ -f "$REPO_ROOT/LICENSE-APACHE" ] && echo "1" || echo "0")
if [ "$MIT_LIC" = "1" ] && [ "$APACHE_LIC" = "1" ]; then
  add_item "CQ-7" "PASS" "Dual license: LICENSE-MIT and LICENSE-APACHE present"
elif [ -f "$REPO_ROOT/LICENSE" ]; then
  add_item "CQ-7" "PASS" "LICENSE file present"
else
  add_item "CQ-7" "FAIL" "No license files found"
fi

# CQ-8: CHANGELOG.md present and has entries
if [ -f "$REPO_ROOT/CHANGELOG.md" ]; then
  ENTRIES=$(grep -c "^## \|^### " "$REPO_ROOT/CHANGELOG.md" 2>/dev/null || true)
  add_item "CQ-8" "PASS" "CHANGELOG.md present with $ENTRIES section headers"
else
  add_item "CQ-8" "FAIL" "CHANGELOG.md missing"
fi

# CQ-9: No large test data committed in src/ (only in tests/fixtures/)
LARGE_IN_SRC=$(find "$WASM_DIR/src" -name "*.xes" -o -name "*.json" -size +100k 2>/dev/null | wc -l | tr -d ' ')
if [ "$LARGE_IN_SRC" -gt 0 ]; then
  add_item "CQ-9" "WARN" "$LARGE_IN_SRC large data files in src/ — move to tests/fixtures/"
else
  add_item "CQ-9" "PASS" "No large test data files in src/"
fi

# CQ-10: Mergeability — no leftover conflict markers
CONFLICT_MARKERS=$(grep -rn "^<<<<<<< \|^>>>>>>> \|^=======$" "$WASM_DIR/src/" 2>/dev/null | wc -l | tr -d ' ')
if [ "$CONFLICT_MARKERS" -gt 0 ]; then
  add_item "CQ-10" "FAIL" "$CONFLICT_MARKERS git conflict markers in src/ — resolve before merge"
else
  add_item "CQ-10" "PASS" "No git conflict markers in src/"
fi

# Write results
python3 -c "
import json
print(json.dumps({'code_quality': json.loads('''$items''')}, indent=2))
" > "$RESULTS_FILE"

echo "code-quality: results written to $RESULTS_FILE"
