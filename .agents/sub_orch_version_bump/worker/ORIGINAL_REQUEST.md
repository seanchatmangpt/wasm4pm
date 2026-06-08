## 2026-06-05T18:50:19Z
You are the Worker.
Your working directory is `/Users/sac/wasm4pm/.agents/sub_orch_version_bump/worker/`.
The codebase is located at `/Users/sac/wasm4pm`.
The Scope document is `/Users/sac/wasm4pm/.agents/sub_orch_version_bump/SCOPE.md` and Project document is `/Users/sac/wasm4pm/PROJECT.md`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/boundary implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your task is to perform the version bump to 26.6.5 across the codebase, rebuild the WASM bundle, run all release checks, tests, and verification gates, and generate release certificates and verification evidence matching version 26.6.5.

Specific Files to Update:
1. NPM package.json files (Change version to "26.6.5"):
   - `package.json` (root)
   - `wasm4pm/package.json`
   - `apps/wasm4pm/package.json`
   - `packages/kernel/package.json`
   - `packages/agents/package.json`
   - `packages/cognition/package.json`
   - `packages/config/package.json`
   - `packages/contracts/package.json`
   - `packages/engine/package.json`
   - `packages/examples-zoe-la/package.json`
   - `packages/ml/package.json`
   - `packages/observability/package.json`
   - `packages/planner/package.json`
   - `packages/supabase/package.json`
   - `packages/swarm/package.json`
   - `packages/testing/package.json`
   - `lab/package.json`
   - `wasm4pm/validators/package.json`
   - `crates/wasm4pm-cognition/package.json`

2. Rust Cargo.toml package and dependencies versions (Change version to "26.6.5"):
   - `Cargo.toml` (root: change `[workspace.package].version` and dependencies under `[workspace.dependencies]` to "26.6.5")
   - `crates/miniml-core/Cargo.toml` (package version to 26.6.5)
   - `crates/ocel-core/Cargo.toml` (package version to 26.6.5)
   - `crates/ocpq/Cargo.toml` (package version to 26.6.5)
   - `crates/pm-core/Cargo.toml` (package version to 26.6.5)
   - `crates/wasm4pm-cli/Cargo.toml` (dependencies: `wasm4pm-algos`, `wasm4pm`, `ocel-core` versions to 26.6.5)
   - `crates/wasm4pm-cognition/Cargo.toml` (dependency: `prolog8` version to 26.6.5)
   - `wasm4pm/Cargo.toml` (dependencies: `wasm4pm-cognition`, `wasm4pm-macros`, `miniml` versions to 26.6.5)

3. Source, mock, and script references (Change to "26.6.5" or handle appropriately):
   - `packages/kernel/src/version-resolver.ts` (change `PACKAGE_VERSION` to '26.6.5')
   - `packages/kernel/src/algorithm-versions.json` (update all algorithm mapping version strings to "26.6.5")
   - `packages/kernel/__tests__/gap-fixes.test.ts` (change all mocks of get_version from '26.5.28' to '26.6.5')
   - `packages/observability/src/otel.ts` (change `OBSERVABILITY_SCOPE_VERSION` to '26.6.5')
   - `apps/wasm4pm/src/commands/prolog8.ts` (change default version '26.5.29' to '26.6.5')
   - `packages/kernel/ALGORITHMS.md` (change version string from `v26.5.29` to `v26.6.5`)
   - `wasm4pm/README.md` (change version reference 26.5.29 to 26.6.5)
   - `release-gate.sh` (change `RELEASE` to 26.6.5, add '26.5.29' to the forbidden/scanned check on line 12)
   - `scripts/generate-capability-matrix.sh` (change `VERSION` fallback to 26.6.5)
   - `scripts/substrate-cert.sh` (change paths and `RELEASE` default to 26.6.5)

Execution Steps:
1. Make the file changes using appropriate replacement or file modification tools (No stream editors like sed/awk on source files).
2. Clean and bootstrap the workspace: run `npm run clean` and `npm install` (this will refresh package-lock.json).
3. Verify cargo workspace check: run `cargo check --workspace`.
4. Rebuild the WASM core: run `npm run build:wasm` (or target-specific wasm builder scripts like `npm run build:all --workspace @wasm4pm/core`).
5. Rebuild profiles: run `npm run build:profiles`.
6. Rebuild TS packages: run `npm run build:all`.
7. Git-remove/delete old release evidence files:
   - `RELEASE_CERTIFICATE.v26.5.29.json`
   - `artifacts/release/ALGORITHM_BEHAVIOR_EVIDENCE.v26.5.29.json`
   - `artifacts/release/ALGORITHM_REACHABILITY_EVIDENCE.v26.5.29.json`
   (if they exist in the repo)
8. Run the master prepublish gauntlet script: `npm run release:full` (or `bash scripts/release/prepublish-gauntlet.sh 26.6.5`). This will run the examples gate, generate reachability and behavior evidence, compile the new release certificate `RELEASE_CERTIFICATE.v26.6.5.json`, check forbidden terms, verify pack smoke-testing, and verify certificate authenticity.
9. Conduct boundary proof verification: intentionally corrupt a receipt or evidence hash, verify the verifier script fails correctly (rejects the corrupted state), then restore it.
10. Verify git status, packages, and verifiers.
11. Write your execution logs, verification command outputs, and generated files details in a handoff report at `/Users/sac/wasm4pm/.agents/sub_orch_version_bump/worker/handoff.md`.
12. Use `send_message` to report back to your parent conversation ID afb4a52b-e62f-475b-a9ff-d19d103e813a when done.
