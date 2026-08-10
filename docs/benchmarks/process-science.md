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

## Published `wpm` CLI surface

The installed CLI exposes the process-science admission/projection boundary directly:

```bash
wpm lab process-science --input evidence.xes --output process-science-out
```

The command reads actual XES bytes, binds their evidence identity, requires at least one observable trace and event, manufactures the complete 13-family process-operator plan, and writes `process-science-out/process-science.json` when `--output` is supplied. Every family carries `authority=CONSTRUCT_ONLY`; the projection carries `actuation=REFUSED`.

The command does not shell out to a repository-local Cargo example. This keeps the surface valid for the published npm package, whose distributable file surface is `dist`. Unreadable evidence and structurally empty XES inputs are typed source refusals and may not manufacture an output projection.

## Chicago filesystem court

`apps/wasm4pm/src/__tests__/process-science-cli.chicago-fs.test.ts` validates the published binary through real filesystem consequences rather than a mocked filesystem. The court:

1. creates a real temporary XES file;
2. spawns the built `wpm` child process through `@wasm4pm/testing`;
3. reads the actual persisted `process-science.json` projection;
4. checks all 13 operators, observed evidence counts, construction-only authority, refused actuation, and receipt shape;
5. replays the same admitted evidence into a second real directory and requires byte-for-byte deterministic projection output;
6. observes the CLI's command-receipt directory as a separate filesystem consequence;
7. supplies a missing path and requires `PROCESS_SCIENCE_INPUT_UNREADABLE` with no output projection;
8. supplies structurally empty XES and requires `PROCESS_SCIENCE_XES_EVIDENCE_EMPTY` with no output projection.

The dedicated `.github/workflows/process-science-bench.yml` builds `@wasm4pm/cli`, runs this exact Chicago filesystem test, then compiles and executes the Rust stress subject and invokes the independent benchmark verifier.

## Authority boundary

The benchmark and CLI have no external DO authority. Causal and reinforcement-learning families manufacture candidate interventions only. `actuation=REFUSED` is part of both the benchmark subject/completion identity and the CLI projection.

```text
SELECT != CONSTRUCT != DO
```

## Interpretation

The benchmark is useful when comparing architectures for process-oriented inference because it exposes workload dimensions hidden by ordinary prediction latency: hypothesis-space width, future branching, intervention branching, evidence density, governance, refusal, and receipt cost.

It does **not** establish that the synthetic process contexts reproduce a particular enterprise, that inferred hypotheses are causally correct, or that measured operations are equivalent to human/LLM reasoning. Those require separate admitted datasets and semantic correctness fixtures.
