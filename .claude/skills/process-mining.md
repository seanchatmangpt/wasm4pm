---
name: Process Mining Chicago TDD
description: Chicago TDD patterns for van der Aalst process mining
paths: ["wasm4pm/src/**/*.rs", "packages/**/*.ts"]
type: skill
---

# Skill: Process Mining Chicago TDD

## Purpose

Implement process mining features using Chicago TDD: real collaborators (no mocks), state-based verification, observable results.

## Van der Aalst Doctrine

> If the code says it worked but the event log cannot prove a lawful process happened, then it did not work.

Real execution must be provable via:
1. **Event log** — OCEL object-centric event log from real execution
2. **OTEL spans** — OpenTelemetry spans showing real API calls
3. **Observable state** — Actual artifacts written (receipts, event logs, drift records)

## Chicago TDD Pattern (AAA)

### Arrange
Set up real collaborators (not mocks):
```rust
let mut pm = ProcessMining::new();
let mut log_file = NamedTempFile::new()?;  // Real file
log_file.write_all(xes_content.as_bytes())?;
```

### Act
Execute the real operation:
```rust
let result = pm.discover(log_file.path(), "inductive")?;
```

### Assert
Verify observable state (not mock interactions):
```rust
assert!(result.dfg.nodes.len() > 0);
assert_eq!(result.fitness, 0.95);  // Real metric
let model_json = std::fs::read_to_string("result.json")?;
assert!(model_json.contains("\"type\": \"parallel\""));
```

## FORBIDDEN: London TDD

❌ Do NOT mock:
- `PM4PY` library calls
- `ConformanceCheck` trait implementations
- Event log ingestion

❌ Do NOT test:
- Mock call counts
- Mock interaction sequences
- Internal state without observable proof

## Three-Layer Evidence Requirement

Every process mining test must prove across 3 layers:

1. **Test assertion** — `assert_eq!()` on fitness, detected activities, etc.
2. **OTEL span** — Span for discovery/conformance with attributes:
   - `pm.algorithm` = "inductive", "alpha", etc.
   - `pm.fitness` = 0.95 (real value)
   - `pm.duration_ms` = 2341 (real timing)
3. **OCEL artifact** — Real event log output with proper structure

**If any layer is missing, the test is incomplete.**

## Commands

```bash
# Red test
vim crates/wasm4pm-algos/tests/discovery_test.rs
pnpm test -- discovery_test  # FAILED

# Green implementation
vim crates/wasm4pm-algos/src/discovery.rs
pnpm test -- discovery_test  # PASSED

# Verify three-layer evidence
RUST_LOG=trace,wasm4pm=trace pnpm test -- discovery_test 2>&1 | grep "pm.algorithm"
# Check .ocel artifact exists with valid events
cat result.ocel | jq '.events[] | .activity' | sort | uniq
```
