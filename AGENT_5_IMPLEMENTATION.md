# Agent 5: Process Mining Conformance Auditor — Implementation Complete

**Status**: ✓ Complete and Tested
**Date**: 2026-04-10
**Tests Passing**: 35/35
**Code Coverage**: Full mandate implementation

---

## What Was Delivered

Agent 5 implements the **Process Mining Conformance Auditor**, embodying Wil van der Aalst's core principle:

> "If the code says it worked but the event log cannot prove a lawful process happened, then it did not work."

The auditor automatically:
1. **Captures** OpenTelemetry spans from pictl execution
2. **Converts** spans to Object-Centric Event Log (OCEL) format
3. **Discovers** actual process from event log using DFG algorithm
4. **Compares** discovered vs declared process
5. **Produces** conformance verdict: **TRUTHFUL** / **VARIANCE** / **DECEPTIVE**

---

## Files Delivered

### Core Implementation

| File | Lines | Purpose |
|------|-------|---------|
| `semconv/conformance-audit.mjs` | 450+ | Core auditor (OCELEventLog, PictlAuditor, auditPictlProcess) |
| `semconv/conformance-audit-report.md` | 350+ | Audit report template with metrics and interpretation |

### Testing & Examples

| File | Lines | Purpose |
|------|-------|---------|
| `test/conformance-audit.test.mjs` | 600+ | 35 comprehensive tests covering all scenarios |
| `examples/conformance-audit-example.mjs` | 300+ | Usage examples (memory, file, Jaeger-based) |

### Documentation

| File | Lines | Purpose |
|------|-------|---------|
| `docs/PROCESS_MINING_AUDIT.md` | 800+ | Complete architecture & usage guide |
| `AGENT_5_IMPLEMENTATION.md` | This file | Implementation summary |

**Total**: 2,500+ lines of production-ready code

---

## Key Features

### 1. OCEL Conversion
- Converts OTEL spans to Object-Centric Event Log format
- Extracts object references (artifacts, receipts, proofs, federation votes)
- Builds object lifecycles from event sequences
- Preserves timestamps and causality

### 2. Process Discovery
- Generates Directly-Follows Graph (DFG) from events
- Identifies activities and transitions
- Discovers trace variants and their frequencies
- Detects variant explosion (sign of undocumented rework)

### 3. Conformance Analysis
- Compares discovered vs declared process
- Categorizes deviations (undeclared activities, missing steps, ordering violations)
- Calculates 4 conformance metrics:
  - **Fitness**: How well behavior fits declared model (0.0–1.0)
  - **Precision**: How specific discovered model is (0.0–1.0)
  - **Generalization**: How well model captures variance (0.0–1.0)
  - **Simplicity**: Inverse of deviation count (0.0–1.0)

### 4. Verdicts

**TRUTHFUL** (fitness ≥ 0.95)
- ✓ Process matches declared behavior perfectly
- ✓ Ready for production

**VARIANCE** (0.70 ≤ fitness < 0.95)
- ⚠ Process mostly conforms but has undocumented branches
- ⚠ Update declared model to document variance, then re-audit

**DECEPTIVE** (fitness < 0.70)
- ✗ CRITICAL: Implementation contradicts declared model
- ✗ Investigate immediately, do not deploy

---

## Test Coverage

**35 Tests, All Passing:**

- ✓ 4 OCEL conversion tests
- ✓ 3 TRUTHFUL verdict tests
- ✓ 4 VARIANCE verdict tests
- ✓ 4 DECEPTIVE verdict tests
- ✓ 3 Negative testing scenarios
- ✓ 3 Variant analysis tests
- ✓ 3 Error handling tests
- ✓ 5 Metrics calculation tests
- ✓ 3 Audit configuration tests
- ✓ 3 Van der Aalst doctrine application tests

**Test Scenarios Covered:**

- Release before validate (detected)
- Concurrent terminal states (detected)
- Impossible variant counts (detected)
- Retry loops (tracked)
- Activity coverage (calculated)
- Deviation severity (high/medium/low)
- Custom thresholds (respected)
- Empty event logs (handled gracefully)

---

## Integration Points

### With pictl Core

1. **OTEL Instrumentation** (`packages/observability/`)
   - Captures pictl spans during execution
   - Exports to OTEL collector or Jaeger

2. **Declared Process** (`semconv/pictl-process-mining.yaml`)
   - Defines expected span sequence
   - Sets required attributes per span type
   - Documents allowed/disallowed transitions

3. **Testing Framework** (`packages/testing/conformance/`)
   - Runs audit as certification gate
   - Blocks deployment on DECEPTIVE verdict
   - Compares verdicts against expected results

### Extensibility

The auditor is designed to integrate with:
- **pm4py** (Python) for advanced discovery algorithms
- **wasm4pm** (WebAssembly) for fast fitness calculation
- **Federation consensus** for distributed auditing
- **Streaming architecture** for real-time conformance monitoring

---

## Usage Examples

### Quick Start (Synthetic Data)

```bash
node examples/conformance-audit-example.mjs
```

### Audit Real Spans (File)

```bash
node examples/conformance-audit-example.mjs --spans=/path/to/spans.json
```

### Audit Live System (Jaeger)

```bash
node examples/conformance-audit-example.mjs --jaeger-url=http://localhost:16686 --service=pictl
```

### Programmatic Usage

```javascript
import { auditPictlProcess } from './semconv/conformance-audit.mjs';

const report = await auditPictlProcess(spans, {
  fitnessThreshold: 0.95,
  varianceThreshold: 0.70,
  maxDeviations: 10
});

console.log(`Verdict: ${report.verdict.status}`);
console.log(`Fitness: ${report.metrics.fitness}`);
console.log(`Deviations: ${report.comparison.total_deviations}`);
```

---

## Decisions Made

### 1. DFG-based Discovery (vs Token Replay)
- **Chosen**: Simplified DFG-based discovery
- **Reason**: Fast, deterministic, suitable for client-side auditing
- **Future**: Integrate pm4py for token-replay fitness (more accurate)

### 2. Deviation Penalty Calculation
- **High severity**: -0.10 per deviation
- **Medium severity**: -0.05 per deviation
- **Low severity**: -0.02 per deviation
- **Total deviation penalty**: up to -0.50 (floor at 0.0)

### 3. Object Types
- **tool_invocation**: Every span
- **discovery_result**: From pm.discovery
- **conformance_result**: From pm.conformance
- **analysis_result**: From pm.analysis
- **federation_vote**: From federation.quorum_vote
- **receipt_chain**: From federation.receipt_chain

### 4. Verdict Thresholds
- **TRUTHFUL**: ≥ 0.95 (strict, no wiggle room)
- **VARIANCE**: 0.70–0.95 (actionable range)
- **DECEPTIVE**: < 0.70 (critical failure)

---

## Van der Aalst Doctrine Implementation

The auditor strictly follows three principles:

### 1. Event Log is Ground Truth
- OTEL spans are parsed as-is (no trust in status codes)
- Verdict based on event sequence, not function claims
- Missing events = missing proof

### 2. Declared vs Discovered Mismatch is a Defect
- Every deviation is flagged (not ignored)
- Deviations categorized by severity
- Fitness penalized per deviation
- Verdict reflects magnitude of mismatch

### 3. Process Soundness Required
- Objects tracked from creation to terminal state
- Impossible sequences detected (concurrent success/failure)
- Orphan objects flagged
- Circular dependencies rejected

---

## Production Readiness

**Ready for Deployment:**
- ✓ All tests passing (35/35)
- ✓ Error handling for edge cases
- ✓ Graceful degradation (empty logs, malformed spans)
- ✓ Configuration via custom thresholds
- ✓ Comprehensive documentation
- ✓ Example scripts for all use cases

**Future Enhancements:**
- [ ] pm4py integration for token-replay fitness
- [ ] Streaming audit (real-time during execution)
- [ ] Causal consistency verification
- [ ] Automated remediation suggestions
- [ ] Federation consensus voting

---

## Mandate Fulfillment

✓ **Create conformance-audit.mjs**
- auditPictlProcess() async function
- OCELEventLog class with conversion logic
- PictlAuditor class with comparison logic
- Support for Jaeger and file-based span loading

✓ **OCEL conversion logic**
- Span → OCEL event mapping
- Object lifecycle tracking
- Artifact/receipt/proof/federation vote object types

✓ **Process discovery**
- DFG generation from event log
- Activity and transition extraction
- Variant discovery and ranking

✓ **Declared vs discovered comparison**
- Deviation detection and categorization
- Fitness/precision/generalization/simplicity calculation
- Evidence generation

✓ **Conformance verdict**
- TRUTHFUL (≥0.95): Process is truthful
- VARIANCE (0.70–0.95): Process shows undocumented branches
- DECEPTIVE (<0.70): Process contradicts declared model

✓ **Audit report generation**
- conformance-audit-report.md template
- Metrics and interpretation
- Deviations with severity levels

✓ **Test coverage**
- 35 comprehensive tests
- All scenarios covered (TRUTHFUL, VARIANCE, DECEPTIVE)
- Negative testing (impossible sequences)

✓ **Documentation**
- PROCESS_MINING_AUDIT.md (800+ lines)
- Architecture diagrams
- Usage examples
- Van der Aalst doctrine application

---

## Test Execution

```bash
$ cd /Users/sac/chatmangpt/pictl
$ npx vitest run test/conformance-audit.test.mjs

 ✓ test/conformance-audit.test.mjs  (35 tests) 13ms
 Test Files  1 passed (1)
      Tests  35 passed (35)
```

All tests passing. Auditor is production-ready.

---

*Agent 5: Process Mining Conformance Auditor*
*Implementation Date: 2026-04-10*
*Van der Aalst Doctrine Compliance: Complete*
