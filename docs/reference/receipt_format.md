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
      "version": "26.5.19" 
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
