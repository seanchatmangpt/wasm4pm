<!-- wasm4pm-doc-status: archived; reviewed: 2026-08-02; original: docs_quarantine/ARCHIVE/unverified/reference/receipt_format.md; source-sha256: f09eae1ecbe1f2f69dbbc41f1ab4b76119bdd5e472493d23513a08445f782ffb; reason: already in an archive surface -->

# Reference: BLAKE3 Receipt Format

Every successful run generates a deterministic, unforgeable receipt.

## JSON Schema

```json
{
  "run_id": "uuid-v4",
  "timestamp": "iso8601",
  "config_hash": "blake3-hex-64",
  "input_hash": "blake3-hex-64",
  "plan_hash": "blake3-hex-64",
  "output_hash": "blake3-hex-64",
  "status": "success",
  "algorithm": { 
      "name": "ilp", 
      "version": "26.5.21" 
  },
  "adversarial_gates": {
      "passed": 24,
      "failed": 0,
      "signatures": ["hex", "hex", "..."]
  },
  "merkle_root": "blake3-hex-64"
}
```

## Hash Generation
The `merkle_root` is a rolling BLAKE3 hash of `config_hash + input_hash + plan_hash + output_hash`. Any bit flip in the input XES file or algorithm version will completely change the root.
