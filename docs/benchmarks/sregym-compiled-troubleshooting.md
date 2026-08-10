# SREGym-Derived Compiled Troubleshooting Benchmark

## Purpose

This benchmark asks which recurring SRE reasoning steps should be compiled into deterministic process reasoning rather than paying for fresh LLM inference on every incident.

The source taxonomy is pinned to:

- upstream repository: `SREGym/SREGym`
- upstream revision: `ba07faf1a322f9b6d4a279643bb796aa2f36f64b`
- `Problem List.md` blob: `41f9e5d96c14be808a863cca4842cb3479863300`

The implementation derives troubleshooting archetypes from the public failure taxonomy. It does not copy SREGym solutions, grading logic, hidden state, or live environments.

## Chesterton boundary

SRE agents use language models because production failures can be novel, observations can be incomplete, and incident evidence can be unstructured. This benchmark does **not** eliminate that capability.

It asks where the opposite condition holds: the same causal topology appears repeatedly and can be represented as a finite diagnostic graph with structured evidence and an executable verifier. In that domain, re-invoking general intelligence for every episode is unnecessary work.

The admission rule is:

```text
structured evidence
AND finite/stable causal graph
AND bounded repair candidates
AND deterministic verifier
=> compile to wasm4pm

otherwise
=> FALLBACK (LLM / human / richer investigation)
```

`FALLBACK` is an admitted outcome, not benchmark failure.

## Troubleshooting calculus

```text
OBSERVE
  -> NORMALIZE
  -> ROUTE
  -> HYPOTHESIZE
  -> ELIMINATE
  -> CONSTRUCT REPAIR INTENT
  -> VERIFY
  -> ADMIT | REFUSE | FALLBACK
  -> RECEIPT
```

No stage acquires ambient actuation authority. `actuation=REFUSED` is invariant. A repair intent can later cross a separate BRCE boundary, but this benchmark does not perform DO.

## Highest-value compiled troubleshooting classes

| Class | Typical structured observations | Why it should usually be compiled |
|---|---|---|
| Scheduling / capacity | Pending pods, scheduler events, node allocatable resources, requests/limits, taints, affinity | Finite constraint satisfaction and explicit refusal reasons |
| Probe / restart loops | restart count, probe result, probe port/path, container state | Stable lifecycle state machine with deterministic checks |
| Service selector / endpoints | selectors, pod labels, EndpointSlices, targetPort | Graph/relational mismatch rather than open-ended reasoning |
| DNS / service discovery | DNS policy, CoreDNS config, lookup results, service/endpoints | Bounded dependency graph and reproducible probes |
| RBAC / credentials | verb/resource/namespace, role bindings, auth failures | Policy evaluation against explicit authority relations |
| Resource exhaustion | OOMKilled, CPU throttling, requests/limits, quotas | Numeric thresholds plus known state transitions |
| Storage / PVC / mount | PVC/PV state, access mode, node affinity, mount events, I/O errors | Finite storage attachment and permission state machines |
| Configuration / env / image | desired vs observed env/config/image/version | Direct diff and conformance problem |
| Queue / backpressure | lag, queue depth, service time, retry rate | Process-flow and Little's-Law style evidence once causal model is admitted |
| Network path | packet loss, routes, policy, conntrack, ports | Graph reachability plus bounded policy checks |
| Job / CronJob execution | schedule, concurrency policy, completions, backoff, pod outcome | Deterministic workflow lifecycle |
| Deployment / rollout | replicas, availability, surge/unavailable, image, readiness | Explicit rollout state machine and invariants |

## Where LLM reasoning remains valuable

Do not compile an issue merely because it has appeared once. Prefer fallback when the causal graph itself is uncertain, the evidence is predominantly semantic/unstructured, the repair requires new code/design, multiple subsystems have unknown coupling, or the verifier cannot distinguish a true repair from a plausible explanation.

SREGym explicitly includes metastable failures, concurrent failures, OS-level faults, and simulations of real production outages. These are useful adversarial examples for the fallback frontier: once a causal mechanism becomes stable and independently verifiable, it can graduate from fallback into the compiled graph.

## Benchmark families

The executable `wasm4pm/examples/sregym_issue_reasoning.rs` contains five families:

1. `symptom_to_diagnostic_route` — structured observations to a bounded diagnostic graph.
2. `hypothesis_elimination` — evidence eliminates incompatible causes before selection.
3. `compiled_known_troubleshooting` — known patterns execute without a fresh intelligence step.
4. `llm_fallback_boundary` — uncertain/metastable archetypes remain explicitly unresolved by the compiled graph.
5. `issue_reasoning_end_to_end` — observe through receipt as one bounded episode.

The direct execution constitution is **30,501,000 episodes** and **244,008,000 diagnostic transitions**, with a 10,000,000-episode routing flagship and 5,000,000-episode compiled/end-to-end rows.

## Metrics

### Evidence-Bound Troubleshooting Episodes per second

\[
EBTE/s = \frac{N_{episodes}}{T}
\]

### Hypothesis Elimination Rate

\[
HER = \frac{N_{hypotheses\ eliminated}}{T}
\]

### Diagnostic Transition Throughput

\[
DTT = \frac{N_{diagnostic\ transitions}}{T}
\]

### Compiled Troubleshooting Coverage

For an independently replayed issue corpus:

\[
CTC = \frac{|episodes\ resolved\ by\ admitted\ compiled\ graph|}{|eligible\ issue\ episodes|}
\]

The current stress benchmark measures the execution mechanics needed for CTC but does **not** claim solve-rate coverage over SREGym's live benchmark. A future matched SREGym experiment must actually run each problem through the compiled diagnostic graph and compare outcomes to the benchmark's independent verifier.

### LLM Avoidance Opportunity

After a matched live corpus exists:

\[
LAO = \frac{|episodes\ with\ sufficient\ compiled\ evidence|}{|all\ episodes|}
\]

This quantity may support an inference-cost comparison, but no token/cost savings are claimed until an LLM baseline is executed against the same problem set and success criterion.

## Claim discipline

The present benchmark proves deterministic diagnostic-graph execution, hypothesis elimination accounting, typed fallback/refusal, receipt manufacture and performance at the recorded exact head.

It does not prove:

- SREGym solve rate;
- superiority to a particular LLM;
- real incident MTTR reduction;
- production repair safety;
- engineer replacement;
- autonomous actuation.

Those require matched live-system experiments. The intended next crown is a differential court:

```text
same SREGym problem
x same initial world
x compiled wasm4pm diagnostic graph
x LLM agent baseline
x independent SREGym verifier
-> accuracy / latency / token cost / evidence / fallback receipt
```

That experiment would locate the empirical boundary where general-purpose cognition is unnecessary for known troubleshooting patterns.
