#!/usr/bin/env bash
# scan-ghost-impls.sh — find capabilities that look implemented but actually are not.
#
# Based on real bugs found in this codebase:
#   • A*:  all-or-nothing fitness threshold blocked all edge candidates
#   • SA:  HashSet::iter().next() is non-deterministic across runs
#   • Benchmarks: panic!("REAL DATA REQUIRED") fires before algorithms run
#
# Exit 0 = clean. Exit 1 = findings that require investigation.
#
# Usage:
#   bash scripts/scan-ghost-impls.sh              # full scan
#   bash scripts/scan-ghost-impls.sh --quick      # skip test execution
#   bash scripts/scan-ghost-impls.sh --json       # machine-readable output

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

QUICK="${1:-}"
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

CRITICAL=0
HIGH=0
MEDIUM=0
TOTAL=0

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

finding() {
  local severity="$1"; local msg="$2"; local detail="$3"
  TOTAL=$((TOTAL + 1))
  case "$severity" in
    CRITICAL) CRITICAL=$((CRITICAL + 1)); echo -e "${RED}[CRITICAL]${NC} $msg" ;;
    HIGH)     HIGH=$((HIGH + 1));         echo -e "${YELLOW}[HIGH]${NC}     $msg" ;;
    MEDIUM)   MEDIUM=$((MEDIUM + 1));     echo -e "${CYAN}[MEDIUM]${NC}   $msg" ;;
  esac
  if [ -n "$detail" ]; then
    echo "$detail" | head -5 | while IFS= read -r line; do
      echo "           $line"
    done
  fi
}

section() {
  echo ""
  echo -e "${BOLD}━━━ $1 ━━━${NC}"
}

# ─────────────────────────────────────────────────────────────────────────────
# A: Explicit non-implementations in production (non-test) code
# ─────────────────────────────────────────────────────────────────────────────
section "A: Explicit stubs / panics in production code"

# A1. todo!() and unimplemented!() in Rust src (not test files, not comments)
HITS=$(grep -rEn '\b(todo!|unimplemented!)\s*\(' wasm4pm/src/ 2>/dev/null \
  | grep -vE '^\s*//|^\s*///|^\s*//!' || true)
if [ -n "$HITS" ]; then
  finding "CRITICAL" "todo!()/unimplemented!() in production Rust code" "$HITS"
else
  echo -e "  ${GREEN}✓${NC} no todo!()/unimplemented!() in wasm4pm/src/"
fi

# A2. panic! with "not implemented", "TODO", "FIXME" message in src/
HITS=$(grep -rEn 'panic!\s*\(\s*"[^""]*(not implemented|TODO|FIXME|STUB|placeholder)[^""]*"' \
  wasm4pm/src/ apps/wasm4pm/src/ packages/ 2>/dev/null \
  | grep -vE '^\s*//|^\s*///|test' || true)
if [ -n "$HITS" ]; then
  finding "CRITICAL" "panic! with 'not implemented' / TODO message in production" "$HITS"
else
  echo -e "  ${GREEN}✓${NC} no 'not implemented' panics in src/"
fi

# A3. TypeScript: throw new Error('not implemented') in command files
HITS=$(grep -rEn "throw new Error\(['\"][^'\"]*not.implement[^'\"]*['\"]" \
  apps/wasm4pm/src/commands/ packages/ 2>/dev/null \
  | grep -vE '\.(test|spec)\.|node_modules' || true)
if [ -n "$HITS" ]; then
  finding "CRITICAL" "TypeScript 'not implemented' throw in production command" "$HITS"
else
  echo -e "  ${GREEN}✓${NC} no 'not implemented' throws in commands/"
fi

# ─────────────────────────────────────────────────────────────────────────────
# B: Tests / benchmarks that prevent actual algorithm execution
# ─────────────────────────────────────────────────────────────────────────────
section "B: Tests that prevent algorithm execution"

# B1. panic! gating on missing data (like the REAL DATA REQUIRED pattern)
HITS=$(grep -rEn 'panic!\s*\(\s*"[^""]*(REAL DATA|requires.*real|data.*required)[^""]*"' \
  wasm4pm/tests/ 2>/dev/null \
  | grep -vE '^\s*//' || true)
if [ -n "$HITS" ]; then
  finding "CRITICAL" "Test panics on missing data before algorithm runs" "$HITS"
else
  echo -e "  ${GREEN}✓${NC} no data-gate panics in wasm4pm/tests/"
fi

# B2. Discarded algorithm results: let _ = discover_X(...)
# These silently discard errors and never assert anything about algorithm output.
HITS=$(grep -rEn 'let\s+_\s*=\s*(discover_|analyze_|mine_|detect_|compute_|score_)' \
  wasm4pm/tests/ 2>/dev/null || true)
if [ -n "$HITS" ]; then
  COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
  finding "HIGH" "$COUNT discarded algorithm results in tests (let _ = discover_...)" "$HITS"
else
  echo -e "  ${GREEN}✓${NC} no discarded algorithm results"
fi

# B3. Test functions with no assert (functions named test_* / #[test] with no assert!/expect/panic)
HITS=$(awk '
  /^\s*#\[test\]/ { in_test=1; test_line=NR; asserts=0; name="" }
  in_test && /^\s*fn / { name=$0 }
  in_test && /assert|expect|panic\!|should_panic/ { asserts++ }
  in_test && /^\s*\}/ && asserts==0 && name!="" {
    print FILENAME ":" test_line ": " name " — no assertions"
    in_test=0
  }
' wasm4pm/tests/*.rs 2>/dev/null | head -10 || true)
if [ -n "$HITS" ]; then
  finding "HIGH" "Test functions with no assertions" "$HITS"
else
  echo -e "  ${GREEN}✓${NC} all test functions contain assertions"
fi

# ─────────────────────────────────────────────────────────────────────────────
# C: Non-deterministic algorithm selection (HashSet/HashMap iteration for picking)
# ─────────────────────────────────────────────────────────────────────────────
section "C: Non-deterministic selection in algorithms"

# C1. .iter().next() used to select an element from a HashSet/HashMap in src/
# This is fine for "give me any element" idempotent reads but wrong in
# stochastic algorithms — two identical calls produce different elements.
HITS=$(grep -rEn '\.iter\(\)\.next\(\)|\.iter_mut\(\)\.next\(\)' \
  wasm4pm/src/ 2>/dev/null \
  | grep -vE '^\s*//|^\s*///' \
  | grep -vE 'spc_history|Option|unwrap_or|is_none|is_some|map\(|if let Some' || true)
if [ -n "$HITS" ]; then
  finding "HIGH" "iter().next() for element selection — non-deterministic across runs" "$HITS"
else
  echo -e "  ${GREEN}✓${NC} no iter().next() selection patterns"
fi

# C2. Non-seeded RNG in algorithm files (rand::thread_rng or from_entropy)
# All stochastic algorithms must use seed_from_u64 for reproducibility.
HITS=$(grep -rEn 'thread_rng\(\)|SmallRng::from_entropy\(\)|StdRng::from_entropy\(\)|rand::random\(\)' \
  wasm4pm/src/ 2>/dev/null \
  | grep -vE '^\s*//|^\s*///' || true)
if [ -n "$HITS" ]; then
  finding "HIGH" "Non-seeded RNG in algorithm code — breaks determinism" "$HITS"
else
  echo -e "  ${GREEN}✓${NC} no non-seeded RNG in wasm4pm/src/"
fi

# ─────────────────────────────────────────────────────────────────────────────
# D: Hardcoded scores / fitness in algorithm return paths
# ─────────────────────────────────────────────────────────────────────────────
section "D: Hardcoded metrics in algorithm outputs"

# D1. Hardcoded fitness/precision/score literals in non-test Rust source
# Pattern: json!({ "fitness": 1.0 }) in algorithm functions that should compute it.
HITS=$(grep -rEn '"(fitness|precision|generalization|final_fitness|score|confidence)":\s*(1\.0|0\.0|0\.5)\b' \
  wasm4pm/src/ 2>/dev/null \
  | grep -vE '^\s*//|^\s*///|:.*///|:\s*//' \
  | grep -vE 'default|min|max|threshold|budget|target|example|test|doc' || true)
if [ -n "$HITS" ]; then
  finding "HIGH" "Hardcoded fitness/score literal in algorithm output" "$HITS"
else
  echo -e "  ${GREEN}✓${NC} no suspicious hardcoded score literals"
fi

# D2. TypeScript commands returning hardcoded status without calling kernel
# Heuristic: command file has 'status: ok' or 'status: "ok"' but no 'kernel.' or 'wasm'
HITS=$(for f in apps/wasm4pm/src/commands/*.ts; do
  [ -f "$f" ] || continue
  basename=$(basename "$f")
  [ "$basename" = "index.ts" ] && continue
  has_ok=$(grep -c "status.*['\"]ok['\"]" "$f" 2>/dev/null || true)
  has_kernel=$(grep -c "kernel\.\|wasm\.\|runAlgorithm\|\.run(" "$f" 2>/dev/null || true)
  # grep -c returns a plain integer when given a single file
  has_ok="${has_ok:-0}"; has_kernel="${has_kernel:-0}"
  if [ "${has_ok:-0}" -gt 0 ] 2>/dev/null && [ "${has_kernel:-0}" -eq 0 ] 2>/dev/null; then
    echo "  $f  (${has_ok} ok-returns, 0 kernel calls)"
  fi
done || true)
if [ -n "$HITS" ]; then
  finding "MEDIUM" "TS command returns ok without any kernel/WASM call" "$HITS"
else
  echo -e "  ${GREEN}✓${NC} all ok-returning commands also call kernel"
fi

# ─────────────────────────────────────────────────────────────────────────────
# E: Wrapper functions that duplicate algorithm logic instead of delegating
# ─────────────────────────────────────────────────────────────────────────────
section "E: Wrapper-logic duplication (should delegate to _from_log)"

# E1. wasm_bindgen wrapper functions with more than 30 lines of algorithm logic
# A thin wrapper should be < 15 lines. More means the logic isn't in _from_log.
for rs_file in wasm4pm/src/*.rs; do
  [ -f "$rs_file" ] || continue
  awk -v file="$rs_file" '
    /^\s*#\[wasm_bindgen\]/ { next_is_export=1; next }
    next_is_export && /^\s*pub fn discover_/ {
      fn_name=$0; body_start=NR; lines=0; depth=0; opened=0
      next_is_export=0; in_fn=1; next
    }
    next_is_export { next_is_export=0 }
    in_fn {
      n=gsub(/{/, "{"); depth += n; opened += n
      m=gsub(/}/, "}"); depth -= m
      lines++
      if (opened > 0 && depth <= 0) {
        if (lines > 40) {
          printf "  %s:%d  %s  (%d lines — likely duplicates _from_log logic)\n", file, body_start, fn_name, lines
        }
        in_fn=0; lines=0
      }
    }
  ' "$rs_file" 2>/dev/null || true
done | { read -r first_line || true; if [ -n "$first_line" ]; then
  finding "MEDIUM" "wasm_bindgen wrapper > 40 lines (algorithm logic not delegated to _from_log)" "$first_line"
  # print rest
  while IFS= read -r line; do echo "           $line"; done
else
  echo -e "  ${GREEN}✓${NC} all wasm_bindgen discover_ wrappers are thin (≤ 40 lines)"
fi; }

# E2. Algorithms with #[wasm_bindgen] but no corresponding _from_log variant
WASM_FNS=$(grep -rEh '^\s*pub fn discover_\w+\s*\(' wasm4pm/src/*.rs 2>/dev/null \
  | grep -v '_from_log\|#\[wasm_bindgen\]' \
  | sed 's/.*pub fn \(discover_[^( ]*\).*/\1/' | sort -u || true)
FROM_LOG_FNS=$(grep -rEh '^\s*pub fn discover_\w+_from_log\s*\(' wasm4pm/src/*.rs 2>/dev/null \
  | sed 's/.*pub fn \(discover_[^( ]*\)_from_log.*/\1/' | sort -u || true)
MISSING=""
while IFS= read -r fn; do
  [ -z "$fn" ] && continue
  if ! echo "$FROM_LOG_FNS" | grep -qx "$fn"; then
    MISSING="$MISSING\n  $fn"
  fi
done <<< "$WASM_FNS"
if [ -n "$MISSING" ]; then
  finding "MEDIUM" "Algorithms without _from_log variant (cannot be correctness-tested without WASM runtime)" "$(echo -e "$MISSING")"
else
  echo -e "  ${GREEN}✓${NC} all discover_ functions have _from_log variants"
fi

# ─────────────────────────────────────────────────────────────────────────────
# F: Algorithms registered in the kernel but not covered by correctness tests
# ─────────────────────────────────────────────────────────────────────────────
section "F: Algorithm-test coverage gap"

REGISTERED=$(grep -E "^\s+'[a-z_]+'" packages/kernel/src/registry.ts 2>/dev/null \
  | sed "s/.*'\([a-z_]*\)'.*/\1/" | sort -u || true)
TESTED=$(grep -rEh "discover_\w+_from_log|_from_log" wasm4pm/tests/algorithm_correctness.rs 2>/dev/null \
  | grep -oE "discover_[a-z_]+_from_log" | sed 's/_from_log//' | sed 's/discover_//' | sort -u || true)

UNCOVERED=""
while IFS= read -r algo; do
  [ -z "$algo" ] && continue
  # Map registry ID to function suffix (drop underscores, fuzzy match)
  normalized=$(echo "$algo" | tr -d '_')
  found=false
  while IFS= read -r tested; do
    [ -z "$tested" ] && continue
    t_norm=$(echo "$tested" | tr -d '_')
    if [ "$normalized" = "$t_norm" ]; then found=true; break; fi
  done <<< "$TESTED"
  $found || UNCOVERED="$UNCOVERED\n  $algo"
done <<< "$REGISTERED"

if [ -n "$UNCOVERED" ]; then
  UNCOV_COUNT=$(echo -e "$UNCOVERED" | grep -c '  ' || true)
  finding "MEDIUM" "$UNCOV_COUNT registered algorithms not in algorithm_correctness.rs" "$(echo -e "$UNCOVERED" | head -12)"
else
  echo -e "  ${GREEN}✓${NC} all registered algorithms have correctness tests"
fi

# ─────────────────────────────────────────────────────────────────────────────
# G: Semantic gate — correctness tests must pass
# ─────────────────────────────────────────────────────────────────────────────
if [ "$QUICK" != "--quick" ]; then
  section "G: Semantic gate (cargo test algorithm_correctness)"

  if cargo test --test algorithm_correctness --quiet 2>&1 | grep -q "test result: ok"; then
    PASS_COUNT=$(cargo test --test algorithm_correctness 2>&1 | grep -oE "[0-9]+ passed" | head -1 || echo "?")
    echo -e "  ${GREEN}✓${NC} $PASS_COUNT"
  else
    OUTPUT=$(cargo test --test algorithm_correctness 2>&1 | tail -20)
    finding "CRITICAL" "algorithm_correctness tests FAILED" "$OUTPUT"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $TOTAL -eq 0 ]; then
  echo -e "${GREEN}${BOLD}CLEAN — no ghost implementations found${NC}"
  exit 0
else
  echo -e "${BOLD}Findings: ${RED}$CRITICAL critical${NC}  ${YELLOW}$HIGH high${NC}  ${CYAN}$MEDIUM medium${NC}"
  if [ $CRITICAL -gt 0 ]; then
    echo -e "${RED}${BOLD}STOP THE LINE — critical findings require immediate fix${NC}"
    exit 2
  else
    echo -e "${YELLOW}Review recommended before next release${NC}"
    exit 1
  fi
fi
