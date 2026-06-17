## 2026-06-11T03:25:37Z
You are a read-only exploration agent. Your working directory is /Users/sac/wasm4pm/.agents/teamwork_preview_explorer_verification.
Your task is to:
1. Run `cargo test -p wasm4pm-cognition` in `/Users/sac/wasm4pm` and check the results.
2. Rebuild the WASM module via `wasm-pack build --target nodejs --out-dir pkg -- --features wasm` in `/Users/sac/wasm4pm/crates/wasm4pm-cognition`.
3. Run `pnpm --filter @wasm4pm/cognition test` in `/Users/sac/wasm4pm` to check the TypeScript tests.
4. Run release verification commands like `pnpm run release:full` or `release:verify-algorithm-behavior` or `examples:gate` if applicable, and report their outcomes.
5. Scan the implementation files in `crates/wasm4pm-cognition/src/breeds/` for any placeholders, TODOs, stubs, or empty trace returns, particularly for Tier P2, P3, and P4 breeds.
6. Provide a detailed report of passing/failing tests, incomplete code, or missing verification artifacts.
Write your findings to `/Users/sac/wasm4pm/.agents/teamwork_preview_explorer_verification/handoff.md` and notify the parent via `send_message` with the absolute path of your handoff.md.
