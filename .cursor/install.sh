#!/usr/bin/env bash
# Deterministic, non-interactive Cloud Agent bootstrap for wasm4pm.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WASM_PACK_VERSION="0.13.1"
EXPECTED_TOOLCHAIN="nightly-2026-04-15"

echo "==> [1/6] Verifying pinned Rust toolchain"
actual_toolchain="$(rustc --version | awk '{print $2}')"
if [[ "$(rustup show active-toolchain)" != "$EXPECTED_TOOLCHAIN"* ]]; then
  echo "ENVIRONMENT_REFUSED: expected $EXPECTED_TOOLCHAIN, got $(rustup show active-toolchain)" >&2
  exit 1
fi
rustup target add wasm32-unknown-unknown

echo "==> [2/6] Ensuring wasm-pack $WASM_PACK_VERSION"
if ! command -v wasm-pack >/dev/null 2>&1 || [[ "$(wasm-pack --version)" != "wasm-pack $WASM_PACK_VERSION" ]]; then
  cargo install wasm-pack --version "$WASM_PACK_VERSION" --locked
fi
[[ "$(wasm-pack --version)" == "wasm-pack $WASM_PACK_VERSION" ]] || {
  echo "ENVIRONMENT_REFUSED: wasm-pack version mismatch" >&2
  exit 1
}

echo "==> [3/6] Activating package-manager version from package.json"
package_manager="$(node -p "require('./package.json').packageManager")"
corepack enable
corepack prepare "$package_manager" --activate

echo "==> [4/6] Installing immutable dependency graph"
pnpm install --frozen-lockfile

echo "==> [5/6] Building CLI dependency closure"
pnpm --filter "@wasm4pm/cli^..." run build

echo "==> [6/6] Verifying generated artifacts and executable boundary"
test -s wasm4pm/pkg/wasm4pm.js
test -s wasm4pm/pkg/wasm4pm_bg.wasm
for artifact in packages/*/dist/index.js; do
  test -s "$artifact"
done

CLI=(node --import tsx apps/wasm4pm/src/bin/wpm.ts)
"${CLI[@]}" model discover data/small-example.xes -a dfg --human >/tmp/wasm4pm-discover.out
"${CLI[@]}" system doctor --human >/tmp/wasm4pm-doctor.out

grep -qi 'dfg' /tmp/wasm4pm-discover.out
grep -qi 'status.*ok\|42 pass' /tmp/wasm4pm-doctor.out

echo "ENVIRONMENT_ALIVE toolchain=$actual_toolchain wasm_pack=$WASM_PACK_VERSION package_manager=$package_manager"
