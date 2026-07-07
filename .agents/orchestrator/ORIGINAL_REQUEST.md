# Original User Request

## 2026-07-05T03:05:10Z

You are the Project Orchestrator (archetype: teamwork_preview_orchestrator). Your working directory is /Users/sac/wasm4pm/.agents/orchestrator/ and the project workspace is /Users/sac/wasm4pm.
Your task is to orchestrate the verification, validation, and refactoring of all 60 algorithms in the kernel and 55 cognitive breeds in the cognition package using a 5x7 Per-Item Maturity Ledger as specified in the authoritative request file: /Users/sac/wasm4pm/ORIGINAL_REQUEST.md.

Specifically:
1. Initialize the ledger file `ALGORITHM_AND_BREED_STATUS.md` in the project root.
2. Initialize plan.md, progress.md, and context.md in your working directory (/Users/sac/wasm4pm/.agents/orchestrator/).
3. Maintain clean execution and high standards, conforming to the AGENTS.md rules.
4. Delegate work to specialist subagents (e.g. workers, reviewers, challengers) as needed.
5. Continuously update your plan.md and progress.md.
6. When all 115 items in the ledger are fully closed (D7 complete, status VALID/FIXED/REFACTORED/TEST_ADDED/UNSUPPORTED/BLOCKED/BUILD_BROKEN), report completion to the Sentinel.

Good luck!

## 2026-07-06T01:01:00Z

You are the Project Orchestrator for the wasm4pm integration testing mission.
Your task is to implement a comprehensive integration test suite for the wasm4pm global case study (Project Omni-Route) using all core testing paradigms from chicago-tdd-tools.

Workspaces involved:
1. wasm4pm: /Users/sac/wasm4pm
2. chicago-tdd-tools: /Users/sac/chicago-tdd-tools
Integrity mode: demo

Specifically:
1. Edit `/Users/sac/chicago-tdd-tools/Cargo.toml` to add `wasm4pm` and `wasm4pm-cognition` as dev-dependencies.
2. Implement a new integration test file at `/Users/sac/chicago-tdd-tools/tests/global_case_study_integration.rs` validating the Project Omni-Route case study phases across:
   - Synchronous Test (`test!`)
   - Async Test (`async_test!`)
   - Fixture Test (`fixture_test!`)
   - Performance Test (`performance_test!`)
   - Property-based Test (using PropertyTestGenerator)
   - Mutation Test (using MutationTester)
   - Concurrency Test
   - OCEL Logging (via OcelCollector)
3. Ensure no unwrap or panic calls in the helper paths.
4. Run `cargo test --test global_case_study_integration` and check that it compiles and passes with zero warnings.
5. Run clippy and check for clean results.

Create your agent directory at `/Users/sac/wasm4pm/.agents/orchestrator` if it doesn't already exist, write your plan.md, progress.md, and context.md files there, and manage the specialists to complete the tasks. Make sure to update your progress.md periodically. Report completion when done.
