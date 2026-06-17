# Task: Forensic Integrity Audit

## Objective
Run a complete forensic integrity audit on the `wasm4pm` codebase, validating that all implemented cognition breed examples, E2E chains, and validation scripts are authentic, compile cleanly, and exhibit no "receipt theater", fake receipt hashes, or hardcoded cheating.

## Instructions
1. Run the Forensic Auditor tools or manually inspect files to verify:
   - All 52 breeds are correctly defined in `registry.json` and compile.
   - All breed examples under `examples/cognition/` execute correctly and produce genuine receipts.
   - Replay determinism checks pass without hardcoded shortcuts.
   - Receipt authenticity checks (`verify-all.sh`) pass and use authentic BLAKE3 hashes.
   - No mock/stub bypasses are present in packages/cognition/ or apps/wasm4pm/ that fake execution.
2. Confirm that there are no integrity violations, cheating behaviors, or fake receipts.
3. Write your detailed verdict and findings to `handoff.md`.
