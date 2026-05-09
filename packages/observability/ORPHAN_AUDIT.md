# `@wasm4pm/observability` — Orphan Export Audit

**Generated:** 2026-05-09 (Plan J, Surface J).
**Scope:** Audit-only. NO deletions performed in this pass.
**Method:** `grep -rn "from '@wasm4pm/observability'" apps/ packages/ lab/ playground/` then enumerate `src/index.ts` re-exports.

## External-caller summary

| Symbol | External callers | Recommendation | Rationale |
|---|---|---|---|
| `Instrumentation` | apps/wasm4pm/src/ml-runner.ts; engine/src/engine.ts | **Keep** | Active use across two top-level callers |
| `ObservabilityWrapper` | engine/src/engine.ts | **Keep** | Engine bootstrap depends on it |
| `ObservabilityLayer` | engine/src/wasm-loader.ts (and dist twins) | **Keep** | wasm-loader integration |
| `ObservabilityConfig` | engine/src/engine.ts (type) | **Keep** | Public type contract |
| `OtelEvent` | apps/wasm4pm/src/ml-runner.ts (type) | **Keep** | Type contract for ml-runner events |
| `RequiredOtelAttributes` | apps/wasm4pm/src/ml-runner.ts; playground/scenarios/05-otel-tracing.ts (type) | **Keep** | Type contract |
| `getTracer` | apps/wasm4pm/src/commands/watch.ts; packages/swarm/src/loop.ts | **Keep** | Two active callers |
| `WatchingSpans` | apps/wasm4pm/src/commands/watch.ts | **Keep** | Watch command spans |
| `RunningSpans` | packages/swarm/src/loop.ts; packages/swarm/dist/loop.js | **Keep** | Swarm dispatch spans |
| `LawfulDispatchSpans` | packages/swarm/src/loop.ts | **Keep** | Swarm dispatch spans |
| `REQUIRED_FIELD_NAMES` | playground/scenarios/05-otel-tracing.js | **Keep** | Playground references |
| `createRequiredFields` | playground/scenarios/05-otel-tracing.js | **Keep** | Playground references |
| `getObservabilityLayer` | docs only (API_REFERENCE.md) | **@internal** candidate | No production callers — only docs |
| `SecretRedaction` | docs only (OBSERVABILITY.md) | **@internal** candidate | No production callers |
| `sendMetrics` | docs only (testing/GEMBA.md, may not exist) | **Delete-candidate** | Symbol referenced in docs but not located in src export grep above; verify export presence before deletion |
| `BootstrapSpans` | None (grep) | **Delete-candidate** | No external import found; review intent |
| `PlanningSpans` | None (grep) | **Delete-candidate** | No external import found; review intent |
| `LiveSpan` (class) | None (grep) | **@internal** candidate | Implementation detail leaked through `export *` |
| `Tracer` (interface) | Implicit via `getTracer()` return | **Keep** | Necessary public type |
| `Span`, `SpanKind`, `SpanStatusCode`, `SpanStatus`, `SpanEvent` | None directly grep-able | **@internal** candidate | Surface area for `Tracer` consumers; confirm by widening grep |
| `OtelExporter` | None (grep) | **Delete-candidate** | Re-exported via `export *` from `otel-exporter.js`; no external callers |
| `JsonWriter` | None (grep) | **Delete-candidate** | Re-exported; no external callers |
| `JsonConfig`, `OtelConfig` (types) | Indirect via `ObservabilityConfig` | **Keep** | Required for `ObservabilityConfig` shape |
| `CliEvent`, `JsonEvent` (types) | None (grep) | **@internal** candidate | Internal event union members |
| `ObservabilityResult` (type) | None (grep) | **@internal** candidate | |
| `StateChangeEvent`, `PlanGeneratedEvent`, `AlgorithmEvent`, `IOEvent`, `ProgressEvent`, `ErrorEventData`, `RlAgentDecisionEvent`, `RlPolicyUpdateEvent`, `RlAgentSwitchEvent`, `PredictionTaskEvent`, `DriftCheckEvent`, `ConformanceCheckEvent`, `MlAnalysisEvent`, `EventType` | None grep-direct (used internally by `Instrumentation`) | **@internal** candidates | Used by `Instrumentation.create*Event()` factories — likely not needed as named exports |
| `RequiredFields`, `validateRequiredFields` | None (grep) | **@internal** candidates | Lower-level than `RequiredOtelAttributes` |
| `TraceContext`, `SpanContext`, `generateTraceId`, `generateSpanId`, `parseTraceparent`, `createTraceparent`, `createRootContext`, `createChildContext` | None (grep) | **@internal** candidates | Context-management primitives; consumed only inside the package |
| `SafeEmitResult` (type) | None (grep) | **@internal** candidate | Return shape of `ObservabilityWrapper.safeEmit()` |

## Methodology notes

- "**Keep**" = at least one production import outside this package's own tree (excluding `dist/` self-twins, docs, and tests).
- "**@internal** candidate" = referenced only inside this package's own modules; should be removed from the public re-export surface and marked `@internal` in JSDoc.
- "**Delete-candidate**" = no callers found anywhere; pending owner sign-off before removal in a future surface (NOT this surface — Plan J is audit-only).

## Counts

| Category | Count |
|---|---|
| Keep (active external callers) | 13 |
| @internal candidates (collapse from public surface) | ~25 (named types/utilities buried under `export *`) |
| Delete-candidates (no callers anywhere) | 3 (`OtelExporter`, `JsonWriter`, `BootstrapSpans`/`PlanningSpans` clusters) |

**Approximate orphan count: ~28** (combined @internal + delete-candidates).

## Next-pass checklist (NOT executed in this surface)

- [ ] Convert each delete-candidate to `@internal` first; re-run audit after one release cycle.
- [ ] Replace `export *` blocks in `index.ts` with explicit named re-exports.
- [ ] Add an ESLint rule (`no-restricted-exports`) to block re-introduction.
- [ ] Add a unit test that imports every public symbol — non-importable symbols become test failures, exposing accidental private exports.
