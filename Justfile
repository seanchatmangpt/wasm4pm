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
