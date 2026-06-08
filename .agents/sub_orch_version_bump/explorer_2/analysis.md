# Version Bump & Dependency Analysis: Explorer 2 Report

## Executive Summary
This report analyzes the version configurations, internal workspace package dependencies, and build/release scripts in the `wasm4pm` monorepo. It outlines a comprehensive strategy and checklist to upgrade all relevant configuration, dependency, lock, script, and mock files to version `26.6.5` in a clean, consistent manner.

---

## 1. Monorepo File Catalog

### A. NPM/TypeScript package.json Files (19 Total to Bump from `26.5.29` to `26.6.5`)
These files must have their `"version"` fields upgraded:
1. `package.json` (Root package, `wasm4pm-monorepo`)
2. `apps/wasm4pm/package.json` (`@wasm4pm/cli`)
3. `crates/wasm4pm-cognition/package.json` (`@wasm4pm/cognition`)
4. `lab/package.json` (`@wasm4pm/lab-cli-tests`)
5. `packages/agents/package.json` (`@wasm4pm/agents`)
6. `packages/cognition/package.json` (`@wasm4pm/cognition` package wrapper)
7. `packages/config/package.json` (`@wasm4pm/config`)
8. `packages/contracts/package.json` (`@wasm4pm/contracts`)
9. `packages/engine/package.json` (`@wasm4pm/engine`)
10. `packages/examples-zoe-la/package.json` (`@wasm4pm/examples-zoe-la`)
11. `packages/kernel/package.json` (`wasm4pm` core TS package)
12. `packages/ml/package.json` (`@wasm4pm/ml`)
13. `packages/observability/package.json` (`@wasm4pm/observability`)
14. `packages/planner/package.json` (`@wasm4pm/planner`)
15. `packages/supabase/package.json` (`@wasm4pm/supabase`)
16. `packages/swarm/package.json` (`@wasm4pm/swarm`)
17. `packages/testing/package.json` (`@wasm4pm/testing`)
18. `wasm4pm/package.json` (`@wasm4pm/core` WASM engine)
19. `wasm4pm/validators/package.json` (`@wasm4pm/validators`)

*Note: Generated package.json files like `crates/wasm4pm-cognition/pkg/package.json` and `wasm4pm/pkg/package.json` will be automatically overwritten with the correct version during the WASM build phase.*

---

### B. Rust Cargo.toml Files
The monorepo contains a cargo workspace with members declaring versions either explicitly or via `version.workspace = true`.

#### 1. Root and Crate Cargo.toml files with Explicit Version `26.5.29` (5 Total):
These files must have their `version` fields upgraded to `"26.6.5"`:
1. `Cargo.toml` (Root workspace config, `[workspace.package].version = "26.5.29"`)
2. `crates/miniml-core/Cargo.toml` (Crate `miniml`, `version = "26.5.29"`)
3. `crates/ocel-core/Cargo.toml` (Crate `ocel-core`, `version = "26.5.29"`)
4. `crates/ocpq/Cargo.toml` (Crate `ocpq`, `version = "26.5.29"`)
5. `crates/pm-core/Cargo.toml` (Crate `pm-core`, `version = "26.5.29"`)

#### 2. Cargo.toml files inheriting Workspace Version (10 Total):
These do not declare a local version string (they use `version.workspace = true`) but must be compiled/checked:
1. `crates/pm4py-lsp/Cargo.toml`
2. `crates/prolog8/Cargo.toml`
3. `crates/wasm4pm-algos/Cargo.toml`
4. `crates/wasm4pm-cli/Cargo.toml`
5. `crates/wasm4pm-cognition/Cargo.toml`
6. `crates/wasm4pm-macros/Cargo.toml`
7. `crates/wasm4pm-compat/Cargo.toml`
8. `crates/wasm4pm-utils/Cargo.toml`
9. `tps-metrics/Cargo.toml`
10. `wasm4pm/Cargo.toml`

---

## 2. Dependency Analysis (Internal Workspace Packages)

### A. NPM/TypeScript Workspace Dependencies
All internal TS package dependencies in the `dependencies` or `devDependencies` sections use the wildcard `*` (e.g. `"@wasm4pm/contracts": "*"`).
- **Finding:** No NPM dependency version strings need to be modified, as they automatically resolve to the workspace versions via NPM workspaces.
- **Exception:** `packages/cognition/package.json` references `"wasm4pm-cognition": "file:../../crates/wasm4pm-cognition/pkg"`. This uses a path reference and does not need version updates.

### B. Cargo (Rust) Workspace Dependencies
Several Cargo files contain hardcoded versions in path dependency constraints. They must be updated to `"26.6.5"`:

1. **Root `Cargo.toml` (`[workspace.dependencies]`):**
   ```toml
   wasm4pm-compat = { version = "26.6.5", path = "crates/wasm4pm-compat" }
   wasm4pm-algos = { version = "26.6.5", path = "crates/wasm4pm-algos" }
   wasm4pm-utils = { version = "26.6.5", path = "crates/wasm4pm-utils" }
   wasm4pm-cognition = { version = "26.6.5", path = "crates/wasm4pm-cognition" }
   wasm4pm-macros = { version = "26.6.5", path = "crates/wasm4pm-macros" }
   prolog8 = { version = "26.6.5", path = "crates/prolog8" }
   miniml = { version = "26.6.5", path = "crates/miniml-core" }
   ocel-core = { version = "26.6.5", path = "crates/ocel-core" }
   ocpq = { version = "26.6.5", path = "crates/ocpq" }
   ```

2. **`crates/wasm4pm-cli/Cargo.toml`:**
   ```toml
   wasm4pm-algos = { version = "26.6.5", path = "../wasm4pm-algos" }
   wasm4pm = { version = "26.6.5", path = "../../wasm4pm", features = ["cloud"] }
   ocel-core = { version = "26.6.5", path = "../ocel-core" }
   ```

3. **`crates/wasm4pm-cognition/Cargo.toml`:**
   ```toml
   prolog8 = { version = "26.6.5", path = "../prolog8" }
   ```

4. **`wasm4pm/Cargo.toml`:**
   ```toml
   wasm4pm-cognition = { version = "26.6.5", path = "../crates/wasm4pm-cognition", default-features = false, optional = true }
   wasm4pm-macros = { version = "26.6.5", path = "../crates/wasm4pm-macros" }
   miniml = { version = "26.6.5", path = "../crates/miniml-core" }
   ```

---

## 3. Build & Release Scripts

The following scripts were located and analyzed:
1. **WASM Core Builder Scripts:**
   - `npm run build:all --workspace @wasm4pm/core` (builds WASM module for bundler, web, and nodejs targets using `wasm-pack`).
   - Profile-specific builds: `build-profile.sh`, `build-all-profiles.sh`.
2. **Release / Validation Gates:**
   - `scripts/release/prepublish-gauntlet.sh` (The master gauntlet validation script. Uses `scripts/release/lib/version.sh` to fetch version dynamically from root `package.json`.)
   - `scripts/release/verify-release-certificate.ts` (Generates release certificate `RELEASE_CERTIFICATE.v${version}.json` dynamically.)
   - `scripts/release/verify-certificate-authenticity.ts` (Verifies release certificate and recomputes hashes dynamically.)
   - `scripts/release/verify-receipt-authenticity.ts` (Verifies example execution receipts dynamically.)
   - `scripts/release/verify-pack-smoke.sh` (Smoke checks npm tarball packaging.)
   - `release-gate.sh` (Root validation script, contains hardcoded version `26.5.28` that needs updates).

---

## 4. Hardcoded Code & Script Inconsistencies

The following files contain hardcoded versions referencing `26.5.28` or individual algorithm manifests that must be bumped:

1. **`packages/kernel/src/version-resolver.ts`:**
   - Line 14: `const PACKAGE_VERSION = '26.5.28';` -> change to `'26.6.5'`
2. **`packages/kernel/__tests__/gap-fixes.test.ts`:**
   - Lines 39, 250, 328 mock version references: `get_version: vi.fn(() => '26.5.28')` -> change to `'26.6.5'`
3. **`packages/kernel/src/algorithm-versions.json`:**
   - All 43 registered algorithm version mappings currently declare `"26.5.29"`. All must be bumped to `"26.6.5"`.
4. **`release-gate.sh`:**
   - Line 3: `RELEASE="26.5.28"` -> change to `RELEASE="26.6.5"`
   - Line 12: `rg "26\.5\.13|..."` -> Add `26.5.29` to the list of banned version strings to ensure no old strings remain.
5. **`scripts/generate-capability-matrix.sh`:**
   - Line 7: `VERSION="${VERSION:-26.5.28}"` -> change to `VERSION="${VERSION:-26.6.5}"`
6. **`scripts/substrate-cert.sh`:**
   - Lines 9-12 default paths/release values: `26.5.28` -> change to `26.6.5`.

---

## 5. Upgrade Strategy & Step-by-Step Checklist

This checklist is structured to prevent build/version mismatch errors and satisfy the proof verification rules of the `AGENTS.md` and `GEMINI.md` protocols.

### Phase 1: Clean/Reset local environment
- [ ] Ensure local git state is checked out correctly.
- [ ] Clean any previous build artifacts:
  ```bash
  npm run clean
  ```

### Phase 2: Apply Version Upgrades (Non-disruptive edits)
- [ ] Update NPM `package.json` version string to `"26.6.5"` in all 19 identified package files.
- [ ] Update `Cargo.toml` package versions to `"26.6.5"` in the 5 identified Rust files.
- [ ] Update Cargo workspace dependencies and path dependency versions to `"26.6.5"` in root and sub-crate `Cargo.toml` files (as listed in Section 2.B).
- [ ] Update `packages/kernel/src/version-resolver.ts` to set `PACKAGE_VERSION = '26.6.5';`.
- [ ] Update `packages/kernel/src/algorithm-versions.json` to bump all 43 algorithm entries to `"26.6.5"`.
- [ ] Update mocks in `packages/kernel/__tests__/gap-fixes.test.ts` to return `'26.6.5'`.
- [ ] Update script variables in `release-gate.sh` (`RELEASE="26.6.5"`), `scripts/generate-capability-matrix.sh`, and `scripts/substrate-cert.sh`.
- [ ] Run `npm install` at root to regenerate/refresh `package-lock.json` with the new workspace versions.
- [ ] Run a test build of cargo workspace to verify lockfile consistency:
  ```bash
  cargo check --workspace
  ```

### Phase 3: Rebuild the WASM Bundle & Sub-Packages
- [ ] Build the WASM engine core:
  ```bash
  npm run build:all --workspace @wasm4pm/core
  ```
- [ ] Build all other TypeScript packages:
  ```bash
  npm run build:all
  ```

### Phase 4: Execute Release Validation & Gates
- [ ] Clean up any old release artifacts to prevent stale evidence:
  ```bash
  git rm -f RELEASE_CERTIFICATE.v26.5.29.json
  git rm -f artifacts/release/ALGORITHM_BEHAVIOR_EVIDENCE.v26.5.29.json
  git rm -f artifacts/release/ALGORITHM_REACHABILITY_EVIDENCE.v26.5.29.json
  ```
- [ ] Run the master gauntlet script:
  ```bash
  bash scripts/release/prepublish-gauntlet.sh 26.6.5
  ```
- [ ] Run the boundary proof verification (intentionally corrupting a receipt hash/verification target to verify that `release:verify-algorithm-behavior` or `verify-receipt-authenticity.ts` fails correctly, avoiding Receipt Theater).
- [ ] Run final status check:
  ```bash
  git status --short
  ```
- [ ] Verify the package identity output:
  ```bash
  node -p "require('./packages/kernel/package.json').name + '@' + require('./packages/kernel/package.json').version"
  ```
  *(Expected: `wasm4pm@26.6.5`)*
