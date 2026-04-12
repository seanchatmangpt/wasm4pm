#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Module: code-quality.sh — 10 items
# ---------------------------------------------------------------------------

RESULTS_FILE="${1:-/tmp/code-quality.json}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
case "$SCRIPT_DIR" in
  */scripts/validators) REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)" ;;
  */scripts)            REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)" ;;
  *)                    REPO_ROOT="$SCRIPT_DIR" ;;
esac
WASM_DIR="$REPO_ROOT/wasm4pm"
cd "$REPO_ROOT"

{

# CQ-1: rustfmt check
FMT_OUT=$(cargo fmt -- --check 2>&1 || true)
DIFFS=$(echo "$FMT_OUT" | grep -c "^Diff in" 2>/dev/null || echo 0)
DIFFS_INT=$(echo "$DIFFS" | tr -d '[:space:]')
if [ "$DIFFS_INT" -gt 0 ]; then
  DIFFS_FILES=$(echo "$FMT_OUT" | grep "^Diff in" | head -3 | tr '\n' ';')
  echo "FAIL|CQ-1|rustfmt: $DIFFS_INT file(s) need formatting: $DIFFS_FILES — run 'cargo fmt'"
else
  echo "PASS|CQ-1|rustfmt: all Rust sources correctly formatted"
fi

# CQ-2: Public API documentation coverage
PUB_N=$(grep -rn "^pub fn\|^pub struct\|^pub enum\|^pub trait" "$WASM_DIR/src/" 2>/dev/null | wc -l | tr -d ' ')
DOC_N=$(grep -rn "^/// \|^///$" "$WASM_DIR/src/" 2>/dev/null | wc -l | tr -d ' ')
PUB_INT=$(echo "$PUB_N" | tr -d '[:space:]')
DOC_INT=$(echo "$DOC_N" | tr -d '[:space:]')
if [ "$PUB_INT" -gt 0 ]; then
  DOC_PCT=$(python3 -c "print(round($DOC_INT / max($PUB_INT, 1) * 100, 1))")
  if python3 -c "import sys; sys.exit(0 if $DOC_PCT >= 30 else 1)"; then
    echo "PASS|CQ-2|Documentation: $DOC_INT doc lines / $PUB_INT public items ($DOC_PCT%)"
  else
    echo "WARN|CQ-2|Low documentation: $DOC_INT doc lines / $PUB_INT public items ($DOC_PCT%) — aim for >30%"
  fi
else
  echo "WARN|CQ-2|No public items found in src/ to count"
fi

# CQ-3: No .unwrap() in hot-path files
UNWRAP_N=0
for f in "$WASM_DIR/src/hot_kernels.rs" "$WASM_DIR/src/fast_discovery.rs" "$WASM_DIR/src/discovery.rs"; do
  if [ -f "$f" ]; then
    C=$(grep -c "\.unwrap()" "$f" 2>/dev/null || echo 0)
    C_INT=$(echo "$C" | tr -d '[:space:]')
    UNWRAP_N=$((UNWRAP_N + C_INT))
  fi
done
if [ "$UNWRAP_N" -gt 0 ]; then
  echo "WARN|CQ-3|$UNWRAP_N .unwrap() calls in hot-path files — prefer .expect() with context"
else
  echo "PASS|CQ-3|No .unwrap() in hot-path discovery files"
fi

# CQ-4: Production dependency count
PROD_DEPS=$(python3 -c "
import re
text = open('$WASM_DIR/Cargo.toml').read()
# Extract [dependencies] section
m = re.search(r'\[dependencies\](.*?)(\[|\Z)', text, re.DOTALL)
if m:
    lines = [l.strip() for l in m.group(1).splitlines() if l.strip() and not l.strip().startswith('#')]
    print(len(lines))
else:
    print(0)
" 2>/dev/null || echo 0)
DEPS_INT=$(echo "$PROD_DEPS" | tr -d '[:space:]')
if [ "$DEPS_INT" -le 30 ]; then
  echo "PASS|CQ-4|Production dependencies: $DEPS_INT (<= 30 limit)"
else
  echo "WARN|CQ-4|$DEPS_INT production dependencies (>30 — review for potential bloat)"
fi

# CQ-5: Tech debt markers
DEBT_N=$(grep -rn "TODO\|FIXME\|HACK\|XXX" "$WASM_DIR/src/" 2>/dev/null | wc -l | tr -d ' ')
DEBT_INT=$(echo "$DEBT_N" | tr -d '[:space:]')
if [ "$DEBT_INT" -gt 20 ]; then
  echo "WARN|CQ-5|$DEBT_INT TODO/FIXME/HACK markers in src/ — track and resolve"
elif [ "$DEBT_INT" -gt 0 ]; then
  echo "PASS|CQ-5|$DEBT_INT minor tech debt markers (acceptable)"
else
  echo "PASS|CQ-5|No TODO/FIXME/HACK in source"
fi

# CQ-6: CalVer version format
CRATE_VER=$(grep "^version" "$WASM_DIR/Cargo.toml" | head -1 | sed 's/version = "//;s/"//')
CALVER_OK=$(python3 -c "
import re, sys
v = '$CRATE_VER'
m = re.match(r'^(\d{2})\.(\d{1,2})\.(\d{1,2})[a-z]?\$', v)
if m:
    yy, mo, day = int(m.group(1)), int(m.group(2)), int(m.group(3))
    sys.exit(0 if (yy >= 26 and 1 <= mo <= 12 and 1 <= day <= 31) else 1)
else:
    sys.exit(1)
" 2>/dev/null && echo "ok" || echo "fail")
if [ "$CALVER_OK" = "ok" ]; then
  echo "PASS|CQ-6|CalVer format: v$CRATE_VER"
else
  echo "FAIL|CQ-6|Version '$CRATE_VER' is not CalVer format (vYY.M.D, e.g. 26.4.10)"
fi

# CQ-7: License files
if [ -f "$REPO_ROOT/LICENSE-MIT" ] && [ -f "$REPO_ROOT/LICENSE-APACHE" ]; then
  echo "PASS|CQ-7|Dual license: LICENSE-MIT + LICENSE-APACHE present"
elif [ -f "$REPO_ROOT/LICENSE" ]; then
  echo "PASS|CQ-7|LICENSE file present"
else
  echo "FAIL|CQ-7|No license files found"
fi

# CQ-8: CHANGELOG.md
if [ -f "$REPO_ROOT/CHANGELOG.md" ]; then
  CH_N=$(grep -c "^## \|^### " "$REPO_ROOT/CHANGELOG.md" 2>/dev/null || echo 0)
  echo "PASS|CQ-8|CHANGELOG.md present with $CH_N section headers"
else
  echo "FAIL|CQ-8|CHANGELOG.md missing"
fi

# CQ-9: No large data files in src/
LARGE_N=$(find "$WASM_DIR/src" \( -name "*.xes" -o -name "*.json" \) -size +100k 2>/dev/null | wc -l | tr -d ' ')
LARGE_INT=$(echo "$LARGE_N" | tr -d '[:space:]')
if [ "$LARGE_INT" -gt 0 ]; then
  echo "WARN|CQ-9|$LARGE_INT large data files (>100KB) in src/ — move to tests/fixtures/"
else
  echo "PASS|CQ-9|No large data files in src/"
fi

# CQ-10: No git conflict markers
CONF_N=$(grep -rn "^<<<<<<< \|^>>>>>>> \|^=======$" "$WASM_DIR/src/" 2>/dev/null | wc -l | tr -d ' ')
CONF_INT=$(echo "$CONF_N" | tr -d '[:space:]')
if [ "$CONF_INT" -gt 0 ]; then
  echo "FAIL|CQ-10|$CONF_INT git conflict markers in src/ — resolve before merge"
else
  echo "PASS|CQ-10|No git conflict markers in src/"
fi

} | python3 -c "
import sys, json
items = []
for line in sys.stdin:
    line = line.strip()
    if not line or '|' not in line:
        continue
    parts = line.split('|', 2)
    if len(parts) == 3:
        items.append({'id': parts[1], 'status': parts[0], 'detail': parts[2]})
with open('$RESULTS_FILE', 'w') as f:
    json.dump({'code_quality': items}, f, indent=2)
"

echo "code-quality: $RESULTS_FILE"
