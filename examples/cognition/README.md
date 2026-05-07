# Cognition Examples

Working `wpm cognition` examples for each of the 9 breeds. Each example is
a self-contained directory with a JSON input and a shell script that runs
the breed end-to-end.

## Quickstart

```bash
# 1. Build
make cognition-build

# 2. Run all examples
make cognition-examples

# 3. Run a single example
cd examples/cognition/eliza && bash run.sh
```

## Examples

| Breed | Demonstrates | Directory |
|-------|--------------|-----------|
| ELIZA | Pattern matching with regex slot binding | `eliza/` |
| CBR | Jaccard similarity case retrieval | `cbr/` |
| Prolog | Robinson unification + bounded SLD resolution | `prolog/` |
| MYCIN | Forward chaining + Shortliffe CF combining | `mycin/` |

## Doctrine

Every example produces:

1. A non-empty **inference trace** (the breed's actual reasoning, not a canned string).
2. A **BLAKE3 receipt** with `combined_hash` (proof the run happened).
3. **Replay verification** — re-running the same input must produce a byte-identical hash.

If any example produces an empty trace or a receipt that fails replay, the
breed is failing the cognition doctrine and the `cognition-no-stub-gate`
should reject it.

## Prerequisites

These examples assume:
- `wpm` (apps/wasm4pm) is built and on PATH (or use `pnpm exec wpm` from workspace root).
- The Rust crate is built and `wasm4pm-cognition` WASM module is loadable.
- The TS facade `@wasm4pm/cognition` is built.

If any of these are missing, run `make cognition-build` from workspace root.
