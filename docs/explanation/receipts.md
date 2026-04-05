# Explanation: Receipts and Cryptographic Proof

**Time to read**: 10 minutes  
**Level**: Intermediate  

## What is a Receipt?

A receipt is a cryptographic proof that an execution happened:

```json
{
  "run_id": "run-2026-04-05-120145",
  "config_hash": "blake3:a7f3e2c9...",
  "input_hash": "blake3:c9b1d4e7...",
  "output_hash": "blake3:5e8f2a1c...",
  "timestamp": "2026-04-05T12:01:45Z",
  "status": "success"
}
```

## What BLAKE3 Proves

BLAKE3 is a cryptographic hash function (like SHA-256, but faster).

**Property**: One-way function - impossible to reverse.

```
Input → BLAKE3 → Hash
↓                  ↓
Any change → Different hash instantly

Original: "abc" → hash1
Modified: "abd" → hash2 (completely different)
```

**Use**: Detect tampering

```
Days later, someone modifies the model:
  Original hash: blake3:5e8f2a1c
  Current file hash: blake3:9x1y2z3  (DIFFERENT!)
  → Tampering detected
```

## Verification Workflow

### 1. Verify Reproducibility

```bash
# Run 1
pmctl run --config config.toml
HASH1=$(jq -r '.combined_hash' output/receipt.json)

# Run 2
pmctl run --config config.toml
HASH2=$(jq -r '.combined_hash' output/receipt.json)

# Check
if [ "$HASH1" = "$HASH2" ]; then
  echo "✓ Reproducible"
fi
```

### 2. Verify Output Integrity

```bash
# Check if output file was modified
current_hash=$(sha256sum output/model.json | awk '{print $1}')
receipt_hash=$(jq -r '.output_hash' output/receipt.json)

if [ "$current_hash" = "$receipt_hash" ]; then
  echo "✓ Output unchanged"
else
  echo "✗ Output was modified!"
fi
```

### 3. Verify Config Matches

```bash
# Was config changed after execution?
current_config=$(sha256sum config.toml | awk '{print $1}')
receipt_config=$(jq -r '.config_hash' output/receipt.json)

if [ "$current_config" = "$receipt_config" ]; then
  echo "✓ Config unchanged"
fi
```

## Compliance Usage

### Evidence Collection

```
For auditor:
  "Please prove this analysis is valid"

Response:
  Receipt: { hash, timestamp, status }
  Config: (git history shows no changes)
  Input: (hash unchanged)
  Output: (hash unchanged)
  
Conclusion: ✓ Valid, unchanged, reproducible
```

### Audit Trail

```
Timeline:
  2026-01-01: Config created, committed to git
  2026-02-15: Analysis run, receipt generated
  2026-03-20: Audit conducted
  
Verification:
  git show 2026-02-15:config.toml > historical.toml
  pmctl run --config historical.toml
  → Same results as 2026-02-15 receipt
```

## Tampering Detection

Someone modifies the model:

```
Original (2026-02-15):
  "model": { "nodes": 23, "edges": 18 }
  "output_hash": "blake3:5e8f2a1c"

Modified (later):
  "model": { "nodes": 24, "edges": 19 }  # Changed!
  
Verification:
  hash output/model.json
  → blake3:9x1y2z3 (different from receipt)
  → ✗ Tampering detected
```

## Storage

Receipts are stored with models:

```
output/
├── receipt.json          ← The proof
├── model.json            ← The output
└── report.html
```

Backup receipt:

```bash
cp output/receipt.json archive/receipt-2026-02-15.json
```

Version control receipt:

```bash
git add output/receipt.json
git commit -m "Add receipt for compliance audit"
```

## Limitations

Receipts prove:
- ✓ Execution happened
- ✓ Output is unchanged
- ✓ Config matches
- ✓ Reproducibility

Receipts don't prove:
- ✗ Correctness of algorithm
- ✗ Quality of model
- ✗ Whether model is useful
- ✗ Whether config is optimal

(Those are domain expertise, not cryptography)

## See Also

- [Tutorial: Compliance Audit](../tutorials/compliance-audit.md)
- [Explanation: Determinism](./determinism.md)
- [Reference: Data Types](../reference/data-types.md)
