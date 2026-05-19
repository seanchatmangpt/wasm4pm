# AGENT9-002: Add Tier 1 OTEL Instrumentation

**Status:** 🟡 READY  
**Priority:** P0 — Critical (Chicago TDD doctrine)  
**Effort:** 25 hours  
**Complexity:** Medium  
**Type:** Observability Enhancement  

## Summary

AGENT9 promised "100% OTEL coverage" but only 30% of critical functions emit spans. This violates Chicago TDD doctrine: "Trust only event evidence." Without OTEL spans, E2E tests cannot prove lawful execution via OTel traces → OCEL logs → conformance validation.

## Problem Statement

Current state:
- ✅ OTEL infrastructure exists (@wasm4pm/observability, Jaeger configured)
- ✅ Some commands emit spans (run, status, predict)
- ❌ 10 critical functions missing spans:
  - `kernel.run()` — No span for algorithm execution
  - `discovery.*()` — No algorithm-specific spans
  - `rl.orchestrator.cycle()` — No RL state/reward spans
  - `config.resolveConfig()` — No config resolution span
  - `engine.bootstrap()`, `engine.plan()`, `engine.run()` — No lifecycle spans
  - `ml.*()` — No ML algorithm spans
  - `circuit_breaker.*()` — No state transition spans
  - `spc.detect_drift()` — No drift detection spans

Impact:
- ❌ Chicago TDD doctrine violated — cannot derive OCEL logs from traces
- ❌ E2E tests cannot prove conformance via event logs
- ❌ Observability gaps hide failure modes (FM-1, TS-1, CB-1)
- ❌ Cannot diagnose performance issues (p50/p95/p99 latency unknown)

## 10 Critical Functions to Instrument

### Layer 1: Kernel (3 functions)
1. **`kernel.run()`** → Span `kernel.run` (algorithm_name, handle_size, status)
2. **`kernel.stream()`** → Span `kernel.stream` (algorithm_name, chunk_count, status)
3. **`kernel.getAlgorithmMetadata()`** → Span `kernel.getMetadata` (algorithm_name)

### Layer 2: Discovery (2 functions)
4. **`discovery.dfg()`** → Span `discovery.dfg` (event_count, edge_count, duration_ms)
5. **`discovery.genetic_algorithm()`** → Span `discovery.genetic` (population_size, generation_count, best_fitness)

### Layer 3: RL (2 functions)
6. **`rl.orchestrator.cycle()`** → Span `rl.cycle` (agent_id, action, reward, next_state_hash)
7. **`rl.selectAgent()`** → Span `rl.selectAgent` (context_hash, selected_agent, ucb_score)

### Layer 4: Config & Engine (2 functions)
8. **`config.resolveConfig()`** → Span `config.resolve` (source, override_count, config_hash)
9. **`engine.bootstrap()`** → Span `engine.bootstrap` (wasm_size_kb, status, duration_ms)

### Layer 5: Quality/Drift (1 function)
10. **`spc.detect_drift()`** → Span `spc.detect` (rule_number, alert_level, metrics_hash)

## Acceptance Criteria

### 1. Span Emission
```typescript
// packages/observability/src/instrumentation.ts
export interface CriticalSpanAttributes {
  // kernel.run
  'algorithm.name': string;
  'event_log.size': number;
  'execution.status': 'ok' | 'error';
  'execution.duration_ms': number;
  
  // discovery.*
  'graph.node_count': number;
  'graph.edge_count': number;
  
  // rl.cycle
  'agent.id': string;
  'agent.action': number;
  'reward.value': number;
  'state.hash': string;
  
  // config.resolve
  'config.source': 'cli' | 'file' | 'env' | 'default';
  'config.override_count': number;
  
  // engine.bootstrap
  'wasm.size_kb': number;
  'wasm.status': 'loaded' | 'failed';
  
  // spc.detect
  'spc.rule_number': number;
  'spc.alert_level': number; // 0-3
}
```

### 2. Span Status
Every span MUST include a status field:
```typescript
span.setStatus({ code: SpanStatusCode.OK });      // Success
span.setStatus({ code: SpanStatusCode.ERROR, message: 'reason' });  // Failure
```

### 3. Test Verification (Jaeger UI)
For each function, verify:
- Span appears in Jaeger UI (`http://localhost:16686`)
- Service name is `wasm4pm`
- Span name matches convention
- Status field is populated (not omitted)
- Attributes capture actual values (not null)

### 4. OCEL Derivation
Verify that OTEL traces can be converted to OCEL:
```bash
# In E2E test
const traces = await otelCapture.getTraces();
const ocelLog = convertTracesToOCEL(traces);
assert(ocelLog.events.length > 0);  // Can derive events
assert(ocelLog.objects.length > 0);  // Can derive objects
```

## Definition of Done

- ✅ All 10 functions emit OTEL spans
- ✅ All spans include status field (ok/error)
- ✅ All spans include required attributes (no nulls)
- ✅ Span names follow `domain.operation` convention
- ✅ Spans visible in Jaeger UI for all 10 functions
- ✅ OTEL traces can be converted to OCEL logs
- ✅ E2E tests use OtelCapture to validate spans
- ✅ No breaking changes to function signatures

## Implementation Plan

### Phase 1: Kernel Instrumentation (8 hours)
1. Update `packages/kernel/src/api.ts` — wrap `run()`, `stream()`, `getAlgorithmMetadata()`
2. Create spans via `Instrumentation.createKernelSpan()`
3. Wire attributes: algorithm_name, event_log size, status, duration
4. Write 3 tests validating spans appear in capture

### Phase 2: Discovery Instrumentation (6 hours)
1. Update `packages/kernel/src/discovery/*.ts` — wrap discovery functions
2. Create spans via `Instrumentation.createDiscoverySpan()`
3. Wire attributes: node_count, edge_count, fitness (if available)
4. Write 2 tests for DFG and genetic

### Phase 3: RL & Config Instrumentation (6 hours)
1. Update `wasm4pm/src/rl_orchestrator.rs` — emit to JavaScript span via `wasm_bindgen`
2. Update `packages/config/src/resolver.ts` — wrap `resolveConfig()`
3. Update `packages/engine/src/engine.ts` — wrap bootstrap/plan/run
4. Write 3 tests for RL, config, engine

### Phase 4: Quality & Edge Cases (5 hours)
1. Update `wasm4pm/src/spc.rs` — emit drift detection spans
2. Update `packages/observability/src/instrumentation.ts` — add error handling
3. Add timeout protection (5s max for span emission)
4. Write 2 tests for SPC and error cases

## Metrics

- Lines of code: ~800
- Files modified: 12 (kernel, discovery, rl, config, engine, observability, spc)
- Spans added: 10
- Test cases: 10+
- OTEL coverage: 30% → 80%

## Dependencies

- `@wasm4pm/observability` (already exists)
- `@opentelemetry/api` (already in dependencies)
- Jaeger local instance (for testing)

## Blockers

- AGENT9-001: E2E test scenarios must exist to validate spans
- E2E tests must use `OtelCapture` to assert span presence/attributes

## Related Issues

- AGENT9-001: E2E test scenarios (consumes these spans)
- AGENT9-003: Performance baselines (uses these latency attributes)
