## 2026-06-05T10:18:09Z

You are a teamwork_preview_worker. Your working directory is `/Users/sac/wasm4pm/.agents/worker_final_verify/`.
Your task is to perform the final release checks and clean up the repository state.

Specifically:
1. Run the full release verification command to see if the current state passes:
   `npm run release:full`
2. If it passes, stage and commit the modified `RELEASE_CERTIFICATE.v26.5.29.json` using explicit git paths:
   `git add RELEASE_CERTIFICATE.v26.5.29.json`
   `git commit -m "chore(release): update release certificate for v26.5.29"`
3. Retrieve the final HEAD commit hash:
   `git rev-parse HEAD`
4. Run the verification scripts again on the clean committed state to ensure zero regression:
   - `npm run release:full`
   - `DYLD_FRAMEWORK_PATH=/Applications/Xcode.app/Contents/Developer/Library/Frameworks cargo test -p pm4py-lsp`
   - `DYLD_FRAMEWORK_PATH=/Applications/Xcode.app/Contents/Developer/Library/Frameworks cargo bench -p pm4py-lsp --no-run`
5. Print/document the exact output of these verifications, the git HEAD commit, and git status.
6. Provide a detailed handoff report in `/Users/sac/wasm4pm/.agents/worker_final_verify/handoff.md`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
