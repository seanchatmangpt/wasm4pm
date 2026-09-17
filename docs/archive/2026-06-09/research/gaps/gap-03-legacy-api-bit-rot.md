<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/research/gaps/gap-03-legacy-api-bit-rot.md; source-sha256: cc21e1acaee51183de312417e88d0d9092bb5f8c69d5d28a853a3f66c91fd921; reason: tooling or agent control surface -->

# Research: Legacy API Bit-rot

## Overview
Several examples within the repository were found to contain outdated API references, resulting in over 50 TypeScript compilation errors upon initial evaluation.

## Analysis
As the `wasm4pm` ecosystem evolved—specifically with the refactoring of Machine Learning (ML) functions into the dedicated `@wasm4pm/ml` package and the deprecation of `registry.run` in favor of `kernel.run`—the examples directory was not synchronously updated. Because these examples were accidentally untracked in Git and excluded from the strict CI/CD validation gates, they suffered from significant API "bit-rot."

This disconnect between the active compiler target and the demonstrative code breaks the social contract with developers attempting to learn the system's architecture.

## Proposed Architectural Solution
1. **CI/CD Integration Pipeline:** The examples directory must be elevated to a first-class citizen within the automated CI/CD validation matrix. Any Pull Request modifying the core kernel API must trigger a full `npm run validate` inside the examples workspace.
2. **Strict Typestate Enforcement:** Ensure that the examples do not bypass TypeScript constraints (e.g., prohibiting `@ts-nocheck`).
3. **Deprecation Wrappers:** Implement formal deprecation notices and transitional shims in the kernel when removing older APIs, ensuring that dependent code (including examples) receives clear upgrade paths.