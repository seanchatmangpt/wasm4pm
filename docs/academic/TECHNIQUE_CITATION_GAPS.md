# Technique Citation Gaps — Algorithms That Use Papers But Don't Cite Them

*Generated 2026-05-30 from codebase sweep + ALGORITHM_LINEAGE.toml audit.*

These algorithms are classified `engineering_only` in the TOML (no process-mining paper defines
the algorithm exactly), but they **implement** or **directly use** a foundational technique
that has a canonical academic paper. The distinction matters for the paper claim:

> "wasm4pm reconstructs the PM canon" — but also builds on general CS/ML foundations.

---

## Category A: Directly Uses a Named Theorem / Algorithm From a Paper

### `agentic_pipeline`
**Formal object:** Bellman-optimized policy execution via 5 RL agents + LinUCB contextual bandit

**Foundational papers used:**
| Technique | Paper | arXiv | Downloaded |
|---|---|---|---|
| LinUCB contextual bandit | Li, Chu, Langford, Schapire (2010) WWW | arXiv:1003.0146 | ✅ yes |
| Q-Learning / Bellman equation | Bellman (1957) Indiana Univ. Math. J. 6(4) | n/a (1957) | paywalled |
| ε-greedy SARSA | Rummery & Niranjan (1994) CUED Tech Report | n/a | paywalled |

**Code evidence:** `wasm4pm/src/rl_orchestrator.rs` — LinUCB weight update, Bellman equation update
**Honest classification:** `engineering` with `technique_papers = ["li_2010_linucb", "bellman_1957_mdp"]`

---

### `a_star`
**Formal object:** A\* heuristic search over process model space for Petri net discovery

**Foundational paper:**
| Technique | Paper | arXiv | Downloaded |
|---|---|---|---|
| A\* search algorithm | Hart, Nilsson, Raphael (1968) IEEE TSS&C | n/a (1968) | paywalled |

**Note:** In *conformance* context, A\* alignment is directly from Adriansyah 2014 (PhD, already in bibliography).
In *discovery* context (this algorithm), A\* is used as a search heuristic for Petri net quality optimization.
The discovery application is engineering; the alignment application is `direct`.

---

### `analyze_variant_complexity`
**Formal object:** Shannon entropy of trace variant distribution over event log

**Foundational paper:**
| Technique | Paper | arXiv | Downloaded |
|---|---|---|---|
| Shannon entropy | Shannon (1948) Bell System Technical Journal 27(3):379–423 | n/a (1948) | paywalled |

**PM context:** van der Aalst (2016) §3.2 defines process variants; entropy quantifies variant explosion.
The entropy formula used is exactly Shannon's: `H = -Σ p(v) log₂ p(v)`.

**Code evidence:** `wasm4pm/src/final_analytics.rs` — uses itertools::counts() + FMA-optimized entropy calculation

---

## Category B: Implements a Classical ML Algorithm Used in PM Context

### `ml_pca`
**Formal object:** PCA (Jacobi eigendecomposition) of trace feature matrix

| Technique | Paper | Notes |
|---|---|---|
| PCA origin | Pearson (1901) Philosophical Magazine 2(11):559–572 | Pre-arXiv |
| Numerical PCA | Hotelling (1933) J. Ed. Psych. 24(6):417–441 | NIPALS/power iteration |

**PM application:** Dimensionality reduction for process feature spaces; no PM-specific PCA paper.

---

### `automl_classify`
**Formal object:** Auto-optimized k-NN / Random Forest classifier for trace outcome prediction

| Technique | Paper | arXiv | Downloaded |
|---|---|---|---|
| k-NN algorithm | Cover & Hart (1967) IEEE TIT 13(1):21–27 | n/a (1967) | paywalled |
| Random Forest | Breiman (2001) Machine Learning 45(1):5–32 | n/a (2001) | paywalled |
| AutoML k-fold CV | Kohavi (1995) IJCAI | n/a | paywalled |

---

### `automl_forecast`
**Formal object:** Auto-optimized EWMA forecasting with 5-fold CV sweep over α ∈ [0.05, 0.95]

| Technique | Paper | Notes |
|---|---|---|
| EWMA (Exponential Smoothing) | Brown (1959) "Statistical Forecasting for Inventory Control" | McGraw-Hill book |
| Holt-Winters extension | Holt (1957) ONR Memorandum | Technical report |

**Note:** The EWMA formula is `Sₜ = α·xₜ + (1-α)·Sₜ₋₁`; the CV sweep for optimal α is AutoML practice.

---

### `compute_activity_transition_matrix`
**Formal object:** Normalized activity transition frequency matrix (Markov chain approximation)

| Technique | Paper | Notes |
|---|---|---|
| Markov chains | Markov (1906) | Classical probability |
| PM stochastic Petri nets | Rozinat et al. (2009) ICSOC | Already in bibliography as monte_carlo_simulation |

**Note:** A discrete-time Markov chain is exactly what this matrix represents.

---

### `compute_trace_similarity_matrix`
**Formal object:** Pairwise trace similarity using Levenshtein edit distance

| Technique | Paper | Notes |
|---|---|---|
| Edit distance | Levenshtein (1966) Sov. Physics Doklady 10(8):707–710 | Classical string metric |
| PM trace clustering | Song, Günther, van der Aalst (2008) BPM Workshops | Already in bibliography |

---

## Category C: Engineering Optimizations — No Paper Needed

| Algorithm | Reason |
|---|---|
| `simd_streaming_dfg` | SIMD intrinsics optimization of DFG computation. **Also has P1 bug: HashMap non-determinism.** |
| `smart_engine` | Heuristic algorithm selector based on log profile metrics. Rule-based, no academic precedent. |
| `ocel_encode` | Text encoding of OCEL for LLM context. Entirely engineering. |
| `analyze_process_speedup` | Sliding-window temporal analysis. Engineering PM tooling. |
| `hill_climbing` | Generic HC applied to process model perturbation. No PM paper. |

---

## Papers to Add to Download Script

Already downloaded (new as of this session):
- ✅ arXiv:1003.0146 — Li et al. 2010 (LinUCB / `agentic_pipeline`)
- ✅ arXiv:1706.09837 — Teinemaa et al. 2019 preprint (`predict_outcome`)

Paywalled (manual retrieval needed):
| Paper | DOI / Location | Algorithm |
|---|---|---|
| Hart et al. 1968 (A\*) | IEEE TIT, no DOI in databases | `a_star` |
| Shannon 1948 | `10.1002/j.1538-7305.1948.tb01338.x` | `analyze_variant_complexity` |
| Cover & Hart 1967 | `10.1109/TIT.1967.1053964` | `automl_classify` |
| Breiman 2001 Random Forests | `10.1023/A:1010933404324` | `automl_classify` |
| Bellman 1957 | Indiana Univ. Math. J. 6(4) | `agentic_pipeline` |
| Pearson 1901 (PCA) | Philosophical Magazine 2(11) | `ml_pca` |

---

## Recommended TOML Update

Add `technique_papers` field for algorithms in Category A and B to document foundational lineage
without falsely claiming the PM implementation is a direct paper instantiation:

```toml
[[algorithm]]
id = "agentic_pipeline"
coverage_kind = "engineering_only"
formal_object = "End-to-end autonomic lifecycle..."
technique_papers = ["li_chu_langford_schapire_2010_linucb", "bellman_1957_mdp"]
# ^ technique_papers: foundational methods used, NOT the PM algorithm paper
```

This separates:
- `papers`: "this IS the algorithm from this paper"  
- `technique_papers`: "this USES the technique from this paper"
