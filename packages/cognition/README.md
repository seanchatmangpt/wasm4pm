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

## Browser usage (Vite / Next / Webpack / esbuild)

The package-root `.` export uses the `--target nodejs` build (Node `require`),
which bundlers cannot run in the browser. For browser bundlers, import the
dedicated `@wasm4pm/cognition/browser` subpath. It points the `WasmLoader`
singleton at the `--target web` build (`wasm4pm-cognition-web`), whose default
export is an async `init()` that `fetch`es and instantiates the `.wasm`.

```typescript
import { initCognitionBrowser } from '@wasm4pm/cognition/browser';
import { cognitionRun } from '@wasm4pm/cognition';

// Let your bundler emit/serve the wasm asset and hand us its URL:
import wasmUrl from 'wasm4pm-cognition-web/wasm4pm_cognition_bg.wasm?url'; // Vite

// Initialize ONCE, before any wrapper call:
await initCognitionBrowser({ wasmUrl });

// Now every wrapper works against the in-browser WASM instance:
const result = await cognitionRun({ breed: 'mycin', contract: { /* … */ } });
```

`initCognitionBrowser` is a thin wrapper over the loader; equivalently:

```typescript
import { WasmLoader } from '@wasm4pm/cognition';
await WasmLoader.getInstance({
  modulePath: 'wasm4pm-cognition-web',
  wasmUrl, // optional: omit to resolve the wasm relative to the module URL
}).init();
```

Notes:
- The `wasmUrl` import suffix differs by bundler (`?url` Vite/esbuild; `new URL('…', import.meta.url)` Webpack 5). Omit `wasmUrl` to let the web build resolve it relative to its own module URL.
- The loader is a singleton: call `WasmLoader.reset()` before re-pointing it.
- Node consumers need no changes — keep importing from `@wasm4pm/cognition`.

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
