# Monorepo Documentation & Release Realignment Analysis

## Executive Summary
This analysis identifies all outdated documentation, release changelogs, handoff notes, or status reports that do not match the current commit state (`6b575a6b27b8b78f7954a3c8dfaa161a29c47591`) and the verdict (`PM4PY-LSP-003_ALIVE`). The investigation reveals version drift across package configuration files, outdated commit references in release artifacts (pointing to `94895822da3e823f67c37ac814361cd5f7cb10ff`), outdated status reports, and multiple stubs/placeholders in tests and the CLI.

---

## 1. Version Discrepancies Inventory
The root version is set to `26.5.29`. The following files contain outdated or mismatched version references:

| Path | Current Reference | Expected / Workspace Reference | Context / Impact |
|------|-------------------|--------------------------------|------------------|
| `package-lock.json` (line 3, 9, etc.) | `26.5.28` | `26.5.29` | Root lockfile out-of-sync with `package.json`. |
| `WASM_API.md` (line 5) | `26.5.28` | `26.5.29` | Public WASM API reference documentation lists old version train. |
| `benchmark_audit.md` (line 1) | `v26.5.28` | `26.5.29` | Benchmark audit document is outdated. |
| `docs/reference/algorithms.md` (line 4) | `v26.5.28` | `26.5.29` | Algorithms reference documentation is outdated. |
| `packages/kernel/ALGORITHMS.md` (line 5) | `v26.5.28` | `26.5.29` | Kernel algorithm reference is outdated. |
| `packages/kernel/src/algorithm-versions.json` (lines 2-45) | `26.5.28` | `26.5.29` | All 60 individual algorithm entries are mapped to version `26.5.28`. |
| `crates/pm4py-lsp/Cargo.toml` (line 3) | `0.1.0` | `26.5.29` (or `version.workspace = true`) | Crate version is not synchronized with workspace train. |
| `crates/pm-core/Cargo.toml` (line 3) | `0.1.0` | `26.5.29` (or `version.workspace = true`) | Crate version is not synchronized with workspace train. |
| `crates/wasm4pm-cognition/package.json` (line 3) | `26.4.28` | `26.5.29` | NPM package version has drifted. |
| `crates/wasm4pm-cognition/pkg/package.json` (line 7) | `26.5.19` | `26.5.29` | Outdated generated NPM build version. |
| `lab/package.json` (line 3) | `26.4.23` | `26.5.29` | Workspace package version has drifted. |
| `wasm4pm/validators/package.json` (line 3) | `26.4.9` | `26.5.29` | Workspace package version has drifted. |
| `crates/ocel-core/Cargo.toml` (line 3) | `26.5.30` | `26.5.29` | Version drift (ahead of workspace train). |
| `crates/ocpq/Cargo.toml` (line 3) | `26.5.30` | `26.5.29` | Version drift (ahead of workspace train). |
| `Cargo.toml` (lines 32-33) | `ocel-core`/`ocpq` at `26.5.30` | `26.5.29` | Workspace dependencies pin ahead-of-train versions. |
| `crates/wasm4pm-cli/Cargo.toml` (lines 24-25) | `wasm4pm-algos`/`wasm4pm` at `26.5.28` | `26.5.29` (or `{ workspace = true }`) | Pinned dependencies point to outdated version. |
| `crates/wasm4pm-cognition/Cargo.toml` (line 23) | `prolog8` at `26.5.28` | `26.5.29` (or `{ workspace = true }`) | Pinned dependency points to outdated version. |
| `PUBLISH_READY_REPORT.txt` (line 2, 8, 23, 28) | `26.5.21` | `26.5.29` | Outdated readiness report from a prior cycle (dated May 20, 2026). |
| `CHANGELOG_RELEASE.md` (line 1, 3, 13) | `v26.5.19` | `v26.5.29` | Outdated release notes from prior release cycle. |

---

## 2. Commit Hash Discrepancies Inventory
The expected release-level commit hash is `6b575a6b27b8b78f7954a3c8dfaa161a29c47591`. The following files point to outdated commits:

| Path | Current Commit Hash | Expected Commit Hash | Context / Impact |
|------|---------------------|----------------------|------------------|
| `RELEASE_CERTIFICATE.v26.5.29.json` (line 5) | `94895822da3e823f67c37ac814361cd5f7cb10ff` | `6b575a6b27b8b78f7954a3c8dfaa161a29c47591` | Points to the prior release chore commit rather than the current HEAD. |
| `artifacts/release/ALGORITHM_BEHAVIOR_EVIDENCE.v26.5.29.json` (line 4) | `94895822da3e823f67c37ac814361cd5f7cb10ff` | `6b575a6b27b8b78f7954a3c8dfaa161a29c47591` | Points to the prior release chore commit. |
| `examples/out/*.receipt.json` (all 8 files, line 6) | `94895822da3e823f67c37ac814361cd5f7cb10ff` | `6b575a6b27b8b78f7954a3c8dfaa161a29c47591` | Prior release commit pinned inside example execution receipts. |

*Note: In code-centric reports (`docs/reports/pm4py-lsp-agent-reports/FINAL-VERDICT.md`, `VERIFICATION.md`, `agent-10-verifier.md`, and their counterparts in `docs/reports/pm4py-lsp-dod/`), referencing the code-level implementation commit `ca8b6e1de68a1cf474445f1ec1008c524e778e66` is correct and expected as specified by reports.*

---

## 3. Placeholders, Stubs, TODOs, and Script Integrity Issues

### A. Code Stubs and Placeholders
- **CLI Oracle Command Stub**: In `crates/wasm4pm-cli/src/commands/oracle.rs`, the `handle_oracle_command` contains hardcoded stubs. It prints simple strings (lines 38-41, 44-45) rather than executing streaming Ndjson conformance checks.
- **Vitest Test Placeholders (`it.todo`)**:
  - `packages/contracts/src/__tests__/enterprise-integration.test.ts` (lines 385-430) contains 17 `it.todo()` tests representing unimplemented specifications (e.g., AtomVM port protocol, Byzantine branch detection).
  - `packages/contracts/src/__tests__/mcpp-rust-ffi.test.ts` (lines 53-342) contains 19 `it.todo()` tests representing unimplemented Rust FFI mappings.
- **Miniml Core Algorithm Placeholders**:
  - `crates/miniml-core/src/causal.rs` (line 324) - hardcoded placeholder scaling factor (`* 0.1`).
  - `crates/miniml-core/src/decision_tree.rs` (line 311) - hardcoded placeholder node logic.
  - `crates/miniml-core/src/explainability.rs` (line 166, 255) - placeholder values (`JsValue::from_f64(0.0)`) and confidence metrics (`0.8`).
- **Prolog8 Admission Placeholder**:
  - `crates/prolog8/src/admission.rs` (line 150) - comment explicitly noting code check is a placeholder.
- **Documentation Placeholders**:
  - `docs/checkpoints/MAX-PURITY-FENCE.md` (line 35) - `Commit: (Pending manual commit)` is a placeholder.
  - `docs/academic/ACADEMIC_LINEAGE_RECEIPT.md` (lines 6, 169) - `**Hash commitment:** [to be filled by cargo make receipt]` is a placeholder.

### B. Broken Verification Script
- **`npm run docs:link-check`**: The command fails with an ESM module require error:
  ```
  Error [ERR_REQUIRE_ESM]: require() of ES Module /Users/sac/.npm/_npx/3c3b53b86e3a61f2/node_modules/marked/lib/marked.esm.js from /Users/sac/.npm/_npx/3c3b53b86e3a61f2/node_modules/markdown-link-extractor/index.js not supported.
  ```
  This occurs due to version conflicts between the `markdown-link-extractor` package (CommonJS) and `marked` (ESM) in the npx workspace environment.

---

## 4. Verification Results & Verdict
Running `cargo test -p pm4py-lsp` with environment library framework parameters results in:
- **Total non-stress tests**: 52 tests successfully compiled and passed.
- **Verdict Mapping**: Matches `PM4PY-LSP-003_ALIVE` perfectly.
