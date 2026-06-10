# Cognition Examples

Working `wpm cognition` examples for all 13 breeds — 9 Old AI + 4 Autoinstinct. Each example is a self-contained directory with a JSON input file (`intent.json`), a shell runner (`run.sh`), a live `result.json`, and a `last-output.log`.

## Quickstart

```bash
# Run a single breed
bash examples/cognition/mycin/run.sh

# Run all 13 breeds
bash examples/cognition/run-all.sh
```

## Old AI Breeds (9)

All 9 Old AI breeds have verified working examples. Every run exits 0, produces `status: ok`, an OCEL conformance receipt (fitness=1.0), and a BLAKE3 output hash.

| Breed | CLI ID | Demonstrates | Directory |
|-------|--------|--------------|-----------|
| MYCIN | `mycin` | Shortliffe CF combining for bacterial infection diagnosis | `mycin/` |
| HEARSAY-II | `hearsay` | KSAR opportunistic scheduler over speech hypothesis blackboard | `hearsay/` |
| SOAR | `soar` | Preference resolution + bounded subgoal on tie impasse | `soar/` |
| CBR | `cbr` | 4R cycle: Retrieve (Jaccard), Reuse, Revise, Retain (BLAKE3 id) | `cbr/` |
| Prolog | `prolog` | Flat-term Robinson unification + bounded SLD resolution | `prolog/` |
| STRIPS | `strips` | Iterative-deepening forward search with frame axioms | `strips/` |
| GPS | `gps` | Means-ends analysis with difference reduction table | `gps/` |
| DENDRAL | `dendral` | Constrained structure enumeration with forbid/require rules | `dendral/` |
| ELIZA | `eliza` | Keystack priority pattern matching, Rogerian therapist | `eliza/` |

## Autoinstinct Breeds (4)

| Breed | CLI ID | Demonstrates | Directory |
|-------|--------|--------------|-----------|
| AutoinstinctLearning | `autoinstinct_learning` | STRIPS/HACKER bitwise heuristic planning (Winston 1975) | `autoinstinct_learning/` |
| AutoinstinctNeurosis | `autoinstinct_neurosis` | Affect simulation with noisy-OR belief update under conflict | `autoinstinct_neurosis/` |
| AutoinstinctSemantics | `autoinstinct_semantics` | Conceptual Dependency ATRANS/PTRANS/MTRANS parsing | `autoinstinct_semantics/` |
| AutoinstinctVision | `autoinstinct_vision` | Blocks-world scene parsing: support-graph, clear-set, stack detection | `autoinstinct_vision/` |

## Doctrine

Every example produces:

1. A non-empty **inference trace** (the breed's actual reasoning, not a canned string).
2. An **OCEL 2.0 event log** inside `output_hash` — every phase of the declared lifecycle is attested.
3. **OCEL conformance fitness = 1.0** — model-vs-log mismatch is a defect, not a discrepancy.
4. A **BLAKE3 output_hash** covering the OCEL log — proof the declared process happened.
5. **Replay determinism** — same input → bit-exact hash across runs and platforms.

If any example exits non-zero or produces an empty `output_hash`, the breed has regressed.

## Live output hashes (v26.6.9a)

| Breed | output_hash (first 16) |
|-------|------------------------|
| mycin | `f0886d11be3240a2` |
| hearsay | `a28c2c75c4c6c2a2` |
| soar | `729ad206d43b056f` |
| cbr | `0f4e3c1bb4930348` |
| prolog | `a8ca0fc451e8f268` |
| strips | `70d70d6f6164c531` |
| gps | `9f81a6c98331c6a9` |
| dendral | `9442f99ed7d0b0d8` |
| eliza | `9932078050af4f41` |
| autoinstinct_learning | `98a21d56937ae82e` |
| autoinstinct_neurosis | `d5cc681126405235` |
| autoinstinct_semantics | `3b61a92be807bf73` |
| autoinstinct_vision | `0dddfce965370d09` |

## Prerequisites

- `wpm` is on PATH, **or** run from repo root (scripts auto-detect `apps/wasm4pm/dist/bin/wpm.js`)
- WASM module is built: `cd wasm4pm && npm run build:nodejs`
- TypeScript CLI is built: `cd apps/wasm4pm && pnpm build`

## Docs

- [Cognition Contracts Tutorial](../../docs/tutorials/cognition_contracts.md) — full field reference, all 13 breeds, receipt chain
- [Glossary: breed, contract, ContractResult](../../docs/reference/glossary.md)
- [OLDIA Thesis](../../docs/thesis/oldia/) — PhD-level validation and falsification of all 13 breeds
