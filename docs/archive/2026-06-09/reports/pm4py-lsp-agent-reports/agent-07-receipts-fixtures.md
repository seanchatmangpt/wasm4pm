# Receipts and Fixtures Investigation Report

**Role**: Receipts & Fixtures Agent (`receipts-fixtures`)  
**Milestone**: Milestone 7 Verification and Checkpoint Promotion  
**Project**: `pm4py-lsp` Cryptographic Receipts & Parity Fixtures

## 1. Blake3 Snapshot Hash Determinism
The server calculates `SnapshotId` inside `crates/pm4py-lsp/src/receipts.rs`. To guarantee determinism:
- The active document URIs are sorted alphabetically.
- The sorted URIs and their corresponding text contents are hashed sequentially using the BLAKE3 algorithm.
- This ensures that the snapshot ID remains identical regardless of insertion, opening, or alteration sequence.
This is validated by `test_snapshot_determinism` in `capability_test.rs`.

## 2. Persistence Directories and Formats
- **Parity Fixtures**: Serialized process mining configs are saved in:
  `fixtures/pm4py-parity/<snapshot_id>.json`
  Example structure:
  ```json
  {
    "csv_path": "log.csv",
    "parameters": {},
    "expected_outcome": "Process discovered"
  }
  ```
- **Receipts**: Cryptographic proofs are saved in:
  `receipts/pm4py-lsp/<snapshot_id>/<receipt_id>.json`
  Example structure:
  ```json
  {
    "receipt_id": "receipt-fixture-8d369f04-1f2c-47f7-8291-e31605f540b1",
    "hash": "7100dc838d85aa547efcf3a487a3beb407e7a33afd57cac64019471fe3c7ee26"
  }
  ```

## 3. Reloading and Authenticity Verification
- **Verification Logic**: `verify_receipt_file` reads the persisted receipt, computes the canonical serialization hash of its payload, and asserts that it matches the stored receipt hash.
- **Auditor Verification**: The test `test_corrupt_receipt_refusal` in `receipts_fixtures_test.rs` verifies that modifying either the receipt file contents or the hash payload results in verification failure. This prevents "Receipt Theater" by proving the verifier works and rejects corrupted state.
