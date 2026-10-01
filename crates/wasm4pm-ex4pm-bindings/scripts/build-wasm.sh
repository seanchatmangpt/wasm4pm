#!/usr/bin/env bash
# Build the ex4pm WASM artifact with zero imports and only allowlisted exports.
# Links the staticlib with rust-lld, exporting only the `export_name` symbols,
# so upstream rlib #[no_mangle]/wasm-bindgen wrappers are never GC roots.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRATE="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$CRATE/../.." && pwd)"
cd "$ROOT"

TARGET=wasm32-unknown-unknown
TDIR="${CARGO_TARGET_DIR:-$ROOT/target}/$TARGET/release"
OUT="$TDIR/wasm4pm_ex4pm_bindings.wasm"
LIB="$TDIR/libwasm4pm_ex4pm_bindings.a"

cargo rustc --locked -p wasm4pm-ex4pm-bindings --lib --release --target "$TARGET" --crate-type staticlib

HOST="$(rustc -vV | sed -n 's/^host: //p')"
LLD="$(rustc --print sysroot)/lib/rustlib/$HOST/bin/rust-lld"
[ -x "$LLD" ] || { echo "rust-lld not found at $LLD" >&2; exit 1; }

ALLOW="$(grep -ho 'export_name = "[a-z0-9_]*"' "$CRATE"/src/*.rs | sed 's/.*"\(.*\)"/\1/' | sort -u)"
[ -n "$ALLOW" ] || { echo "empty export allowlist" >&2; exit 1; }

ARGS=()
while IFS= read -r n; do ARGS+=("--export=$n"); done <<<"$ALLOW"

"$LLD" -flavor wasm "${ARGS[@]}" \
  -z stack-size=1048576 --stack-first --no-demangle --no-entry \
  --gc-sections --strip-debug -O2 \
  "$LIB" -o "$OUT"

REPORT="$(python3 "$HERE/wasm_imports.py" --require-zero-imports "$OUT")" || {
  echo "$REPORT" >&2; echo "FAIL: output has wasm imports" >&2; exit 1; }
echo "$REPORT" | sed -n '1,2p'

EXPORTS="$(echo "$REPORT" | sed -n 's/^  export //p')"
MISSING=0
while IFS= read -r n; do
  grep -qxF "$n" <<<"$EXPORTS" || { echo "FAIL: missing export $n" >&2; MISSING=1; }
done <<<"$ALLOW"
[ "$MISSING" -eq 0 ] || exit 1

echo "OK $OUT ($(wc -c <"$OUT" | tr -d ' ') bytes, $(echo "$ALLOW" | wc -l | tr -d ' ') allowlisted exports)"
shasum -a 256 "$OUT"
