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

# ── ggen breed scaffold pipeline ────────────────────────────────────────────

# Project ocel/reports/*.json admission evidence into evidence.ttl
# (deterministic, sorted by breed_id). The alive-gate CONSTRUCT derives
# PARTIAL_ALIVE from this file — there is no hand-flip path.
project-evidence:
    python3 scripts/project_evidence.py

# Conformance gate: sync and fail on modified OR untracked generated surfaces.
ggen-gate:
    ggen sync run
    test -z "$(git status --porcelain -- \
        crates/wasm4pm-cognition/src/breeds/registration.rs \
        crates/wasm4pm-cognition/breeds/registry.json \
        packages/cognition/src/breed-ids.ts \
        crates/wasm4pm-cognition/tests/paper_pointers_generated.rs \
        crates/wasm4pm-cognition/tests/universal_anticheat_generated.rs \
        crates/wasm4pm-cognition/tests/phd_lifecycle_generated.rs \
        crates/wasm4pm-cognition/tests/phd_paper_oracles_generated.rs \
        crates/wasm4pm-cli/src/commands/evidence.rs \
        crates/wasm4pm-cli/tests/phd_mining_contracts_generated.rs \
        crates/wasm4pm-cli/tests/phd_cli_cases_generated.rs \
        wasm4pm/algorithm-registry.json)"
    just ggen-verify
    just ggen-bridge

# Full doctoral gate. A source declaration is not enough: native, wasm32,
# lifecycle, paper oracle, falsifier, anti-cheat, real CLI run, receipt, and span all run.
phd-gate: ggen-gate
    cargo check -p wasm4pm-cognition
    cargo check -p wasm4pm-cognition --target wasm32-unknown-unknown --features wasm
    cargo test -p wasm4pm-cognition \
        --test phd_lifecycle_generated \
        --test phd_paper_oracles_generated \
        --test paper_grounded \
        --test anti_fraud_gate \
        --test universal_anticheat_generated
    cargo check -p wasm4pm-cli
    cargo test -p wasm4pm-cli --test phd_mining_contracts_generated
    cargo test -p wasm4pm-cli --test phd_cli_cases_generated

# Cryptographic receipt verification. Current ggen resolves .ggen-v2/receipt.json
# and its verifying key from the project root; JSON `valid` is the admission bit.
ggen-verify:
    ggen receipt verify \
        | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('valid') is True, d; print('receipt verified:', d.get('chain_hash', 'no-chain-hash'))"

ggen-bridge:
    python3 scripts/ggen_receipt_bridge.py
