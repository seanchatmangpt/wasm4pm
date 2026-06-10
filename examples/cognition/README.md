# Cognition Examples

Working `wpm cognition` examples for all 9 Old AI breeds. Each example is a self-contained directory with a JSON input file (`intent.json`) and a shell runner (`run.sh`).

## Quickstart

```bash
# Run a single breed
bash examples/cognition/mycin/run.sh

# Run all 9 Old AI breeds
bash examples/cognition/run-all.sh
```

## Old AI Examples (9 breeds)

All 9 Old AI breeds have verified working examples. Every run exits 0, produces `status: ok`, and emits a BLAKE3 receipt.

| Breed | CLI ID | Demonstrates | Directory |
|-------|--------|--------------|-----------|
| ELIZA | `eliza` | Pattern matching with regex slot binding (frame.rs) | `eliza/` |
| MYCIN | `mycin` | Forward-chaining production rules with certainty factors | `mycin/` |
| CBR | `cbr` | Jaccard similarity case retrieval and adaptation | `cbr/` |
| Prolog | `prolog` | Robinson unification + bounded SLD resolution | `prolog/` |
| STRIPS | `strips` | Linear planning with add/delete effects | `strips/` |
| DENDRAL | `dendral` | Hypothesis-and-test generate-and-test search | `dendral/` |
| GPS | `gps` | General Problem Solver — means-ends analysis | `gps/` |
| SOAR | `soar` | Universal subgoaling + chunking cognitive architecture | `soar/` |
| HEARSAY | `hearsay` | Blackboard architecture with competing knowledge sources | `hearsay/` |

## Doctrine

Every example produces:

1. A non-empty **inference trace** (the breed's actual reasoning, not a canned string).
2. A **BLAKE3 output_hash** (proof the run happened and the output is intact).
3. **Replay determinism** — re-running the same input produces a byte-identical hash.

If any example exits non-zero or produces an empty `output_hash`, the breed has regressed.

## Running all 9 breeds

```bash
bash examples/cognition/run-all.sh
```

Each line of output: `breed: status=ok / hash=<first 16 hex chars>`

## Prerequisites

- `wpm` is on PATH, or set `WPM="node apps/wasm4pm/dist/bin/wpm.js"`
- WASM module is built: `cd wasm4pm && npm run build:nodejs`

## Docs

- [Cognition Contracts Tutorial](../../docs/tutorials/cognition_contracts.md) — full field reference, all 13 breeds, receipt chain
- [Glossary: breed, contract, ContractResult](../../docs/reference/glossary.md)
