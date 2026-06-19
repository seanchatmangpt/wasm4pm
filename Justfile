test:
    make test

# Universal anti-cheat harness (U1,U2,U2b,U3,U4,U5) — feature-gated oracle impls.
anticheat:
    cargo test -p wasm4pm-cognition --features breed-oracles --test universal_anticheat

test-full:
    make verify-ts

polish:
    pnpm run lint && cargo clippy --workspace -- -D warnings

build:
    make build

bench:
    make bench-quick

clean:
    make clean

publish:
    pnpm run release:full

scan:
    cargo build -p wasm4pm-lsp
    ./target/debug/wasm4pm-lsp --scan . --fail-on-error

ci: polish test-full anticheat scan

# ── ggen breed scaffold pipeline ────────────────────────────────────────────

# Project ocel/reports/*.json admission evidence into evidence.ttl
# (deterministic, sorted by breed_id). The alive-gate CONSTRUCT derives
# PARTIAL_ALIVE from this file — there is no hand-flip path.
project-evidence:
    python3 scripts/project_evidence.py

# Western Electric SPC rules applied to breed fitness time-series.
# Reads ocel/reports/*.json (current) and ocel/reports/history/**/*.json (historical).
# Exits 1 if any WE violation is detected; 0 if all breeds are within control limits.
# Add historical snapshots under ocel/reports/history/<breed>/<date>.json to enable
# multi-point rules (9-in-a-row, 6-point trend, etc.).
breed-health:
    python3 scripts/breed_health.py

# Same as breed-health but outputs JSON (suitable for CI artifact upload).
breed-health-json:
    python3 scripts/breed_health.py --json

# Conformance gate: lsp-check, sync, and fail on any drift in generated surfaces.
# After ggen Ed25519 verification (ggen-verify), also runs affi receipt verify
# for cryptographic chain integrity + continuity + commitment verification.
ggen-gate:
    ggen sync
    git diff --exit-code -- \
        crates/wasm4pm-cognition/src/breeds/registration.rs \
        crates/wasm4pm-cognition/breeds/registry.json \
        packages/cognition/src/breed-ids.ts \
        crates/wasm4pm-cognition/tests/paper_pointers_generated.rs \
        crates/wasm4pm-cognition/tests/universal_anticheat_generated.rs
    just ggen-verify
    just ggen-bridge
    just ggen-affi-verify

# Cryptographic receipt verification (Ed25519 chain; ggen >= 26.6.9).
# The CLI exits 0 even on invalid receipts, so gate on the is_valid field.
ggen-verify:
    ggen receipt verify --receipt-path .ggen/receipts/latest.json --public-key .ggen/keys/verifying.key 2>/dev/null \
        | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['is_valid'], d['message']; print('receipt verified:', d['message'])"

ggen-bridge:
    python3 scripts/ggen_receipt_bridge.py

# Affidavit cryptographic conformance check.
# Bridges the ggen receipt into an affi receipt (emit → assemble → verify),
# running chain integrity + continuity + commitment verification via `affi`.
# If `affi` is not installed a warning is printed and the step soft-skips
# (to hard-require affi, install it: cargo install --path /tmp/affidavit).
ggen-affi-verify:
    python3 scripts/affi_ggen_verify.py
