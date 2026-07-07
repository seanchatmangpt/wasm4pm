# Integration Test Plan: Project Omni-Route

## Goal
Implement a comprehensive integration test suite for the wasm4pm global case study (Project Omni-Route) using all core testing paradigms from `chicago-tdd-tools`.

## Workspaces
- `wasm4pm`: `/Users/sac/wasm4pm`
- `chicago-tdd-tools`: `/Users/sac/chicago-tdd-tools`

## Steps / Milestones
1. **Explore & Analyze**:
   - Investigate `chicago-tdd-tools` dependency and testing paradigms (macros, modules, testing types: Sync, Async, Fixture, Performance, Property, Mutation, Concurrency, OCEL Logging).
   - Investigate `wasm4pm` and `wasm4pm-cognition` dependencies (where they are located, how they are structured, what APIs/phases are in Project Omni-Route).
2. **Configure Cargo.toml**:
   - Edit `/Users/sac/chicago-tdd-tools/Cargo.toml` to add `wasm4pm` and `wasm4pm-cognition` as dev-dependencies.
3. **Implement Integration Test File**:
   - Create `/Users/sac/chicago-tdd-tools/tests/global_case_study_integration.rs`.
   - Validate Project Omni-Route case study phases.
   - Use:
     - `test!`
     - `async_test!`
     - `fixture_test!`
     - `performance_test!`
     - `PropertyTestGenerator`
     - `MutationTester`
     - Concurrency Test
     - `OcelCollector`
   - Ensure no `unwrap` or `panic` calls in helper paths (use `Result` and propagate errors).
4. **Build, Test, and Verify**:
   - Run `cargo test --test global_case_study_integration` and check compilation, passes, zero warnings.
   - Run `cargo clippy --test global_case_study_integration` (or clippy on the test package) to ensure clean results.
