# Handoff Report: Monorepo Documentation and Release Realignment

This report provides the results of the monorepo-wide exploration of outdated documentation, changelogs, status reports, stubs, and placeholders relative to the target version `26.5.29` and the commit state `6b575a6b27b8b78f7954a3c8dfaa161a29c47591` (with verdict `PM4PY-LSP-003_ALIVE`).

---

## 1. Observation
We directly observed the following discrepancies across the workspace:

### A. Version and Lockfile Drift
- `package-lock.json` contains:
  ```json
  "version": "26.5.28",
  ```
- `WASM_API.md` (line 5):
  ```markdown
  **Current version:** `26.5.28`
  ```
- `benchmark_audit.md` (line 1):
  ```markdown
  # wasm4pm Benchmark Audit — v26.5.28
  ```
- `docs/reference/algorithms.md` (line 4):
  ```markdown
  > Version: **v26.5.28** · Count: **60** registered algorithms.
  ```
- `packages/kernel/ALGORITHMS.md` (line 5):
  ```markdown
  **Version:** v26.5.28
  ```
- `packages/kernel/src/algorithm-versions.json` lists version `"26.5.28"` for all 60 registered algorithms (lines 2-45).
- `crates/pm4py-lsp/Cargo.toml` and `crates/pm-core/Cargo.toml` define `version = "0.1.0"` (line 3).
- `crates/wasm4pm-cognition/package.json` defines `"version": "26.4.28"`.
- `crates/wasm4pm-cognition/pkg/package.json` defines `"version": "26.5.19"`.
- `lab/package.json` defines `"version": "26.4.23"`.
- `wasm4pm/validators/package.json` defines `"version": "26.4.9"`.
- `crates/ocel-core/Cargo.toml` and `crates/ocpq/Cargo.toml` define `version = "26.5.30"` (line 3).
- The root `Cargo.toml` pins workspace dependencies `ocel-core` and `ocpq` to version `"26.5.30"`.
- `crates/wasm4pm-cli/Cargo.toml` pins dependencies `wasm4pm-algos` and `wasm4pm` at `"26.5.28"`.
- `crates/wasm4pm-cognition/Cargo.toml` pins `prolog8` at `"26.5.28"`.

### B. Outdated Release and Status Reports
- `PUBLISH_READY_REPORT.txt` (line 2) specifies version `26.5.21` from May 20, 2026.
- `CHANGELOG_RELEASE.md` (line 1) references version `v26.5.19` from May 19, 2026.

### C. Release Evidence Commit Mismatch
- `RELEASE_CERTIFICATE.v26.5.29.json` (line 5) references an outdated commit:
  ```json
  "git_commit": "94895822da3e823f67c37ac814361cd5f7cb10ff"
  ```
- `artifacts/release/ALGORITHM_BEHAVIOR_EVIDENCE.v26.5.29.json` (line 4) references:
  ```json
  "git_commit": "94895822da3e823f67c37ac814361cd5f7cb10ff",
  ```
- All 8 examples execution receipts (e.g. `examples/out/benevolence_route.receipt.json`, etc.) reference `"commit": "94895822da3e823f67c37ac814361cd5f7cb10ff"` on line 6.

### D. Stubs, Placeholders, and Broken Scripts
- `crates/wasm4pm-cli/src/commands/oracle.rs` contains print-only command stubs for `Check` (lines 38-41) and `Watch` (lines 44-45).
- `packages/contracts/src/__tests__/enterprise-integration.test.ts` (17 tests) and `packages/contracts/src/__tests__/mcpp-rust-ffi.test.ts` (19 tests) use Vitest's `it.todo()` placeholders.
- `crates/miniml-core/src/causal.rs` (line 324), `crates/miniml-core/src/decision_tree.rs` (line 311), and `crates/miniml-core/src/explainability.rs` (lines 166, 255) contain algorithm/metric placeholders.
- `docs/checkpoints/MAX-PURITY-FENCE.md` (line 35) lists `Commit: (Pending manual commit)`.
- `docs/academic/ACADEMIC_LINEAGE_RECEIPT.md` lists `[to be filled by cargo make receipt]`.
- Running `npm run docs:link-check` results in `Error [ERR_REQUIRE_ESM]` in the global/npx environment due to package format conflicts between `marked` (ESM) and `markdown-link-extractor` (CommonJS).

---

## 2. Logic Chain
1. The expected version of the release is `26.5.29`. Root `package.json` is correctly set to `26.5.29`.
2. Any configuration files (e.g. `package-lock.json`, sub-package configuration files, or pinned dependencies) that specify prior versions (e.g. `26.5.28`, `26.5.21`, `26.5.19`, `26.4.x`) or ahead-of-train versions (e.g. `26.5.30`) represent version-string drift or discrepancies, as listed under Section 1.A and 1.B.
3. The expected release-level commit is `6b575a6b27b8b78f7954a3c8dfaa161a29c47591`.
4. Release certificate `RELEASE_CERTIFICATE.v26.5.29.json` and evidence files like `ALGORITHM_BEHAVIOR_EVIDENCE.v26.5.29.json` currently point to the prior release commit `94895822da3e823f67c37ac814361cd5f7cb10ff`. This is an outdated reference.
5. In contrast, code-centric reports correctly point to the verified code commit `ca8b6e1de68a1cf474445f1ec1008c524e778e66`, which is valid for those documents.
6. The codebase contains several stubs (the Oracle CLI command) and Vitest `it.todo` test placeholders, representing incomplete and deferred implementation work.
7. Verification tools like `npm run docs:link-check` are broken in the current environment due to CommonJS/ESM module requirements.

---

## 3. Caveats
- No code changes were implemented (this is a read-only investigation).
- Code-centric reports (`FINAL-VERDICT.md` and `VERIFICATION.md`) referencing `ca8b6e1de68a1cf474445f1ec1008c524e778e66` are assumed correct for code checkpoints, as permitted.
- Environmental limitations (such as Xcode framework paths required for PyO3 dynamic linking on mac) were bypassed by setting `DYLD_FRAMEWORK_PATH=/Applications/Xcode.app/Contents/Developer/Library/Frameworks` for test execution.

---

## 4. Conclusion
The monorepo contains multiple version discrepancies (with major version drift at `26.5.28` and `26.5.30`), outdated release certificates/evidence (pinning `94895822da3e823f67c37ac814361cd5f7cb10ff` instead of `6b575a6b27b8b78f7954a3c8dfaa161a29c47591`), outdated readiness and release notes (`v26.5.21`/`v26.5.19`), and multiple placeholder stubs/tests. All of these require realignment to accurately reflect the state of the monorepo.

---

## 5. Verification Method
1. **To verify the version discrepancy**:
   - Run `node -p "require('./package.json').version"` to confirm root version is `26.5.29`.
   - Inspect `package-lock.json` and sub-package `package.json` files listed in the inventory to observe mismatches.
2. **To verify the release evidence commit mismatch**:
   - Inspect `RELEASE_CERTIFICATE.v26.5.29.json` and check `git_commit` value.
   - Run `git rev-parse HEAD` to verify it does not match the certificate's commit.
3. **To verify test compilation and execution**:
   - Run `DYLD_FRAMEWORK_PATH=/Applications/Xcode.app/Contents/Developer/Library/Frameworks cargo test -p pm4py-lsp` to observe all 52 non-stress tests passing successfully.
