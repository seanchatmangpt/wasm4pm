# wasm4pm-testing

`wasm4pm-testing` is a non-production Rust testkit for the integration boundary:

```text
GymAct receipts -> OCEL/object-centric evidence -> process oracle -> AutoFDE Lab
```

It intentionally carries **no actuation authority** and is isolated from the release workspace.
The crate supplies a small Gall-style lifecycle oracle and falsifiers that richer wasm4pm
implementations can be tested against before a production adapter is admitted.

## Modeled laws

- process conformance never grants authority;
- `discover` is registry inspection, not an episode transition;
- receipt predecessor/ordinal/episode drift is refused;
- GymAct lifecycle conformance remains independently checkable;
- two independent process oracles must agree or return
  `REFUSED:PROCESS_SEMANTIC_DIVERGENCE`;
- OCEL projection preserves multiple typed, qualified objects rather than flattening an episode
  to one case id;
- expected processes use explicit step identity and partial-order precedence, so independent
  steps may commute while repeated labels remain distinct;
- process evidence identity binds the exact subject, engine, model, dispositions, and replay;
- process evidence is neither a benchmark score nor a postcondition verifier.

## 2026-08-07 -> 2026-08-08 architecture court

`src/last_24h.rs` and `tests/last_24h_court.rs` turn the previous integration window into an
executable architectural court rather than a prose changelog. The modeled topology is:

```text
AutoFDE Lab --admitted capability--> ggen --digest-bound bundle--> AutoFDE
      ^                                                        |
      |                                                        |
      +----- process evidence <-- wasm4pm <-- receipts/OCEL <-- GymAct
```

The court encodes the strongest cross-repository patterns that emerged in that window:

- AutoFDE Lab explores, falsifies, and admits; it is not copied wholesale into production.
- ggen manufactures deterministic, exact-subject-bound capability bundles and generated
  customer/environment surfaces.
- AutoFDE remains a small handwritten production kernel plus promoted generated surfaces.
- GymAct owns bounded world interaction, authority-aware execution, independent observation,
  verification, receipts, and OCEL evidence.
- wasm4pm owns process evidence: conformance, POWL/process structure, quality dimensions,
  drift, remaining-time, handover, and replay analysis. Those results never grant DO authority.
- `SELECT` and `CONSTRUCT` remain candidate-producing lanes. Consequential `DO` requires BRCE
  plus an admitted execution grant.
- uncertain consequence follows `RECONCILE -> OBSERVE -> DECIDE`; blind retry is refused.
- `HOT` cognition is compilable only after empirical competitor closure and binds problem,
  planner, objective, environment, hardware, capability, policy, and selector identities;
  compiled routes remain candidate-only and carry no ambient authority.
- the Azure Closed Vertical Crown is conjunctive across production bootstrap, Lab extraction,
  ggen manufacture/promotion, live Azure authority, Terraform consequence, ingress/wiring,
  managed identity/RBAC, confidential evidence, RDFDelta/Knowledge Hooks, AgentSession/POWL,
  authority envelopes, independent verification, OCEL, replay/replanning, and deterministic
  cleanup/orphan sweep.
- registry/catalog presence is not source materialization: ontology, schema, knowledge catalog,
  and protocol kinds remain distinct and external bytes stay below `ALIVE` until pinned and
  executed through their validation boundary.
- technical evidence, authenticated evidence, and customer adoption are separate standings.
- a draft PR or queued workflow is publication metadata, not exact-subject execution evidence.

`last_24h_innovation_index()` records the observed PR subjects used to reconstruct this court
across AutoFDE Lab, GymAct, ggen, and wasm4pm. Index membership is provenance only; it never
promotes the referenced subject's runtime standing.

## Intended adapters

The crate models the stable test contract. Production and experimental adapters may later bind:

```text
LifecycleOracle                    small local Gall oracle
Wasm4pmProcessOracle               real wasm4pm OCEL/POWL oracle
DifferentialOracle                 fail-closed comparison
AutoFDE Lab process court          deviation/drift/self-play consumer
```

A wasm4pm-backed adapter must bind exact engine/WASM/model identities and must not convert a
wasm4pm refusal into success. A missing optional process runtime is `UNSUPPORTED`/`BLOCKED`; it
does not make the GymAct core unavailable.

## Focused verification

```bash
cargo test --manifest-path crates/wasm4pm-testing/Cargo.toml
cargo fmt --manifest-path crates/wasm4pm-testing/Cargo.toml -- --check
cargo clippy --manifest-path crates/wasm4pm-testing/Cargo.toml --all-targets -- -D warnings
```

The repository workflow `.github/workflows/gymact-process-testkit.yml` runs this isolated court.
Passing this crate proves the modeled contract only; it does not prove real GymAct execution,
real OCEL ingestion by wasm4pm, a WASM component boundary, production AutoFDE authority, or the
Azure Closed Vertical Crown.
