---
name: Cognition Breed Patterns
description: 9 old-AI breed logic, BLAKE3 receipt chains, adversarial gate
paths: ["crates/wasm4pm-cognition/**"]
type: skill
---

# Skill: Cognition Breed Patterns

## Purpose

Implement and verify the 9 cognition kernel breeds (old-AI intelligence patterns), BLAKE3 receipt chain semantics, and adversarial gate validation.

## The 9 Breeds

| Breed | Logic | Use Case |
|-------|-------|----------|
| **Breed 1: Symbolic** | Rule-based logical inference | Deterministic decision trees |
| **Breed 2: Statistical** | Probabilistic reasoning | Confidence scoring |
| **Breed 3: Evolutionary** | Fitness-based selection | Multi-variant search |
| **Breed 4: Swarm** | Collective intelligence | Distributed exploration |
| **Breed 5: Evolutionary Strategy** | Population-based optimization | Hyperparameter tuning |
| **Breed 6: Genetic Programming** | Syntax tree evolution | Code generation synthesis |
| **Breed 7: Neural Symbolic** | Hybrid neural + logic | Explainable AI |
| **Breed 8: Bayesian** | Probabilistic graphical models | Uncertainty quantification |
| **Breed 9: Ensemble** | Multiple breed voting | Robustness via diversity |

## Breed Selection Rules

```rust
// Each breed must declare:
pub trait CognitionBreed {
    fn name() -> &'static str;
    fn execute(&self, input: &Input) -> Result<Output>;
    fn blake3_receipt(&self) -> Receipt;  // Mandatory
    fn confidence() -> f64;
}

// Breed registration in kernel:
match breeding_config.selected {
    BreedSelector::Symbolic => SymbolicBreed::execute(),
    BreedSelector::Statistical => StatisticalBreed::execute(),
    // ... 9 breeds total
}
```

## BLAKE3 Receipt Chain

Every breed execution must emit a receipt:

```json
{
  "breed": "symbolic",
  "input_hash": "blake3 hash of input",
  "output_hash": "blake3 hash of output",
  "previous_hash": "blake3 of previous breed's receipt",
  "timestamp": "2026-05-07T14:23:45Z",
  "signature": "ed25519 signature"
}
```

**CRITICAL**: Empty signature field means the receipt is invalid. The chain is unverified.

## Receipt Verification Workflow

```bash
# 1. Collect all breed receipts
ls crates/wasm4pm-cognition/receipts/*.json

# 2. Verify chain linkage (each previous_hash matches prior receipt)
jq -r '.previous_hash' receipt_N.json | \
  sha256sum - | \
  awk '{print $1}' | \
  grep -q "$(jq -r '.hash' receipt_N_minus_1.json)"

# 3. Verify all signatures non-empty
jq -e '.[] | select(.signature == "" or .signature == null)' receipts/*.json
# Must return nothing (no empty signatures)

# 4. Verify execution order matches timestamps
jq -s 'sort_by(.timestamp) | .[].breed' receipts/*.json
```

## Adversarial Gate

The adversarial gate validates breed output against declared invariants:

```bash
# Run full validation
make cognition-build
# Checks: all 9 breeds present, all receipts valid, signatures match, chain unbroken, timestamps ordered
```

Exit 0 = all breeds passed. Exit 1 = breach detected.

## Forbidden Patterns

❌ Breed that emits a receipt with empty `signature` field
❌ Breed that doesn't verify `previous_hash` linkage
❌ Breed execution without emitting a receipt
❌ Multiple breeds writing the same receipt file (race condition)

## Required Patterns

✅ Every breed derives `input_hash` from actual input (not fabricated)
✅ Every breed signs receipt with private key
✅ Receipt chain linkage verifiable via BLAKE3
✅ Adversarial gate catches broken chains immediately (fail-fast)

## Commands

```bash
# Test all 9 breeds
cargo test -p wasm4pm-cognition --lib breed

# Build with cognition kernel
pnpm build:cognition

# Run adversarial gate
make cognition-build

# Verify receipt chain integrity
wpm doctor --breed-receipts
```
