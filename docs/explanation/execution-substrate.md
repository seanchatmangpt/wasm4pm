# Explanation: The Execution Substrate

**Time to read**: 20 minutes  
**Level**: Advanced  
**Audience**: Architects, advanced users  

## Overview

wasm4pm's execution model is based on **configuration-as-API**: the system is entirely controlled via configuration files, enabling reproducibility, auditing, and deterministic execution.

## Design Principles

### 1. Configuration Binding (Early Binding)

All parameters are bound **at configuration time**, not runtime:

```
Good (wasm4pm):
  config.toml → [analysis parameters fixed] → execution

Bad (other systems):
  CLI args → [runtime argument confusion] → execution
```

Benefits:
- ✅ Reproducibility: Same config → Same output
- ✅ Auditability: Config change = traced change
- ✅ Version control: Configs are versioned

### 2. The 8-State Engine Lifecycle

Every execution goes through these states:

```
1. INITIALIZED      ← New engine created
   ↓
2. CONFIG_LOADED    ← Configuration parsed & validated
   ↓
3. PLAN_GENERATED   ← Execution plan created
   ↓
4. EXECUTING        ← Algorithm running
   ↓
5. COMPUTING        ← Post-processing
   ↓
6. OUTPUT_WRITING   ← Results written
   ↓
7. COMPLETED        ← Success
   ↓
8. FAILED           ← Error (terminal)
```

Each state transition is **logged and hashed** for determinism verification.

### 3. The Planner

The planner generates an **execution DAG** from configuration:

```
Config → Planner → Plan (DAG) → Executor
                  [blake3 hash]
```

Example plan for DFG discovery:

```json
{
  "id": "plan-abc123",
  "steps": [
    { "id": "s1", "type": "LoadEventLog", "deps": [] },
    { "id": "s2", "type": "Algorithm", "deps": ["s1"] },
    { "id": "s3", "type": "WriteSink", "deps": ["s2"] }
  ],
  "hash": "blake3:7c9f1a..."
}
```

The DAG enables:
- ✅ Parallel execution (steps with no deps)
- ✅ Checkpointing (save after each step)
- ✅ Reproducibility (same plan → same execution)

### 4. Event Log Ingestion

Three-phase loading:

```
Phase 1: Parse
  XES/JSON → Raw events → Validation

Phase 2: Structure
  Validated events → Traces → Trace map

Phase 3: Optimize
  Index creation → Activity map → Ready for algorithm
```

Each phase produces hashes for verification.

### 5. Algorithm Execution

Algorithms run in WASM (WebAssembly) for:
- Performance (compiled, not interpreted)
- Portability (runs on any platform)
- Isolation (safe memory model)
- Determinism (no undefined behavior)

### 6. Model Output

Generated model is structured:

```json
{
  "type": "dfg",
  "nodes": [
    { "id": "A", "frequency": 100 }
  ],
  "edges": [
    { "source": "A", "target": "B", "frequency": 95 }
  ]
}
```

### 7. Receipt Generation

After completion, a **receipt** proves:

```json
{
  "run_id": "run-abc123",
  "config_hash": "blake3:...",    // Config → this hash
  "input_hash": "blake3:...",     // Input → this hash
  "plan_hash": "blake3:...",      // Plan → this hash
  "output_hash": "blake3:...",    // Output → this hash
  "combined_hash": "blake3:...",  // All combined
  "timestamp": "2026-04-05T12:30:00Z"
}
```

If anyone changes the output, the hash changes, and tampering is detected.

## Information Flow

```
Configuration
    ↓
[Validate Schema]
    ↓
[Generate Plan]
    ↓
[Load Event Log]
    ↓
[Run Algorithm]
    ↓
[Compute Metrics]
    ↓
[Write Outputs]
    ↓
[Generate Receipt]
    ↓
Receipt (proof)
```

Each stage produces:
- **Hash**: For verification
- **Checkpoint**: For resumption
- **Status**: For monitoring

## Why This Matters

### Reproducibility

```bash
# Day 1
pmctl run --config config.toml
# → output hash = blake3:abc123

# Day 1000, same command
pmctl run --config config.toml
# → output hash = blake3:abc123  (SAME!)
```

No environment variables, no luck, no randomness.

### Auditability

Question: "Who changed the model?"

Answer:
```bash
git log --oneline config.toml
# Shows every config change with author and timestamp
```

### Compliance

Receipts provide evidence:
- ✅ What ran (algorithm, parameters)
- ✅ What input was used (hash proof)
- ✅ What output was produced (hash proof)
- ✅ When it happened (timestamp)
- ✅ That it's unchanged (Blake3 verification)

## Comparison to Traditional Systems

| Aspect | wasm4pm | Traditional |
|--------|---------|------------|
| Control | Configuration file | CLI arguments |
| Reproducibility | Guaranteed | Best effort |
| Auditability | Full trail | Ad hoc |
| Determinism | Proven | Assumed |
| State | Explicit | Implicit |

## Key Takeaway

The execution substrate is **configuration-driven determinism**: every execution is reproducible because all parameters are fixed before execution, and every change is tracked through cryptographic hashes and version control.

## See Also

- [Explanation: Determinism](./determinism.md)
- [Explanation: Configuration Resolution](./config-resolution.md)
- [Reference: CLI Commands](../reference/cli-commands.md)
