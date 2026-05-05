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

*Version: 26.4.23*
