## 2026-06-10T23:44:48-07:00

You are a developer worker. Your working directory is `/Users/sac/wasm4pm/.agents/teamwork_preview_worker_doc_alignment`.
Your mission is to update the documentation files (`README.md`, `docs/registry/certified-breeds-2026-06.md`, `docs/implementation-status.md`, `check_docs.js`) and any outdated files under `docs/breeds/*` as follows:

1. **Update `README.md`**:
   - In the introductory sentence (line 3), change "13 Old-AI cognition breeds" to "39 Old-AI cognition breeds".
   - In the "## Cognition (Old AI)" section, update the text to state that there are 39 implemented/admitted breeds running natively in Rust.
   - Update the table of breeds in the README.md to represent the 39 implemented/admitted breeds (you can list all 39 or group them cleanly, but make sure the text correctly specifies the total count of 39 implemented/admitted breeds).

2. **Update `docs/registry/certified-breeds-2026-06.md`**:
   - Update it to include all 39 implemented breeds as ADMITTED.
   - List the remaining 13 classic/autoinstinct breeds (eliza, cbr, dendral, strips, prolog, mycin, gps, soar, hearsay, autoinstinct_neurosis, autoinstinct_semantics, autoinstinct_vision, autoinstinct_learning) as PARTIAL_ALIVE or UNSUPPORTED.
   - The total defined breeds in the registry should sum to 52.
   - Update the summary sections and totals accordingly (e.g. "Registry totals: 39 implemented (39 ADMITTED, 13 PARTIAL_ALIVE) | 52 total defined").
   - Align the git commit hash/references with the v26.6.10 details (e.g. version v26.6.10).

3. **Update `docs/implementation-status.md`**:
   - Update table entries (especially G4 OCEL Gate and WS D OCEL L1) to reflect that all 39/52 breeds have L0 + L1 spans, OCPN models, and fitness replay at 1.0.
   - Align version metrics with the v26.6.10 changes.

4. **Update `check_docs.js`**:
   - Update the `breeds` array in `check_docs.js` to include all 52 breed IDs from `packages/cognition/src/schemas.ts` (the 33 previously listed + the 13 classic ones + the 6 new ones tableaux, construction_grammar, markov_logic, pomdp, contingent_plan, meta_reasoning) to ensure that the script checks all 52 breed files exist on disk.
   - Run `node check_docs.js` using `run_command` and verify it exits successfully with no output indicating missing files.

5. **Run test verification**:
   - Run `pnpm vitest run packages/cognition/src/__tests__/` and `cargo test --lib --workspace` to ensure all tests pass.
   - Run any lint/check scripts (e.g. `npm run docs:check` or similar).

IMPORTANT INTEGRITY WARNING: DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Handoff report `handoff.md` must be written to your working directory when you are done. Send a message to your parent (conversation ID: a8bbe02b-2028-4237-9948-5c881fad3414) when finished.
