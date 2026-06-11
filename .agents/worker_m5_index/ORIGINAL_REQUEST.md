## 2026-06-11T17:57:02Z
You are a worker tasked with executing Milestone 5: Generate the `docs/reference/reviews/INDEX.md` index file and perform verification checks.
Your working directory is `/Users/sac/wasm4pm/.agents/worker_m5_index/`.

Here are your steps:
1. Initialize `BRIEFING.md`, `ORIGINAL_REQUEST.md`, and `progress.md` inside your working directory `/Users/sac/wasm4pm/.agents/worker_m5_index/`.
2. Inspect the generated reviews directory `/Users/sac/wasm4pm/docs/reference/reviews/`.
3. Read the mapping file `/Users/sac/wasm4pm/.agents/explorer_m1/algorithm_mapping.json`.
4. Ensure that exactly 60 markdown review files exist (one for each of the 60 algorithms).
5. For each review file, perform verification to make sure it contains no stubs, placeholders, or TODOs, and that it has real, meaningful correctness audits and optimization suggestions based on the actual codebase.
6. Create an index file `docs/reference/reviews/INDEX.md` containing:
   - A title: `# Algorithm Reviews Index`
   - A brief introductory explanation.
   - A structured markdown table or list of all 60 algorithms.
   - For each algorithm in the table/list, provide:
     - Algorithm ID (with a working relative link to its `<algorithm_id>.md` file).
     - Category/Domain.
     - Brief one-sentence summary of the main finding/improvement recommendation in the review.
7. Run `cargo check` and `cargo test --lib --workspace` in `/Users/sac/wasm4pm` to verify workspace health.
8. Write a detailed handoff report `handoff.md` in your working directory outlining all findings and listing the files verified.
9. Send a message back to the orchestrator (conversation ID: dd2e0ea8-127c-4007-9fbb-9a5857696a87) when done.
