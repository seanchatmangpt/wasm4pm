# wasm4pm — AI Agent Developer Guide
**Format:** Follows `CLAUDE.md` structure | **Policy:** Toyota Production System (TPS) — Hard Crashes, No Silent Fallbacks.

---

## 1. What this project is

**wasm4pm** is an agentic process mining platform. It consists of:
1. **Rust/WASM Core** (`wasm4pm/`): High-performance algorithm kernel (38+ algorithms), compiled to WASM.
2. **TypeScript Monorepo** (`packages/` + `apps/`): CLI orchestration, contracts, and observability.
3. **Agentic Layer**: Integrated RL (LinUCB), SPC (Western Electric), and Self-Healing (Circuit Breakers) in the Rust core.

---

## 2. Versioning: CalVer (Calendar Versioning)

**Format:** `vYEAR.MONTH.DAY[suffix]`
- `v26.5.19`: Release on May 19, 2026.
- `v26.5.19a`: Second release on the same day.
- **PATCH value is the DAY of month** (Max 31). Never increment PATCH beyond the current date.

---

## 3. Core Developer Commands

### Rust / WASM (Core Algorithms)
```bash
cd wasm4pm
cargo check                    # Fast type check
cargo build --release          # Build library
cargo test                     # Run all 695+ native tests
npm run build                  # wasm-pack to pkg/
npm run build:nodejs           # Build for Node.js target
```

### TypeScript (CLI & Monorepo)
```bash
pnpm build                     # Build all packages (monorepo root)
pnpm test                      # Test all packages
cd apps/wasm4pm && npm start   # Run CLI from source
```

### Verification & Validation
```bash
# Verify 100% native test pass (No #[ignore] on critical tests)
cargo test -p wasm4pm --lib 2>&1 | grep -c "ok$"

# Algorithm Ground-Truth (pm4py cross-validation)
python3 scripts/cross_validate.py
```

---

## 4. Operational Policies (TPS / Andon Cord)

**NO SILENT FALLBACKS.**
- If a real dataset (XES) is missing, the system MUST **panic** (Hard Crash).
- If metrics cannot be parsed, the system MUST **panic**.
- **Prohibited:** `unwrap_or(default)`, `eprintln!("WARN...fallback")`, synthetic data generation in production benchmarks.
- **Verification:** Check `wasm4pm/benches/helpers.rs` for `panic!` in `generate_event_log`.

---

## 5. Agentic Subsystems

### RL Orchestrator (`src/rl_orchestrator.rs`)
- **LinUCB Multi-Armed Bandit**: Manages 5 agents for algorithm selection.
- **Reward Function**: Based on fitness, precision, and latency.

### SPC & Self-Healing (`src/spc.rs`, `src/self_healing.rs`)
- **Western Electric Rules**: Monitors process capability ($C_p$, $C_{pk}$).
- **Circuit Breakers**: Tripped when $C_{pk}$ drops below 1.0 or $3\sigma$ violations occur.

### AutoProcess (`src/autoprocess.rs`)
- **Lifecycle**: Perception → Decision → Protection → Optimization.
- **State**: Persisted in Ring Buffer (100 snapshots).

---

## 6. Testing Hierarchy

1. **Rust Unit Tests**: Logic correctness (Internal).
2. **WASM Integration Tests**: JS/WASM boundary validation.
3. **Adversarial Tests**: `ADVERSARIAL_TEST_PLAN.md` — 36 categories (P8-CF-*).
4. **Parity Tests**: Comparison against `pm4py` ground-truth.

---

## 7. Key File Locations

| Component | Path |
|---|---|
| **WASM Entry Points** | `wasm4pm/src/lib.rs` |
| **XES Parser** | `wasm4pm/src/xes_format.rs` |
| **Algorithm Registry** | `packages/kernel/src/registry.ts` |
| **Bench Helpers** | `wasm4pm/benches/helpers.rs` |
| **Real Datasets** | `wasm4pm/tests/fixtures/` and `bench_data/` |
| **Prolog8 Engine** | `crates/prolog8/` |

---

## 8. Common Gotchas for Agents

1. **Self-Closing Tags**: XES `<string>` and `<date>` tags MUST be self-closing (`/>`). The parser enforces this strictly.
2. **WASM Serialization**: `serde_wasm_bindgen` cannot serialize `serde_json::Value`. Use `to_js_str()` in `utilities.rs`.
3. **Commit Hooks**: Lint hooks require Node 22+. Use `--no-verify` if stuck on Node 20.
4. **Benchmarks**: `real_data_bench.rs` will panic if `sepsis.xes` or `bpi2020_travel.xes` are missing. Do NOT add fallbacks.
5. **Memory**: `wasm-pack` build may crash on exit (SIGABRT) — check individual test pass counts.
