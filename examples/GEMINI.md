# wasm4pm Examples - Local Agent Context

This directory (`examples/`) contains the executable examples for the `wasm4pm` monorepo. It serves as both a tutorial/demonstration surface for end-users and as a critical verification gate for the `wasm4pm` release process.

## Context & Rules

1.  **Monorepo Integration:**
    *   This directory is an active workspace within the `wasm4pm` pnpm monorepo.
    *   It depends heavily on internal packages (e.g., `wasm4pm`, `@wasm4pm/kernel`, `@wasm4pm/config`).
    *   **Do not** attempt to fetch these internal packages from the public npm registry. Ensure pnpm workspace linking is correctly resolving local paths (via `workspace:*` dependencies).

2.  **Execution:**
    *   Examples are written in TypeScript (`.ts`) and must be executed using `tsx` or `ts-node`.
    *   **Execution paths:** Always execute examples relative to the workspace root or with fully qualified paths when testing.
    *   *Note:* There are current issues resolving ESM dependencies (`blake3`, etc.) when running examples directly via `npx tsx` due to nested monorepo symlinks and node's resolution algorithm.

3.  **Core Dependencies:**
    *   The primary interface for examples is the `wasm4pm` kernel package (e.g., `import { Kernel, getRegistry } from 'wasm4pm'`).

4.  **Release Gate (`run-all.ts`):**
    *   The examples act as a strict combinatorial release gate. The script `scripts/examples/run-all.ts` executes a subset of simulated algorithm runs to generate **Release Receipts**.
    *   Receipts are output to `examples/out/*.receipt.json`.
    *   If the examples fail, the `wasm4pm` release process is blocked.

5.  **Recreation Note (Temporary):**
    *   The previous contents of this directory were accidentally lost due to an untracked git clean.
    *   Current efforts are focused on correctly recreating the base examples (like `01-discovery/01-basic-dfg.ts`) and stabilizing the local package resolution before writing additional examples.
    *   When writing new examples, ensure they use realistic payloads, do not rely on stubs, and correctly instantiate the `wasm4pm` Kernel.
