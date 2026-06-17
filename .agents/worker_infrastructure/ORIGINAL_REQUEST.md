## 2026-06-10T22:26:08Z

Objective: Implement Phase A (Batch 0: Infrastructure) for wasm4pm.
Your working directory is: `/Users/sac/wasm4pm/.agents/worker_infrastructure/`
Please do the following:
1. Run `cargo test -p wasm4pm-cognition` to verify all current tests pass.
2. Edit `crates/wasm4pm-cognition/Cargo.toml` to add `rand = { version = "0.8", default-features = false, features = ["small_rng"] }` as a dependency.
3. Extract dispatch logic from `crates/wasm4pm-cognition/src/wasm.rs` (`dispatch_breed`) and `crates/wasm4pm-cognition/src/breeds/mod.rs` (`dispatch_breed_test`) to a new file `crates/wasm4pm-cognition/src/breeds/dispatch.rs`.
   - Ensure the dispatch match arms are explicitly written (no placeholders, matching all 55 breeds).
   - Register this module in `src/breeds/mod.rs`.
4. In `crates/wasm4pm-cognition/src/breeds/mod.rs`, define `BreedId::ALL` constant containing all 55 breed IDs (both existing ones and the UNSUPPORTED ones).
5. Implement an exhaustiveness test in `tests/dispatch_smoke.rs` verifying that:
   - every `BreedId` Display value routes through `dispatch_breed` successfully (or returns the correct error/unsupported response) and matches `dispatch_breed_test`.
6. Extract model sources from `wasm.rs` `compute_model_hash` into `crates/wasm4pm-cognition/src/ocel/model_sources.rs` (if any are still inline).
7. Reconcile `crates/wasm4pm-cognition/breeds/registry.json`:
   - Verify that all 55 breed IDs are present in the registry.
   - Rename placeholders to canonical PRD names:
     `bayesian` -> `bayesian_network`
     `fuzzy` -> `fuzzy_logic`
     `constraint` -> `csp_ac3`
     `temporal` -> `allen_temporal`
     `abductive` -> `abductive_lp`
     `inductive` -> `ilp`
     `ontological` -> `description_logic`
     `analogical` -> `analogy_sme`
     `dempster_shafer` keeps its id.
   - Make sure all the newly added 42 breeds have status "UNSUPPORTED" in the registry.
8. Add a support module `crates/wasm4pm-cognition/src/breeds/support/` and implement:
   - `fact_keys.rs` — typed parsers for prefixes (`prob:`, `constraint:`, `ltl:`, `domain:`, `fuzzy:`, `temporal:`, `interval:`, `bpa:`, `frame:`, `cpt:`, `evidence:`) with property tests.
   - `rng.rs` — `seeded_rng() -> SmallRng::seed_from_u64(42)` using `rand::SeedableRng`.
9. Ensure everything compiles and all tests pass (`cargo test -p wasm4pm-cognition`).
