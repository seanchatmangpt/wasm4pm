# Challenger Enterprise Architecture Benchmarks

This rail measures the economics of architectural decision-making on real process evidence, not only isolated algorithm latency.

## Evidence subject

The executable benchmark consumes the checked-in `wasm4pm/bench_data/receipt.xes` fixture. The CI receipt binds the exact Git head, dataset SHA-256, dataset byte count, benchmark log SHA-256, Actions run ID, and run attempt.

Synthetic event-log generation is not admitted for this rail.

## Challenger teaching point

Conventional enterprise architecture often optimizes a selected design while leaving the cost of premature selection unmeasured. The benchmark asks a different question:

> How much deterministic, reversible architecture space can be evaluated and receipted before an enterprise would normally make one irreversible choice?

## Measures

| Measure | What executes | Enterprise interpretation |
|---|---|---|
| Portfolio Before Decision | DFG + footprint semantics + four heuristic-policy projections, then one dataset-bound BLAKE3 receipt | Cost of preserving six alternatives before selection |
| Policy Space Sweep | Nine dependency-threshold candidates, each hashed into one evidence receipt | Cost of testing policy sensitivity before standardizing |
| Receipt Tax | BLAKE3 binding of a pre-manufactured six-candidate portfolio | Evidence overhead separated from analysis cost |
| Architecture Optionality Density | Fifteen candidate evaluations plus one dataset-bound receipt | Reversible alternatives manufactured per unit time |

Criterion element throughput is interpreted as candidate evaluations/second for portfolio, policy sweep, and optionality density. `Receipt Tax Ratio` is derived from receipt-only latency divided by portfolio latency.

## Challenger sales use cases

**Architecture Review Board.** Replace “which design do we approve?” with “how many evidence-bound alternatives can we evaluate before approval latency becomes material?”

**Regulatory or control change.** Sweep policy thresholds against the same admitted observation before changing a standard, exposing sensitivity that a single configuration hides.

**Migration and modernization.** Quantify the cost of preserving multiple process interpretations before selecting a target architecture.

**M&A process harmonization.** The next extension pairs two public enterprise logs and measures the cost of manufacturing and comparing candidate process portfolios before forcing a common operating model.

## Claim discipline

These benchmarks prove execution and decision-economics measurements for wasm4pm on the exact recorded subject. They do not establish cross-product SOTA until competing engines are executed against the same datasets, hardware class, semantics, and acceptance criteria.

The sales claim is therefore not “wasm4pm is fastest.” The claim under test is:

> Process-mining primitives can be cheap enough that enterprise architecture can evaluate and receipt a portfolio of alternatives before making one irreversible decision.
