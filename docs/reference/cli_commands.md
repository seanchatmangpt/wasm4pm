# Reference: CLI Commands

The `wpm` (wasm4pm) CLI provides a unified interface for process mining, Truex receipt verification, and old-AI cognition.

## High-Level Commands

| Category | Commands |
|----------|----------|
| **Discovery** | `run`, `compare`, `diff`, `watch`, `init`, `algorithms` |
| **Prediction** | `predict`, `drift-watch` |
| **Analysis** | `ml`, `powl`, `quality`, `conformance`, `validate`, `simulate`, `temporal`, `social` |
| **Truex** | `truex verify` |
| **Cognition** | `cognition run`, `cognition verify`, `cognition replay`, `prolog8` |
| **Governance** | `receipts`, `cell`, `autoprocess`, `explain` |
| **System** | `status`, `doctor`, `results`, `cache`, `models`, `wasm-server` |

Run `wpm --help` for the full command tree (40+ top-level commands).

## Process Discovery

```bash
# Discover a model — default: config algorithm.name, else profile default, else simd_streaming_dfg
wpm run log.xes

# Specific algorithm (alias or registry ID)
wpm run log.xes -a dfg
wpm run log.xes -a inductive

# List all 60 registered algorithms
wpm algorithms
wpm algorithms --tier fast
wpm algorithms --show-ratings
wpm algorithms --format json

# Compare multiple discovery aliases side-by-side
wpm compare dfg,heuristic,inductive -i log.xes
```

**Default algorithm:** `config.algorithm.name` from `wasm4pm.toml` / `wasm4pm.json`, else the first algorithm for your execution profile, else `heuristic_miner`. See [Algorithms reference](algorithms.md) for the full registry and alias list.

`wpm compare` benchmarks a fixed subset of discovery aliases. `wpm run -a <id>` accepts any registered algorithm ID or CLI alias.

## Truex — OCEL 2.0 Receipt Verification

Verify object-centric execution receipts with BLAKE3 digests and a structured refusal taxonomy.

```bash
# Admitted receipt (exit 0)
wpm truex verify examples/out/truex_ocel2_valid.json

# Machine-readable output
wpm truex verify examples/out/truex_ocel2_valid.json --format json

# Forged / tampered envelope (exit non-zero, structured refusal — not a panic)
wpm truex verify examples/out/truex_ocel2_forged.json
```

Refusal statuses include `ReceiptForged`, `CanonicalizationMismatch`, `ReplayDetected`, and others defined in the [Truex OCEL 2.0 Canonical Profile](../truex-ocel2-canonical-profile.md).

Tutorial: [Truex Receipt Verification](../tutorials/truex_receipts.md).

## System & Health

```bash
# Environment and registry health
wpm doctor check

# Runtime status (JSON for automation)
wpm status --format json

# Browse saved discovery results
wpm results

# Inspect most recent result with receipt hash validation
wpm results --last --verify
```

## Predictive Monitoring

```bash
# Predict next activity for a prefix
wpm predict next-activity -i log.xes --prefix "A,B"

# Estimate remaining case duration
wpm predict remaining-time -i log.xes --prefix "A"
```

## Cognition Contracts

```bash
# Run a MYCIN diagnostic contract
wpm cognition run --contract mycin --input examples/cognition/mycin/intent.json
```

For full documentation and all subcommands, run `wpm --help` or `wpm <command> --help`.
