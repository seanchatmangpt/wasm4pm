# Handoff Report — Explorer 1

## 1. Observation
We conducted a read-only investigation of the workspace and observed the following:
* **Current Versions in `package.json`**:
  * Root `package.json` line 3: `"version": "26.5.29"`
  * `wasm4pm/package.json` line 3: `"version": "26.5.29"`
  * `packages/kernel/package.json` line 3: `"version": "26.5.29"`
  * `apps/wasm4pm/package.json` line 3: `"version": "26.5.29"`
  * Sub-packages under `packages/` (e.g. `agents`, `cognition`, `contracts`) declare `"version": "26.5.29"`.
* **Current Versions in `Cargo.toml`**:
  * Root `Cargo.toml` line 7: `version = "26.5.29"`
  * Cargo workspace dependencies on internal packages reference version `"26.5.29"` (e.g. `wasm4pm-types = { version = "26.5.29", path = "crates/wasm4pm-types" }`).
  * Stale dependencies: `wasm4pm/Cargo.toml` has dependencies on `wasm4pm-cognition`, `wasm4pm-macros`, and `miniml` pinned to `"26.5.28"`.
* **Source/Script Hardcoded Versions**:
  * `packages/kernel/src/version-resolver.ts` line 14: `const PACKAGE_VERSION = '26.5.28';`
  * `packages/observability/src/otel.ts` line 28: `export const OBSERVABILITY_SCOPE_VERSION = '26.5.15';`
  * `packages/kernel/src/algorithm-versions.json` specifies `"26.5.29"` for all 42 algorithms.
  * `apps/wasm4pm/src/commands/prolog8.ts` line 156: `const version = cobj['version'] ?? '26.5.29';`
  * `release-gate.sh` line 3: `RELEASE="26.5.28"`
  * `scripts/generate-capability-matrix.sh` line 7: `VERSION="${VERSION:-26.5.28}"`
  * `scripts/substrate-cert.sh` line 9-12 default variables use `26.5.28`.

## 2. Logic Chain
1. We identified 19 `package.json` files and 25 `Cargo.toml` files in the monorepo.
2. We parsed their content and confirmed the active release packages are currently at version `26.5.29`.
3. We checked dependency references across crates and packages and discovered they fall into three categories:
   * Dynamic workspace dependencies (JS packages use `*` or `workspace:*`).
   * Inherited workspace versions (most Rust crates use `version.workspace = true`).
   * Pinned internal crate version requirements in root `Cargo.toml` and specific crate `Cargo.toml` files (e.g. `wasm4pm/Cargo.toml` using `26.5.28`).
4. We scanned code files and scripts for literal version strings and found inconsistencies (e.g., observability at `26.5.15`, kernel version resolver at `26.5.28`, and algorithm versions at `26.5.29`).
5. Based on these observations, any bump to version `26.6.5` requires synchronous updates to all identified locations to prevent compilation/runtime mismatches and pass the `release:full` verification gate.

## 3. Caveats
No caveats. The scanning script covered all folders in the repository (excluding `node_modules`, `.git`, `target`, `dist`) and successfully mapped all package files and code/script hardcoded version strings.

## 4. Conclusion
To safely upgrade the monorepo to version **26.6.5**, the implementer must:
1. Update version strings in 19 `package.json` files and 4 `Cargo.toml` files that declare versions explicitly.
2. Update version requirements in Cargo dependency declarations (root `Cargo.toml`, `crates/wasm4pm-cli/Cargo.toml`, `crates/wasm4pm-cognition/Cargo.toml`, and `wasm4pm/Cargo.toml`).
3. Update hardcoded version strings in the source files and helper scripts (`version-resolver.ts`, `algorithm-versions.json`, `otel.ts`, `prolog8.ts`, `release-gate.sh`, and `substrate-cert.sh`).
4. Perform a workspace clean, run a full WASM rebuild (`npm run build:wasm`), and execute the release validation gate (`npm run release:full`) to rebuild artifacts and recompute hashes.

## 5. Verification Method
After implementation, verification should be done by:
1. Running `npm run release:forbidden` to confirm no stale version strings (`26.5.28` or `26.5.29`) remain in source code files.
2. Compiling the WASM binary and executing the release gauntlet:
   ```bash
   npm run clean
   npm install
   npm run build:wasm
   npm run release:full
   ```
3. Checking that the generated release certificate `RELEASE_CERTIFICATE.v26.6.5.json` and evidence files exist on disk, are fully populated, and verify correctly.
