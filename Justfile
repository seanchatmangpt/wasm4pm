test:
    make test

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

ci: polish test-full
