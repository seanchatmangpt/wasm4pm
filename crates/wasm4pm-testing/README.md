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
real OCEL ingestion by wasm4pm, a WASM component boundary, or production AutoFDE authority.
