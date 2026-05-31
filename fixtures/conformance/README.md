# fixtures/conformance

Conformance-checking fixtures for the ggen (process-law oracle) lifecycle. These XES event logs
are used by the Process-Law Oracle E2E test suite to validate token-replay fitness against the
`living_diagnostic_clear_v1` Petri-net model.

## Files

| File | Description |
|------|-------------|
| `ggen_valid.xes` | Complete, lawful lifecycle — all six stages executed in order |
| `ggen_invalid.xes` | Incomplete lifecycle — mandatory stages skipped; receipt emitted early |

## The lifecycle model

The canonical ggen lifecycle (`fixtures/models/living_diagnostic_clear_v1.pnml`) defines a
strict ordered sequence of six activities:

```
DiagnosticRaised → RouteSelected → RepairAttempted → GatePassed → ReceiptEmitted → ALIVE
```

Every stage is mandatory. No stage may be skipped. No stage may be emitted before its
predecessor.

## ggen_valid.xes — the lawful trace

The valid fixture contains a single case (`ggen_case_valid`) that executes all six stages in
order with monotonically increasing timestamps:

| Event | Activity | Role |
|-------|----------|------|
| e1 | `DiagnosticRaised` | Lifecycle opens — anomaly detected |
| e2 | `RouteSelected` | Repair route chosen |
| e3 | `RepairAttempted` | Repair action executed |
| e4 | `GatePassed` | Proof gate cleared |
| e5 | `ReceiptEmitted` | Cryptographic receipt issued |
| e6 | `ALIVE` | Object lifecycle closed — system healthy |

Expected token-replay fitness: **1.0** (perfect conformance, no missing tokens, no remaining
tokens in non-final places).

## ggen_invalid.xes — the unlawful trace

The invalid fixture contains a single case (`ggen_case_invalid`) that emits a receipt before
the mandatory `RepairAttempted` and `GatePassed` stages. The lifecycle is never closed
(`ALIVE` is never reached):

| Event | Activity | Violation |
|-------|----------|-----------|
| e1 | `DiagnosticRaised` | — |
| e2 | `RouteSelected` | — |
| e3 | `ReceiptEmitted` | Receipt before GatePassed — mandatory stages skipped |

Expected token-replay fitness: **< 0.5** (missing tokens for `RepairAttempted`, `GatePassed`,
and `ALIVE`; remaining token in intermediate place).

This fixture deliberately triggers the `conformance_fail` exit code (6) when checked against
`living_diagnostic_clear_v1` with `--threshold 0.9`.

## Test harness

These fixtures are consumed by:

```
apps/wasm4pm/src/__tests__/process-law-e2e.test.ts
```

The test suite is the Process-Law Oracle E2E suite. It resolves fixture paths relative to the
repo root:

```typescript
const validXes   = path.join(rootDir, 'fixtures/conformance/ggen_valid.xes');
const invalidXes = path.join(rootDir, 'fixtures/conformance/ggen_invalid.xes');
const ggenModel  = path.join(rootDir, 'fixtures/models/living_diagnostic_clear_v1.pnml');
```

Key test cases that depend on these fixtures:

| Test ID | Fixture | Command | Expected |
|---------|---------|---------|----------|
| F1-1 | valid | `wpm conformance -i <valid> --stream` | exit 0 |
| F1-4 | invalid | `wpm conformance -i <invalid> --threshold 0.9 --stream` | exit 6 |
| F2-5 | valid | `wpm prefix-conformance -m living_diagnostic_clear_v1 -i <valid>` | exit 0 |

## How to add new fixtures

1. Create the XES file in this directory following the naming convention `ggen_<description>.xes`.
2. Use a unique case ID (e.g., `ggen_case_rework`) so traces are distinguishable in logs.
3. Document the expected fitness and violation type in this README.
4. Add a corresponding test case in `process-law-e2e.test.ts` using the `validXes`/`invalidXes`
   pattern.
5. If the fixture tests a new violation category, add a corresponding negative case to the
   conformance command test matrix.

## Related fixtures

The OCPQ (object-centric process query) variants of these traces live under `fixtures/ocpq/`:

- `ggen_valid.json` — OCEL 2.0 format, same lifecycle sequence
- `ggen_invalid_precedence.json` — RouteSelected before DiagnosticRaised (precedence violation)
- `ggen_invalid_immediate.json` — RepairAttempted before RouteSelected (immediate-succession violation)
- `ggen_invalid_exclusion.json` — ReceiptEmitted without GatePassed (exclusion violation)

Real captured traces (JSONL) live under `fixtures/real/ggen-oracle-law/` and
`fixtures/real/ggen-living-loop/`.
