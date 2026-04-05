# Explanation: Determinism in Process Mining

**Time to read**: 15 minutes  
**Level**: Intermediate  
**Audience**: Anyone concerned with reproducibility  

## What Determinism Means

**Determinism** = Same input → Always same output

```
Run 1: config.toml + sample.xes → model A (hash: abc123)
Run 2: config.toml + sample.xes → model A (hash: abc123)  ✓ Deterministic
Run 3: config.toml + sample.xes → model B (hash: xyz789)  ✗ Non-deterministic
```

wasm4pm **guarantees determinism** through:
1. Fixed parameters (configuration)
2. No randomness (algorithms seeded)
3. No time-dependent behavior (order-independent)
4. Cryptographic proof (hashes)

## How wasm4pm Proves Determinism

### 1. BLAKE3 Hashing

Every artifact is hashed with BLAKE3:

```
Input file → BLAKE3 → "blake3:c9b1d4e7f2a5c8d1e4b7c9a2d5e8f1a3"

Model → BLAKE3 → "blake3:5e8f2a1c7d4b9e3a6f2c5d8a1e4b7c9e"

Config → BLAKE3 → "blake3:a7f3e2c9d1b5e8f4a6c2d9e1f3a5b7c9"
```

If input or algorithm changes → Hash changes instantly.

### 2. Receipt Comparison

```bash
# Run 1
pmctl run --config config.toml
HASH1=$(jq -r '.combined_hash' output/receipt.json)

# Run 2
pmctl run --config config.toml
HASH2=$(jq -r '.combined_hash' output/receipt.json)

if [ "$HASH1" = "$HASH2" ]; then
  echo "✓ Deterministic"
else
  echo "✗ Non-deterministic"
fi
```

### 3. Explain/Run Parity

The system guarantees:

```
pmctl explain --config config.toml
  → Shows the exact plan that will execute

pmctl run --config config.toml
  → Executes that exact plan
  → Produces the same results every time
```

## Sources of Non-Determinism (and How We Prevent Them)

### ❌ Random Number Generation

**Problem**: Random seed not fixed
**Solution**: Algorithms seeded from config hash

```toml
[discovery]
algorithm = "genetic"
random_seed = "blake3:a7f3e2c9"  # Derived from config
```

### ❌ Hash Map Iteration Order

**Problem**: HashMap iterates in unpredictable order (in some languages)
**Solution**: Use ordered maps (indexmap in Rust)

```rust
// Bad:
let mut map = HashMap::new();  // Order undefined

// Good:
let mut map = IndexMap::new(); // Order preserved
```

### ❌ Floating Point Rounding

**Problem**: Floating point math can differ between runs
**Solution**: Use exact arithmetic, round consistently

```rust
// Bad:
let score = trace_count as f64 / total_traces; // Rounding varies

// Good:
let score = (trace_count * 100) / total_traces; // Integer math
```

### ❌ Time-Based Decisions

**Problem**: "If execution takes >5 sec, do X"
**Solution**: All timeouts are configuration-based

```toml
[discovery]
timeout_ms = 300000  # Fixed, not time-dependent
```

### ❌ Environment Variable Jitter

**Problem**: Different env vars on different machines
**Solution**: All parameters in config file

```toml
[discovery]
algorithm = "genetic"  # Never from env var
```

## Verification Workflow

To verify determinism:

```bash
#!/bin/bash

# 1. Run first time
pmctl run --config config.toml
HASH1=$(jq -r '.combined_hash' output/receipt.json)
cp output/receipt.json receipt-1.json

# 2. Run second time (different day, different machine)
pmctl run --config config.toml
HASH2=$(jq -r '.combined_hash' output/receipt.json)
cp output/receipt.json receipt-2.json

# 3. Compare
if [ "$HASH1" = "$HASH2" ]; then
  echo "✓ Deterministic"
  diff receipt-1.json receipt-2.json
else
  echo "✗ Non-deterministic"
  echo "Hash 1: $HASH1"
  echo "Hash 2: $HASH2"
fi
```

## Why Determinism Matters

### Research & Reproducibility

Published paper:
> "We ran algorithm X and got model Y"

Reviewer should get **identical** model Y when running the exact code.

### Compliance & Auditing

If audit happens 2 years later:
> "Run this analysis again and verify you get the same result"

Determinism guarantees you **will** get the same result.

### Debugging

Bug found in production:
> "Reproduce locally with the same config"

Determinism means locally = production exactly.

### Distribution & Collaboration

Send config to colleague:
> "Run this and tell me what you get"

You both get **identical** results (no surprises).

## Limitations

Determinism is guaranteed for:
- ✅ Same wasm4pm version
- ✅ Same input file
- ✅ Same configuration
- ✅ Same algorithm parameters

Not guaranteed for:
- ❌ Different wasm4pm versions (may change hashing)
- ❌ Different algorithm (obviously)
- ❌ Different input file
- ❌ Modified algorithm logic

## See Also

- [Explanation: Receipts](./receipts.md)
- [Explanation: Execution Substrate](./execution-substrate.md)
- [Tutorial: Compliance Audit](../tutorials/compliance-audit.md)
