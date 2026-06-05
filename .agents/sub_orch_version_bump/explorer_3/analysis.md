# Wasm4pm Version Upgrade Analysis & Strategy — 26.5.29 → 26.6.5

This analysis document outlines the current state of versioning and workspace dependencies in the `wasm4pm` monorepo, identifies all build and release validation scripts, and details a complete, step-by-step strategy/checklist to upgrade the monorepo to version **26.6.5**.

---

## 1. Summary of Findings

### 1.1 Monorepo Version Configuration Files
We located all `package.json` and `Cargo.toml` files in the repository. The monorepo versions are currently at **26.5.29** for both the npm and Cargo workspaces, with some minor drift in specific crates/configurations pointing to **26.5.28**.

*   **Workspace Version Source of Truth:**
    *   `package.json` (Root) — `"version": "26.5.29"`
    *   `Cargo.toml` (Root) — `version = "26.5.29"` (under `[workspace.package]`)

*   **Drift/Legacy Version References:**
    *   `packages/kernel/src/version-resolver.ts` pins `'26.5.28'`.
    *   `wasm4pm/Cargo.toml` pins dependencies `@wasm4pm-cognition`, `@wasm4pm-macros`, and `miniml` at `26.5.28` (rather than workspace).
    *   `scripts/generate-capability-matrix.sh`, `scripts/substrate-cert.sh` default to version `26.5.28` in directories or scripts.

### 1.2 Internal Workspace Dependencies & References
Most workspace internal npm dependencies use the wildcard dependency specifier `*` or `workspace:*`, which resolves dynamically. However, there are some hardcoded file references and Cargo path/version constraints:
*   **Rust path dependencies** in `Cargo.toml` files:
    *   Root `Cargo.toml` maps workspace dependencies using version `26.5.29` and paths.
    *   `crates/wasm4pm-cli/Cargo.toml` has hardcoded path dependency versions for `wasm4pm-algos`, `wasm4pm`, and `ocel-core` set to `26.5.29`.
    *   `crates/wasm4pm-cognition/Cargo.toml` has a dependency on `prolog8` at version `26.5.29`.
    *   `wasm4pm/Cargo.toml` has dependencies on `wasm4pm-cognition`, `wasm4pm-macros`, and `miniml` set to `26.5.28`.
*   **Private/Independent workspaces (No Bump Needed):**
    *   `lifecycle/` (private, standalone engine versioned `0.1.0`)
    *   `vendors/tower-lsp-max/` (standalone vendor LSP implementation versioned `26.6.4`)
    *   `vendors/proxyable/` (independent vendor library versioned `26.5.22`)
    *   `benchmarks/adversarial/` (private benchmark harness versioned `1.0.0`)
    *   `playground/`, `tests/proof/`, `tests/archive/` (private test runners with version `0.0.0`)

### 1.3 WASM Build & Release Validation Scripts
*   **WASM Core Builder:**
    *   `wasm4pm/package.json` scripts:
        *   `build:all`: Runs bundler, web, and nodejs builds.
        *   `build:profiles`: Builds all profiles (mobile, iot, edge, fog, browser/cloud).
    *   Root `package.json` scripts:
        *   `build:wasm`: `npm run build:all --workspace @wasm4pm/core`
*   **Release Gauntlet Master Script:**
    *   `scripts/release/prepublish-gauntlet.sh` (run via `npm run release:gauntlet`):
        1.  Clean Build (`npm run clean`, `npm install`, `npm run build:all`)
        2.  Lint & Type Check (`npm run lint`)
        3.  Native Rust Tests (`cd wasm4pm && cargo test --lib`)
        4.  Kernel TS Tests (`cd packages/kernel && npm run test`)
        5.  CLI Parity (`npm run cli:parity`)
        6.  Examples Gate (`npm run examples:gate` — 8x8 algorithms conformance)
        7.  Behavior Evidence (`npm run release:algorithm-behavior` & `release:verify-algorithm-behavior`)
        8.  Forbidden Terms Check (`npm run release:forbidden` — scanning for stubs/placeholders)
        9.  Pack Smoke Test (`npm run prepublish:pack-smoke`)
        10. Release Certificate Generation (`npm run release:certificate`)
        11. WASM Hash & Certificate Authenticity verification (`tsx scripts/release/verify-certificate-authenticity.ts`)
        12. Receipt Authenticity verification (`tsx scripts/release/verify-receipt-authenticity.ts`)

---

## 2. Upgrade Strategy & File-by-File Checklist

To safely bump the version train to **26.6.5** without introducing compile-time errors or verification mismatches, the implementer must execute edits across all package descriptors, workspace dependency blocks, and hardcoded resolver configurations.

### 2.1 Workspace Configuration Upgrades (2 Files)
*   [ ] **`package.json` (Root)**
    *   Change `"version": "26.5.29"` (line 3) → `"version": "26.6.5"`
*   [ ] **`Cargo.toml` (Root)**
    *   Change `version = "26.5.29"` (line 7) → `version = "26.6.5"`
    *   Change all `[workspace.dependencies]` version declarations to `"26.6.5"` (lines 25-33):
        *   `wasm4pm-types = { version = "26.6.5", path = "crates/wasm4pm-types" }`
        *   `wasm4pm-algos = { version = "26.6.5", path = "crates/wasm4pm-algos" }`
        *   `wasm4pm-utils = { version = "26.6.5", path = "crates/wasm4pm-utils" }`
        *   `wasm4pm-cognition = { version = "26.6.5", path = "crates/wasm4pm-cognition" }`
        *   `wasm4pm-macros = { version = "26.6.5", path = "crates/wasm4pm-macros" }`
        *   `prolog8 = { version = "26.6.5", path = "crates/prolog8" }`
        *   `miniml = { version = "26.6.5", path = "crates/miniml-core" }`
        *   `ocel-core = { version = "26.6.5", path = "crates/ocel-core" }`
        *   `ocpq = { version = "26.6.5", path = "crates/ocpq" }`

### 2.2 Workspace `package.json` Upgrades (17 Files)
Change `"version": "26.5.29"` to `"version": "26.6.5"` in:
*   [ ] `wasm4pm/package.json`
*   [ ] `apps/wasm4pm/package.json`
*   [ ] `packages/kernel/package.json`
*   [ ] `packages/agents/package.json`
*   [ ] `packages/cognition/package.json`
*   [ ] `packages/config/package.json`
*   [ ] `packages/contracts/package.json`
*   [ ] `packages/engine/package.json`
*   [ ] `packages/examples-zoe-la/package.json`
*   [ ] `packages/ml/package.json`
*   [ ] `packages/observability/package.json`
*   [ ] `packages/planner/package.json`
*   [ ] `packages/supabase/package.json`
*   [ ] `packages/swarm/package.json`
*   [ ] `packages/testing/package.json`
*   [ ] `lab/package.json`
*   [ ] `wasm4pm/validators/package.json`

*(Note: `crates/wasm4pm-cognition/package.json` also has version `26.5.29` on line 3 and should be bumped to `26.6.5` to stay aligned with `packages/cognition` which references its built output).*

### 2.3 Workspace `Cargo.toml` Version Upgrades (4 Files)
Change `version = "26.5.29"` to `version = "26.6.5"` in:
*   [ ] `crates/miniml-core/Cargo.toml` (line 4)
*   [ ] `crates/ocel-core/Cargo.toml` (line 3)
*   [ ] `crates/ocpq/Cargo.toml` (line 3)
*   [ ] `crates/pm-core/Cargo.toml` (line 3)

### 2.4 Crate-Level Internal Path-Dependency Upgrades (3 Files)
Update all hardcoded versions pointing to internal workspace packages to `"26.6.5"`:
*   [ ] **`crates/wasm4pm-cli/Cargo.toml`** (lines 24-26)
    *   Change version in `wasm4pm-algos = { version = "26.6.5", path = "../wasm4pm-algos" }`
    *   Change version in `wasm4pm = { version = "26.6.5", path = "../../wasm4pm", features = ["cloud"] }`
    *   Change version in `ocel-core = { version = "26.6.5", path = "../ocel-core" }`
*   [ ] **`crates/wasm4pm-cognition/Cargo.toml`** (line 23)
    *   Change version in `prolog8 = { version = "26.6.5", path = "../prolog8" }`
*   [ ] **`wasm4pm/Cargo.toml`** (lines 60, 82, 84)
    *   Change version in `wasm4pm-cognition = { version = "26.6.5", path = "../crates/wasm4pm-cognition", ... }`
    *   Change version in `wasm4pm-macros = { version = "26.6.5", path = "../crates/wasm4pm-macros" }`
    *   Change version in `miniml = { version = "26.6.5", ... }`

### 2.5 Hardcoded Sources, Mocks & Script Upgrades (8 Files)
*   [ ] **`packages/kernel/src/version-resolver.ts`** (line 14)
    *   Change `const PACKAGE_VERSION = '26.5.28';` → `const PACKAGE_VERSION = '26.6.5';`
*   [ ] **`packages/kernel/src/algorithm-versions.json`**
    *   Update all 60 algorithm version mappings from `"26.5.29"` → `"26.6.5"`.
*   [ ] **`packages/kernel/__tests__/gap-fixes.test.ts`** (lines 39, 250, 328)
    *   Change all mocked `get_version` values from `'26.5.28'` → `'26.6.5'`.
*   [ ] **`packages/kernel/ALGORITHMS.md`** (line 5)
    *   Update version string from `v26.5.29` → `v26.6.5`.
*   [ ] **`wasm4pm/README.md`** (line 168)
    *   Update reference `26.5.29` → `26.6.5`.
*   [ ] **`release-gate.sh`** (lines 3, 12)
    *   Update `RELEASE="26.6.5"`.
    *   Add `26.5.29` to the list of scanned version strings on line 12.
*   [ ] **`scripts/generate-capability-matrix.sh`** (line 7)
    *   Update default fallback: `VERSION="${VERSION:-26.6.5}"`.
*   [ ] **`scripts/substrate-cert.sh`** (lines 9-12)
    *   Update default report paths from `wasm4pm-v26.5.28` to `wasm4pm-v26.6.5`.
    *   Update `RELEASE="${RELEASE:-26.6.5}"` (line 12).

---

## 3. Post-Upgrade Verification Checklist

Once files have been modified, a strict verification lifecycle must be executed to compile, test, build WASM, and authenticate release receipts and evidence files.

### 3.1 Clean, Install, and Compilation
1.  [ ] Run `npm run clean` to wipe out old `node_modules` and compiled assets.
2.  [ ] Run `npm install` to regenerate the workspace `package-lock.json` with version `26.6.5`.
3.  [ ] Run `cargo check` to ensure Rust crates resolve versions and compile cleanly.
4.  [ ] Run `npm run build:all` to compile all TypeScript packages, the CLI, and rebuild the WASM bundle (generating `wasm4pm/pkg/package.json` and `crates/wasm4pm-cognition/pkg/package.json` with the new version train).

### 3.2 Automated Release Checks & Testing
5.  [ ] Run native Rust tests across the workspace:
    *   `cargo test --lib --workspace`
6.  [ ] Run kernel TypeScript tests:
    *   `npm run test:contract`
7.  [ ] Run the Master prepublish gauntlet script:
    *   `npm run release:gauntlet` (or `bash scripts/release/prepublish-gauntlet.sh 26.6.5`)
    *   *Note: This script will run the examples gate, generate reachability and behavior evidence under `artifacts/release/*.v26.6.5.json`, compile the new release certificate `RELEASE_CERTIFICATE.v26.6.5.json`, scan for placeholders, verify pack smoke-testing, and assert authenticity.*

### 3.3 Boundary Proof Verification (Ostar Doctor & Auditor)
8.  [ ] **Intentional Corruption Smoke Test:**
    *   To satisfy the strict rule against "Receipt Theater" in `GEMINI.md` / `AGENTS.md`, intentionally corrupt one of the generated receipts (e.g. modify the `receipt_hash` inside `examples/out/prayer_pipeline.receipt.json` or `artifacts/release/algorithm-behavior-receipts/dfg.receipt.json`).
    *   Run `npm run release:verify-algorithm-behavior` or `tsx scripts/release/verify-receipt-authenticity.ts`.
    *   **Verify** that the script correctly rejects the corrupted receipt and exits with code 1.
    *   Restore the receipt back to its correct state, and run the gauntlet again to confirm a clean success.
