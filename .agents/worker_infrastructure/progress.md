# Progress Log

Last visited: 2026-06-10T22:33:50Z

- [x] Run `cargo test -p wasm4pm-cognition` to verify all current tests pass.
- [x] Edit `crates/wasm4pm-cognition/Cargo.toml` to add `rand` dependency.
- [x] Extract dispatch logic from `crates/wasm4pm-cognition/src/wasm.rs` (`dispatch_breed`) and `crates/wasm4pm-cognition/src/breeds/mod.rs` (`dispatch_breed_test`) to a new file `crates/wasm4pm-cognition/src/breeds/dispatch.rs`.
- [x] Define `BreedId::ALL` in `crates/wasm4pm-cognition/src/breeds/mod.rs`.
- [x] Implement exhaustiveness test in `tests/dispatch_smoke.rs`.
- [x] Extract model sources from `wasm.rs` into `crates/wasm4pm-cognition/src/ocel/model_sources.rs`.
- [x] Reconcile `crates/wasm4pm-cognition/breeds/registry.json`.
- [x] Add support module `crates/wasm4pm-cognition/src/breeds/support/` with `fact_keys.rs` and `rng.rs`.
- [x] Verify everything compiles and passes tests.
