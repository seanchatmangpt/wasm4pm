# @wasm4pm/cognition

Old-AI cognition kernel for AutoSystems: frames, rules, constraints, search, scoring, verify, receipt, contract

## Overview

This package provides the foundation for autonomous systems cognition — contract-driven rule inference, constraint satisfaction, multi-perspective scoring, and receipt-based execution verification. It bridges symbolic AI reasoning (frames, rules, constraints) with modern cryptographic proof chains (BLAKE3 receipts).

## Key Components

### Core Abstractions

- **Frames**: Structured knowledge representation with slots and constraints
- **Rules**: Forward-chaining and backward-chaining inference rules
- **Constraints**: Declarative satisfaction constraints (CSP-style)
- **Search**: Heuristic search for optimal solutions

### Verification & Proof

- **Scoring**: Multi-dimensional quality assessment (fitness, precision, generalization, simplicity)
- **Verification**: Receipt-based proof of execution
- **Contracts**: Field-level contracts enforcing correctness at runtime

## WASM Integration

The cognition kernel compiles to WebAssembly for high-performance autonomous reasoning:

```typescript
import { initCognition, runInference } from '@wasm4pm/cognition';

await initCognition();
const result = await runInference(knowledge, rules, constraints);
```

## Receipt Chain

Every inference run produces a BLAKE3 receipt proving execution:

```typescript
{
  "run_id": "uuid-v4",
  "config_hash": "blake3-hex-64",
  "output_hash": "blake3-hex-64",
  "status": "ok",
  "findings": [...]
}
```

## Testing

```bash
npm test
```

## FM-5 Safeguard

This package enforces FM-5 protection — no test may mock the WASM initialization layer. All tests must exercise real cognition kernel behavior, not simulated stubs.

## See Also

- [@wasm4pm/contracts](../contracts) — Shared contracts and receipts
- [@wasm4pm/agents](../agents) — Autonomous agents using cognition
- [@wasm4pm/testing](../testing) — Test harnesses with real cognition
