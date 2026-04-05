# Tutorial: Compliance Audit Trail

**Time to complete**: 20 minutes  
**Level**: Advanced  
**Audience**: Compliance officers, auditors  

## What You'll Learn

- Generate cryptographic receipts for compliance
- Verify determinism across runs
- Generate audit evidence reports
- Track configuration changes with Git
- Export audit snapshots

## Prerequisites

- wasm4pm service running
- Understanding of compliance requirements
- Git for version control

## Step 1: Understanding Receipts

A receipt proves:
1. **What ran**: Algorithm, configuration
2. **What input was used**: Event log hash
3. **What output was produced**: Model hash
4. **When it happened**: Timestamp
5. **That it's unchanged**: Cryptographic signature

## Step 2: Generate a Receipt

Run discovery with receipt enabled (default):

```bash
pmctl run --config config.toml --verbose
```

View the receipt:

```bash
cat output/receipt.json
```

Complete receipt structure:

```json
{
  "run_id": "run-2026-04-05-120145",
  "timestamp": "2026-04-05T12:01:45Z",
  "status": "success",
  
  "configuration": {
    "algorithm": "heuristic",
    "profile": "balanced",
    "config_file_hash": "blake3:a7f3e2c9d1b5e8f4a6c2d9e1f3a5b7c9",
    "config_content": "base64:encoded..."
  },
  
  "input": {
    "source_type": "file",
    "source_path": "sample.xes",
    "event_count": 1234,
    "trace_count": 42,
    "input_hash": "blake3:c9b1d4e7f2a5c8d1e4b7c9a2d5e8f1a3"
  },
  
  "execution": {
    "algorithm": "heuristic",
    "execution_time_ms": 234,
    "memory_used_mb": 45.2,
    "completed_at": "2026-04-05T12:01:45Z"
  },
  
  "output": {
    "model_type": "dfg",
    "nodes": 23,
    "edges": 18,
    "output_hash": "blake3:5e8f2a1c7d4b9e3a6f2c5d8a1e4b7c9e"
  },
  
  "hashes": {
    "plan_hash": "blake3:3b8c1f5a9d2e7c4a6b1f8d3e9a2c5f7b",
    "combined_hash": "blake3:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d"
  },
  
  "verification": {
    "config_deterministic": true,
    "input_deterministic": true,
    "algorithm_deterministic": true,
    "reproducible": true
  }
}
```

## Step 3: Verify Determinism

Run the same analysis twice:

```bash
# First run
pmctl run --config config.toml
RECEIPT_1=$(jq -r '.hashes.combined_hash' output/receipt.json)

# Second run
pmctl run --config config.toml
RECEIPT_2=$(jq -r '.hashes.combined_hash' output/receipt.json)

# Compare
if [ "$RECEIPT_1" = "$RECEIPT_2" ]; then
  echo "✓ Deterministic: Same hash"
else
  echo "✗ Non-deterministic: Different hashes"
  echo "  Receipt 1: $RECEIPT_1"
  echo "  Receipt 2: $RECEIPT_2"
fi
```

Expected: Both hashes identical (deterministic)

## Step 4: Create Audit Report

Create `audit-report.sh`:

```bash
#!/bin/bash

generate_audit_report() {
  local receipt_file=$1
  local report_file="${receipt_file%.json}.audit.txt"

  {
    echo "=== AUDIT REPORT ===" 
    echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo ""
    
    echo "EXECUTION SUMMARY"
    echo "=================="
    jq -r '"\(.run_id) | \(.timestamp) | \(.status)"' "$receipt_file"
    echo ""
    
    echo "CONFIGURATION"
    echo "============="
    jq -r '.configuration | "Algorithm: \(.algorithm)\nProfile: \(.profile)\nConfig Hash: \(.config_file_hash)"' "$receipt_file"
    echo ""
    
    echo "INPUT VERIFICATION"
    echo "=================="
    jq -r '.input | "Source: \(.source_type) \(.source_path)\nEvents: \(.event_count)\nTraces: \(.trace_count)\nInput Hash: \(.input_hash)"' "$receipt_file"
    echo ""
    
    echo "EXECUTION DETAILS"
    echo "================="
    jq -r '.execution | "Duration: \(.execution_time_ms)ms\nMemory: \(.memory_used_mb)MB\nCompleted: \(.completed_at)"' "$receipt_file"
    echo ""
    
    echo "OUTPUT VERIFICATION"
    echo "==================="
    jq -r '.output | "Model Type: \(.model_type)\nNodes: \(.nodes)\nEdges: \(.edges)\nOutput Hash: \(.output_hash)"' "$receipt_file"
    echo ""
    
    echo "DETERMINISM VERIFICATION"
    echo "========================"
    jq -r '.verification | "Config Deterministic: \(.config_deterministic)\nInput Deterministic: \(.input_deterministic)\nAlgorithm Deterministic: \(.algorithm_deterministic)\nReproducible: \(.reproducible)"' "$receipt_file"
    echo ""
    
    echo "CRYPTOGRAPHIC HASHES"
    echo "===================="
    jq -r '.hashes | "Plan Hash: \(.plan_hash)\nCombined Hash: \(.combined_hash)"' "$receipt_file"
  } | tee "$report_file"
  
  echo "Audit report saved to: $report_file"
}

generate_audit_report "output/receipt.json"
```

Run it:

```bash
chmod +x audit-report.sh
./audit-report.sh
```

## Step 5: Track Configuration Changes

Initialize Git for configuration:

```bash
git init
git config user.name "Audit System"
git config user.email "audit@company.com"

# Add configuration files
git add config.toml config.dev.toml config.prod.toml
git commit -m "Initial configuration"

# View history
git log --oneline
```

Create configuration version tracking:

```bash
# Before each run, commit any config changes
git add config.toml
if ! git diff --cached --quiet; then
  git commit -m "Update config: $(date)"
else
  echo "No config changes"
fi

# Run with config hash
CONFIG_HASH=$(git rev-parse HEAD:config.toml)
pmctl run --config config.toml

# Compare with receipt
RECEIPT_CONFIG_HASH=$(jq -r '.configuration.config_file_hash' output/receipt.json)
echo "Git config hash: $CONFIG_HASH"
echo "Receipt config hash: $RECEIPT_CONFIG_HASH"
```

## Step 6: Audit Snapshots

Create periodic audit snapshots:

```bash
#!/bin/bash

create_audit_snapshot() {
  local timestamp=$(date -u +%Y%m%d-%H%M%S)
  local snapshot_dir="audits/$timestamp"
  
  mkdir -p "$snapshot_dir"
  
  # Capture current state
  cp output/receipt.json "$snapshot_dir/"
  cp config.toml "$snapshot_dir/"
  git log --oneline -10 > "$snapshot_dir/git-log.txt"
  git show HEAD:config.toml > "$snapshot_dir/config-committed.toml"
  
  # Generate audit report
  cat > "$snapshot_dir/audit.txt" << EOF
AUDIT SNAPSHOT - $timestamp

Receipt: $(jq -r '.run_id' output/receipt.json)
Status: $(jq -r '.status' output/receipt.json)

Config Hash (file): $(sha256sum config.toml | awk '{print $1}')
Config Hash (receipt): $(jq -r '.configuration.config_file_hash' output/receipt.json)
Input Hash: $(jq -r '.input.input_hash' output/receipt.json)
Output Hash: $(jq -r '.output.output_hash' output/receipt.json)

Reproducible: $(jq -r '.verification.reproducible' output/receipt.json)

Git HEAD: $(git rev-parse HEAD)
EOF
  
  echo "Snapshot saved to: $snapshot_dir"
}

create_audit_snapshot
```

Run it:

```bash
chmod +x create-snapshot.sh
./create-snapshot.sh
```

## Step 7: Audit Trail Export

Export complete audit trail:

```bash
#!/bin/bash

export_audit_trail() {
  local output_file="audit-trail-$(date -u +%Y%m%d-%H%M%S).json"
  
  {
    echo "{"
    echo '  "export_timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",'
    echo '  "receipts": ['
    
    first=true
    for receipt in audits/*/receipt.json; do
      if [ -f "$receipt" ]; then
        if [ "$first" = false ]; then echo ","; fi
        cat "$receipt"
        first=false
      fi
    done
    
    echo "  ],"
    echo '  "git_history": "'$(git log --oneline | head -20 | tr '\n' '|'|sed 's/|/\\n/g')'"'
    echo "}"
  } | jq . > "$output_file"
  
  echo "Audit trail exported to: $output_file"
}

export_audit_trail
```

## Step 8: Compliance Checklist

Create `COMPLIANCE.md`:

```markdown
# Compliance Checklist

## Evidence Collection

- [ ] Receipt generated for each run
- [ ] Determinism verified (two identical hashes)
- [ ] Configuration version controlled
- [ ] Audit snapshots created
- [ ] Cryptographic hashes documented

## Verification

- [ ] Input hash verified
- [ ] Output hash verified  
- [ ] Configuration hash verified
- [ ] Algorithm deterministic flag checked
- [ ] Status marked as "success"

## Audit Trail

- [ ] All receipts exported
- [ ] Git history retained
- [ ] Snapshots backed up
- [ ] Timeline documented
- [ ] Changes tracked

## Compliance Rules

1. All runs must generate receipts
2. Determinism must be verified monthly
3. Configuration must be version controlled
4. Snapshots created before major changes
5. Audit trail retained for 3+ years
```

## Step 9: Automated Compliance Testing

Create `test-compliance.sh`:

```bash
#!/bin/bash

test_determinism() {
  echo "Testing determinism..."
  
  pmctl run --config config.toml
  HASH1=$(jq -r '.hashes.combined_hash' output/receipt.json)
  
  pmctl run --config config.toml
  HASH2=$(jq -r '.hashes.combined_hash' output/receipt.json)
  
  if [ "$HASH1" = "$HASH2" ]; then
    echo "✓ PASS: Determinism verified"
    return 0
  else
    echo "✗ FAIL: Non-deterministic"
    return 1
  fi
}

test_receipt_structure() {
  echo "Testing receipt structure..."
  
  if jq -e '.run_id and .hashes.combined_hash and .verification.reproducible' output/receipt.json > /dev/null; then
    echo "✓ PASS: Receipt structure valid"
    return 0
  else
    echo "✗ FAIL: Invalid receipt structure"
    return 1
  fi
}

test_determinism
test_receipt_structure

echo "Compliance tests completed"
```

## Step 10: Regular Audit Schedule

Create cron job for periodic audits:

```bash
# Run daily compliance test
0 2 * * * cd /opt/wasm4pm && bash test-compliance.sh >> audits/daily.log 2>&1

# Weekly audit snapshot
0 3 * * 0 cd /opt/wasm4pm && bash create-snapshot.sh

# Monthly audit trail export
0 4 1 * * cd /opt/wasm4pm && bash export-audit-trail.sh
```

## Next Steps

1. **Version control**: [How-To: Version Control Config](../how-to/version-control.md)
2. **Understanding receipts**: [Explanation: Receipts](../explanation/receipts.md)
3. **Determinism**: [Explanation: Determinism](../explanation/determinism.md)

---

## Related Documentation

- **[Explanation: Receipts](../explanation/receipts.md)** — How receipts work
- **[Explanation: Determinism](../explanation/determinism.md)** — Reproducibility
- **[Reference: Error Codes](../reference/error-codes.md)** — Understanding failures
