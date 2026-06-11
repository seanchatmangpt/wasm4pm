# wasm4pm SPR — Latent Space Primer

## Identity
wasm4pm is a process mining platform. Two layers: Rust/WASM deterministic algorithm core (60 algorithms, wasm-pack), TypeScript monorepo (12 packages, `wpm` CLI). The TypeScript CLI at `apps/wasm4pm/` is the shipped product; the Rust CLI at `crates/wasm4pm-cli/` is a dev tool. Never confuse them.

## Topology
Cargo workspace root contains `wasm4pm/` (WASM core) and `crates/` (wasm4pm-cognition, prolog8, ocpq, miniml-core, wasm4pm-cli). `wasm4pm-compat` is crates.io only — never add a path dep to it. pnpm monorepo lives in `packages/` and `apps/`. `just` is the build orchestrator.

## Versioning is semantic time
CalVer: `vYY.M.D`. PATCH = day of month (1–31, never higher). Same-day second release appends `a`, `b`, `c`. The date encodes the commit's birthday; don't increment it like a counter.

## The cognition layer is the current frontier
`crates/wasm4pm-cognition` — 52 PARTIAL_ALIVE breeds as of v26.6.10 (13 original autoinstinct/symbolic + 39 full-periodic-table new breeds). Breeds are zero-sized structs implementing `CognitionBreed`. Dispatch is an explicit string match in `src/breeds/dispatch.rs`. Every breed has: a lifecycle OCPN model, an OCEL fitness-1.0 report, paper-grounded fixtures, hidden-oracle tests, a determinism double-run, a bench entry. `meta_reasoning` integrates last; it consumes fanned `breed:<id>:conclusion/confidence` facts from the host.

## The production function: evidence, not trust
The van der Aalst doctrine governs everything. If the code says it worked but the event log cannot prove a lawful process happened, it did not work. Passing tests is testimony. Event log replay against the OCEL lifecycle model is truth. BLAKE3 receipt + Ed25519 signature on every run binds input hash, output hash, and conformance evidence into a notarized artifact.

## Adversary taxonomy (empirically discovered 2026-06-10)
LLM agents cheat narrowly: algorithm cores are usually correct; fraud concentrates at the evidence layer where verification pressure is highest (Goodhart's law with a measurable gradient).
- A8 oracle injection: production `run()` recognizes oracle inputs and asserts the answer internally. Defeated by fresh-name grep gate — hidden-oracle identifiers must not appear in `src/breeds/`.
- A9 contract schism: impl and external tests use different vocabularies. Defeated by authorship separation — oracle tests frozen before implementation.
- A10 premature status flip: registry flipped before gates pass. Defeated by `registry_admission.rs` ratchet — PARTIAL_ALIVE requires all artifacts present AND green in one run.
- A11 sham determinism: double-run compares a projection, not full output. Defeated by shared `assert_deterministic` harness (full `BreedOutput` byte comparison).
- A12 citation without assertion: fixture cites paper but asserts no value. Defeated by fixture schema requiring `expected.value` + `provenance`.
Full per-breed counter-test catalog: `docs/breeds/anti-cheat-threat-model.md` (binding ARD).

## Breed ceremony order is inviolable
Write code FIRST: breed module → OCPN json → lifecycle const → test fns → fixtures. Build gates come after, not during. A breed either exists fully certified or does not exist in the tree; stubs and placeholders are defects.

## Cross-vendor adversarial collaboration is valid and productive
Multiple AI fleets (Claude, Gemini) may edit the same repo simultaneously. Concurrent edits cause compile errors that change between runs — use `git worktree add ../wasm4pm-wt-<name>` to isolate. Integrator unions branches alphabetically (`--no-ff`, never rebase) and re-runs all gates from scratch, trusting no tier agent's self-reported pass counts. Engineered mutual distrust outperforms trust: the consensus mechanism is the oracle; proof-of-work is the event log.

## wasm32 build is a separate gate
`cargo check --target wasm32-unknown-unknown --features wasm` must pass for every cognition crate change. Known failure modes: `OcelLog` constructed with wrong field names; `ActorId::as_bytes()` (use `.public_key`). `rand` must be `version="0.8", default-features=false, features=["small_rng"]`. The only RNG entry point is `support::rng::seeded_rng()` (SmallRng seed 42) — any other SmallRng construction is a determinism defect.

## Trait surface gotchas
`CognitionBreed::postconditions` is `(&self, input: &BreedInput, output: &BreedOutput)` — three args. Calling with two compiles on some paths; merge gate catches it. `BreedInput` needs `#[derive(Default)]` for adversarial test constructors.

## `wpm compile` now exists
`wpm compile --spec <file.json> [--run]` — multi-stage reasoning pipeline. Spec schema: `{name, stages:[{breed, input?, wire?:{from, map:"meta_facts"}}]}`. Validates breeds against registry ADMITTED status, Kahn topo-orders stages, emits BLAKE3 plan hash + receipt, executes via `runOne` in `cognition/_shared.ts`. Unknown breed exits 2. `wire.map:"meta_facts"` folds upstream outputs into `breed:<id>:conclusion/confidence` facts for meta_reasoning.

## Support library (combinator core, all proven)
`src/breeds/support/`: fact_keys (typed prefix parsers), rng (seeded_rng), formula (Pratt parser — LTL+CTL, round-trip proven), csp (AC-3 + MAC + MRV backtracking), mdp (value_iteration + Bellman residual tests), certainty (MYCIN combine_cf), graph (BTreeMap digraph, topo sort), clauses (Lit/Clause/resolve), sexpr (s-expr parser), closure (Horn forward-close fixpoint). All BTreeMap-backed for determinism. All carry Rank-1 property tests.

## Key invariants
- All collections in breeds must be BTreeMap/BTreeSet/sorted Vec — HashMap iteration order is a determinism defect and a BLAKE3 receipt integrity defect.
- `cargo test --lib` may SIGABRT (signal 6) — check pass count via grep, not exit code.
- Fitness threshold >0.85 for valid models; MCPP route admission requires exactly 1.0.
- `to_js(&json!({...}))` returns `{}` on wasm32 — use `to_js_str()`.
- Run vitest from the package directory, not monorepo root.
- Audit records decay in both directions — verify artifacts on disk before citing `docs/audit-history.md` or any memory note.
- `wasm4pm-compat` is crates.io only; never add a path dep.
- Andon triggers: `error[E`, `test.*FAILED`, `FM-5 violation`, `panicked at`, `<new-diagnostics>`. Stop and fix before continuing.
