# Task: Run E2E Breed Chain and Verify

## Objective
Run the 52-stage sequential breed chain defined under `examples/cognition/chains/factory-agent/chain.sh` and verify that every stage executes successfully, producing a valid receipt and JSON output.

## Instructions
1. Run the script:
   ```bash
   bash examples/cognition/chains/factory-agent/chain.sh
   ```
2. Verify that all 52 stages execute successfully and the output ends with:
   `=== Chain complete: 52/52 stages ok ===`
3. Document the output of the chain execution, the output hashes, and write your findings to `handoff.md`.
