# 09b — ML / AI Primitives (Review + Correction Ledger)

**Agent:** A10 — ML & AI Algorithm Review and Correction
**Scope (files owned):** `wasm4pm/src/ml/*`, `reinforcement.rs`, `rl_orchestrator.rs`,
`prediction_drift.rs`, `spc.rs`, `self_healing.rs`, `final_analytics.rs`,
`crates/miniml-core/src/*`.
**Method:** code read + math check against the source theorems (no FM-5 self-reference),
build + run of the relevant Rust tests, paper grounding for the LTN future primitive.
**Verification base:** `cargo check -p wasm4pm` (clean), `cargo check -p miniml` (clean),
`cargo test -p miniml --lib` → 393 passed / 0 failed, `cargo test -p wasm4pm --features cloud`
on the touched suites (see §6).

> **Doctrine note (Van der Aalst / Chicago-TDD):** A primitive is "real" here only if its math
> matches the cited source, it is deterministic where determinism is claimed, and a test whose
> oracle is the *math* (not the implementation) passes. "It compiles" is not proof.

---

## 0. Headline findings

1. **The three historically-tracked bugs are already FIXED in the tree** — confirmed by reading
   the source, not by trusting the prior handoff:
   - **FM-1** (Bellman self-reference when `next_state == state`) — fixed at
     `rl_orchestrator.rs:1307` via `let effective_done = done || (state == next_state);`.
   - **TS-1** (`String::len()` used as a timestamp-gap proxy) — fixed; `final_analytics.rs:164,281`
     use real `crate::parse_iso8601_duration(..)`. No `.len()` time-proxy remains in the file.
   - **CB-1** (circuit breaker step counter never advancing) — fixed; `self_healing.rs` has a
     monotonic `now_ms()` step counter plus `advance_clock`/`reset_clock`, and `allow_request`
     reads `now_ms().saturating_sub(last_state_change_ms)` against the per-state timeout.
2. **Math is correct** for the audited primitives: LinUCB (UCB + Sherman-Morrison),
   Q-Learning / SARSA Bellman updates, reward bounds `[-5.5, +1.6]`, learning-rate decay
   `α_t = α_0·0.9999^t`, Western-Electric Rules 1–4, Cp/Cpk/DPMO/σ-level, EWMA, Jaccard, Shannon
   variant entropy.
3. **`miniml-core` is real, not stubs.** 226 `#[wasm_bindgen]` exports, 867 `pub` items, 393
   passing lib tests, all algorithms validate inputs and return `Result<_, MlError>` (they do **not**
   silently accept empty/malformed input — they error). The only `unreachable!()` found is a
   legitimate exhaustive-match arm in `classification_metrics.rs:25`, not a stub.
4. **New test added** (Chicago-TDD, Rank-1 Bellman oracle): `wasm4pm/tests/fm1_equal_state_collapse_tests.rs`
   — proves the FM-1 equal-state collapse (`state == next_state` ⇒ target = r, no self-bootstrap)
   that the prior A3 tests did **not** exercise (they only covered the *distinct*-state path). It
   fails if the `|| (state == next_state)` clause is reverted.
5. **Neuro-symbolic / LTN primitive: none exists** (confirmed — no `ltn`, no `SatAgg`, no
   `pMeanError`, no FOL/LTL injection anywhere). Documented in §7 as a *designed future primitive*
   grounded in the De Santis et al. paper. **Not built this pass** by design.
6. **Reachability gap (PARTIAL, not FAKE-LIVE):** the SPC computational kernels
   (`check_western_electric_rules`, `ProcessCapability::calculate`) and the `CircuitBreaker` FSM are
   reached *indirectly* through the autonomic loop and have wasm-exported **state I/O**
   (`get_spc_history`/`set_spc_history`, `circuit_breaker_get_state`/`set_state`/`configure`), but
   there is **no direct wasm/CLI export that runs WE-rules or computes Cp/Cpk on a caller-supplied
   series.** This is documented as a recommended additive export in §8; not added in this review pass
   to avoid unreviewed public surface.

---

## 1. RL — `reinforcement.rs`, `rl_orchestrator.rs`

### 1.1 Bellman correctness (Rank-1 oracle)

| Item | File:line | Status | Math-correct | Deterministic | WASM-reachable |
|------|-----------|--------|--------------|---------------|----------------|
| Q-Learning update `Q(s,a) += α(r + γ·maxₐ' Q(s',a') − Q(s,a))` | `reinforcement.rs:182-204` | real | ✅ terminal collapses to `target=r` (`done ⇒ max_next_q=0`) | ✅ seeded RNG (`new_with_seed`) | indirect (autonomic loop; `export_all_q_tables` serialization) |
| SARSA update (on-policy `Q(s',a')`) | `reinforcement.rs:408-422` | real | ✅ uses pre-selected next action a'=π(s') | ✅ | indirect |
| DoubleQLearning, ExpectedSARSA, REINFORCE | `reinforcement.rs` | real | ✅ | ✅ | indirect |
| **FM-1 fix** (equal-state ⇒ terminal) | `rl_orchestrator.rs:1297-1307` | real / **fix verified** | ✅ self-reference avoided | ✅ | via `run_cycle` |

**FM-1 detail.** When `guard_pass && circuit_allowed` but health is unchanged, the orchestrator
produces `state == next_state`. Treated as non-terminal, the Bellman bootstrap reads
`maxₐ' Q(s', ·)` where `s' == s` — i.e. the very cell being updated — an inflating fixed point that
drives the cell toward `r/(1−γ)` instead of `r`. The fix forces `effective_done = done || (state ==
next_state)`, so every agent's target collapses to `r`. **Proof:** `fm1_equal_state_collapse_tests.rs`
(see §6) — `fm1a` shows the non-terminal branch overshoots (`α(r+γ·Q_seed)`) while the terminal
branch yields exactly `α·r`; `fm1b` drives 50 equal-state cycles through `run_cycle` and asserts no
divergence / reward stays in `[-5.5, +1.6]`.

### 1.2 Reward function & schedule

| Item | File:line | Status | Math-correct | Notes |
|------|-----------|--------|--------------|-------|
| `compute_reward_with_momentum` | `rl_orchestrator.rs:333-381` | real | ✅ bounded `[-5.5,+1.6]` | momentum capped at 10-cycle window (`0.05·min(k,10) ≤ 0.5`); best/worst pinned by tests at lines 1628-1658 |
| `learning_rate_schedule` `α_t=α_0·0.9999^t` | `rl_orchestrator.rs:412-415` | real | ✅ monotone decreasing, → exploitation | doctest-verified bounds |
| state quantization (8 dims, 368,640 states) | `lib.rs` `create_rl_state` | real | ✅ bounds-clamped (see `rl_edge_case_audit.rs`) | — |

### 1.3 LinUCB — `wasm4pm/src/ml/linucb.rs`

Implements **disjoint LinUCB** (Li et al., WWW 2010). Inference
`Q̂_a(x) = w_a·x + b_a + α√(xᵀA⁻¹x)`; update is gradient-on-(w,b) plus a rank-1
`A += x⊗x` with **Sherman-Morrison** maintenance of `A⁻¹`.

| Item | File:line | Status | Math-correct | Deterministic | WASM-reachable |
|------|-----------|--------|--------------|---------------|----------------|
| `select` (argmax UCB) | `linucb.rs:150-166` | real | ✅ | ✅ pure fn of state+input | indirect (orchestrator agent selection) |
| `update` (Sherman-Morrison) | `linucb.rs:206-253` | real | ✅ `A⁻¹' = A⁻¹ − (uuᵀ)/(1+xᵀA⁻¹x)`, denom ≥ 1 (PSD) so guard is safe | ✅ | indirect |
| `compute_ucb_variance` `xᵀA⁻¹x` | `linucb.rs:184-189` | real | ✅ clamped ≥0 for numeric safety | ✅ | — |
| `weight_norms` (convergence metric) | `linucb.rs:284-294` | real | ✅ L2 | ✅ | — |

**Math oracle that proves it (not FM-5):** `linucb.rs` test `a_inv_is_consistent_with_a_after_updates`
multiplies `A · A⁻¹` after 5 updates and asserts it equals `I` (±1e-3) — an external linear-algebra
identity, independent of the Sherman-Morrison code path. **Verdict: real, math-correct, deterministic.**

---

## 2. SPC — `wasm4pm/src/spc.rs`

| Item | File:line | Status | Math-correct | Deterministic | WASM-reachable |
|------|-----------|--------|--------------|---------------|----------------|
| Rule 1 (point beyond 3σ control limits) | `spc.rs:137-189` | real | ✅ + **NaN-as-defect** (non-finite ⇒ out-of-control, can't slip past) | ✅ | indirect via autonomic loop |
| Rule 2 (9 consecutive same side of CL) | `spc.rs:199-241` | real | ✅ branchless, fires at exactly the 9th | ✅ | indirect |
| Rule 3 (6 consecutive monotone) | `spc.rs:243-288` | real | ✅ strict monotone over last 6 | ✅ | indirect |
| Rule 4 (2-of-3 beyond 2σ same side) | `spc.rs:290-362` | real | ✅ `σ=(UCL−CL)/3`, `2σ` boundary | ✅ | indirect |
| `ProcessCapability::calculate` (Cp, Cpk, DPMO, σ-level) | `spc.rs:439-518` | real | ✅ `Cp=(USL−LSL)/6σ`, `Cpk=min((USL−μ)/3σ,(μ−LSL)/3σ)`, DPMO via Φ | ✅ | **NOT directly** (see §8) |
| `spc_mean`, `spc_std_dev` (Bessel N−1) | `spc.rs:536-564` | real | ✅ | ✅ | — |
| `normal_cdf` / `inverse_normal_cdf` (hand-rolled) | `spc.rs:583-690` | real | ✅ no statrs dependency | ✅ | — |

**Reachability:** WE-rules are invoked from the autonomic loop (`lib.rs:1279`); the ring-buffer
snapshots are wasm-exported (`get_spc_history`/`set_spc_history`, `lib.rs:2722,2738`). There is **no**
`spc_western_electric(series)` / `spc_process_capability(series, usl, lsl)` direct export. Tests:
`adversarial_spc_tests.rs`, `spc_exact_position_tests.rs`, `spc_rule_classification.rs` (all green).
**Verdict: real + math-correct; reachability PARTIAL.**

---

## 3. Circuit breaker / self-healing — `wasm4pm/src/self_healing.rs`

| Item | File:line | Status | Math-correct | Deterministic | WASM-reachable |
|------|-----------|--------|--------------|---------------|----------------|
| Monotonic clock (`now_ms`, `advance_clock`, `reset_clock`) | `self_healing.rs:69-95` | real / **CB-1 fix** | ✅ step counter, not wall-clock | ✅ test-drivable | — |
| `CircuitBreaker` FSM (Closed/HalfOpen/Open) | `self_healing.rs:254-460` | real | ✅ only legal transitions; timeout via `elapsed ≥ threshold` | ✅ | state I/O exported: `circuit_breaker_get_state`/`set_state`/`configure` (`lib.rs:2763+`) |
| `allow_request` (probe on Open-timeout) | `self_healing.rs:383-460` | real / CB-1 | ✅ Open→HalfOpen only after timeout | ✅ | indirect (`lib.rs:1237`) |
| `RetryPolicy` (backoff) | `self_healing.rs` | real | ✅ | ✅ | indirect |

**CB-1 detail.** The breaker uses a caller-driven monotonic counter; tests call `reset_clock()` +
`advance_clock(delta)` (serialized via `CLOCK_LOCK`) to deterministically expire the Open timeout and
assert `allow_request()` flips to `true`. Tests: `circuit_breaker_state_machine_tests.rs`,
`adversarial_circuit_breaker.rs`, `clock_lock_regression_tests.rs` (all green). **Verdict: real,
fix-verified; FSM reachable for state, computation indirect.**

---

## 4. Prediction / drift — `wasm4pm/src/prediction_drift.rs`

| Item | File:line | Status | Math-correct | Deterministic | WASM-reachable |
|------|-----------|--------|--------------|---------------|----------------|
| `ewma_series` `s_t = α·x_t + (1−α)·s_{t−1}` | `prediction_drift.rs:130-143` | real | ✅ α clamped to `(0,1]`; empty ⇒ empty | ✅ | `compute_ewma` (`#[wasm_bindgen]`) |
| `jaccard_distance` (`∅,∅ ↦ 0` convention) | `prediction_drift.rs:101-118` | real | ✅ `1 − |A∩B|/|A∪B|` | ✅ | via `detect_drift` |
| `classify_trend` (rising/falling/stable) | `prediction_drift.rs:165-180` | real | ✅ relative threshold | ✅ | via `compute_ewma` response |
| `detect_drift` (sliding-window Jaccard) | `prediction_drift.rs:223-301` | real | ✅ | ✅ | `#[wasm_bindgen]` |

Tests: `prediction_drift_oracles.rs`, `drift_*` suites, plus 12 in-file unit tests (all green; see §6).
**Verdict: real, math-correct, deterministic, WASM-reachable.**

---

## 5. Analytics & miniml-core

### 5.1 `wasm4pm/src/final_analytics.rs` (7 `#[wasm_bindgen]` exports)

| Item | File:line | Status | Math-correct | Notes |
|------|-----------|--------|--------------|-------|
| `analyze_variant_complexity` (Shannon entropy) | `final_analytics.rs:12-74` | real | ✅ `H = −Σ p·log₂p` (FMA via `mul_add`) | — |
| `compute_activity_transition_matrix` (Markov) | `final_analytics.rs:77-140` | real | ✅ row-normalized | — |
| `analyze_process_speedup` (time gaps) | `final_analytics.rs:143-…` | real / **TS-1 fix** | ✅ real ISO-8601 parse, not `String::len()` | `parse_iso8601_duration` at 164 |
| remaining 4 exports | — | real | ✅ | — |

### 5.2 `wasm4pm/src/ml/*` (8 `#[wasm_bindgen]` discovery dispatchers)

`discover_ml_regress(+automl)`, `discover_ml_forecast`, `discover_ml_classify`,
`discover_ml_cluster`, `discover_ml_pca`, plus AutoML forecast/classify. All real, wasm-reachable,
delegating to deterministic numeric kernels. **Verdict: real, WASM-reachable.**

### 5.3 `crates/miniml-core/src/*` (crate `miniml`)

- **Surface:** 226 `#[wasm_bindgen]` exports, 867 `pub` items, ~67 modules (linear/ridge/lasso/elastic-net,
  logistic, kNN, k-means(+++), DBSCAN, hierarchical, naive-Bayes, decision-tree, random-forest,
  adaboost, gradient-boosting, SVM/SVR, PCA, perceptron, neural, Bayesian, gaussian-process, markov,
  monte-carlo, distributions/stats, survival, recommendation, graph, plus `optimization/`:
  genetic, PSO, annealing, bandit, drift, anomaly, prediction, feature-importance, fitness).
- **Real vs stub:** **all real.** No `todo!`/`unimplemented!`/empty-body stubs. The single
  `unreachable!()` (`classification_metrics.rs:25`) is an exhaustive-match arm.
- **Determinism:** numeric kernels are deterministic; the metaheuristics (`optimization/genetic.rs`,
  `pso.rs`, `annealing.rs`) take an explicit seed for reproducibility.
- **Empty-array handling (audited explicitly):** kernels validate and **error**, they do not silently
  accept garbage. Examples: `kmeans_impl` → `Err("k must be between 1 and number of samples")`
  (`kmeans.rs:79`); `knn_fit_impl` → `Err("labels length must match number of samples")` /
  `Err("k must be > 0")` (`knn.rs:103,106`); ridge/lasso → `Err("targets length must match number of
  samples")` and a positive-definite check (`linear_regression.rs:57,128,214`). One benign note:
  `KnnModel::predict` returns `Vec<u32>` (not `Result`) and yields an empty vector on empty input —
  harmless, no panic.
- **wasm-reachable:** the 226 `#[wasm_bindgen]` thin wrappers map `MlError → JsError`.
- **Tests:** `cargo test -p miniml --lib` → **393 passed / 0 failed**.

**Verdict: real, deterministic, WASM-reachable, no silent-empty-array defects.**

---

## 6. Verification run (this pass)

```
cargo check -p wasm4pm                                   → Finished (clean)
cargo check -p miniml                                    → Finished (clean)
cargo test -p miniml --lib                               → 393 passed; 0 failed
cargo test -p wasm4pm --features cloud \
   --test fm1_equal_state_collapse_tests                 → 2 passed; 0 failed   (NEW)
cargo test -p wasm4pm --features cloud --lib \
   -- ml::linucb spc:: prediction_drift                  → 25 passed; 0 failed
cargo test -p wasm4pm --features cloud \
   --test adversarial_bellman_spc                         → 6 passed; 0 failed
   --test adversarial_circuit_breaker                     → 6 passed; 0 failed
   --test clock_lock_regression_tests                     → 2 passed; 0 failed
```

### New Chicago-TDD test — `wasm4pm/tests/fm1_equal_state_collapse_tests.rs`

- `fm1a_equal_state_nonterminal_would_overshoot_terminal_equals_reward` — Rank-1 Bellman oracle.
  Pre-seeds `Q(s, Restart) = α·R`, then updates `Q(s, Continue)` once with `s' = s`. Non-terminal
  branch must equal `α(r + γ·Q_seed)` (self-referential overshoot); terminal branch must equal `α·r`;
  the two **must** differ by > 1.0. All numbers derived from the Bellman equation, not the code.
  **Fails if the FM-1 fix is reverted.**
- `fm1b_orchestrator_equal_state_run_cycle_does_not_diverge` — drives 50 `run_cycle` calls with
  `state == next_state` on the `guard_pass && circuit_allowed` trigger; asserts every per-cycle reward
  is finite and in `[-5.5, +1.6]`, the cycle counter reaches 50, and cumulative reward stays finite.

> Note: the RL/SPC/circuit code is gated behind the `cloud` feature, so these run under
> `--features cloud` (matching the existing `adversarial_*` suites).

---

## 7. Future primitive — Compliance-Aware Neuro-Symbolic (LTN) prediction

**Status: NOT IMPLEMENTED (designed here).** No LTN, `SatAgg`, `pMeanError`, or FOL/LTL-injection
exists in the tree. This section is the paper-grounded design so a later pass can build it without
re-deriving the formalism.

**Paper:** De Santis, Park, van der Aalst, Zanichelli — *Compliance-Aware Predictive Process
Monitoring: A Neuro-Symbolic Approach* (arXiv:2603.26948v2). Builds on **Logic Tensor Networks**
(Badreddine et al.). Pipeline: (1) feature extraction → (2) rule extraction → (3) KB creation →
(4) knowledge injection.

### 7.1 Formal objects to implement

- **Grounded inputs.** Prefixes `l = (σ, k)` are the variables `x₊` (positive set `L₊`) / `x₋`
  (negative set `L₋`); `G_X(x₊)` grounds a prefix to its feature vector; constants (activity labels,
  payload values) via `G_C`; deterministic descriptors (e.g. wait/cycle times) via functions `G_F`.
- **Predicate.** Unary `A` is the prefix classifier `P`; its grounding `G_θ(P)` is a neural net
  (LSTM/Transformer encoder + MLP), output truth value in `[0,1]`. `¬A` via fuzzy negation `1 − u`.
- **Quantifier / satisfaction (pMeanError, the load-bearing math):**
  ```
  ∀x₊ A(x₊) = 1 − ( (1/|L₊|) · Σ_{v∈G_X(x₊)} (1 − G_θ(A(v)))^p )^(1/p),   p ≥ 1
  ```
  Existentials use the generalized mean (pMean). The KB aggregates all formulas with `SatAgg`
  (again pMeanError).
- **Loss (the objective to minimize):**
  ```
  L = 1 − SatAgg_{φ∈K} ( G_θ(φ) )
  ```
  i.e. tune θ so all constraints jointly approach truth value 1.

### 7.2 Three FOL rule types (extracted from logs)

| Type | Source | FOL form (paper examples) |
|------|--------|----------------------------|
| **Control-flow** | Declare mining → LTL, then LTL→FOL | `□(Rev ⟹ ◇Exam)` ↦ `∀l (HasAct(l,Rev) ∧ Next(l,Rev,Exam))` |
| **Temporal** | SLA analysis → IF-THEN | `∀l₊ (WaitTime(l₊,Surg,ATB) ≤ 2 → ¬P(l₊))` |
| **Payload** | statistical correlation → IF-THEN | e.g. `O₂ sat < 90% post-surgery → risk↑` |

### 7.3 Three injection levels (Fig. 3 — must be implemented as distinct pathways)

- **(A) Feature expansion** — *class-independent, non-outcome-oriented* knowledge preprocessed into
  the feature space before `P` (e.g. `Age(l)>60 ∧ HasCond(l,Diabetes) → SpecMon(l)`).
- **(B) Output refinement** — *class-dependent, outcome-oriented* knowledge that masks/redefines the
  classifier output (e.g. `WaitTime(l₊,Surg,ATB) < 2 → ¬P(l₊)`).
- **(C) Parallel constraints** — *class-independent* structural rules added as extra KB formulas that
  regularize the shared representation (e.g. `medical-history-review must precede physical-exam`).

### 7.4 Proposed wasm4pm surface (when built — **no new MCP tools**, per plan constraint)

- Reuse the existing prefix/feature extraction (`ml-runner`, prediction tasks) for `G_X`/`G_F`.
- Reuse `declare` discovery (kernel) for control-flow rule extraction; reuse SLA/temporal stats for
  temporal rules; reuse `miniml` correlation/association for payload rules.
- Add a `nesy`/`ltn` Rust module exposing deterministic `sat_agg`, `p_mean_error`, fuzzy connectives,
  and a `compliance_predict(handle, kb_json, injection_level)` `#[wasm_bindgen]` export + `wpm`
  subcommand. Determinism: fixed seed; the LTN forward pass is deterministic given weights.
- **Anti-FAKE-LIVE proof obligations:** a positive prefix that satisfies a rule must score `P→1`; a
  prefix that violates an injected constraint must be penalized in `L` (negative proof); deterministic
  BLAKE3 over `(features, kb, weights, seed)`.

**Verdict (future primitive): BLOCKED — not built.** Reason is structural, not mathematical: a
differentiable LTN backbone (fuzzy quantifier aggregation + gradient training loop) is a net-new
sub-system, out of scope for a review/correction pass. The formal target above is sufficient to
implement it without further paper work.

---

## 8. Recommended additive exports (reachability hardening — NOT done this pass)

To close the PARTIAL reachability on SPC/circuit *computation* (state I/O is already exported), a
later pass should add minimal `#[wasm_bindgen]` thin wrappers (no new MCP tools; CLI/WASM only):

- `spc_western_electric(series_json) → alerts_json` (wraps `spc::check_western_electric_rules`).
- `spc_process_capability(series_json, usl, lsl) → indices_json` (wraps `ProcessCapability::calculate`).
- `circuit_breaker_allow_request() → bool` and `circuit_breaker_advance_clock(delta_ms)` for
  deterministic external probing (the FSM state is already get/set/config-exported).

These were intentionally **not** added in this review pass because adding public surface changes
shipped behavior and should be reviewed/tested as its own change per the plan's constraints.

---

## 9. Per-primitive ledger (completion-contract format)

```
Primitive:        RL Bellman correctness (FM-1)
Paper grounding:  Bellman optimality equation; terminal target = r (absorbing state)
Artifact:         reinforcement.rs:182-204; rl_orchestrator.rs:1297-1307; ml/linucb.rs
Positive proof:   fm1a/fm1b (fm1_equal_state_collapse_tests.rs), a1/a2/a3 (adversarial_rl_tests.rs),
                  linucb a_inv_is_consistent_with_a_after_updates  — ALL PASS
Negative proof:   fm1a asserts the non-terminal (buggy) branch overshoots & MUST differ from terminal
Reachability:     Rust (agents) + indirect WASM via run_cycle/Q-table serialization
Verdict:          ALIVE (math-correct, deterministic, fix-regression-guarded)

Primitive:        SPC (Western-Electric + Process Capability)
Paper grounding:  WE Rules 1-4; Cp/Cpk/DPMO/σ-level (Six Sigma)
Artifact:         spc.rs:128-518
Positive proof:   adversarial_spc_tests, spc_exact_position_tests, spc_rule_classification — PASS
Negative proof:   NaN-as-defect (Rule 1 treats non-finite as out-of-control)
Reachability:     Rust + indirect (autonomic loop) + state I/O exported; computation NOT directly exported
Verdict:          PARTIAL  (reason: WE/Cp computational kernels lack a direct wasm/CLI entry; §8)

Primitive:        Circuit breaker / self-healing (CB-1)
Paper grounding:  3-state breaker FSM with timeout-driven recovery probe
Artifact:         self_healing.rs:69-460
Positive proof:   circuit_breaker_state_machine_tests, adversarial_circuit_breaker,
                  clock_lock_regression_tests — PASS
Negative proof:   Open state refuses requests until timeout (allow_request=false)
Reachability:     Rust + state I/O exported (get/set/configure); allow_request indirect
Verdict:          PARTIAL  (reason: allow_request/advance_clock not directly exported; §8)

Primitive:        Prediction / drift (EWMA, Jaccard, trend)
Paper grounding:  EWMA recurrence; Jaccard set distance
Artifact:         prediction_drift.rs
Positive proof:   prediction_drift_oracles + 12 in-file unit tests + drift_* suites — PASS
Negative proof:   empty input ⇒ empty output (no garbage); α clamped to (0,1]
Reachability:     Rust + WASM (compute_ewma, detect_drift)
Verdict:          ALIVE

Primitive:        miniml-core (226 wasm exports)
Paper grounding:  classical ML kernels (ridge/lasso/kNN/k-means/trees/forests/PCA/SVM/…)
Artifact:         crates/miniml-core/src/* (crate `miniml`)
Positive proof:   cargo test -p miniml --lib → 393 passed / 0 failed
Negative proof:   kernels Err on invalid input (k bounds, label-length, non-PD matrix); no silent empty
Reachability:     Rust + 226 #[wasm_bindgen]
Verdict:          ALIVE

Primitive:        Neuro-symbolic LTN compliance predictor
Paper grounding:  De Santis et al. (LTN, pMeanError, SatAgg, 3 injection levels)
Artifact:         (none — designed in §7)
Positive proof:   n/a (not built)
Negative proof:   n/a
Reachability:     n/a
Verdict:          BLOCKED  (reason: net-new differentiable LTN sub-system; formal target documented)
```

**A10 sub-kernel verdict:** the audited ML/AI primitives are **ALIVE** for RL, drift, and miniml-core;
**PARTIAL** for SPC and circuit-breaker (computation reachable only indirectly — additive exports
specified in §8); the LTN primitive is **BLOCKED/designed**. All three historically-tracked bugs
(FM-1, TS-1, CB-1) are confirmed fixed and now carry an additional fails-if-reverted regression test
for the FM-1 equal-state collapse.
