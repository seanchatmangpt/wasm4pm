# Cognition Overview

wasm4pm ships a **real Rust cognition kernel** — 9 classical AI algorithms from the foundational literature, implemented in production Rust, compiled to WebAssembly, and surfaced through the `wpm cognition` CLI. This primer covers what the kernel is, why it exists, and how to use it in the first 15 minutes.

## What problem it solves

Process mining tells you what happened in a process by mining event logs. But the practitioner question that comes immediately after discovery is: *what should I do about it*? That question requires reasoning — not statistical prediction, not nearest-neighbor retrieval, but structured inference over a defined knowledge base.

The cognition kernel provides that reasoning layer. It implements 9 classical AI algorithms that cover the main families of structured inference: rule-based reasoning (MYCIN, production rules), logical deduction (Prolog unification), planning (STRIPS, GPS), case-based reasoning (CBR), constraint-driven enumeration (DENDRAL), preference-based operator selection (SOAR), and blackboard consensus (Hearsay-II).

Every run produces a **BLAKE3 receipt chain** — a cryptographic proof that the inference happened, which breed ran, what the inputs were, and what the outputs were. Receipts can be replayed to verify byte-identical determinism.

## The 9 breeds

### ELIZA (Weizenbaum 1966)
Pattern matching with slot binding. Input patterns are matched against a rule set; matched slots are bound and used to generate structured output. Use case: intent extraction from process annotations, alert classification from event labels.

### MYCIN (Shortliffe 1976)
Forward-chaining rule engine with Shortliffe certainty-factor (CF) combining. Rules have confidence weights; evidence propagates through the chain with the Shortliffe combining formula. Use case: root-cause diagnosis from SPC alerts, conformance violation explanation.

### STRIPS (Fikes & Nilsson 1971)
Goal regression planning. Given a goal state and a set of operator preconditions/effects, STRIPS works backward from the goal to find an action sequence. Use case: process repair planning (given a deviant trace, find the minimum sequence of corrective actions).

### Prolog (Robinson 1965)
Robinson unification with SLD resolution and the occur check. A clause database is queried via backward chaining. Use case: compliance rule verification, constraint checking over process models.

### CBR — Case-Based Reasoning (Kolodner 1992)
Jaccard similarity-based case retrieval from a case ledger. The closest matching past case is retrieved and adapted to the current problem. Use case: process variant recommendation, anomaly classification by similarity to known cases.

### DENDRAL (Buchanan & Lederberg 1969)
Constraint-driven candidate enumeration. A search space is pruned by structural constraints; remaining candidates are ranked. Use case: hypothesis generation for process model repair, feature combination enumeration for ML pipelines.

### GPS — General Problem Solver (Newell & Simon 1963)
Means-ends analysis with gap reduction. The difference between current state and goal state drives operator selection. Use case: process optimization (given current KPIs and target KPIs, find the intervention path).

### SOAR (Laird, Rosenbloom & Newell 1987)
Preference-based operator selection with impasse resolution. When no operator is preferred, an impasse fires and a subgoal is created. Use case: multi-step process decision making where conflicts between objectives must be resolved.

### Hearsay-II (Erman & Lesser 1980)
Blackboard architecture with knowledge-source consensus. Multiple knowledge sources write hypotheses to a shared blackboard; consensus is established by aggregating contributions. Use case: multi-perspective process analysis where evidence from different analytical agents must be combined.

## The adversarial gates

Every breed output passes through 8 adversarial detectors before the receipt is signed. These detectors were designed to catch the most common false-pass patterns in AI systems:

| Gate | Detector | What it catches |
|------|----------|----------------|
| V1 | `stub_gate` | `todo!()`, `unimplemented!()`, `pub struct Stub` in hot paths |
| V2 | `human_authority` | Human-written text used as authoritative evidence source |
| V3 | `missing_evidence` | Output not backed by an OTEL span (no runtime proof) |
| V4 | `central_firehose` | Single event stream routing to all consumers (architectural smell) |
| V5 | `self_certify` | Agent certifying its own output without external trust anchor |
| V6 | `bench_missing` | Performance claim without measured benchmark data |
| V7 | `repair_weakens` | A repair step that weakens a passing gate to make it pass |
| V8 | `replay_broken` | Replay of a receipt produces a different hash than the original |

A receipt with any Fatal finding (V1, V5, V8) gets exit code 5. A receipt with any Error finding (V2, V3, V6, V7) gets exit code 4. Only exit code 0 is a proof of success.

## Quickstart

### Prerequisites

```bash
# Install CLI
npm install -g @wasm4pm/cli

# Verify WASM is loaded
wpm status
```

### Run your first contract

```bash
# MYCIN: forward-chain over diagnostic rules
wpm cognition run \
  --contract mycin \
  --input examples/cognition/mycin/symptoms.json

# Output:
# Contract:   mycin
# Breed:      MYCIN (Shortliffe 1976)
# Status:     clean (exit 0)
# Findings:   0
# Receipt ID: a1b2c3d4...
# Top hypothesis: root_cause=resource_contention (CF=0.82)
```

### Verify the receipt

```bash
wpm cognition verify --receipt-id a1b2c3d4

# Output:
# V1 stub_gate:       PASS
# V2 human_authority: PASS
# V3 missing_evidence:PASS
# V4 central_firehose:PASS
# V5 self_certify:    PASS
# V6 bench_missing:   PASS
# V7 repair_weakens:  PASS
# V8 replay_broken:   PASS
# All gates: PASS (exit 0)
```

### Replay for determinism proof

```bash
wpm cognition replay --receipt-id a1b2c3d4

# Output:
# Original output hash:  sha256:abc123...
# Replayed output hash:  sha256:abc123...
# Match: YES — byte-identical determinism proved
```

### Dry-run (no side effects)

```bash
wpm cognition explain --contract strips --input examples/cognition/strips/repair-goal.json

# Output:
# Plan (no receipt, no side effects):
# 1. check_preconditions(repair-goal)
# 2. execute(STRIPS, frame=repair-goal)
# 3. check_postconditions(output)
# 4. run_adversarial_gates(V1-V8)
# 5. append_receipt(ledger)
# Estimated steps: 7 regression operations
```

## CLI reference

```
wpm cognition run [options]
  --contract <breed>    Required. One of: eliza, mycin, strips, prolog,
                        cbr, dendral, gps, soar, hearsay
  --input <path>        Required. JSON input file (schema depends on breed)
  --actor <id>          Optional. Actor identity for receipt signing
  --format human|json   Output format (default: human)
  --no-save             Skip auto-save to .wasm4pm/results/

wpm cognition explain [options]
  --contract <breed>    Required.
  --input <path>        Required.
  (Same options as run, but no receipt is generated, no side effects)

wpm cognition verify [options]
  --receipt-id <id>     Required. Receipt ID from a previous run

wpm cognition receipt [options]
  --id <id>             Required. Receipt ID to inspect

wpm cognition adversarial
  (No options — lists all 8 detectors with descriptions)

wpm cognition replay [options]
  --receipt-id <id>     Required. Receipt to replay

wpm cognition plan [options]
  --contract <breed>    Required.
  --input <path>        Required.
  (Shows the planner execution plan without running)

wpm cognition inspect [options]
  --artifact <id>       Required. Artifact ID to inspect
```

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Clean success — all adversarial gates passed, receipt signed |
| 1 | Precondition failed — input did not meet contract preconditions |
| 2 | Execution failed — breed threw an error during inference |
| 3 | Postcondition failed — output did not meet contract postconditions |
| 4 | Adversarial error — one or more Error-severity gates fired |
| 5 | Adversarial fatal — one or more Fatal-severity gates fired |

## Input schemas

Each breed expects a JSON input object. The schema is breed-specific but all share the `contract` field:

```json
{
  "contract": "mycin",
  "evidence": [
    { "attribute": "fever", "value": "high", "cf": 0.9 },
    { "attribute": "spc_alert", "value": "rule_1_violation", "cf": 0.8 }
  ]
}
```

```json
{
  "contract": "strips",
  "initial_state": ["trace_deviant", "activity_missing:approve"],
  "goal_state": ["trace_conformant"],
  "operators": [
    {
      "name": "insert_approve",
      "preconditions": ["activity_missing:approve"],
      "add_effects": ["activity_present:approve"],
      "del_effects": ["activity_missing:approve"]
    }
  ]
}
```

Full schemas are in `examples/cognition/<breed>/` and `crates/wasm4pm-cognition/src/breeds/<breed>.rs`.

## Integration with process mining

The cognition kernel is designed to compose with wasm4pm's process mining output:

```bash
# 1. Discover process model
wpm run loan.xes --format json > discovery.json

# 2. Check conformance
wpm conformance -i loan.xes --format json > conformance.json

# 3. Feed SPC violations into MYCIN for root-cause diagnosis
wpm cognition run \
  --contract mycin \
  --input <(jq '{contract: "mycin", evidence: .violations}' conformance.json)

# 4. Feed MYCIN findings into STRIPS for repair planning
wpm cognition run \
  --contract strips \
  --input <(jq '{contract: "strips", initial_state: .hypotheses}' findings.json)
```

The receipt chain links all steps: the discovery receipt, the conformance receipt, the MYCIN receipt, and the STRIPS receipt are all independently verifiable and can be replayed.

## Further reading

- [ARCHITECTURE.md](../ARCHITECTURE.md) — full architecture with mermaid diagrams
- [docs/cognition-doctrine.md](cognition-doctrine.md) — the "Old AI is the factory" manifesto
- [CONTRIBUTING.md](../CONTRIBUTING.md) — contribution rules for cognition breeds
- `crates/wasm4pm-cognition/src/breeds/` — Rust source for all 9 breeds
- `wasm4pm/tests/` — integration tests for cognition contracts
