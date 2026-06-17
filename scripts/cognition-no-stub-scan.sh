#!/usr/bin/env bash
# Cognition no-stub gate — prevents the previous fraud regression where
# `pub struct Stub` shipped while claiming "cognition complete".
#
# Strict-precision rules: forbidden tokens are flagged only when they appear
# as identifiers/declarations, NOT when they appear in doc comments or
# explanatory strings. Doc comments may legitimately mention the words.
#
# Three scan layers:
#   1. Identifier scan   (forbidden tokens as type names / variables)
#   2. Structural scan   (canned-stub patterns, identity functions)
#   3. Semantic scan     (cargo tests pass)
#
# Usage:
#   bash scripts/cognition-no-stub-scan.sh           # all 3 layers
#   bash scripts/cognition-no-stub-scan.sh --quick   # layers 1+2 only

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

QUICK="${1:-}"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

FAIL=0

RUST_PATHS=(
  "crates/wasm4pm-cognition/src"
  "crates/prolog8/src"
)
TS_PATHS=(
  "apps/wasm4pm/src/commands/cognition.ts"
  "apps/wasm4pm/src/commands/cognition"
  "packages/cognition/src"
)

# -----------------------------------------------------------------------------
# Layer 1: Identifier scan (NOT comments, NOT strings).
# Forbidden type names: exact `Stub`, `Placeholder`, `Mock`, `Fake`, `TodoStub`.
# Forbidden macros / fn calls: todo!(), unimplemented!().
# -----------------------------------------------------------------------------
echo "─── Layer 1: forbidden identifiers ───"

# 1a. Rust: detect `pub struct Stub` as exact type name (not StubGate, etc.).
for path in "${RUST_PATHS[@]}"; do
  [ -e "$path" ] || continue
  HITS=$(grep -rEn '^\s*pub\s+struct\s+(Stub|Placeholder|Mock|FakeImpl)\s*[;{(]' "$path" 2>/dev/null || true)
  if [ -n "$HITS" ]; then
    echo -e "${RED}✗ FAIL${NC}  forbidden struct name:"
    echo "$HITS"
    FAIL=1
  fi
done

# 1b. Rust: detect `todo!()` and `unimplemented!()` macro invocations.
for path in "${RUST_PATHS[@]}"; do
  [ -e "$path" ] || continue
  HITS=$(grep -rEn '\b(todo!|unimplemented!)\s*\(' "$path" 2>/dev/null \
    | grep -vE '^\s*///|^\s*//!|^\s*//' || true)
  if [ -n "$HITS" ]; then
    echo -e "${RED}✗ FAIL${NC}  todo!()/unimplemented!() invocation:"
    echo "$HITS"
    FAIL=1
  fi
done

# 1c. Rust: detect identifier names containing `_stub`, `_placeholder`, `_mock`
#     when used as fn/struct/enum/const NAMES (not in comments).
for path in "${RUST_PATHS[@]}"; do
  [ -e "$path" ] || continue
  HITS=$(grep -rEn '^\s*(pub\s+)?(fn|struct|enum|const|static)\s+\w*(_stub|_placeholder|_mock|_fake)' "$path" 2>/dev/null || true)
  if [ -n "$HITS" ]; then
    echo -e "${RED}✗ FAIL${NC}  identifier with forbidden suffix:"
    echo "$HITS"
    FAIL=1
  fi
done

# 1d. TypeScript: detect explicit "(stub)", "(placeholder)", "(mock)" markers
#     in console.log / process.stdout (the previous-agent fraud signature).
for path in "${TS_PATHS[@]}"; do
  [ -e "$path" ] || continue
  HITS=$(grep -rEn '(console\.log|process\.stdout\.write)\s*\(\s*[`"][^`"]*\((stub|placeholder|mock)\)' "$path" 2>/dev/null || true)
  if [ -n "$HITS" ]; then
    echo -e "${RED}✗ FAIL${NC}  console.log stub/placeholder marker:"
    echo "$HITS"
    FAIL=1
  fi
done

[ $FAIL -eq 0 ] && echo -e "${GREEN}✓ OK${NC}    no forbidden identifiers"

# -----------------------------------------------------------------------------
# Layer 2: Structural — identity-function and canned-string patterns.
# -----------------------------------------------------------------------------
echo ""
echo "─── Layer 2: structural ───"
STRUCT_FAIL=0

# 2a. Each breed's run() must have body length >= 5 non-trivial lines.
for breed in crates/wasm4pm-cognition/src/breeds/*.rs; do
  [ -e "$breed" ] || continue
  base="$(basename "$breed")"
  [ "$base" = "mod.rs" ] && continue
  BODY_LEN=$(awk '
    /fn run\(/ { in_fn=1; depth=0; opened=0 }
    in_fn {
      n = gsub(/\{/, "{"); depth += n; opened += n
      m = gsub(/\}/, "}"); depth -= m
      if (NF > 0 && $0 !~ /^\s*$/ && $0 !~ /^\s*\/\//) lines++
      if (opened > 0 && depth <= 0) { exit }
    }
    END { print lines+0 }
  ' "$breed")
  if [ "$BODY_LEN" -lt 5 ]; then
    echo -e "${RED}✗ FAIL${NC}  $breed run() body has only $BODY_LEN non-comment lines (likely identity function)"
    STRUCT_FAIL=1
  fi
done

# 2b. Look for canned "stub" string literals inside Rust source bodies (not comments).
for path in "${RUST_PATHS[@]}"; do
  [ -e "$path" ] || continue
  HITS=$(grep -rEn '"\s*\w*\s+stub\s*"' "$path" 2>/dev/null \
    | grep -vE '^\s*//|^\s*///|^\s*//!' || true)
  if [ -n "$HITS" ]; then
    echo -e "${RED}✗ FAIL${NC}  canned 'stub' string literal:"
    echo "$HITS"
    STRUCT_FAIL=1
  fi
done

[ $STRUCT_FAIL -eq 0 ] && echo -e "${GREEN}✓ OK${NC}    no structural fraud"
[ $STRUCT_FAIL -ne 0 ] && FAIL=1

# -----------------------------------------------------------------------------
# Layer 3: Semantic — actual cargo tests pass.
# -----------------------------------------------------------------------------
if [ "$QUICK" != "--quick" ]; then
  echo ""
  echo "─── Layer 3: semantic ───"
  if cargo test -p wasm4pm-cognition --tests --quiet 2>&1 | tail -5 | grep -q "test result: ok"; then
    echo -e "${GREEN}✓ OK${NC}    cognition tests pass"
  else
    echo -e "${RED}✗ FAIL${NC}  cognition tests failed"
    FAIL=1
  fi
  if cargo test -p prolog8 --tests --quiet 2>&1 | tail -5 | grep -q "test result: ok"; then
    echo -e "${GREEN}✓ OK${NC}    prolog8 tests pass"
  else
    echo -e "${RED}✗ FAIL${NC}  prolog8 tests failed"
    FAIL=1
  fi
fi

echo ""
if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}═══ COGNITION NO-STUB GATE: PASSED ═══${NC}"
  exit 0
else
  echo -e "${RED}═══ COGNITION NO-STUB GATE: FAILED ═══${NC}"
  exit 1
fi
