#!/usr/bin/env bash
# fake-stub-audit.sh — scan wasm4pm/src for fake/stub/placeholder patterns
# Outputs: JSON array of findings to OUTPUT_FILE
# Usage: OUTPUT_FILE=target/.../fake-stub-audit.json bash scripts/fake-stub-audit.sh
set -euo pipefail

# Run from repo root regardless of invocation directory
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

RS_SRC="wasm4pm/src"
OUTPUT_FILE="${OUTPUT_FILE:-/dev/stdout}"

findings=""
n=0

add_finding() {
  local file="$1" line="$2" severity="$3" classification="$4" production_allowed="$5" required_action="$6"
  local rec
  rec=$(printf '  {"file":"%s","line":%s,"severity":"%s","classification":"%s","production_allowed":%s,"required_action":"%s"}' \
    "$file" "$line" "$severity" "$classification" "$production_allowed" "$required_action")
  if [ -z "$findings" ]; then findings="$rec"; else findings="$findings,\n$rec"; fi
  n=$((n+1))
}

# ── S1 CRITICAL: todo!() / unimplemented!() in production Rust ──────────────
while IFS=: read -r file line _rest; do
  add_finding "$file" "$line" "CRITICAL" "s1_fake" "false" "implement_or_remove"
done < <(grep -rEn --include='*.rs' '^\s*(todo!|unimplemented!)\s*[\(\(]' "$RS_SRC" 2>/dev/null \
  | grep -v '/tests/' | grep -oE '^[^:]+:[0-9]+' || true)

# ── S1 CRITICAL: hardcoded "not yet implemented" strings ────────────────────
while IFS=: read -r file line _rest; do
  add_finding "$file" "$line" "CRITICAL" "s1_fake" "false" "implement_or_remove"
done < <(grep -rEin --include='*.rs' '"[^"]*not yet implemented[^"]*"' "$RS_SRC" 2>/dev/null \
  | grep -v '/tests/' | grep -oE '^[^:]+:[0-9]+' || true)

# ── S2 HIGH: TODO/FIXME/HACK/STUB markers in production Rust ────────────────
while IFS=: read -r file line _rest; do
  add_finding "$file" "$line" "HIGH" "s2_placeholder" "true" "resolve_before_stable_release"
done < <(grep -rEn --include='*.rs' '//\s*(TODO|FIXME|HACK|STUB|PLACEHOLDER|XXX)\b' "$RS_SRC" 2>/dev/null \
  | grep -v '/tests/' | grep -oE '^[^:]+:[0-9]+' || true)

# ── S2 HIGH: Ok(JsValue::NULL) stub returns ─────────────────────────────────
while IFS=: read -r file line _rest; do
  add_finding "$file" "$line" "HIGH" "s2_placeholder" "false" "implement_real_return_value"
done < <(grep -rEn --include='*.rs' 'Ok\s*\(\s*JsValue::(NULL|UNDEFINED)\s*\)' "$RS_SRC" 2>/dev/null \
  | grep -v '/tests/' \
  | grep -v 'wasm4pm-s2-exclude' \
  | grep -oE '^[^:]+:[0-9]+' || true)

# ── Emit JSON ────────────────────────────────────────────────────────────────
mkdir -p "$(dirname "$OUTPUT_FILE")" 2>/dev/null || true
printf '[\n%b\n]\n' "$findings" > "$OUTPUT_FILE"
echo "fake-stub-audit: $n finding(s) written to $OUTPUT_FILE" >&2
