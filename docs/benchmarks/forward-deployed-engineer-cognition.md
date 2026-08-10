# Forward-Deployed Engineer Cognition Benchmark

This rail measures a deterministic simulation of bounded forward-deployed engineering cognition over deployed-enterprise incident and change envelopes.

It does **not** claim to measure human thought, human engineer productivity, LLM inference, real customer incidents, or external system actuation.

## Cognition graph

Every simulated episode executes the same bounded cognition graph:

```text
OBSERVE
  -> ROUTE
  -> HYPOTHESIZE
  -> TEST
  -> CONSTRUCT
  -> VERIFY
  -> ADMIT / REFUSE
  -> RECEIPT
```

Known patterns may take a compiled hook path. The hook manufactures a candidate intent only; it never acquires ambient execution authority. Every benchmark subject records `actuation=REFUSED`.

## Enterprise dimensions

The simulation spans deterministic combinations of:

- tenant;
- region;
- site;
- service;
- incident class;
- jurisdiction;
- control family;
- change window.

The checked-in `wasm4pm/bench_data/receipt.xes` evidence bytes seed the benchmark identity. Incident/change envelopes themselves are deterministic simulations rather than claims about a real customer estate.

## Benchmark families

| Family | Question |
|---|---|
| Incident Hypothesis Portfolio | How quickly can a deployed observation become a bounded portfolio of testable hypotheses? |
| Repair Plan Search | How quickly can reversible repair candidates be constructed, verified, admitted/refused, and receipted? |
| Cross-Site Generalization | How cheaply can one evidence identity be evaluated across many bounded deployment contexts? |
| Compiled Known-Pattern Hook | What happens when known engineering patterns route without fresh intelligence while preserving zero ambient DO authority? |
| Forward-Deployed Engineer End-to-End | What is the throughput of the complete bounded cognition graph before any actuation boundary? |

## Direct execution scale

The rail directly executes at least:

- **20,000,000** simulated engineering episodes;
- **160,000,000** cognition transitions;
- one **10,000,000-episode** end-to-end flagship row;
- one **5,000,000-episode** compiled-known-pattern row.

The exact counts, elapsed nanoseconds, hypotheses evaluated, known/search routes, admitted/refused standings, and BLAKE3 receipts are emitted as machine-readable `FDE_COGNITION_RESULT` records.

## Metrics

The directly measured metrics are:

```text
FDE episodes / second
engineering hypotheses evaluated / second
bounded cognition transitions / second
known-pattern routes / second
search routes / second
admitted and refused candidate plans
```

A cognition transition is one stage in the declared eight-stage benchmark graph. It is a benchmark unit, not a biological or psychological unit.

## Validation constitution

The GitHub Actions validator refuses promotion unless:

1. there is exactly one subject and one completion record;
2. all 13 required scale rows execute;
3. the 10,000,000-episode end-to-end row is present;
4. directly executed episodes are at least 20,000,000;
5. directly executed cognition transitions are at least 160,000,000;
6. every episode is classified into exactly one known-pattern or search route;
7. every episode ends admitted or refused;
8. every row contains a valid 64-hex receipt;
9. episode, hypothesis, and transition throughput are independently recomputed from raw nanoseconds within relative error `1e-6`;
10. both subject and completion retain `actuation=REFUSED`.

## Claim boundary

The strongest admissible claim is:

> wasm4pm can execute and receipt a declared deterministic model of forward-deployed engineering cognition at the observed exact-head rate.

It is **not** admissible to translate this automatically into “engineers replaced,” “human thoughts per second,” or “LLM calls avoided.” Those require separate empirical baselines executed against matched tasks and acceptance criteria.
