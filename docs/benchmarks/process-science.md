# Process Science Benchmark

## Thesis under test

This benchmark does **not** claim that data science is literally reducible to one implementation or that synthetic throughput proves real-world scientific validity. It tests a narrower architectural proposition:

> Conventional data-science workloads can be represented as bounded operators over process evidence, where the primary computational objects are process hypotheses, trajectories, transition laws, candidate futures, interventions, admissions/refusals, and receipts rather than isolated rows or predictions.

The executable subject is `wasm4pm/examples/process_science.rs`. Its seed identity is the checked-in `wasm4pm/bench_data/receipt.xes` evidence. The episode stream itself is deterministic synthetic process context derived from an ordinal and that evidence identity.

## Data science -> process science benchmark families

| Conventional discipline | Process-science operator measured |
|---|---|
| Descriptive statistics | latent process hypothesis generation |
| Classification | trajectory/state inference |
| Regression | transition-dynamics estimation |
| Clustering | process-family inference |
| Forecasting / time series | forward process inference |
| Survival analysis | terminal-path hazard inference |
| Anomaly detection | transition-law violation detection |
| Causal inference | intervention-reachability discrimination |
| Feature engineering | process-projection retention |
| ETL / data engineering | evidence reconstruction and provenance |
| Bayesian inference | process-hypothesis discrimination |
| Reinforcement learning | governed policy-trajectory search |
| Integrated process science | observe -> admit -> infer -> discriminate -> simulate -> construct -> govern -> receipt |

## Anti-hiding contract

Each configured process hypothesis is actually scored. Each configured candidate future is separately evaluated. Each configured intervention is separately constructed as a reversible candidate. Every episode passes through a policy/evidence/blast-radius admission gate and emits a BLAKE3 receipt binding evidence identity, operator, context, candidate cardinalities, and standing.

The benchmark records, per family and scale:

- observations;
- process hypotheses evaluated;
- transition evaluations;
- candidate futures evaluated;
- candidate interventions constructed;
- evidence links carried;
- admitted and refused outcomes;
- receipts emitted;
- elapsed nanoseconds;
- observations/second;
- hypotheses/second;
- transitions/second;
- final aggregate receipt.

CI independently recomputes all cardinality and throughput arithmetic. A printed number is not accepted merely because the executable emitted it.

## Scale

Twelve discipline-specific families execute at 10,000, 100,000, and 1,000,000 observations. The integrated process-science family executes at 100,000, 1,000,000, and a 10,000,000-observation flagship frontier. The executable refuses its own plan if aggregate observations fall below 24,000,000 or aggregate transition evaluations fall below 144,000,000.

These counts are directly executed synthetic benchmark episodes. Capacity projections beyond the executed counts, if produced by CI summaries, are explicitly labeled derived rather than executed.

## Authority boundary

The benchmark has no external DO authority. Causal and reinforcement-learning families manufacture candidate interventions only. `actuation=REFUSED` is part of both the subject and completion identity and is validated by CI.

## Interpretation

The benchmark is useful when comparing architectures for process-oriented inference because it exposes workload dimensions hidden by ordinary prediction latency: hypothesis-space width, future branching, intervention branching, evidence density, governance, refusal, and receipt cost.

It does **not** establish that the synthetic process contexts reproduce a particular enterprise, that inferred hypotheses are causally correct, or that measured operations are equivalent to human/LLM reasoning. Those require separate admitted datasets and semantic correctness fixtures.
