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

# Regression gate: compare current Criterion medians against the committed
# baseline (.wasm4pm/benchmarks/baselines/main-latest.json) and FAIL if any
# benchmark's median regresses beyond the threshold (default 10%, --threshold).
bench-regress:
    cargo run -q -p bench-tools -- regress

# Emit a BLAKE3 performance receipt (environment + results + lineage) and refresh
# the committed baseline used by the regression gate and CI.
bench-receipt:
    cargo run -q -p bench-tools -- receipt

# Verify a benchmark receipt's BLAKE3 integrity (tamper detection) and refuse a
# dirty-tree baseline. Run after bench-receipt; --allow-dirty to permit local runs.
bench-verify:
    cargo run -q -p bench-tools -- verify --allow-dirty

# Longitudinal view: verify the append-only receipt-chain ledger and print a
# per-bench median trend over all recorded runs. --bench SUBSTR to filter.
bench-ledger:
    cargo run -q -p bench-tools -- ledger

# Correctness × performance: run the paper-grounded + falsification gates, join
# each breed's correctness with its latency, and FAIL on any fast-but-wrong breed.
bench-attest:
    cargo run -q -p bench-tools -- attest

# Performance budgets as code: FAIL if any bench exceeds its machine-independent
# SLO (median/calibration ratio) declared in docs/benchmarks/budgets.json.
bench-budget:
    cargo run -q -p bench-tools -- budget

# Unified report: walk target/criterion/**/new/estimates.json and emit
# docs/benchmarks/REPORT.md + docs/benchmarks/report.csv (deterministic order).
bench-report:
    cargo run -q -p bench-tools -- report

clean:
    make clean

publish:
    pnpm run release:full

ci: polish test-full anticheat

# Regenerate packs/workspace-pack/ontology.ttl's compat:WorkspaceCrate individuals
# from real `cargo metadata` (replaces hand-editing the ontology when a crate is
# added/removed/renamed). Idempotent -- no-op diff on an unchanged workspace.
workspace-pack-sync:
    python3 packs/workspace-pack/scripts/sync-crates-from-cargo-metadata.py

# ── ggen breed scaffold pipeline ────────────────────────────────────────────

# Project ocel/reports/*.json admission evidence into evidence.ttl
# (deterministic, sorted by breed_id). The alive-gate CONSTRUCT derives
# PARTIAL_ALIVE from this file — there is no hand-flip path.
project-evidence:
    python3 scripts/project_evidence.py

# Conformance gate: lsp-check, sync, and fail on any drift in generated surfaces.
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

# Cryptographic receipt verification (Ed25519 chain; ggen >= 26.6.9).
# The CLI exits 0 even on invalid receipts, so gate on the is_valid field.
ggen-verify:
    ggen receipt verify --receipt-path .ggen/receipts/latest.json --public-key .ggen/keys/verifying.key 2>/dev/null \
        | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['is_valid'], d['message']; print('receipt verified:', d['message'])"

ggen-bridge:
    python3 scripts/ggen_receipt_bridge.py
