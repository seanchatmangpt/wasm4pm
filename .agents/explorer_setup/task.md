# Task: Swarm Setup and Workspace Validation

## Objective
Verify the build status of the workspace, locate the `wpm` CLI, check which cognition breeds are already implemented or compiled in WASM, and confirm that we can execute them.

## Action Items
1. Run `cargo check` and `cargo test` on the Rust workspace to ensure it builds.
2. Build/locate the `wpm` CLI and verify it runs. E.g. check `pnpm build:cli` or test `node apps/wasm4pm/dist/bin/wpm.js`.
3. Check the version of the package.
4. Verify that running a test command like `node apps/wasm4pm/dist/bin/wpm.js cognition run --contract cbr --input examples/cognition/cbr/intent.json` works and produces the expected outputs.
5. Create a report in your directory documenting your findings and verifying the path to the CLI and the exact commands we should use.
