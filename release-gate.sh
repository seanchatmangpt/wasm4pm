set -euo pipefail

RELEASE="26.6.5"
OUT="artifacts/releases/v${RELEASE}"
mkdir -p "$OUT"

echo "== git =="
git status --porcelain=v1 | tee "$OUT/git-status.txt"
git rev-parse HEAD | tee "$OUT/git-head.txt"

echo "== version scan =="
rg "26\.5\.13|26\.5\.15|26\.5\.19|26\.5\.20|26\.5\.21|26\.5\.28|26\.5\.29" . \
  | tee "$OUT/version-scan.txt" || true

echo "== examples gate =="
npm run examples:gate \
  > "$OUT/examples-gate.stdout" \
  2> "$OUT/examples-gate.stderr" || true

echo "== receipt verify =="
npx tsx apps/wasm4pm/src/bin/wpm.ts results --verify --last \
  > "$OUT/receipt-verify.stdout" \
  2> "$OUT/receipt-verify.stderr" || true

echo "== GHF tests =="
cargo test ghf::tests \
  > "$OUT/cargo-test-ghf.stdout" \
  2> "$OUT/cargo-test-ghf.stderr" || true

cargo test --test ghf_fleet_sentinel_test \
  > "$OUT/cargo-test-ghf-fleet-sentinel.stdout" \
  2> "$OUT/cargo-test-ghf-fleet-sentinel.stderr" || true

echo "== clippy =="
cargo clippy --workspace -- -D warnings \
  > "$OUT/cargo-clippy.stdout" \
  2> "$OUT/cargo-clippy.stderr" || true

echo "== npm dry-run =="
npm publish --dry-run \
  > "$OUT/npm-publish-dry-run.stdout" \
  2> "$OUT/npm-publish-dry-run.stderr" || true

echo "== cargo dry-run =="
cargo publish --dry-run --workspace \
  > "$OUT/cargo-publish-dry-run.stdout" \
  2> "$OUT/cargo-publish-dry-run.stderr" || true

echo "== release gate complete =="
