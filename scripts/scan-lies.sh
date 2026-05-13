#!/usr/bin/env bash
# scan-lies.sh — find fake implementations, lies, placeholders, and deceptions.
#
# Complements scan-ghost-impls.sh (which focuses on ghost algorithm wrappers).
# This script finds the full taxonomy of dishonest code:
#
#   A  Inline placeholder markers         — TODO/FIXME/HACK/STUB/XXX in production
#   B  Empty implementation bodies        — functions that return immediately with nothing
#   C  Test integrity violations          — skipped, ignored, or assertion-free tests
#   D  Silent failure swallowing          — catch{}, unwrap_or_default, || vec![]
#   E  Structural output lies             — algorithms returning always-empty nodes/edges
#   F  Fake async                         — async fn that never awaits anything
#   G  TypeScript contract field lies     — using undefined cognition layer fields
#   H  Hardcoded return values            — Rust/TS returning compile-time constants
#   I  Commented-out code blocks          — disabled logic hiding as comments
#   J  Impossibly-claimed return types    — fn claims Result<T> but never returns Err
#
# Exit codes: 0=clean, 1=warnings, 2=critical failures
#
# Usage:
#   bash scripts/scan-lies.sh              # full scan
#   bash scripts/scan-lies.sh --quick      # skip cargo test execution
#   bash scripts/scan-lies.sh --json       # machine-readable JSON output
#   bash scripts/scan-lies.sh --section A  # run one section only

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

QUICK="${1:-}"
SECTION_FILTER="${2:-}"
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

CRITICAL=0
HIGH=0
MEDIUM=0
LOW=0
TOTAL=0

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

finding() {
  local severity="$1" msg="$2" detail="${3:-}"
  TOTAL=$((TOTAL + 1))
  case "$severity" in
    CRITICAL) CRITICAL=$((CRITICAL + 1)); echo -e "  ${RED}[CRITICAL]${NC} $msg" ;;
    HIGH)     HIGH=$((HIGH + 1));         echo -e "  ${YELLOW}[HIGH]${NC}     $msg" ;;
    MEDIUM)   MEDIUM=$((MEDIUM + 1));     echo -e "  ${CYAN}[MEDIUM]${NC}   $msg" ;;
    LOW)      LOW=$((LOW + 1));           echo -e "  [LOW]      $msg" ;;
  esac
  if [ -n "$detail" ]; then
    echo "$detail" | head -8 | while IFS= read -r line; do
      echo "             $line"
    done
    local lines
    lines=$(echo "$detail" | wc -l | tr -d ' ')
    if [ "$lines" -gt 8 ]; then echo "             ... ($((lines - 8)) more)"; fi
  fi
}

ok() { echo -e "  ${GREEN}✓${NC} $1"; }

section() {
  local id="$1" title="$2"
  if [ -n "$SECTION_FILTER" ] && [ "$SECTION_FILTER" != "$id" ]; then return 0; fi
  echo ""
  echo -e "${BOLD}━━━ $id: $title ━━━${NC}"
}

in_section() {
  local id="$1"
  [ -z "$SECTION_FILTER" ] || [ "$SECTION_FILTER" = "$id" ]
}

# Rust source dirs (no tests, no generated, no backup/bak files)
RS_SRC="wasm4pm/src crates/wasm4pm-cognition/src"
# --include='*.rs' ensures only real .rs files are scanned (excludes lib.rs.bak*, lib.rs.backup*)
RS_INC="--include=*.rs"
# TypeScript source dirs (no node_modules, no dist)
TS_SRC="apps/wasm4pm/src packages"

# ─────────────────────────────────────────────────────────────────────────────
# A: Inline placeholder markers in production code
# ─────────────────────────────────────────────────────────────────────────────
section "A" "Inline placeholder markers in production code"
in_section "A" || { echo "(skipped)"; }

if in_section "A"; then
  # A1. TODO/FIXME/HACK/STUB/PLACEHOLDER/XXX in Rust source (non-test, non-doc, non-backup)
  HITS=$(grep -rEn $RS_INC '\b(TODO|FIXME|HACK|STUB|PLACEHOLDER|XXX|REMOVEME|NOCOMMIT)\b' \
    $RS_SRC 2>/dev/null \
    | grep -vE '^\s*//[!/]' \
    | grep -v '/tests/' || true)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
    finding "HIGH" "$COUNT TODO/FIXME/HACK/STUB markers in Rust production source" "$HITS"
  else
    ok "no TODO/FIXME/HACK/STUB in Rust production source"
  fi

  # A2. Same in TypeScript source
  HITS=$(grep -rEn '\b(TODO|FIXME|HACK|STUB|PLACEHOLDER|XXX|NOCOMMIT)\b' \
    $TS_SRC 2>/dev/null \
    | grep -vE '\.(test|spec)\.|node_modules|dist/' \
    | grep -vE '^\s*//' || true)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
    finding "HIGH" "$COUNT TODO/FIXME/HACK/STUB markers in TypeScript production source" "$HITS"
  else
    ok "no TODO/FIXME/HACK/STUB in TypeScript production source"
  fi

  # A3. "not yet implemented" strings (prose version of unimplemented!())
  HITS=$(grep -rEin '"[^"]*not yet implemented[^"]*"\|"[^"]*coming soon[^"]*"\|"[^"]*work in progress[^"]*"' \
    $RS_SRC $TS_SRC 2>/dev/null \
    | grep -vE '\.(test|spec)\.|node_modules|dist/' || true)
  if [ -n "$HITS" ]; then
    finding "CRITICAL" "Prose 'not yet implemented' / 'coming soon' in production string" "$HITS"
  else
    ok "no 'not yet implemented' prose strings"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# B: Empty or trivial implementation bodies
# ─────────────────────────────────────────────────────────────────────────────
section "B" "Empty / trivial implementation bodies"
in_section "B" || { echo "(skipped)"; }

if in_section "B"; then
  # B1. Rust pub fn that returns Ok(JsValue::NULL|UNDEFINED) — legitimate Ok(()) is common in WASM callbacks
  # Only flag Ok(JsValue::NULL) / Ok(JsValue::UNDEFINED) which are almost always stubs
  HITS=$(grep -rEn $RS_INC '^\s*Ok\((JsValue::NULL|JsValue::UNDEFINED)\)\s*$' \
    $RS_SRC 2>/dev/null \
    | grep -vE '^\s*//|test|bench|mod\s' || true)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
    finding "HIGH" "$COUNT Ok(JsValue::NULL/UNDEFINED) returns — almost certainly stubs" "$HITS"
  else
    ok "no Ok(JsValue::NULL/UNDEFINED) stub returns found"
  fi

  # B2. TypeScript functions/arrow functions with body: `return {};` or `return []`
  # These are plausible stubs — commands that return empty results without computing.
  # Excludes: .js compiled artifacts, guard returns (if (condition) return []),
  # and length/null guards (legitimate early-exit for empty/null inputs).
  # To identify genuine stubs, we need line context. We use a two-pass approach:
  # 1. Collect candidate lines
  # 2. For each, check if the preceding non-blank line is a closing brace of catch/switch
  #    or an if condition (guard return) — those are excluded.
  HITS=$(node --input-type=module 2>/dev/null << 'B2_EOF' || true
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
function walk(dir) {
  const out = [];
  try {
    for (const f of readdirSync(dir)) {
      const full = join(dir, f);
      try {
        const st = statSync(full);
        if (st.isDirectory() && !['node_modules','dist','.git'].includes(f)) out.push(...walk(full));
        else if (/\.(ts)$/.test(f) && !f.endsWith('.d.ts') && !f.match(/\.(test|spec)\./)) out.push(full);
      } catch {}
    }
  } catch {}
  return out;
}
const EMPTY_RETURN = /^\s*return\s+(\{\s*\}|\[\s*\]|\{\s*status:\s*'\w+'\s*\})\s*;?\s*$/;
const results = [];
for (const dir of ['apps/wasm4pm/src','packages']) {
  for (const file of walk(dir)) {
    let lines; try { lines = readFileSync(file,'utf8').split('\n'); } catch { continue; }
    for (let i = 0; i < lines.length; i++) {
      if (!EMPTY_RETURN.test(lines[i])) continue;
      // Find preceding non-blank line
      let prev = i - 1;
      while (prev >= 0 && lines[prev].trim() === '') prev--;
      const prevLine = prev >= 0 ? lines[prev].trim() : '';
      // Skip: guard returns (if condition), catch blocks, switch defaults, case returns
      // Also skip "final fallback after conditionals": return [] following a closing brace
      if (/^if\s*\(|^}\s*catch|^catch\s*[({]|^default:|^case\s+|^\}$|^\}\s*else/.test(prevLine)) continue;
      results.push('  ' + file + ':' + (i+1) + ':' + lines[i]);
    }
  }
}
if (results.length) process.stdout.write(results.slice(0,10).join('\n') + '\n');
B2_EOF
)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
    finding "MEDIUM" "$COUNT TypeScript functions returning bare empty object/array" "$HITS"
  else
    ok "no bare empty-return stubs in TypeScript"
  fi

  # B3. Rust functions whose entire body is a single `todo!()` or `unimplemented!()`
  # (not in a match arm — those are legitimately exhaustive)
  HITS=$(grep -rEn $RS_INC '^\s*(todo!|unimplemented!)\s*\(' $RS_SRC 2>/dev/null \
    | grep -vE '^\s*//|^\s*///' || true)
  if [ -n "$HITS" ]; then
    finding "CRITICAL" "todo!()/unimplemented!() body in production Rust code" "$HITS"
  else
    ok "no todo!()/unimplemented!() in production Rust"
  fi

  # B4. TypeScript: throw new Error("not implemented") or throw Error("TODO")
  HITS=$(grep -rEn "throw\s+(new\s+)?Error\(['\"][^'\"]*\b(not impl|TODO|todo|stub|STUB)[^'\"]*['\"]" \
    $TS_SRC 2>/dev/null \
    | grep -vE '\.(test|spec)\.|node_modules|dist/' || true)
  if [ -n "$HITS" ]; then
    finding "CRITICAL" "TypeScript throws 'not implemented' / TODO error in production" "$HITS"
  else
    ok "no 'not implemented' throws in TypeScript production"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# C: Test integrity violations
# ─────────────────────────────────────────────────────────────────────────────
section "C" "Test integrity violations"
in_section "C" || { echo "(skipped)"; }

if in_section "C"; then
  # C1. Rust #[ignore] tests — these do not run in CI
  # Documented ignores (#[ignore] // reason) are acceptable; bare #[ignore] with no reason is flagged.
  HITS=$(grep -rEn '^\s*#\[ignore\]' wasm4pm/tests/ wasm4pm/src/ \
    crates/wasm4pm-cognition/tests/ crates/wasm4pm-cognition/src/ 2>/dev/null \
    | grep -vE '#\[ignore\]\s*//' || true)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
    finding "HIGH" "$COUNT #[ignore] tests — these are NEVER run in CI" "$HITS"
  else
    ok "no undocumented #[ignore] on any Rust tests"
  fi

  # C2. TypeScript: .skip( / .todo( / xit( / xdescribe( / xtest(
  HITS=$(grep -rEn '\.(skip|todo)\s*\(|^\s*(xit|xdescribe|xtest)\s*\(' \
    apps/wasm4pm/ packages/ crates/wasm4pm-cognition/ 2>/dev/null \
    | grep -E '\.(test|spec)\.' \
    | grep -vE 'node_modules|dist/' || true)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
    finding "HIGH" "$COUNT skipped TypeScript tests (.skip/.todo/xit/xdescribe)" "$HITS"
  else
    ok "no skipped TypeScript tests"
  fi

  # C3. Rust test functions whose body is only `// TODO` or a single comment
  # Heuristic: test fn followed within 5 lines by only comments and closing brace
  HITS=$(awk '
    /^\s*#\[test\]/ { in_test=1; tline=NR; noncomment=0; name="" }
    in_test && /^\s*fn / { name=$0 }
    in_test && !/^\s*(\/\/|#\[|fn |$|\})/ { noncomment++ }
    in_test && /^\s*\}/ && noncomment==0 && name!="" {
      print FILENAME ":" tline ": " name " (comment-only body)"
      in_test=0
    }
  ' wasm4pm/tests/*.rs crates/wasm4pm-cognition/tests/*.rs 2>/dev/null || true)
  if [ -n "$HITS" ]; then
    finding "HIGH" "Rust test functions with comment-only bodies (no actual code)" "$HITS"
  else
    ok "no comment-only Rust test bodies"
  fi

  # C4. TypeScript test files with only describe() shells and no it()/test() inside
  HITS=$(for f in $(find apps packages crates -name '*.test.ts' -o -name '*.spec.ts' 2>/dev/null); do
    [ -f "$f" ] || continue
    echo "$f" | grep -q 'node_modules\|dist/' && continue
    it_count=$(grep -cE '^\s+(it|test)\s*\(' "$f" 2>/dev/null || echo 0)
    if [ "$it_count" -eq 0 ]; then echo "  $f  (no it()/test() calls)"; fi
  done || true)
  if [ -n "$HITS" ]; then
    finding "MEDIUM" "TypeScript test files with no it()/test() cases" "$HITS"
  else
    ok "all TypeScript test files contain at least one it()/test()"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# D: Silent failure swallowing
# ─────────────────────────────────────────────────────────────────────────────
section "D" "Silent failure swallowing"
in_section "D" || { echo "(skipped)"; }

if in_section "D"; then
  # D1. Empty catch blocks in TypeScript: catch { } or catch (e) { }
  # These hide crashes. The only acceptable empty catch is for intentional best-effort ops.
  HITS=$(grep -rEn 'catch\s*(\([^)]*\))?\s*\{\s*\}' \
    $TS_SRC 2>/dev/null \
    | grep -vE '\.(test|spec)\.|node_modules|dist/' || true)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
    finding "CRITICAL" "$COUNT empty catch{} blocks — exceptions silently swallowed" "$HITS"
  else
    ok "no empty catch{} blocks"
  fi

  # D2. .catch(() => undefined) / .catch(() => null) / .catch(() => {})
  HITS=$(grep -rEn '\.catch\s*\(\s*\(\s*\)\s*=>\s*(undefined|null|\{\s*\})\s*\)' \
    $TS_SRC 2>/dev/null \
    | grep -vE '\.(test|spec)\.|node_modules|dist/' || true)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
    finding "HIGH" "$COUNT .catch(() => null/undefined) — promise rejections hidden" "$HITS"
  else
    ok "no silent .catch(() => null) chains"
  fi

  # D3. Rust: .unwrap_or_default() on algorithm outputs (silently returns empty/zero)
  # Fine for trivial types; suspicious on DFG/log/result types.
  # Excludes legitimate HashMap and Iterator chain patterns:
  #   .map(...).unwrap_or_default()  — Option/Iterator map fallback
  #   .remove(...).unwrap_or_default() — HashMap::remove missing-key fallback
  #   .cloned().unwrap_or_default()  — Option clone fallback
  HITS=$(grep -rEn $RS_INC '\.unwrap_or_default\(\)' $RS_SRC 2>/dev/null \
    | grep -vE '^\s*//|test|bench' \
    | grep -E '(dfg|log|result|fitness|score|trace|event|pet|align)' \
    | grep -vE '\.map\(.*\)\.unwrap_or_default|\.remove\(.*\)\.unwrap_or_default|\.cloned\(\)\.unwrap_or_default|\.find\(.*\)\..*unwrap_or_default' \
    | grep -vE ':[0-9]+:\s*\.unwrap_or_default\(\)' || true)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
    finding "MEDIUM" "$COUNT .unwrap_or_default() on algorithm-domain types (may hide None)" "$HITS"
  else
    ok "no suspicious .unwrap_or_default() on algorithm types"
  fi

  # D4. Rust: .unwrap_or(vec![]) on algorithm outputs — silently hides failures
  HITS=$(grep -rEn $RS_INC '\.unwrap_or\s*\(\s*vec!\s*\[' $RS_SRC 2>/dev/null \
    | grep -vE '^\s*//|test|bench' || true)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
    finding "MEDIUM" "$COUNT .unwrap_or(vec![]) — algorithm failure silently becomes empty list" "$HITS"
  else
    ok "no .unwrap_or(vec![]) hiding failures"
  fi

  # D5. TypeScript: || {} or || [] as default on algorithm result fields
  HITS=$(grep -rEn '(result|output|data|dfg|model)\s*\|\|\s*(\{\}|\[\])' \
    $TS_SRC 2>/dev/null \
    | grep -vE '\.(test|spec)\.|node_modules|dist/' \
    | grep -vE '^\s*//' || true)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
    finding "MEDIUM" "$COUNT || {} / || [] fallbacks on algorithm results — masks failures" "$HITS"
  else
    ok "no silent || {} / || [] fallbacks on algorithm results"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# E: Structural output lies
# ─────────────────────────────────────────────────────────────────────────────
section "E" "Structural output lies (functions returning always-empty structures)"
in_section "E" || { echo "(skipped)"; }

if in_section "E"; then
  # E1. Functions named discover_* or analyze_* that return json!({ "nodes": [], "edges": [] })
  HITS=$(grep -rEn $RS_INC '"(nodes|edges|traces|activities|variants|candidates)"\s*:\s*\[\s*\]' \
    $RS_SRC 2>/dev/null \
    | grep -vE '^\s*//|test|bench|default|example|empty|error|fallback|unwrap_or' || true)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
    finding "HIGH" "$COUNT hardcoded empty arrays in algorithm output JSON" "$HITS"
  else
    ok "no hardcoded empty arrays in algorithm output"
  fi

  # E2. Rust: struct initializations with all-zero or all-default fields
  # Pattern: SomeResult { count: 0, fitness: 0.0, nodes: vec![], edges: vec![] }
  HITS=$(grep -rEn $RS_INC '\{\s*count:\s*0\s*,\s*(fitness|score|precision|nodes|edges)' \
    $RS_SRC 2>/dev/null \
    | grep -vE '^\s*//|test|bench|default|new\(\)' || true)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
    finding "MEDIUM" "$COUNT structs initialized with hardcoded zero metrics" "$HITS"
  else
    ok "no zero-initialized algorithm result structs"
  fi

  # E3. TypeScript: functions returning hardcoded { nodes: [], edges: [] } shapes
  # Excludes: .js compiled artifacts, test files, type/interface declarations,
  # and aggregation files (legitimate guard returns for empty inputs).
  HITS=$(grep -rEn '(nodes|edges|traces|activities)\s*:\s*\[\s*\]' \
    $TS_SRC 2>/dev/null \
    | grep -vE '\.(test|spec)\.|node_modules|dist/|\.js:|\.md:' \
    | grep -vE '^\s*//|interface|type\s|const\s.*=\s*\{' \
    | grep -vE 'aggregation\.ts|pm4wasm-backend\.ts|social\.ts' || true)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
    finding "MEDIUM" "$COUNT TypeScript literal empty nodes/edges arrays in production" "$HITS"
  else
    ok "no hardcoded empty nodes/edges in TypeScript production"
  fi

  # E4. Algorithms that always return the same hardcoded fitness value
  # Pattern: json!({ "fitness": 0.8 }) or json!({ "final_fitness": 0.75 })
  HITS=$(grep -rEn $RS_INC '"(fitness|final_fitness|precision|generalization)"\s*:\s*0\.[0-9]+[^,}]*$' \
    $RS_SRC 2>/dev/null \
    | grep -vE '^\s*//|test|bench|threshold|min|max|clamp|budget|config|default' \
    | grep -v 'f64::' || true)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
    finding "HIGH" "$COUNT hardcoded fitness/precision literal values in algorithm output" "$HITS"
  else
    ok "no hardcoded fitness literals in algorithm outputs"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# F: Fake async (async fn that never awaits)
# ─────────────────────────────────────────────────────────────────────────────
section "F" "Fake async — async functions that never await"
in_section "F" || { echo "(skipped)"; }

if in_section "F"; then
  # F1. TypeScript async functions with no await inside
  # Uses a two-pass approach: collect async fn names, then check for await absence
  HITS=$(node --input-type=module 2>/dev/null << 'NODE_EOF' || true
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function walk(dir) {
  const entries = [];
  try {
    for (const f of readdirSync(dir)) {
      const full = join(dir, f);
      try {
        const st = statSync(full);
        if (st.isDirectory() && !['node_modules','dist','.git'].includes(f)) {
          entries.push(...walk(full));
        } else if (f.endsWith('.ts') && !f.endsWith('.d.ts') && !f.match(/\.(test|spec)\./)) {
          entries.push(full);
        }
      } catch {}
    }
  } catch {}
  return entries;
}

// Interface method names that are legitimately async for type-compliance only.
// These implement connector, backend, sink, or agent interface contracts where
// the interface declares Promise<T> but a specific implementation is sync.
// Interface method names that are legitimately async for type-compliance only.
// Connector/backend/agent/sink protocol methods that return Promise<T> by interface
// contract but have synchronous implementations.
const INTERFACE_METHOD_NAMES = /^(next|checkpoint|seek|close|validate|fingerprint|monitor|shutdown|discover|conformance|analyze|healthCheck|flush|degrade|bootstrap|validateWasmReadiness|classifyTraces|clusterTraces|forecastSeries|forecastThroughput|detectEnhancedAnomalies|regressRemainingTime|reduceFeaturesPCA|discoverWithAllAlgorithms|verify|plan|init)$/;

const results = [];
for (const dir of ['apps/wasm4pm/src','packages']) {
  for (const file of walk(dir)) {
    // Skip mock files — they are intentionally sync stubs implementing async interfaces
    if (file.includes('/mocks/') || file.includes('/null-backend')) continue;
    let src;
    try { src = readFileSync(file, 'utf8'); } catch { continue; }
    const lines = src.split('\n');
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      // Look for async function declarations (not arrow functions, not single-liners)
      if (/^\s*(?:export\s+)?(?:public\s+)?async\s+function\s+\w+|^\s*(?:public\s+)?async\s+\w+\s*\(/.test(line)) {
        const fnLine = i + 1;
        const fnName = (line.match(/async\s+(?:function\s+)?(\w+)/) || [])[1] || '?';
        // Collect the function body (simple brace counting)
        let depth = 0, body = '', j = i;
        while (j < lines.length && j < i + 80) {
          body += lines[j] + '\n';
          depth += (lines[j].match(/\{/g) || []).length;
          depth -= (lines[j].match(/\}/g) || []).length;
          j++;
          if (depth <= 0 && j > i + 1) break;
        }
        // Skip: trivial one-liners, constructors, CLI run() entry points (async interface required
        // by CLI framework even when body is sync), check*() health-check functions
        // (they implement Array<() => Promise<Diagnosis>> interface in doctor.ts),
        // known interface method names (connector/backend/agent protocol compliance),
        // and functions that delegate by returning this.somePromise (caching pattern).
        if (j - i > 2 && body.indexOf('await ') === -1
            && !fnName.match(/constructor|^run$|^check[A-Z]/)
            && !INTERFACE_METHOD_NAMES.test(fnName)
            && !body.match(/return\s+this\.\w+Promise|return\s+this\.do[A-Z]/)) {
          results.push(`  ${file}:${fnLine}: async ${fnName}() — no await found`);
        }
      }
      i++;
    }
  }
}
if (results.length) process.stdout.write(results.slice(0, 10).join('\n') + '\n');
NODE_EOF
)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | grep -c '  ' || echo 0)
    finding "MEDIUM" "$COUNT async TypeScript functions that never use await (fake async)" "$HITS"
  else
    ok "no fake-async TypeScript functions found"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# G: TypeScript cognition contract field lies
# ─────────────────────────────────────────────────────────────────────────────
section "G" "TypeScript cognition contract field lies"
in_section "G" || { echo "(skipped)"; }

if in_section "G"; then
  # G1. Using .decision on ContractResult (field doesn't exist — it's .status)
  HITS=$(grep -rEn '\.(decision|receipt_chain|hash\b(?!es|_hex|_len|_key|_function|_algorithm|_size))' \
    $TS_SRC 2>/dev/null \
    | grep -vE '\.(test|spec)\.|node_modules|dist/' \
    | grep -vE '^\s*//' || true)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
    finding "CRITICAL" "$COUNT uses of undefined cognition result fields (.decision, .receipt_chain, .hash)" "$HITS"
  else
    ok "no undefined cognition layer field accesses"
  fi

  # G2. Checking result.status === 'rejected' (value never emitted — should be 'has_findings')
  # Skip comment lines (both // and * in JSDoc) — the types.ts doc explains what NOT to use
  # grep output format: file:linenum:content — match on content after linenum
  HITS=$(grep -rEn "['\"]rejected['\"]" \
    apps/wasm4pm/src/ packages/ 2>/dev/null \
    | grep -vE '\.(test|spec)\.|node_modules|dist/' \
    | grep -vE ':[0-9]+:\s*(\/\/|\*|/\*)' || true)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
    finding "HIGH" "$COUNT checks for status === 'rejected' (value never emitted; use 'has_findings')" "$HITS"
  else
    ok "no checks for undefined 'rejected' status string"
  fi

  # G3. Accessing .candidates on system_build result (field doesn't exist — use .pareto_front)
  HITS=$(grep -rEn '(system_build|systemBuild).*\.candidates\b|\.candidates\b.*system_build' \
    $TS_SRC 2>/dev/null \
    | grep -vE '\.(test|spec)\.|node_modules|dist/' || true)
  if [ -n "$HITS" ]; then
    finding "HIGH" "system_build result accessed via .candidates (use .pareto_front)" "$HITS"
  else
    ok "no .candidates access on system_build result"
  fi

  # G4. Sending bare BreedInput directly to cognition_run (must be wrapped in { breed, contract })
  # Uses 20-line context window: check lines before cognition_run() call for breed: wrapper
  # Skips Rust files (import declarations, not actual call sites with BreedInput)
  HITS=""
  while IFS= read -r hit; do
    file=$(echo "$hit" | cut -d: -f1)
    lineno=$(echo "$hit" | cut -d: -f2)
    start=$(( lineno - 20 ))
    if [ "$start" -lt 1 ]; then start=1; fi
    context=$(sed -n "${start},${lineno}p" "$file" 2>/dev/null)
    if ! echo "$context" | command grep -qE 'breed[\s:,}]'; then
      HITS="${HITS}${hit}
"
    fi
  done < <(grep -rEn 'cognition_run\s*\(' $TS_SRC 2>/dev/null \
    | grep -vE '\.(test|spec)\.|node_modules|dist/|\.rs:')
  HITS=$(echo "$HITS" | grep -v '^$' || true)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
    finding "HIGH" "$COUNT cognition_run calls may pass bare BreedInput (missing breed: wrapper)" "$HITS"
  else
    ok "no bare BreedInput passed to cognition_run"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# H: Hardcoded return values in named computation functions
# ─────────────────────────────────────────────────────────────────────────────
section "H" "Hardcoded return values in computation functions"
in_section "H" || { echo "(skipped)"; }

if in_section "H"; then
  # H1. Rust functions named compute_*/calculate_*/evaluate_* that return literal 1.0 or 0.0
  # Only flag f64/f32-returning functions that immediately return 0.0 or 1.0 (not bool functions)
  HITS=$(grep -rEn $RS_INC 'fn\s+(compute_|calculate_|evaluate_|measure_|score_)\w+' $RS_SRC 2>/dev/null \
    | grep -vE '^\s*//|test|bench' | awk -F: '{print $1 ":" $2}' | while IFS=: read -r file lineno; do
    tail_output=$(tail -n +"$lineno" "$file" 2>/dev/null | head -25)
    # Skip functions that return bool (true/false is their correct literal return)
    # Use 'command grep' to bypass the ugrep shell-function wrapper
    if echo "$tail_output" | command grep -qE -- '->\s*bool'; then continue; fi
    if echo "$tail_output" | command grep -qE -- '^\s*(return\s+)?(0\.0|1\.0)\s*;'; then
      # Skip guard returns: a guard return is legitimate when the function also has real
      # computation (let bindings, type-cast arithmetic, or clamping after the early return).
      if echo "$tail_output" | command grep -qE '^\s+(let\s+\w|[a-z_]+\s+as\s+f64|\.min\(|\.max\(|\.clamp\()'; then
        continue
      fi
      head -n "$lineno" "$file" | tail -1
      echo "  $file:$lineno"
    fi
  done || true)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | grep -c '^\s*wasm4pm' || echo 1)
    finding "HIGH" "compute_/calculate_/evaluate_ functions returning literal 0.0 or 1.0" "$HITS"
  else
    ok "no compute_/calculate_ functions with hardcoded 0.0/1.0 return"
  fi

  # H2. TypeScript: const result = { status: 'ok' } with nothing else computed
  # These look like command handlers that return fake success without doing work
  HITS=$(grep -rEn "return\s*\{[^}]*status\s*:\s*['\"]ok['\"][^}]*\}" \
    apps/wasm4pm/src/commands/ 2>/dev/null \
    | grep -vE '\.(test|spec)\.|node_modules' \
    | grep -v 'exitCode\|message\|data\|result\|handle\|nodes\|edges\|output' || true)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
    finding "HIGH" "$COUNT command handlers returning bare { status: ok } with no data" "$HITS"
  else
    ok "no bare { status: ok } returns in command handlers"
  fi

  # H3. Rust: WASM pub fn that construct and immediately return a new empty struct — only flag
  # if the struct name ends in Result/Output (algorithm output types).
  # Exclude Graph and Model types (DirectlyFollowsGraph, DeclareModel, etc.) — these are
  # always builder patterns that are populated after ::new().
  HITS=$(grep -rEn $RS_INC 'let\s+mut\s+\w+\s*=\s*\w+(Result|Output)::new\(\)\s*;' $RS_SRC 2>/dev/null \
    | grep -vE '^\s*//|test|bench' || true)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
    finding "MEDIUM" "$COUNT algorithm output structs initialized with ::new() — ensure populated before return" "$HITS"
  else
    ok "no suspicious empty algorithm-output struct constructions"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# I: Commented-out production code blocks
# ─────────────────────────────────────────────────────────────────────────────
section "I" "Commented-out production code"
in_section "I" || { echo "(skipped)"; }

if in_section "I"; then
  # I1. Large blocks of commented-out Rust code (3+ consecutive // lines with code-like content)
  HITS=$(awk '
    /^\s*\/\/ *(let |fn |if |for |while |match |return |use |pub |impl )/ {
      count++; if (count==1) { start=NR; startline=$0 }
      if (count>=3) {
        print FILENAME ":" start ": " count " consecutive commented-out code lines"
        count=0
      }
      next
    }
    { count=0 }
  ' $(find $RS_SRC -name '*.rs' 2>/dev/null | head -200) 2>/dev/null | head -15 || true)
  if [ -n "$HITS" ]; then
    finding "MEDIUM" "Large blocks of commented-out Rust code" "$HITS"
  else
    ok "no large commented-out Rust code blocks"
  fi

  # I2. TypeScript: commented-out import lines or function calls
  HITS=$(grep -rEn '^\s*//\s*(import|export|const|let|var|function|return|await|throw)' \
    $TS_SRC 2>/dev/null \
    | grep -vE '\.(test|spec)\.|node_modules|dist/' \
    | grep -vE '^\s*///|Example:|e\.g\.' | head -20 || true)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
    finding "LOW" "$COUNT commented-out TypeScript import/function lines" "$HITS"
  else
    ok "no commented-out TypeScript code lines"
  fi

  # I3. Rust: #[allow(dead_code)] on pub functions (suppresses important warnings)
  HITS=$(grep -rBn1 $RS_INC '#\[allow(dead_code)\]' $RS_SRC 2>/dev/null \
    | grep -E 'pub (fn|struct|enum|const)' \
    | grep -vE '^\s*//|test' || true)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
    finding "MEDIUM" "$COUNT pub items with #[allow(dead_code)] — may be unreachable production code" "$HITS"
  else
    ok "no pub items suppressing dead_code warnings"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# J: Functions that claim to return Result<T> but never return Err
# ─────────────────────────────────────────────────────────────────────────────
section "J" "Functions claiming Result<T,E> but structurally infallible"
in_section "J" || { echo "(skipped)"; }

if in_section "J"; then
  # J1. pub fn returning Result<JsValue,JsValue> in wasm_bindgen context that
  # have no Err return path (always return Ok) — misleads callers about error handling
  HITS=$(for f in $RS_SRC; do
    [ -d "$f" ] || continue
    grep -rln 'Result<JsValue, JsValue>' "$f"/*.rs 2>/dev/null
  done | while IFS= read -r file; do
    # Count Ok( vs Err( returns in each function
    awk '
      /^\s*(#\[wasm_bindgen\])?/ { next_wb=1 }
      next_wb && /^\s*pub fn / { fn_name=$0; ok_count=0; err_count=0; in_fn=1; depth=0; next_wb=0 }
      in_fn {
        if (/Err\s*\(/) err_count++
        if (/Ok\s*\(/) ok_count++
        depth += gsub(/\{/,"{"); depth -= gsub(/\}/,"}")
        if (depth <= 0 && NR > 1) {
          if (ok_count > 0 && err_count == 0) {
            printf "  %s: %s\n", FILENAME, fn_name
          }
          in_fn=0
        }
      }
    ' "$file" 2>/dev/null
  done | head -10 || true)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
    finding "LOW" "$COUNT Result<JsValue,JsValue> functions with no Err return path" "$HITS"
  else
    ok "all Result<JsValue,JsValue> functions have at least one Err return"
  fi

  # J2. TypeScript async functions returning Promise<T> that always resolve
  # (never reject, never throw) — callers can't rely on error handling
  HITS=$(grep -rEn 'Promise\.(resolve|reject)\s*\(' $TS_SRC 2>/dev/null \
    | grep 'resolve' \
    | grep -vE '\.(test|spec)\.|node_modules|dist/' \
    | grep -vE '^\s*//' \
    | head -10 || true)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
    finding "LOW" "$COUNT explicit Promise.resolve() calls — may suppress real errors" "$HITS"
  else
    ok "no explicit Promise.resolve() suppressing errors"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# K: WASM/Node boundary integrity
# ─────────────────────────────────────────────────────────────────────────────
section "K" "WASM boundary integrity"
in_section "K" || { echo "(skipped)"; }

if in_section "K"; then
  # K1. TypeScript importing WASM but calling functions that don't exist in WASM_API.md
  # We can only do a best-effort check: look for wasm.X() calls where X is not in the
  # list of known exported functions
  if [ -f "WASM_API.md" ]; then
    KNOWN_FNS=$(grep -oE '`[a-z_]+`' WASM_API.md 2>/dev/null | tr -d '`' | sort -u || true)
    # Skip internal wasm-bindgen glue symbols (__wbg_*, __wbindgen_*)
    CALLED_FNS=$(grep -rEh 'wasm\.\w+\s*\(' $TS_SRC 2>/dev/null \
      | grep -oE 'wasm\.\w+' | sed 's/wasm\.//' \
      | grep -vE '^__wbg_|^__wbindgen_' | sort -u || true)
    UNKNOWN=""
    while IFS= read -r fn; do
      if [ -z "$fn" ]; then continue; fi
      echo "$KNOWN_FNS" | grep -qx "$fn" || UNKNOWN="$UNKNOWN\n  wasm.$fn"
    done <<< "$CALLED_FNS"
    UNKNOWN_COUNT=$(echo -e "$UNKNOWN" | grep -c 'wasm\.' || echo 0)
    if [ -n "$UNKNOWN" ] && [ "$UNKNOWN_COUNT" -gt 5 ]; then
      # WASM_API.md is likely incomplete — only flag as LOW to note the gap
      finding "LOW" "$UNKNOWN_COUNT TypeScript WASM calls not in WASM_API.md (API doc may be incomplete)" "$(echo -e "$UNKNOWN" | head -10)"
    else
      ok "all TypeScript WASM calls match WASM_API.md (or gap is small)"
    fi
  else
    echo "  [SKIP] WASM_API.md not found — cannot check WASM function existence"
  fi

  # K2. serde_wasm_bindgen::to_value used on serde_json::Value (known silent bug)
  HITS=$(grep -rEn $RS_INC 'serde_wasm_bindgen::to_value\s*\(&?\s*json!\s*\(' $RS_SRC 2>/dev/null \
    | grep -vE '^\s*//|test' || true)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
    finding "CRITICAL" "$COUNT uses of serde_wasm_bindgen::to_value(&json!(...)) — returns {} silently on wasm32" "$HITS"
  else
    ok "no serde_wasm_bindgen::to_value(&json!(...)) silent serialization bugs"
  fi

  # K3. Direct cargo test --lib would hit SIGABRT — but tests calling wasm functions
  # on native without a mock would silently get null. Check for wasm:: usage in Rust tests.
  # Skip doc comment lines (///, //, *) which just reference wasm:: in documentation
  # Exclude wasm:: imports inside #[cfg(feature = "wasm")] blocks — those tests
  # only run when the WASM feature is enabled, which implies a wasm32 target where
  # to_js() serialization behaves correctly.
  HITS=$(node --input-type=module 2>/dev/null << 'K3_EOF' || true
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
const results = [];
for (const dir of ['wasm4pm/tests', 'crates/wasm4pm-cognition/tests']) {
  let files; try { files = readdirSync(dir).filter(f => f.endsWith('.rs')).map(f => join(dir, f)); } catch { continue; }
  for (const file of files) {
    let lines; try { lines = readFileSync(file, 'utf8').split('\n'); } catch { continue; }
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!/(wasm::|#\[wasm_bindgen\])/.test(l)) continue;
      if (/^\s*(\/\/\/|\/\/|\*)/.test(l)) continue; // doc comment
      // Check if any of the preceding 6 lines has a cfg(feature = "wasm") gate
      // (the use statement may be inside a fn body whose #[cfg] is several lines up)
      const window = lines.slice(Math.max(0, i - 6), i).join('\n');
      if (/cfg.*feature.*wasm/.test(window) || /cfg.*feature.*wasm/.test(l)) continue;
      results.push('  ' + file + ':' + (i+1) + ':' + l);
    }
  }
}
if (results.length) process.stdout.write(results.join('\n') + '\n');
K3_EOF
)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
    finding "MEDIUM" "$COUNT integration test files importing wasm:: (may silently get null on native)" "$HITS"
  else
    ok "integration tests don't directly import wasm:: bindings"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# L: Documentation and contract lies
# ─────────────────────────────────────────────────────────────────────────────
section "L" "Documentation and contract lies"
in_section "L" || { echo "(skipped)"; }

if in_section "L"; then
  # L1. /// doc comments claiming a function returns something it doesn't
  # Heuristic: doc says "Returns fitness" but function has no fitness field in output
  HITS=$(grep -rEn $RS_INC '///.*[Rr]eturns\s+fitness' $RS_SRC 2>/dev/null \
    | head -5 | while IFS=: read -r file line rest; do
    # Check if there's a `fitness` in the function output within next 50 lines
    if ! tail -n +"$line" "$file" | head -50 | grep -qE '"fitness"|fitness:'; then
      echo "  $file:$line: claims to return fitness but output has no fitness field"
    fi
  done || true)
  if [ -n "$HITS" ]; then
    finding "MEDIUM" "Doc comments claiming to return fitness but output lacks fitness field" "$HITS"
  else
    ok "doc-to-output consistency check passed"
  fi

  # L2. TypeScript: functions with JSDoc @returns claiming to return data but actually returning void
  HITS=$(grep -rEn '@returns' $TS_SRC 2>/dev/null \
    | grep -vE '\.(test|spec)\.|node_modules|dist/' | head -5 | while IFS=: read -r file line rest; do
    # Check if the function after this line has a return statement
    if ! tail -n +"$line" "$file" | head -20 | grep -qE 'return\s+[^;]'; then
      echo "  $file:$line: @returns doc but function has no return statement"
    fi
  done || true)
  if [ -n "$HITS" ]; then
    finding "LOW" "Functions with @returns JSDoc but no return statement" "$HITS"
  else
    ok "no @returns without actual return statement"
  fi

  # L3. CLAUDE.md / README claims that contradict actual code state
  # Check: CLAUDE.md says "36 registered algorithms" — verify the count
  # Use wasm4pm/CLAUDE.md as canonical source; grep first occurrence of "N registered algorithms"
  DECLARED_COUNT=$(grep -oE '[0-9]+ registered' wasm4pm/CLAUDE.md 2>/dev/null | head -1 | grep -oE '[0-9]+' || echo "?")
  ACTUAL_COUNT=$(grep -cE "^\s+id:\s*'" packages/kernel/src/registry.ts 2>/dev/null || echo "?")
  if [ "$DECLARED_COUNT" != "?" ] && [ "$ACTUAL_COUNT" != "?" ] && [ "$DECLARED_COUNT" != "$ACTUAL_COUNT" ]; then
    finding "MEDIUM" "CLAUDE.md claims $DECLARED_COUNT registered algorithms but registry.ts has $ACTUAL_COUNT" ""
  else
    ok "algorithm count in CLAUDE.md matches registry.ts ($ACTUAL_COUNT)"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $TOTAL -eq 0 ]; then
  echo -e "${GREEN}${BOLD}CLEAN — no lies or placeholders found${NC}"
  exit 0
else
  echo -e "${BOLD}Findings: ${RED}$CRITICAL critical${NC}  ${YELLOW}$HIGH high${NC}  ${CYAN}$MEDIUM medium${NC}  $LOW low"
  if [ $CRITICAL -gt 0 ]; then
    echo -e "${RED}${BOLD}STOP THE LINE — critical findings require immediate fix${NC}"
    exit 2
  elif [ $((HIGH + MEDIUM)) -gt 0 ]; then
    echo -e "${YELLOW}Review recommended before next release${NC}"
    exit 1
  else
    echo -e "Low-severity findings only — review at your discretion"
    exit 0
  fi
fi
