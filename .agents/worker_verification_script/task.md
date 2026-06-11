# Task: Create Master Verification & Replay Determinism Script

## Objective
Write a master verification runner script `examples/cognition/verify-all.sh` (or `verify-determinism.sh`) that executes all 52 cognition breed examples and the E2E factory chain, verifying replay determinism, receipt authenticity, and chain linkage.

## Requirements
1. **Replay Determinism**:
   - For each of the 52 breeds, run the breed example twice with identical input.
   - Assert bit-exact output equality (replay determinism) between the two runs. Specifically, compare the generated `result.json` from the two runs, verifying that the `output_hash`, `replay_pointer`, and `output` object are identical.
2. **Receipt Verification**:
   - Verify all generated receipts using `node apps/wasm4pm/dist/bin/wpm.js cognition verify --receipt <path_to_receipt>` or equivalent validation command.
   - Assert that there are no empty, placeholder, or fake receipt hashes (hashes must be valid BLAKE3 hashes).
3. **Chain Linkage**:
   - Run the E2E chain `examples/cognition/chains/factory-agent/chain.sh` (which chains all 52 breeds).
   - Parse the stage results under `examples/cognition/chains/factory-agent/stages/` and verify that the hashes link correctly: `prev_hash` of stage N matches the `combined_hash` of stage N-1.
4. **Script Location**:
   - The master script should be written to `examples/cognition/verify-all.sh`.
   - Running `bash examples/cognition/verify-all.sh` should execute all checks and exit with code 0 if everything is correct, or non-zero if there's any failure.
5. **Execution**:
   - Write the script, execute it, capture the outputs, and stage the script to git.
   - Write your findings to `handoff.md`.
