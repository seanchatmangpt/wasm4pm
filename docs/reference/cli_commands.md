# Reference: CLI Commands

The `wpm` (wasm4pm) CLI provides a unified interface for process mining and old-AI cognition.

## High-Level Commands

| Category | Commands |
|----------|----------|
| **Discovery** | `run`, `compare`, `diff`, `watch`, `init` |
| **Prediction** | `predict`, `drift-watch` |
| **Analysis** | `ml`, `powl`, `quality`, `conformance`, `validate`, `simulate`, `temporal`, `social` |
| **Cognition** | `cognition run`, `cognition verify`, `cognition replay`, `prolog8` |
| **System** | `status`, `doctor`, `results`, `cache`, `models`, `wasm-server` |

## Usage Examples

### Process Discovery
```bash
# Discover a model (default: heuristic miner)
wpm run log.xes

# Compare multiple algorithms with sparklines
wpm compare dfg,alpha,heuristic -i log.xes
```

### Predictive Monitoring
```bash
# Predict next activity for a prefix
wpm predict next-activity -i log.xes --prefix "A,B"

# Estimate remaining case duration
wpm predict remaining-time -i log.xes --prefix "A"
```

### Cognition Contracts
```bash
# Run a MYCIN diagnostic contract
wpm cognition run --contract diagnosis --input intent.json
```

For full documentation and all subcommands, run `wpm --help` or `wpm <command> --help`.
