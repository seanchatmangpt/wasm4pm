# GraphLaw cross-engine fixture vectors — naive_physics

Generated (do not hand-edit) by `/Users/sac/graphlaw/examples/naive_physics_vectors.rs`:

    cd /Users/sac/graphlaw
    cargo run --example naive_physics_vectors --features abi --release

Each vector translates the wasm4pm `naive_physics` breed's scene (np:* facts)
into a positive-Datalog program and runs GraphLaw's admitted Datalog authority
(PurRDF least fixpoint) over it. The generator cross-checks the Datalog result
against an independent reference fixpoint before writing.

## Vector fields

- `vector` — case id (`naive-physics-{paper,support-chain,spill,no-fall}`).
- `breed` — always `naive_physics`.
- `engine` — the executing authority string.
- `provenance` — Hayes 1979/1985 sources, the four named axioms, case note.
- `input.facts` — the breed-contract np:* facts (same shape as
  `tests/fixtures/papers/naive_physics.json`).
- `datalog.rules` — head/body triple patterns with `?var` variables
  (GraphLaw ABI `datalog` op shape).
- `datalog.facts` — EDB triples under `https://np.graphlaw.dev/`.
- `expected.falls` / `expected.spills` — sorted derived atoms.
- `expected.not_falls` — objects asserted stable (deriving a fall for one is a
  defect; over-derivation gate).
- `expected.value` — `verified` only after generator-side checks pass.

## Axiom -> rule encoding (see ENCODERS.md)

All four Hayes axioms are positive Horn clauses; removal is an event fact
(`np:remove`), never negation.
