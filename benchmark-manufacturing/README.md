# DSPy → ggen Cognition Benchmark Manufacturing

This directory is a source/manufacturing boundary, not a `generated/` tree.

## Calculus

`BreedId::ALL → DSPy SELECT → deterministic admission → O* / RDF law → ggen CONSTRUCT → canonical Divan + contract + docs → Rust execution → receipt`

### SELECT — DSPy

`dspy_program.py` exposes a model-backed benchmark-design program. DSPy may propose stronger batch/context scales, measurement surfaces, and falsifiers, but its prediction has **no execution authority**. `admit_candidate()` independently refuses inventory drift, weak scale ladders, missing surfaces, or weak falsifiers. `candidate.json` is the replay fixture for that membrane.

### ADMIT

`O.star.toml` is the admitted observation carrier. `ontology.ttl` is the ggen-readable canonical graph. A change is not admitted merely because DSPy proposed it; the reviewed contract/graph must change explicitly.

### CONSTRUCT — ggen

`ggen.toml` reads `ontology.ttl`, runs `gates/constitution.rq`, and projects directly into canonical repository paths:

- `crates/wasm4pm-cognition/benches/cognition_divan.rs`
- `crates/wasm4pm-cognition/tests/divan_benchmark_contract.rs`
- `docs/benchmarks/cognition-manufacturing.md`

There is intentionally no `generated/` directory or hand-maintained generated namespace. The repository surfaces are projections; source law lives here.

### VERIFY

The manufacturing workflow must:

1. replay the deterministic DSPy admission membrane;
2. build pinned `seanchatmangpt/ggen@e9298d4dbb1a22329e8aee4c8e2d622c25c72223`;
3. execute ggen against this manifest;
4. compile and execute the cognition benchmark contract;
5. run the Divan matrix;
6. verify the expected 55-breed/660-measurement constitution and emit exact-head evidence.

A DSPy prediction, ggen plan, rendered file, queued workflow, or benchmark label is not an execution receipt.

`SELECT != CONSTRUCT != DO`; benchmark actuation is always `REFUSED`.
