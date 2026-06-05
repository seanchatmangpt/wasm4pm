## 2026-06-05T10:42:49Z
You are a teamwork_preview_worker. Your working directory is `/Users/sac/wasm4pm/.agents/worker_git_cleanup/`.
Your task is to restore the repository files to their committed state, check that git status is clean, and run the authenticity and test verification suites.

Specifically:
1. Discard working tree changes to tracked files:
   `git restore RELEASE_CERTIFICATE.v26.5.29.json artifacts/release/ examples/out/`
2. Verify that `git status --short` is completely clean of any tracked file modifications (excluding untracked agent metadata folders).
3. Run the verifications on this clean committed state:
   - `NODE_OPTIONS="--experimental-wasm-modules" npm run release:verify-algorithm-behavior`
   - `NODE_OPTIONS="--experimental-wasm-modules" tsx scripts/release/verify-certificate-authenticity.ts`
   - `DYLD_FRAMEWORK_PATH=/Applications/Xcode.app/Contents/Developer/Library/Frameworks cargo test -p pm4py-lsp`
   - `DYLD_FRAMEWORK_PATH=/Applications/Xcode.app/Contents/Developer/Library/Frameworks cargo bench -p pm4py-lsp --no-run`
4. Confirm that all these checks pass.
5. Print/document the exact output of these verifications, the git HEAD commit (`git rev-parse HEAD`), and git status.
6. Provide a detailed handoff report in `/Users/sac/wasm4pm/.agents/worker_git_cleanup/handoff.md`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
