# Version Bump Investigation and Strategy Report — v26.6.5

This document outlines the findings from the read-only investigation of the monorepo structure, current versioning status, dependency tree, and release automation scripts. It provides a concrete step-by-step strategy for bumping all relevant package files to version **26.6.5**.

---

## 1. Monorepo Package Inventory

### A. npm/Node Workspace Packages
The root `package.json` manages workspaces using npm workspaces. Here is the list of all packages under NPM workspaces:

| Relative Path | Package Name | Current Version | Internal Dependencies |
|---|---|---|---|
| `package.json` | `wasm4pm-monorepo` | `26.5.29` | None |
| `wasm4pm/package.json` | `@wasm4pm/core` | `26.5.29` | `@wasm4pm/ml: *` |
| `apps/wasm4pm/package.json` | `@wasm4pm/cli` | `26.5.29` | `@wasm4pm/agents`, `@wasm4pm/cognition`, `@wasm4pm/config`, `@wasm4pm/contracts`, `@wasm4pm/engine`, `wasm4pm`, `@wasm4pm/ml`, `@wasm4pm/observability`, `@wasm4pm/planner`, `@wasm4pm/supabase`, `@wasm4pm/swarm`, `@wasm4pm/testing` (all as `*`) |
| `packages/agents/package.json` | `@wasm4pm/agents` | `26.5.29` | `@wasm4pm/contracts: *`, `wasm4pm: *`, `@wasm4pm/engine: *` |
| `packages/cognition/package.json` | `@wasm4pm/cognition` | `26.5.29` | `@wasm4pm/contracts: *`, `wasm4pm-cognition: file:../../crates/wasm4pm-cognition/pkg` |
| `packages/config/package.json` | `@wasm4pm/config` | `26.5.29` | `@wasm4pm/contracts: *` |
| `packages/contracts/package.json` | `@wasm4pm/contracts` | `26.5.29` | None |
| `packages/engine/package.json` | `@wasm4pm/engine` | `26.5.29` | `@wasm4pm/config: *`, `@wasm4pm/contracts: *`, `@wasm4pm/observability: *`, `wasm4pm: *` |
| `packages/examples-zoe-la/package.json` | `examples-zoe-la` | `26.5.29` | `@wasm4pm/cognition: *`, `wasm4pm: *` |
| `packages/kernel/package.json` | `wasm4pm` | `26.5.29` | `@wasm4pm/contracts: *`, `@wasm4pm/core: *`, `@wasm4pm/ml: *`, `@wasm4pm/planner: *` |
| `packages/ml/package.json` | `@wasm4pm/ml` | `26.5.29` | None |
| `packages/observability/package.json` | `@wasm4pm/observability` | `26.5.29` | None |
| `packages/planner/package.json` | `@wasm4pm/planner` | `26.5.29` | `@wasm4pm/contracts: *` |
| `packages/supabase/package.json` | `@wasm4pm/supabase` | `26.5.29` | `@wasm4pm/contracts: *` |
| `packages/swarm/package.json` | `@wasm4pm/swarm` | `26.5.29` | `@wasm4pm/contracts: *`, `wasm4pm: *`, `@wasm4pm/observability: *` |
| `packages/testing/package.json` | `@wasm4pm/testing` | `26.5.29` | `@wasm4pm/contracts: *` |
| `lab/package.json` | `@wasm4pm/lab-cli-tests` | `26.5.29` | `wasm4pm: *` |
| `wasm4pm/validators/package.json` | `@wasm4pm/validators` | `26.5.29` | None |
| `crates/wasm4pm-cognition/package.json` | `@wasm4pm/cognition` | `26.5.29` | None |
| `playground/package.json` | `@wasm4pm/playground` | `0.0.0` | `@wasm4pm/config`, `@wasm4pm/contracts`, `@wasm4pm/engine`, `wasm4pm`, `@wasm4pm/observability`, `@wasm4pm/planner`, `@wasm4pm/testing` (all as `file:../packages/*`) |
| `tests/proof/package.json` | `@wasm4pm/test-proof` | `0.0.0` | `@wasm4pm/testing`, `@wasm4pm/contracts`, `wasm4pm`, `@wasm4pm/config`, `@wasm4pm/engine`, `@wasm4pm/ml`, `@wasm4pm/observability` (all as `workspace:*`) |
| `tests/archive/package.json` | `@wasm4pm/test-archive` | `0.0.0` | None |

*Note: `playground`, `tests/proof`, and `tests/archive` use static versions of `0.0.0` or local path/workspace reference protocols and do not need version bumping.*

---

### B. Cargo (Rust) Workspace Members
The root `Cargo.toml` manages workspace members. Most packages inherit the version string via `version.workspace = true`.

Here is the list of Cargo crates:

| Relative Path | Crate Name | Version Strategy |
|---|---|---|
| `Cargo.toml` | *Workspace Root* | Declares `[workspace.package] version = "26.5.29"` |
| `crates/miniml-core/Cargo.toml` | `miniml` | Explicit: `version = "26.5.29"` |
| `crates/ocel-core/Cargo.toml` | `ocel-core` | Explicit: `version = "26.5.29"` |
| `crates/ocpq/Cargo.toml` | `ocpq` | Explicit: `version = "26.5.29"` |
| `crates/pm-core/Cargo.toml` | `pm-core` | Explicit: `version = "26.5.29"` |
| `crates/pm4py-lsp/Cargo.toml` | `pm4py-lsp` | Inherits: `version.workspace = true` |
| `crates/prolog8/Cargo.toml` | `prolog8` | Inherits: `version.workspace = true` |
| `crates/wasm4pm-algos/Cargo.toml` | `wasm4pm-algos` | Inherits: `version.workspace = true` |
| `crates/wasm4pm-cli/Cargo.toml` | `wasm4pm-cli` | Inherits: `version.workspace = true` |
| `crates/wasm4pm-cognition/Cargo.toml` | `wasm4pm-cognition` | Inherits: `version.workspace = true` |
| `crates/wasm4pm-macros/Cargo.toml` | `wasm4pm-macros` | Inherits: `version.workspace = true` |
| `crates/wasm4pm-types/Cargo.toml` | `wasm4pm-types` | Inherits: `version.workspace = true` |
| `crates/wasm4pm-utils/Cargo.toml` | `wasm4pm-utils` | Inherits: `version.workspace = true` |
| `tps-metrics/Cargo.toml` | `tps-metrics` | Inherits: `version.workspace = true` |
| `wasm4pm/Cargo.toml` | `wasm4pm` | Inherits: `version.workspace = true` |

---

### C. Cross-Package Version Dependencies (Hardcoded)
The following files contain hardcoded internal dependency references that must be updated synchronously:

1. **Root `Cargo.toml` dependencies:**
   - `wasm4pm-types = { version = "26.5.29", path = "crates/wasm4pm-types" }`
   - `wasm4pm-algos = { version = "26.5.29", path = "crates/wasm4pm-algos" }`
   - `wasm4pm-utils = { version = "26.5.29", path = "crates/wasm4pm-utils" }`
   - `wasm4pm-cognition = { version = "26.5.29", path = "crates/wasm4pm-cognition" }`
   - `wasm4pm-macros = { version = "26.5.29", path = "crates/wasm4pm-macros" }`
   - `prolog8 = { version = "26.5.29", path = "crates/prolog8" }`
   - `miniml = { version = "26.5.29", path = "crates/miniml-core" }`
   - `ocel-core = { version = "26.5.29", path = "crates/ocel-core" }`
   - `ocpq = { version = "26.5.29", path = "crates/ocpq" }`

2. **`crates/wasm4pm-cli/Cargo.toml` dependencies:**
   - `wasm4pm-algos = { version = "26.5.29", path = "../wasm4pm-algos" }`
   - `wasm4pm = { version = "26.5.29", path = "../../wasm4pm", features = ["cloud"] }`
   - `ocel-core = { version = "26.5.29", path = "../ocel-core" }`

3. **`crates/wasm4pm-cognition/Cargo.toml` dependencies:**
   - `prolog8 = { version = "26.5.29", path = "../prolog8" }`

4. **`wasm4pm/Cargo.toml` dependencies:**
   - `wasm4pm-cognition = { version = "26.5.28", path = "../crates/wasm4pm-cognition", default-features = false, optional = true }` *(Note: stale v26.5.28)*
   - `wasm4pm-macros = { version = "26.5.28", path = "../crates/wasm4pm-macros" }` *(Note: stale v26.5.28)*
   - `miniml = { version = "26.5.28", path = "../crates/miniml-core" }` *(Note: stale v26.5.28)*

---

### D. Hardcoded Versions in Source/Scripts
The following non-config files contain hardcoded versions that must be updated:

1. **`packages/kernel/src/algorithm-versions.json`**
   Contains 42 algorithm entries currently mapped to version `26.5.29`. All must be updated to `26.6.5`.

2. **`packages/kernel/src/version-resolver.ts`**
   `const PACKAGE_VERSION = '26.5.28';` -> update to `26.6.5`.

3. **`packages/kernel/__tests__/gap-fixes.test.ts`**
   Three occurrences mocking `get_version: vi.fn(() => '26.5.28')` -> update to `26.6.5`.

4. **`apps/wasm4pm/src/commands/prolog8.ts`**
   `const version = cobj['version'] ?? '26.5.29';` -> update to `26.6.5`.

5. **`packages/observability/src/otel.ts`**
   `export const OBSERVABILITY_SCOPE_VERSION = '26.5.15';` -> update to `26.6.5` to match package.json version.

6. **`wasm4pm/README.md`**
   Line 168: `26.5.29` -> update to `26.6.5`.

7. **`release-gate.sh`**
   Line 3: `RELEASE="26.5.28"` -> update to `26.6.5`.
   Line 12: rg regex check should be updated to include `26.5.28` and `26.5.29` to flag left-behind versions.

8. **`scripts/generate-capability-matrix.sh`**
   Line 7: `VERSION="${VERSION:-26.5.28}"` -> update to `26.6.5`.

9. **`scripts/substrate-cert.sh`**
   Update default paths/variables referencing `wasm4pm-v26.5.28` to `wasm4pm-v26.6.5`.

---

## 2. Release & Build Script Execution Flow

### A. WASM Rebuild Commands
To rebuild the core WASM engine and generate JS packaging contexts:
- Native rebuild (for browsers/bundlers):
  ```bash
  npm run build:wasm
  ```
  This runs `npm run build:all --workspace @wasm4pm/core`, generating the files in `wasm4pm/pkg/` folder.
- Profiles rebuild:
  ```bash
  npm run build:profiles
  ```
  This executes `bash scripts/build-all-profiles.sh`, which builds optimized and compressed profiles (mobile, iot, edge, fog, browser) into the `dist/` directory.

---

### B. Release Verification Gates
The full verification sequence for a release is encapsulated in:
```bash
npm run release:full
```
This script runs the following steps:
1. `npm run release:forbidden` — Validates that no forbidden terms/placeholders are present.
2. `npm run release:algorithm-reachability` — Checks that all 60 algorithms are registered and reachable in TS/CLI/WASM.
3. `npm run release:algorithm-behavior` — Runs positive, negative, and invariant behavior tests for all 60 algorithms, generating receipts in `artifacts/release/algorithm-behavior-receipts/`.
4. `npm run release:verify-algorithm-behavior` — Programmatically verifies all behavior receipts.
5. `npm run examples:gate` — Runs the 8 canonical examples (e.g. benevolence_route, finance_audit) and generates receipts in `examples/out/`.
6. `npm run prepublish:pack-smoke` — Performs a smoke test of `npm pack` in a temporary directory.
7. `npm run release:certificate` — Computes the release certificate.
8. `tsx scripts/release/verify-certificate-authenticity.ts` — Asserts that the certificate values, WASM hash, and evidence hashes match perfectly.

---

## 3. Step-by-Step Version Bump Strategy

To execute the upgrade cleanly without breaking build states, the following sequence is recommended:

### Step 1: Version Replacements (Read-Only/Automated)
Run precise file replacements for all `package.json`, `Cargo.toml`, and source files listed in Section 1. Do not use `sed`/`awk` directly on source files; use targeted IDE tool calls or python replacement scripts.

### Step 2: Clean and Bootstrap Workspace
Initialize packages with the new version:
```bash
npm run clean
npm install
```

### Step 3: Rebuild WASM Core
Rebuild the core WebAssembly binary and targets so that the package resolver reads the upgraded version from the compiled Rust library:
```bash
npm run build:wasm
```

### Step 4: Rebuild TypeScript Packages
Compile contracts, kernel, CLI, and wrappers:
```bash
npm run build:all
```

### Step 5: Clean Up Old Evidence Artifacts
Delete or git-remove old release certificates and evidence files (versioned `26.5.29` or `26.5.28`):
```bash
git rm RELEASE_CERTIFICATE.v26.5.29.json
git rm artifacts/release/ALGORITHM_BEHAVIOR_EVIDENCE.v26.5.29.json
git rm artifacts/release/ALGORITHM_REACHABILITY_EVIDENCE.v26.5.29.json
```

### Step 6: Execute Release Gauntlet to Regenerate Evidence
Run the verification gauntlet. This will regenerate the receipts and certificates with the new version `26.6.5` and compute their cryptographic hashes:
```bash
npm run release:full
```

### Step 7: Final Release Validation
Verify all receipts, matrices, and certificates exist and have recomputable, correct hashes. Verify git status has no stray or uncommitted placeholder files.
