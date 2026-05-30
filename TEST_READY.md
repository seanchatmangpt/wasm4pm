# TEST_READY.md — E2E Test Suite Readiness

This document verifies the readiness and current status of the opaque-box E2E test suite for the `wasm4pm` process-law oracle.

## 1. Test Suite Status
*   **Current Status**: **Fully Ready & Verified**
*   **Total Test Cases**: 66 (across 4 tiers)
*   **Last Run Status**: **All 66 tests passing successfully**
*   **Execution Time**: ~48 seconds

---

## 2. Execution Command
To run the process-law E2E test suite in isolation, execute:

```bash
npx vitest run apps/wasm4pm/src/__tests__/process-law-e2e.test.ts
```

*Note: Ensure TypeScript files are compiled first by running `npm run build:cli`.*

---

## 3. Feature Verification Checklist

### F1: Streaming Conformance Checking
*   [x] Stream input processing via `--stream` parameter.
*   [x] Log output streaming via `--ndjson`.
*   [x] Structured data verification using JSON formats.
*   [x] Rejection behavior when fitness falls below configured threshold.
*   [x] Validation of fast and full precision modes.

### F2: Prefix Conformance
*   [x] Valid trace prefix adjudication (reports `ALIVE`).
*   [x] Illegal transitions check (reports `BLOCKED` with exit code 6).
*   [x] Dead-ends and sink node unreachability check (reports `FAKE-LIVE` with exit code 6).
*   [x] Parsing inputs from XES trace log files.
*   [x] Direct PNML model file path mapping support.

### F3: Process-Model Registry
*   [x] Saving process model metadata in the registry directory.
*   [x] Loading registered models by unique name.
*   [x] Comparing model properties side-by-side.
*   [x] Removing/deleting models from the repository store.
*   [x] Exporting saved model metadata to JSON, PNML, and CSV.
*   [x] Validating LRU cache bounds and SemVer range checks.

### F4: Object-Centric Causality
*   [x] Grouping and extracting trace variants from logs.
*   [x] Searching and sorting traces by performance metrics.
*   [x] Extracting TraceGraph and mapping to OCEL 2.0.
*   [x] Asserting Object-Centric causality (referential integrity, lifecycle monotonicity).

### F5: Process-Law Query Language (OCPQ)
*   [x] Query execution over OCEL event databases.
*   [x] Syntax verification for temporal constraints (`BEFORE`, `AFTER`, `IMMEDIATELY`).
*   [x] Evaluating scope limits (global vs. same-object).
