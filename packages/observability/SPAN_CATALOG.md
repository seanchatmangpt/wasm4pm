# OTEL Span Catalog — ML / RL / Prediction / Drift / Conformance

Authoritative reference for span names and attributes emitted by the
`Instrumentation` helper in `@wasm4pm/observability`.

All spans carry the following **required** attributes:

| Attribute            | Source                       |
|----------------------|------------------------------|
| `service.name`       | constant `"wasm4pm"`         |
| `run.id`             | `RequiredOtelAttributes.run.id`        |
| `config.hash`        | BLAKE3 of resolved config              |
| `input.hash`         | BLAKE3 of input event log              |
| `plan.hash`          | BLAKE3 of execution plan               |
| `execution.profile`  | `fast | balanced | quality | stream`   |
| `source.kind`        | `xes | csv | parquet | http | ...`     |
| `sink.kind`          | `petri_net | dfg | json | ...`         |

`service.name` is constant so all spans aggregate under one service in
Jaeger / Tempo. The remaining required attributes flow from
`RequiredOtelAttributes` and uniquely identify a run.

---

## ML — `ml.<task>`

Span emitted per ML task execution. `<task>` ∈
{`classify`, `cluster`, `forecast`, `anomaly`, `regress`, `pca`}.

| Attribute                       | Type    | When        | Meaning                                        |
|---------------------------------|---------|-------------|------------------------------------------------|
| `ml.task`                       | string  | both        | Task name (snake_case)                         |
| `ml.method`                     | string  | both        | Algorithm method (e.g. `knn`, `kmeans`)        |
| `ml.duration_ms`                | int     | completed   | Wall-clock duration                            |
| `ml.input.trace_count`          | int     | started     | Cases in input log                             |
| `ml.input.event_count`          | int     | started     | Total events                                   |
| `ml.parameter.k`                | int     | started     | Cluster / neighbor count                       |
| `ml.parameter.eps`              | number  | started     | DBSCAN ε                                       |
| `ml.parameter.n_components`     | int     | started     | PCA components                                 |
| `ml.parameter.forecast_periods` | int     | started     | Forecast horizon                               |
| `ml.confidence`                 | number  | completed   | Mean prediction confidence (0..1)              |
| `ml.feature_count`              | int     | completed   | Features used                                  |
| `ml.cluster_count`              | int     | completed   | Resulting clusters                             |
| `ml.anomaly_count`              | int     | completed   | Anomalies detected                             |
| `ml.r_squared`                  | number  | completed   | Regression R² (0..1)                           |

**Wired entry point:** `executeMlTask` in `apps/wasm4pm/src/ml-runner.ts`
auto-emits this span pair when an `instrumentation` option is supplied.

---

## RL — `rl.agent.decision`

Emitted on **every** action selection by an RL agent.

| Attribute                    | Type    | Meaning                                                   |
|------------------------------|---------|-----------------------------------------------------------|
| `rl.agent.type`              | string  | `QLearning | SARSA | DoubleQLearning | ExpectedSARSA | REINFORCE` |
| `rl.agent.id`                | string  | Stable id for this agent instance                         |
| `rl.action.selected`         | string  | Action name or index                                      |
| `rl.state.health_level`      | int     | 0..4 (Normal..Failed)                                     |
| `rl.state.circuit_state`     | string  | `Closed | HalfOpen | Open`                                |
| `rl.exploration.epsilon`     | number  | ε for ε-greedy (omitted if N/A)                           |
| `rl.exploration.is_explore`  | bool    | Was action exploratory?                                   |
| `rl.decision.duration_ms`    | int     | Time to select action                                     |

## RL — `rl.policy.update`

Emitted on every TD / Q update.

| Attribute                  | Type    | Meaning                              |
|----------------------------|---------|--------------------------------------|
| `rl.update.reward`         | number  | Scalar reward `r`                    |
| `rl.update.td_error`       | number  | δ = r + γ·V(s') − Q(s,a)             |
| `rl.update.q_before`       | number  | Q(s,a) prior to update               |
| `rl.update.q_after`        | number  | Q(s,a) after update                  |
| `rl.update.terminal`       | bool    | Was next-state terminal?             |
| `rl.convergence.delta`     | number  | `|q_after − q_before|`               |
| `rl.update.duration_ms`    | int     | Time to apply update                 |

**Convergence indicator:** `rl.convergence.delta` should trend → 0 over
training. A non-zero floor indicates either continued exploration or
non-stationary reward.

## RL — `rl.agent.switch`

Emitted when LinUCB selects a different agent.

| Attribute             | Type    | Meaning                              |
|-----------------------|---------|--------------------------------------|
| `rl.agent.from`       | string  | Previously active agent              |
| `rl.agent.to`         | string  | Newly selected agent                 |
| `rl.linucb.score`     | number  | UCB score for selected agent         |
| `rl.cycle.count`      | int     | Orchestrator cycle number            |

---

## Prediction — `prediction.<task>`

`<task>` ∈ {`next_activity`, `remaining_time`, `outcome`, `drift`,
`features`, `resource`}. Dashes in input task names are normalized to
underscores.

| Attribute                       | Type    | When        | Meaning                          |
|---------------------------------|---------|-------------|----------------------------------|
| `prediction.task`               | string  | both        | Task (snake_case)                |
| `prediction.input.trace_count`  | int     | started     | Cases in input                   |
| `prediction.input.event_count`  | int     | started     | Events in input                  |
| `prediction.top_k`              | int     | started     | k for next-activity beam search  |
| `prediction.ngram_order`        | int     | started     | n for n-gram                     |
| `prediction.output.count`       | int     | completed   | Predictions emitted              |
| `prediction.duration_ms`        | int     | completed   | Wall-clock                       |
| `error.code`                    | string  | error       | Error code from contracts        |

---

## Drift — `drift.check`

| Attribute              | Type   | When      | Meaning                                 |
|------------------------|--------|-----------|-----------------------------------------|
| `drift.method`         | string | both      | `ewma | jaccard_window | cusum | ...`   |
| `drift.window_size`    | int    | started   | Sliding window size                     |
| `drift.threshold`      | number | started   | Detection threshold                     |
| `drift.score`          | number | completed | Computed drift score                    |
| `drift.detected`       | bool   | completed | Whether score crossed threshold         |
| `drift.duration_ms`    | int    | completed | Wall-clock                              |

---

## Conformance — `conformance.check`

| Attribute                       | Type   | When      | Meaning                          |
|---------------------------------|--------|-----------|----------------------------------|
| `conformance.method`            | string | both      | `token_replay | alignments`      |
| `conformance.model_kind`        | string | started   | `petri_net | tree | dfg | ...`   |
| `conformance.trace_count`       | int    | started   | Traces being checked             |
| `conformance.fitness`           | number | completed | 0..1, **must be > 0.85**         |
| `conformance.precision`         | number | completed | 0..1                             |
| `conformance.generalization`    | number | completed | 0..1                             |
| `conformance.simplicity`        | number | completed | 0..1                             |
| `conformance.duration_ms`       | int    | completed | Wall-clock                       |
| `error.code`                    | string | error     | Error code                       |

---

## Conventions

1. **Naming.** Span names are dot-separated, lower-snake_case:
   `<domain>.<noun>[.<verb>]`. ML uses `ml.<task>`; RL uses
   `rl.<noun>.<verb>`; everything else `<domain>.<verb>`.
2. **Snake_case attributes.** Always; never camelCase.
3. **Status.** Started spans use `UNSET`; completed spans use `OK` or
   `ERROR`. Never omit the `status` field.
4. **Non-blocking.** All emit calls go through `try { emit(...) } catch
   {}` — exporter failures must never break user-facing execution
   (Toyota Production System fail-fast applies to user code, not OTEL).
5. **Required attrs.** Every span carries the eight `RequiredOtelAttributes`
   plus `service.name=wasm4pm`. Validate with
   `OtelCapture.assertRequiredAttributes(['run.id', 'config.hash', ...])`.
6. **Parent span.** Pass `parentSpanId` to root every ML/RL span under
   the enclosing `algorithm.<name>` or `engine.run` span.

## Testing

Use `OtelCapture` from `@wasm4pm/testing`:

```typescript
import { createOtelCapture } from '@wasm4pm/testing';
import { Instrumentation } from '@wasm4pm/observability';

const capture = createOtelCapture();
await Instrumentation.instrumentMlExecution(
  traceId, 'classify', 'knn', requiredAttrs,
  () => runMl(),
  (e) => capture.captureRaw(e as any),
);

expect(capture.findSpans(/^ml\./)).toHaveLength(2);
expect(capture.assertRequiredAttributes(['run.id', 'service.name'])).toEqual([]);
expect(capture.assertNonBlocking(50)).toEqual([]); // <50ms per span
```
