# Research: Module Resolution Fragility

## Overview
The `examples/` directory experiences severe ESM (ECMAScript Modules) resolution failures out-of-the-box, specifically throwing `ERR_MODULE_NOT_FOUND` for core dependencies like `blake3` and `pathe` when executed natively via `npx tsx`.

## Analysis
This fragility stems from the interaction between `pnpm` monorepo workspace hoisting, Node's strict ESM resolution (`NodeNext`), and the execution context of the examples. Because the examples directory operates as a sub-workspace but attempts to execute files that deeply import from built `dist/` folders in sibling packages, Node's module resolver fails to locate implicitly hoisted transitive dependencies (like the cryptographic `blake3` library used in the planner).

This creates a drastically degraded Developer Experience (DX). A developer cloning the repository cannot simply run an individual example script without encountering obscure module resolution panics unless they use a highly specific workspace `test:examples` run script.

## Proposed Architectural Solution
1. **Explicit Dependency Declarations:** Re-architect the `examples/package.json` to explicitly declare all required runtime dependencies (e.g., `blake3`, `pathe`) rather than relying on workspace hoisting.
2. **TypeScript Configuration Audit:** Align the `examples/tsconfig.json` to perfectly match the `NodeNext` resolution patterns expected by the root `wasm4pm` module exports.
3. **Execution Context Isolation:** Potentially bundle or utilize a unified runtime wrapper for examples that guarantees the resolution graph is completely instantiated before execution.