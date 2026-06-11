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

ci: polish test-full anticheat

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
    just ggen-bridge

ggen-bridge:
    python3 scripts/ggen_receipt_bridge.py
