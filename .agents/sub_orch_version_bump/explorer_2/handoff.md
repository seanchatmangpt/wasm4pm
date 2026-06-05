# Handoff Report: version_bump_and_verification

## 1. Observation
We observed the following configurations, dependencies, and scripts across the monorepo:
- **Root package version:** Root `package.json` specifies `"version": "26.5.29"`.
- **NPM Package Files:** 19 package files in total define `"version": "26.5.29"`. All workspace dependencies use wildcard versions (`"*"`).
- **Cargo.toml Files:** Root `Cargo.toml` specifies `version = "26.5.29"` in `[workspace.package]`. Four other members specify `version = "26.5.29"` explicitly:
  - `crates/miniml-core/Cargo.toml:4`
  - `crates/ocel-core/Cargo.toml:3`
  - `crates/ocpq/Cargo.toml:3`
  - `crates/pm-core/Cargo.toml:3`
- **Cargo.toml Dependency Versions:** Pinned versions referencing `"26.5.29"` or `"26.5.28"` in dependencies:
  - Root `Cargo.toml:25-33` lists workspace dependencies using version `"26.5.29"`.
  - `crates/wasm4pm-cli/Cargo.toml:24-26` pins dependencies `wasm4pm-algos`, `wasm4pm`, and `ocel-core` to `"26.5.29"`.
  - `crates/wasm4pm-cognition/Cargo.toml:23` pins dependency `prolog8` to `"26.5.29"`.
  - `wasm4pm/Cargo.toml:60, 82, 84` pins dependencies `wasm4pm-cognition`, `wasm4pm-macros`, and `miniml` to `"26.5.28"`.
- **Hardcoded Version Strings in Mocks/Resolver:**
  - `packages/kernel/src/version-resolver.ts:14` specifies `const PACKAGE_VERSION = '26.5.28';`.
  - `packages/kernel/src/algorithm-versions.json` specifies `"26.5.29"` for all 43 entries.
  - `packages/kernel/__tests__/gap-fixes.test.ts:39, 250, 328` mocks `get_version: vi.fn(() => '26.5.28')`.
- **Hardcoded Versions in Validation Scripts:**
  - `release-gate.sh:3` specifies `RELEASE="26.5.28"`.
  - `scripts/generate-capability-matrix.sh:7` specifies `VERSION="${VERSION:-26.5.28}"`.
  - `scripts/substrate-cert.sh:9-12` specifies path variables and release name using `26.5.28`.
- **WASM Builder Scripts:**
  - Root `package.json` script `build:wasm` runs `npm run build:all --workspace @wasm4pm/core`.
  - `wasm4pm/package.json` script `build:all` builds WASM module for bundler, web, and nodejs targets.
- **Release Verification Scripts:**
  - `scripts/release/prepublish-gauntlet.sh` executes the full publication validation gate sequence.
  - Certificate and receipt validation scripts: `verify-release-certificate.ts`, `verify-certificate-authenticity.ts`, and `verify-receipt-authenticity.ts` located in `scripts/release/`.

---

## 2. Logic Chain
- **Step 1:** The target release version is `26.6.5` (Scope & Request).
- **Step 2:** Any file specifying `26.5.29` or `26.5.28` package versioning or dependencies must be updated to `26.6.5` to prevent package version mismatch and satisfy the Package Identity Gate constraint.
- **Step 3:** The internal package dependencies in NPM `package.json` files are specified as `*`. Therefore, no NPM dependency version strings need updating.
- **Step 4:** The internal Cargo dependencies in `Cargo.toml` specify absolute path versions (either `26.5.28` or `26.5.29`). Under the workspace consistency rules, they must all match the exact same version string as the root `Cargo.toml`. Hence, both workspace definitions and path dependencies must be bumped to `26.6.5`.
- **Step 5:** `version-resolver.ts` and `gap-fixes.test.ts` mock/return a hardcoded version. They must match the bumped package version (`26.6.5`) to avoid runtime/test validation failures.
- **Step 6:** The master prepublish gauntlet script and other release/validation scripts dynamically load version metadata using `node -p "require('./package.json').version"`. Therefore, they do not require manual version edits.
- **Step 7:** Root `release-gate.sh` and helper scripts (`generate-capability-matrix.sh`, `substrate-cert.sh`) have hardcoded version variables which must be updated.

---

## 3. Caveats
- **Assumption:** Generated package files (e.g. `wasm4pm/pkg/package.json`) will be overwritten during Phase 3 of the strategy (WASM rebuild) and therefore do not require manual editing. If they are not overwritten, they will need direct replacement during the implementation phase.
- **Archive files:** Files located in `docs_quarantine/` and `tests/archive` are excluded from the main version upgrade train.

---

## 4. Conclusion
To safely upgrade the monorepo to version `26.6.5` without violating version alignment or package identity rules, we must perform a coordinated replacement of all occurrences of `26.5.29` and `26.5.28` version strings in 19 `package.json` files, 5 explicit version `Cargo.toml` files, root and crate dependency tables, internal TS resolver manifests, testing mocks, and validation script variables. A clean rebuild of the WASM engine core and all workspace TS packages, followed by the execution of `prepublish-gauntlet.sh` and verification gates, is required to validate the release.

---

## 5. Verification Method
1. Run version checks:
   - Root package: `node -p "require('./package.json').version"`
   - Kernel package: `node -p "require('./packages/kernel/package.json').version"`
   - Crate cargo checks: `cargo check --workspace`
2. Run prepublish validation gauntlet:
   - Execute: `bash scripts/release/prepublish-gauntlet.sh 26.6.5`
3. Scan for stale strings:
   - Execute: `git grep "26.5.28" && git grep "26.5.29"`
   - Verdict is successful if zero matches are returned.
