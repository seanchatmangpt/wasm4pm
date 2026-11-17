<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/reference/miniml_core.md; source-sha256: 525a664bb7ecb88639c67bcd66c1561265d3789b029390c92d059e1097b85fd2; reason: canonical Diátaxis or ADR surface -->

# miniml_core.md

What `crates/miniml-core` actually implements on the anomaly, drift, and
neural surfaces — the grounded implementations and their source-paper
lineage. Family table and build instructions live in the crate README
(`crates/miniml-core/README.md`); the wasm4pm-facing ML primitives (LinUCB,
EWMA/Jaccard drift, spc) are documented in
[`docs/primitives/09b-ML-AI-PRIMITIVES.md`](../primitives/09b-ML-AI-PRIMITIVES.md).

## 1. Isolation forest (`optimization/anomaly.rs`)

`isolation_forest_score(point, reference, n_trees, max_depth) -> f64` implements
iForest per **Liu et al. 2008** (ICDM, "Isolation Forest"):

- Per-tree subsampling to `ψ = 256` (`IF_SUBSAMPLE`, clamped to
  `min(ψ, |reference|)`), drawn without replacement via partial Fisher–Yates
  with a fixed seed (`IF_SEED = 42`), so scores are deterministic.
- Tree height limit `min(max_depth, ⌈log2 ψ⌉)`.
- Splitting rule per the paper: random feature q, uniform random split value in
  `[min, max]` of the subsample on that feature.
- Terminal nodes carry the expected-path correction `h = depth + c(size)` with
  `c(n) = 2H(n−1) − 2(n−1)/n` (H via the Euler–Mascheroni constant).
- Score `s = 2^(−E[h]/c(ψ))` — near 0 = normal, near 1 = anomalous.
- Degenerate inputs return 0.0: empty or single-point reference, `n_trees = 0`,
  constant columns.

## 2. Page–Hinkley drift detection (`optimization/drift.rs`)

`page_hinkley_test(values, threshold, alpha) -> Vec<usize>` — the canonical
Page–Hinkley change-point test (Mouss et al.; the `page_hinkley` form from
Gama et al.'s concept-drift literature):

- Running mean `m_t` over the observed values.
- Cumulative deviation `PH_t = PH_{t−1} + (m_t − x_t − δ)`.
- Track the minimum `M_T = min PH_t`; alarm when `M_T − PH_t > λ`.
- API mapping: `threshold` is λ (alarm threshold), `alpha` is the δ magnitude
  allowance. δ = 0 detects any mean shift; δ > 0 tolerates bounded drift.

Test coverage asserts: mean-shift detection with δ = 0 and with
δ = 0.1 under noise (λ = 100), and no alarm on a stationary series.

## 3. Neural networks with gradient-checked backprop (`neural.rs`)

- Backpropagation runs over a Dense-only forward pass (`forward_dense`);
  the final Dense layer is kept **linear** in the gradient pass and the
  output activation is applied by the caller — this is what the delta rule
  expects. Prior to the fix the output activation was applied twice, corrupting
  the gradients.
- Verified by a numerical gradient check: central differences with ε = 1e-6,
  asserted max relative error < 1e-5, including a two-hidden-layer tanh
  network (`test_gradient_check_two_hidden_layers_tanh`).
- Optimizers (SGD, Adam, RMSprop) are unchanged; the fix is in the gradient
  computation, not the update rule.

## See Also

- [`crates/miniml-core/README.md`](../../crates/miniml-core/README.md) — family
  table, build
- [`docs/reference/algorithms.md`](algorithms.md) — algorithm registry
- [`docs/primitives/09b-ML-AI-PRIMITIVES.md`](../primitives/09b-ML-AI-PRIMITIVES.md) —
  wasm4pm-facing ML primitives
