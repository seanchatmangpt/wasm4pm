# Definition of Done (DoD) — DX & QoL

This document defines the "Definition of Done" for Developer Experience (DX) and Quality of Life (QoL) improvements in `wasm4pm`. These criteria must be satisfied for any contribution to be considered "Production Ready" and eligible for release.

---

## 1. Automated Validation (The "No-Manual-Check" Rule)
Any new feature, refactor, or tool MUST include automation to prevent future regressions.
- [ ] **Tests:** Minimum 80% coverage for new logic.
- [ ] **Type Safety:** `tsc` or `cargo build` must pass with zero warnings (unless explicitly suppressed in `Cargo.toml`/`eslintrc` with a comment).
- [ ] **Linter/Formatter:** Code must pass `prettier` and `cargo fmt`.
- [ ] **Benchmark Integration:** If code affects hot paths, it MUST be added to `Makefile` and validated against `Performance Budgets`.

## 2. Documentation & Discoverability
Code is only as good as its documentation.
- [ ] **API Docs:** Public methods/functions MUST have TSDoc or RustDoc comments.
- [ ] **Examples:** If the component is complex, include a snippet in `examples/` or a relevant `docs/*.md` file.
- [ ] **README Update:** If the feature changes how the system is invoked or configured, update the relevant `README.md` and `QUICK_REFERENCE.txt`.

## 3. Operations & Observability
Features must be monitorable and maintainable in production.
- [ ] **Logging:** Use the unified `logger` module; no `console.log` or `println!` in production code.
- [ ] **Metrics:** If it impacts throughput, add an Andon/TPS metric in `tps-metrics/`.
- [ ] **WIP Limits:** Ensure task state updates follow the defined WIP-limit hooks (TPS compliance).

## 4. Maintenance & QoL
- [ ] **Placeholder Removal:** NO `TODO`, `// FIXME`, or `// placeholder` comments left in the codebase for production features.
- [ ] **Feature Gating:** If the feature is experimental, ensure it is behind a toggle in `ostar.toml` or `feature-flags-reference.md`.
- [ ] **Error Handling:** All `Result` or `try/catch` blocks must provide structured error messages (no generic `Error("failed")`).

---

## How to use this DoD
*   **During Development:** Check these boxes as you build.
*   **Pre-Commit:** Run `make verify` (a consolidated target of `test`, `lint`, and `bench-quick`).
*   **During Review:** The reviewer will check this list. If any box is unchecked, the PR will be sent back for cleanup.

*Version: 26.5.13*

---

## 5. Version Consistency

All four version-carrying files must agree before any release tag is created.

| File | Field |
|---|---|
| `apps/wasm4pm/package.json` | `"version"` |
| `wasm4pm/package.json` | `"version"` |
| `Cargo.toml` (workspace) | `version` |
| `apps/wasm4pm/src/cli.ts` | hardcoded banner string |

- [x] All four files set to the release version (e.g., `26.5.13`)
- [x] `node apps/wasm4pm/dist/bin/wpm.js --version` prints the release version

---

## 6. v26.5.13 Release Gate

### 6a. Build & Type Safety
- [x] `cd apps/wasm4pm && pnpm run build` exits 0 with zero `error TS` lines
- [x] `node apps/wasm4pm/dist/bin/wpm.js --version` prints `26.5.13`

### 6b. Test Regression Gate
- [x] All 398 tests pass (`cd apps/wasm4pm && pnpm test`) — 40 files, 0 failures (36 new JTBD tests + 57 error-state tests)
- [x] No test output contains `FAIL` outside of intentional failure fixtures

### 6c. Session-Start Hook
- [x] `watch.ts` `shutdown` made `async` — ESM SyntaxError fixed
- [x] `cognition/watch.ts` `.then()`/`.catch()` callbacks made `async`
- [x] `Makefile` `doctor` target calls `wpm doctor check --format json`
- [x] `session-start.sh` jq paths updated to `.payload.*`, severity to `STOP_THE_LINE`
- [x] `CLAUDE_PROJECT_DIR=/Users/sac/wasm4pm bash .claude/hooks/session-start.sh` exits 0

### 6d. Benchmark Command Acceptance
- [x] `wpm benchmark build <corpus-dir>` — validates corpus, emits JSON result
- [x] `wpm benchmark replay <corpus-dir>` — produces per-trace WASM verdict results
- [x] `wpm benchmark verify` — exits 0 on pass, non-zero on CI gate failure
- [x] `wpm benchmark export --format sarif` — emits valid SARIF 2.1.0 JSON to stdout
- [x] All 4 subcommands have OTEL spans (5 `withSpan` calls in compiled output)
- [x] WASM-unavailable path: graceful error with actionable message (no unhandled rejection)

### 6e. OTEL Phase C Coverage — Explicit Exempt List

22 of 29 commands instrumented. The 7 commands below are **exempt** — they emit no process-mining events:

| Command | Reason |
|---|---|
| `completions.ts` | Shell completions generator — no runtime logic |
| `config.ts` | Config viewer — read-only utility |
| `status.ts` | System info snapshot — no algorithm execution |
| `doctor.ts` | Diagnostic tool — intentionally outside OTEL path |
| `results.ts` | File browser — no process-mining computation |
| `init.ts` | Scaffold generator — one-shot, no log processing |
| `explain.ts` | Help text printer — no computation |

The 2 commands below are **deferred to Phase D** (not blocking this release):

| Command | Reason |
|---|---|
| `membrane.ts` | 11 subcommands; complex WASM integration |
| `agent.ts` | Parent wrapper; 5 subcommands already wired |

- [x] `cognition.ts` uses crate-level OTEL (exempt from CLI layer)
- [x] Exempt list documented here

### 6f. JTBD Validation Gate
- [x] `apps/wasm4pm/src/__tests__/jtbd-all-commands.test.ts` — 36 tests, 4 documented skips, 0 failures
- [x] Every non-streaming, non-profile-dependent command validated against its real JTBD (not `--help`)
- [x] Tier 1 tests (no WASM required): status, doctor, init, results, explain, completions, verify, validate
- [x] Tier 2 tests (WASM available): run, compare, diff, quality, conformance, simulate, temporal, social, autoprocess, predict (6 tasks), ml (6 tasks), powl discover, benchmark, config, agent
- [x] `apps/wasm4pm/src/__tests__/jtbd-error-states.test.ts` — 57 tests, 0 failures; each command has ≥2 unique error-state assertions (command-specific `error.code` strings, not generic file-not-found patterns)

### 6g. Clean Commit State
- [x] All modified files committed (clean `git status`)
- [x] Commit message: `release(v26.5.13): thesis-benchmark-numbers`
- [x] Branch merged to `main` via merge commit (no rebase)
- [x] Git tag `v26.5.13` created on merge commit
