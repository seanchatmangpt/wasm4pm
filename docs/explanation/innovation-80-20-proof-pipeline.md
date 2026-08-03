<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/explanation/innovation-80-20-proof-pipeline.md; reason: executable 80/20 innovation audit and selected composition closure -->

# 80/20 innovation audit: proof-carrying pipelines

## Decision

The highest-leverage innovation gap was not another algorithm. The current release evidence already maps the algorithm registry to kernel dispatch and required WASM exports. The missing product primitive was a trustworthy composition root that turns those capabilities into one resumable, inspectable execution.

This change manufactures that primitive without adding another top-level command or parallel framework.

## Scoring method

Each gap was ranked from 1–5 on user impact, reuse of existing capabilities, implementation leverage, and evidence risk. Priority is:

```text
(user impact × reuse × leverage) ÷ evidence risk
```

| Gap | Impact | Reuse | Leverage | Risk | Priority | Decision |
|---|---:|---:|---:|---:|---:|---|
| Deterministic pipeline identity | 5 | 5 | 5 | 1 | 125 | Close now |
| Real checkpoint resume | 5 | 5 | 5 | 2 | 62.5 | Close now |
| Arguments bound into receipt chain | 5 | 5 | 5 | 2 | 62.5 | Close now |
| Pending receipt before actuation | 5 | 4 | 5 | 2 | 50 | Close now |
| Atomic, tamper-evident execution bundle | 5 | 5 | 4 | 2 | 50 | Close now |
| Recursive DAG output references | 4 | 5 | 4 | 1 | 80 | Close now |
| New algorithm families | 3 | 2 | 1 | 4 | 1.5 | Defer |
| New dashboard or UI | 3 | 3 | 2 | 4 | 4.5 | Defer |
| Distributed scheduler | 4 | 3 | 2 | 5 | 4.8 | Defer |

## Observed gaps

### Plan identity depended on entropy

`engines/orchestrator/plan.ts` generated `planId` with `randomUUID()` and attached wall-clock creation time. The same semantic plan therefore had no stable identity for deduplication, checkpoint lookup, or comparison.

### Receipts did not bind the operation

The prior chain hashed the previous output plus `JSON.stringify(result)`. It did not bind the canonical plan, step index, noun, verb, or resolved arguments. Two different operations could therefore share the same chain edge when they happened to return the same result.

### Receipt persistence was explicitly best effort

A pipeline step could execute successfully while receipt persistence failed. The executor suppressed that failure and could still return success, violating the repository's zero-unreceipted-actuation doctrine.

### Resume did not resume

`wpm pipeline resume` only displayed `.wasm4pm/receipts/latest.json`. The orchestrator did not persist sufficient state to continue execution.

### References were shallow

Only top-level string arguments supported `@{step.path}` substitution. References inside nested configuration objects or arrays remained unresolved.

## Manufactured closure

### Deterministic plan identity

A canonical plan projection is hashed into `planHash`; `planId` is derived from that hash. Creation time remains metadata and does not affect identity.

### Proof-carrying step edges

Every edge binds:

- plan hash;
- step index and identity;
- noun and verb;
- canonical resolved-argument hash;
- previous chain hash;
- canonical result or error hash.

### Broker-style receipt sequence

The executor writes a pending receipt before dispatch. If that write fails, the step does not actuate. After dispatch it requires an outcome receipt; an outcome-write failure is classified as blocked and cannot be crowned successful.

### Atomic pipeline bundle

Every transition updates an atomic bundle under `.wasm4pm/pipelines/`. The bundle contains the admitted plan, completed results, receipt paths, terminal chain hash, typed standing, and a self-verifying evidence hash. A rolling `latest.json` supports operator recovery.

### Actual resume

`wpm pipeline resume` verifies the latest bundle, preserves the successful prefix, retries the failed or missing suffix, and writes a new verified checkpoint after every transition. A completed bundle is verified without additional actuation.

### Recursive references

`@{step.path}` references are now resolved recursively through objects and arrays.

## Standing

The authored calculus is `PARTIAL_ALIVE` until full repository CI executes against the exact PR head. The isolated strict TypeScript capsule and runtime harness prove:

- deterministic plan identity;
- partial checkpoint manufacture;
- successful-prefix preservation;
- failed-step retry;
- terminal `ALIVE` standing after resume;
- bundle tamper rejection;
- recursive reference resolution;
- duplicate-step refusal.

No claim is made here that the full Rust/WASM workspace, package build, or GitHub Actions passed before those boundaries execute.
