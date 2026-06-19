# What the Benchmarks Say

## A thesis on the wasm4pm cognition benchmarks — the what, the why, the how, and a vision for 2030

---

## Abstract

A benchmark is usually a number. The wasm4pm cognition benchmarks are an
*argument*: that the accumulated reasoning methods of artificial intelligence —
56 of them, from Bellman's 1957 dynamic programming to van der Aalst's 2019
object-centric process mining — can be executed not only *correctly* but *fast*,
*deterministically*, and *auditably*, on commodity hardware, with every claim
backed by replayable evidence. This document reports what the measurements say,
explains why those numbers matter, describes how they are produced and governed,
and projects where the discipline leads by 2030.

The headline result: across **55 measured breeds**, the median reasoning
operation completes in **19.1 µs** and the mean in **45.7 µs**; **53 of 55**
breeds finish in under 100 µs. The entire span of symbolic and statistical AI —
deduction, planning, induction, abduction, probability, analogy, constraint
solving — runs at microsecond latency, fast enough to embed thousands of distinct
reasoning steps inside a single interactive frame.

---

## 1. What the benchmarks say

The measurement is wall-clock latency of `CognitionBreed::run()` at the Rust
boundary (no WASM serialization), each breed exercised with the canonical worked
example from its source paper. All figures are normalized against a fixed
**calibration anchor** — a deterministic CPU-bound workload measuring **17.8 µs**
on the reference host — so a breed's *ratio* to the anchor is machine-independent.

| Statistic | Value |
|---|---|
| Breeds measured | 55 |
| Calibration anchor | 17.8 µs |
| Fastest breed | `triz` — 7.0 µs (0.39× anchor) |
| Median breed | `dendral` — 19.1 µs |
| All-breed median latency | **19.1 µs** |
| All-breed mean latency | 45.7 µs |
| Breeds under 50 µs | 48 / 55 |
| Breeds under 100 µs | 53 / 55 |
| Slowest breed | `rl_symbolic` — 1131 µs (63.6× anchor) |

Three things the distribution says plainly:

1. **Reasoning is cheap.** The median paradigm of mechanized thought — a MYCIN
   certainty-factor chain, a Prolog resolution, a STRIPS plan, a Dempster–Shafer
   fusion — costs about the same as the calibration workload: tens of
   microseconds. Symbolic AI has a reputation for being slow; at the scale of one
   worked problem, on modern hardware, it is not.

2. **The cost structure is paradigm-shaped, not random.** The breeds cluster.
   Most deductive and knowledge-representation breeds sit at 0.4–2× the anchor.
   Search and planning breeds (`hearsay` 3.3×, `partial_order_plan` 3.4×,
   `pomdp` 4.9×, `ilp` 6.4×) form a middle tier — they explore a space rather
   than evaluate a fixed structure. One breed, `rl_symbolic` at 63.6×, is a
   genuine outlier: Q-learning *converges* a value function through repeated
   episodes, so it is doing categorically more work than a single inference. The
   benchmark surface is therefore a map of computational character, not just
   speed.

3. **There are no silent pathologies.** Every breed terminates in bounded time on
   its paper example; nothing hangs, allocates unboundedly, or degrades into a
   variant explosion. The slowest is explainable by its algorithm class, not by a
   defect.

---

## 2. Why the numbers matter — and why these numbers, specifically

A latency table is only meaningful if you can answer three questions it usually
leaves open. wasm4pm answers all three, and that is the actual thesis.

### 2.1 Why trust the number? — because the breed is *proven correct*

A benchmark for an algorithm you have not verified is a measurement of how fast
you can be wrong. Every breed in this table also passes a **paper-grounded test**
(it reproduces its source paper's published value — MYCIN's CF 0.7, Pearl's
posterior 0.3736) and a **falsification test** (the suite confirms the right
answer *and* rejects a corrupted one). The attestation gate joins the two: of the
55 benchmarked breeds, **55 are TRUSTED** (correct *and* fast), **0 are
fast-but-wrong**. The number is trustworthy because the thing being measured is
provably the algorithm it claims to be.

This is the property a conventional benchmark suite — and every large language
model — lacks. An LLM can emit a plausible Bayesian posterior in microseconds and
be silently wrong by 0.3. The breed must derive Pearl's exact value or the
attestation fails the build.

### 2.2 Why believe the number reproduces? — because it is *receipted*

Each benchmark run emits a `Wasm4pmBenchmarkReceipt`: a BLAKE3 hash binding the
environment (CPU, cores, governor, rustc, git commit, dirty-tree flag) to the
result set, chained to the prior receipt in an append-only ledger. A number you
cannot reproduce is folklore; a receipted, environment-stamped, tamper-evident
number is evidence. The `verify` gate recomputes the hash and refuses a baseline
produced from an uncommitted tree.

### 2.3 Why compare across machines? — because it is *calibrated*

Absolute microseconds are machine-dependent; a baseline from a laptop and a run
on a CI runner differ by hardware alone. Expressing every latency as a ratio to
the on-host calibration anchor cancels machine speed, so the regression gate and
the performance budgets hold on any runner. A budget of "≤15× calibration" is a
service-level objective that survives a hardware refresh.

Together these make the benchmarks **Fortune-grade**: not a leaderboard, but a
governed measurement with provenance, correctness, and machine-independence built
in.

---

## 3. How the measurement and its governance work

The benchmark layer is a pipeline of seven stages, each a `bench-tools`
subcommand, each with its own unit and integration tests (a gate that cannot fail
proves nothing):

```
measure   — Criterion drives breed_latency over every paper fixture + the anchor
report    — medians + 95% CIs → REPORT.md / CSV
receipt   — BLAKE3 provenance (environment + results), refresh baseline, append ledger
verify    — recompute the hash; detect tampering; refuse a dirty-tree baseline
regress   — flag a slowdown only if it clears the threshold AND the 95% CIs are
            disjoint (statistically distinguishable), after calibration-normalizing
ledger    — verify the receipt chain's integrity; per-bench median trend over time
attest    — join correctness (paper-grounded + falsification) with latency; FAIL on
            any fast-but-wrong breed
budget    — enforce machine-independent latency SLOs (ratio to calibration)
```

The breed benchmark itself is **data-driven**: it iterates the paper fixtures,
resolves each `BreedId`, and benchmarks the lawful dispatch path. It cannot rot
when a breed is added — the surface that defines correctness (the fixtures) also
defines coverage. The regression gate uses confidence-interval non-overlap rather
than a point-estimate threshold, so noisy benches do not produce false alarms.
The budgets are evidence-calibrated from a full run, not guessed.

Every stage runs in CI on the `bench-regression` workflow, so a pull request that
slows a breed past its budget, breaks correctness, or tampers with a receipt is
caught before merge.

---

## 4. Vision 2030

The benchmarks today prove a point about *the present*: mechanized reasoning is
fast, correct, and auditable now. The trajectory to 2030 is about what that makes
possible.

**2026 — full-fleet attestation in CI.** Every breed benchmarked on every PR; the
attestation and budget gates flip from advisory to required. A merge that makes
any breed fast-but-wrong, or breaches an SLO, cannot land. Performance becomes a
correctness property, enforced.

**2027 — instruction-level determinism.** Wall-clock latency gives way, for the
micro-benchmarks, to instructions-retired counts — a noise-free, machine-stable
metric. Regression detection moves from "is it slower?" to "did the algorithm's
work change?", catching complexity regressions (an O(n) breed quietly becoming
O(n²)) that constant-factor timing hides.

**2028 — the reasoning budget as a product surface.** The per-breed ratio table
becomes a published capability sheet: a downstream system (a game engine, a
trading monitor, a diagnostic agent) can read "abduction costs 3.8× calibration,
planning 3.4×, Q-learning 64×" and schedule reasoning the way a real-time system
schedules tasks against a frame budget. Reasoning becomes a resource you allocate,
not a black box you hope finishes.

**2029 — cross-host normalized fleets.** The calibration anchor generalizes into a
distributed normalization basis: thousands of heterogeneous hosts contribute
receipts to one ledger, and the chained history yields fleet-wide performance
trends immune to hardware churn. Regression detection operates over a global,
tamper-evident record rather than a single machine's last run.

**2030 — receipted reasoning at interactive scale.** A median breed runs in
19 µs; a 16 ms interactive frame has room for hundreds of distinct, *verified*
reasoning steps. The vision is a system that, inside a single frame, abduces a
hypothesis, scores it with a Bayesian network, plans a response, monitors the
execution against a temporal-logic property, and emits a receipt for the whole
chain — every step provably the published algorithm, every step under budget,
the entire trace auditable as a lawful object-centric process. Not an AI that
sounds like it reasoned, but one that *did*, fast enough not to notice, and can
prove it afterward.

---

## 5. The one-sentence thesis

> The wasm4pm cognition benchmarks demonstrate that the full span of mechanized
> reasoning runs at microsecond latency — a 19 µs median across 55 paradigms —
> and, uniquely, that every one of those numbers is **trusted** (the algorithm is
> provably correct), **receipted** (the run is reproducible and tamper-evident),
> and **calibrated** (the result is machine-independent): performance you can
> believe, replay, and port.

---

*Grounding note.* Every figure above is from a full `breed_latency` run
(calibration anchor 17.8 µs; medians via Criterion's `estimates.json`). Correctness
is from the `paper_grounded` and `paper_falsification` suites; the join is produced
by `bench-tools attest` (55 TRUSTED, 0 fast-but-wrong). Provenance, regression,
budget, and ledger mechanics are in `crates/bench-tools` and documented in
`docs/benchmarks/README.md`. The claims are checkable against that evidence — as
the doctrine requires.
