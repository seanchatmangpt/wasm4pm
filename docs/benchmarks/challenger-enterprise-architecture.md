# Challenger Enterprise Architecture Benchmarks

This rail measures the economics of architectural decision-making on real process evidence, not only isolated algorithm latency.

## Evidence subject

The executable benchmark consumes the checked-in `wasm4pm/bench_data/receipt.xes` fixture. The CI receipt binds the exact Git head, dataset SHA-256, dataset byte count, benchmark log SHA-256, Actions run ID, and run attempt.

Synthetic event-log generation is not admitted for this rail.

## Challenger teaching point

Conventional enterprise architecture often optimizes a selected design while leaving the cost of premature selection unmeasured. The benchmark asks a different question:

> How much deterministic, reversible architecture space can be evaluated and receipted before an enterprise would normally make one irreversible choice?

## Two-layer measurement constitution

The benchmark now separates two costs that must not be collapsed into one marketing number.

### 1. Process-semantics manufacture

`DISCOVERY_RESULT` executes against the checked-in real XES evidence and manufactures eleven semantic roots:

- one directly-follows graph;
- one footprint model;
- nine heuristic-miner interpretations at thresholds 0.1 through 0.9.

This is the expensive process-mining layer. Its rate is reported as `semantic_roots_per_second`.

### 2. Evidence-bound decision-envelope evaluation

The Fortune 5 stress rail reuses the manufactured semantic roots and evaluates deterministic bounded decision envelopes across region, business unit, jurisdiction, control, policy, operating model, semantic root, admission result, and BLAKE3 receipt.

This layer is reported as:

\[
\mathrm{EBAA/s} =
\frac{\text{evidence-bound architectural alternatives evaluated}}
{\text{wall-clock second}}
\]

An EBAA is therefore a receipted governance/search-envelope evaluation over already-manufactured process semantics. It is **not** a claim that a full process-discovery algorithm executed once per EBAA.

## Massive Fortune 5 stress matrix

The exact-head rail must execute at least **30,000,000** decision envelopes before it may be promoted to ALIVE. The current executable plans **30,511,000** directly observed evaluations across sixteen measured rows.

| Family | Measured scales | Enterprise interpretation |
|---|---:|---|
| Governance Portfolio Frontier | 1K, 10K, 100K, 1M, 10M | How much reversible option space can be evaluated before selection? |
| Regulatory Counterfactual Frontier | 100K, 1M, 5M | How many policy/control counterfactuals can be evaluated against the same admitted evidence? |
| Change Blast-Radius Frontier | 100K, 1M, 5M | How much bounded downstream change topology can be evaluated before a change decision? |
| M&A Harmonization Frontier | 100K, 1M, 5M | How many receipted operating-model combinations can be compared before standardization? |
| Architecture Review Board Frontier | 100K, 1M | How much decision-complete option space can be collapsed into one executive decision? |

The **10,000,000-envelope Governance Portfolio Frontier** is the flagship directly executed stress row. Larger hourly/daily/weekly numbers may be derived arithmetically from that measured throughput, but must be labeled projections rather than directly executed envelope counts.

## Validator / refusal law

The workflow refuses the benchmark if any of the following are false:

1. exactly one process-discovery receipt, subject receipt, and completion receipt are observed;
2. all sixteen expected frontier rows execute;
3. the 10,000,000-envelope flagship row executes;
4. every candidate receives exactly one `admitted` or `refused` standing;
5. every elapsed duration and EBAA/s value is positive;
6. every final row receipt is a 64-hex BLAKE3 digest;
7. the sum of directly executed envelopes equals the executable's declared plan and is at least 30,000,000;
8. EBAA/s recomputed from raw envelope count and raw elapsed nanoseconds matches the logged value within relative error `1e-6`.

The workflow then emits `fortune5-results.csv`, `fortune5-summary.md`, the full benchmark log, exact subject identity, and a SHA-256-bound execution receipt as one Actions artifact.

## Original decision-economics measures

| Measure | What executes | Enterprise interpretation |
|---|---|---|
| Portfolio Before Decision | DFG + footprint semantics + four heuristic-policy projections, then one dataset-bound BLAKE3 receipt | Cost of preserving six alternatives before selection |
| Policy Space Sweep | Nine dependency-threshold candidates, each hashed into one evidence receipt | Cost of testing policy sensitivity before standardizing |
| Receipt Tax | BLAKE3 binding of a pre-manufactured six-candidate portfolio | Evidence overhead separated from analysis cost |
| Architecture Optionality Density | Fifteen candidate evaluations plus one dataset-bound receipt | Reversible alternatives manufactured per unit time |

## Challenger sales use cases

**Architecture Review Board.** Replace “which design do we approve?” with “how many evidence-bound alternatives can we evaluate before approval latency becomes material?”

**Regulatory or control change.** Sweep policy thresholds against the same admitted observation before changing a standard, exposing sensitivity that a single configuration hides.

**Migration and modernization.** Quantify the cost of preserving multiple process interpretations before selecting a target architecture.

**M&A process harmonization.** Measure the bounded combinatorial decision space that can be evaluated and receipted before forcing a common operating model.

## Claim discipline

These benchmarks prove execution and decision-economics measurements for wasm4pm on the exact recorded subject. They do not establish cross-product SOTA until competing engines are executed against the same datasets, hardware class, semantics, and acceptance criteria.

The stress rail's high EBAA/s values must never be relabeled as full process-mining operations per second. `DISCOVERY_RESULT` and `FORTUNE5_RESULT` are deliberately separate evidence classes.

The sales claim under test is:

> Process-mining semantics can be manufactured once and then reused cheaply enough that enterprise architecture can evaluate and receipt enormous bounded portfolios of reversible alternatives before making one irreversible decision.
