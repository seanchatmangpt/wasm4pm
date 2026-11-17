# @seanchatmangpt/wasm4pm

High-performance Process Mining WebAssembly algorithms, Old-AI Cognition Kernel, and TypeScript contracts optimized for **Next.js**, modern web frameworks, and Node.js with **zero CLI dependencies** and **full tree-shaking**.

---

## Features

- ⚡ **60+ High-Speed WASM Algorithms**: Alpha Miner, Heuristics Miner, Inductive Miner, Token Replay, Conformance Checking, Alignments, DFG, POWL, and RL Process Optimization.
- 🌐 **Isomorphic & Framework-Ready**: Designed for Next.js (App & Pages Router), Nuxt, Vite, and serverless edge functions.
- 🌳 **Tree-Shakeable Subpaths**: Explicit `"sideEffects": false` — import only what you need.
- 🧠 **Old-AI Cognition Substrate**: Embedded Prolog-8 interpreter, STRIPS planner, production rule engine, and Hearsay-II blackboard.
- 🔒 **Deterministic Proof Chains**: BLAKE3 cryptographic receipt hashing and Zod-validated OCEL v2 schemas.

---

## Installation

```bash
npm install @seanchatmangpt/wasm4pm
```

---

## Usage in Next.js & Modern Frameworks

### 1. High-Level Kernel (Unified Discovery & Analysis)

```typescript
import { Kernel, getRegistry } from '@seanchatmangpt/wasm4pm';

// Inspect algorithm registry (60 built-in algorithms)
const registry = getRegistry();
console.log('Available algorithms:', registry.list());

// Execute discovery
const kernel = new Kernel();
const eventLog = [
  { case_id: 'case_1', activity: 'A', timestamp: '2026-10-01T10:00:00Z' },
  { case_id: 'case_1', activity: 'B', timestamp: '2026-10-01T10:05:00Z' },
  { case_id: 'case_1', activity: 'C', timestamp: '2026-10-01T10:10:00Z' }
];

const dfg = await kernel.run('dfg', eventLog);
console.log('Directly Follows Graph:', dfg);
```

### 2. Pure TypeScript Contracts (Zero WASM Overhead)

In client components where you only need schemas, validation, or receipts, import from `@seanchatmangpt/wasm4pm/contracts`:

```typescript
import {
  PetriNetSchema,
  DFGSchema,
  ReceiptSchema,
  ALGORITHM_IDS
} from '@seanchatmangpt/wasm4pm/contracts';

// 100% Tree-shakeable — does not load or compile WebAssembly binaries
const isValidNet = PetriNetSchema.safeParse(modelData);
```

### 3. Direct WebAssembly Bindings

For low-level control or browser WebAssembly streaming:

```typescript
import { initWasm } from '@seanchatmangpt/wasm4pm/wasm';

// Automatically handles Node.js buffer loading or Browser fetch streaming
const wasm = await initWasm();

const state = wasm.rl_orchestrator_reset();
console.log('Orchestrator ready:', state);
```

### 4. Cognition Kernel (Prolog-8 & Rules)

```typescript
import * as cognition from '@seanchatmangpt/wasm4pm/cognition';

// Run old-AI reasoning and verification rules
```

---

## Subpath Exports

| Import Path | Description | WASM Loaded |
| :--- | :--- | :--- |
| `@seanchatmangpt/wasm4pm` | Full Kernel, Algorithm Registry, Recommender | On demand |
| `@seanchatmangpt/wasm4pm/contracts` | Zod schemas, types, and receipt structures | ❌ No |
| `@seanchatmangpt/wasm4pm/wasm` | Low-level process mining WASM exports | ✅ Yes |
| `@seanchatmangpt/wasm4pm/cognition` | Prolog-8, STRIPS, and rule engine WASM | ✅ Yes |
| `@seanchatmangpt/wasm4pm/planner` | Process mining DAG and execution planner | ❌ No |
| `@seanchatmangpt/wasm4pm/ml` | Native ML analysis and feature preprocessing | ❌ No |

---

## License

BUSL-1.1 © Sean Chatman
