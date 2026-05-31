# Phase 5: CLI and API Map

The `wasm4pm` application exposes its functionality primarily through the `wpm` CLI, which under the hood maps 1:1 with the `packages/kernel` SDK API.

## Confidence Level: High

## Core CLI Command Tree

```mermaid
graph TD
  WPM[wpm binary] --> Truex[truex]
  WPM --> Core[core]
  WPM --> Ob[observability]

  Truex --> TVerify[verify <receipt.json>]

  Core --> Run[run <log>]
  Core --> Compare[compare — 14 discovery aliases]
  Core --> Doctor[doctor]
  Core --> Predict[predict]
  Core --> ML[ml]
  Core --> Conformance[conformance]
  Core --> Cell[cell]

  Ob --> Status[status]
```

`wpm run -a <id>` dispatches all ~60 kernel registry algorithms. `wpm compare` benchmarks a fixed subset of discovery aliases (dfg, heuristic, inductive, …). `wpm truex verify` is implemented; receipt generation is not exposed on the CLI yet.

## The TypeScript SDK Boundary (`packages/kernel`)

If developers embed `wasm4pm` natively in a Node.js or Browser context, they interact directly with the `Kernel` class.

### Main SDK Exports
1. `new Kernel(wasm); await kernel.init()`: Initializes the WASM module.
2. `kernel.discover(algo, logHandle, params)`: Dispatches to one of the 60 discovery engines.
3. `kernel.truexVerify(envelope)`: The programmatic equivalent of `wpm truex verify`. Parses the JCS-OCEL payload and computes the BLAKE3 digest.

## Architecture Rules
1. **Never Call WASM Directly**: The `apps/wasm4pm` CLI logic MUST NOT import from `wasm4pm/src/lib.rs` directly. It must go through `packages/kernel/src/api.ts` to ensure OTEL spans, validation, and error taxonomies are correctly applied.
2. **Synchronous Math, Async Bridge**: Rust algorithms execute synchronously and trap the thread. The TypeScript Kernel offloads these computations to async promises, and future web-worker configurations will completely decouple the UI/Main thread.
