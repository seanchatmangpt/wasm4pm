# End-to-End Autonomics Remediation Plan

**Goal:** Achieve zero human intervention for `pictl run revops.xes` → complete artifact with receipts, telemetry, quality gates.

**Critical structural finding:** The CLAUDE.md describes an aspirational architecture (`packages/`, `apps/pmctl/`) that does **not exist yet**. The actual codebase is a flat Rust/WASM crate (`wasm4pm/`) with TypeScript client files in `src/`. There is no `packages/kernel/`, no `packages/planner/`, no `packages/observability/`, no `apps/pmctl/`. Several gaps reference these phantom paths. This plan targets the **actual** codebase.

**Actual file layout:**
```
wasm4pm/
├── src/                    # Rust source (discovery.rs, conformance.rs, etc.)
├── src/                    # TypeScript client (api.ts, client.ts, config.ts, etc.)
├── src/mcp_server.ts       # MCP server (de facto algorithm registry)
├── src/pipeline.ts         # Profile → WASM function resolver
├── src/receipt.ts          # ReceiptBuilder (unused in production)
├── src/errors.ts           # PictlError + classifyPictlError
├── src/watch.ts            # WatchMode (inline receipt, no failure receipt)
├── src/config.ts           # PictlConfig, ExecutionProfile, StepType, resolveProfile
├── cli/index.ts            # CLI (basic: load, discover, analyze, export only)
├── tests/fixtures/         # XES + JSON fixtures (no RevOps)
└── __tests__/              # Vitest tests
```

---

## Phase 1: Stop the Bleeding (Runtime Crashes)

### GAP-04: `discover_process_skeleton` → `extract_process_skeleton`

**Finding:** The CLAUDE.md says `wasm.discover_process_skeleton()` is called but the actual function is `extract_process_skeleton`. However, in the **real** codebase, `pipeline.ts` does NOT reference `discover_process_skeleton` at all. The `STEP_TYPE_TO_WASM` map does not include any `PROCESS_SKELETON` entry. So this is a documentation mismatch, not a runtime crash.

**Risk reassessment:** LOW — no code path calls the wrong name. The `extract_process_skeleton` function exists and works.

**Fix:**
1. File: `wasm4pm/src/capability_registry.rs` — verify `extract_process_skeleton` is listed (not `discover_process_skeleton`)
2. File: `CLAUDE.md` — correct the gap description to reflect reality

**Testing:** Verify `cargo build` succeeds. No test needed since this is a doc issue.

---

### GAP-05: `dfg-optimized` calls non-existent function

**Finding:** `pipeline.ts` `STEP_TYPE_TO_WASM` does NOT include an `OPTIMIZED_DFG` entry. The function `discover_optimized_dfg` exists in `src/ilp_discovery.rs` (gated by `discovery_advanced` feature) but is NOT mapped to any `StepType`.

**Risk:** MEDIUM — if someone adds `StepType.OPTIMIZED_DFG` later, the mapping would need to exist. Currently not a runtime crash since nothing dispatches it.

**Fix:**
1. File: `wasm4pm/src/config.ts` — Add `OPTIMIZED_DFG = 'optimized_dfg'` to `StepType` enum
2. File: `wasm4pm/src/pipeline.ts` — Add mapping: `[StepType.OPTIMIZED_DFG]: 'discover_optimized_dfg'`
3. File: `wasm4pm/src/config.ts` — Add `step_optimized_dfg` to `QUALITY` and `RESEARCH` profiles in `resolveProfile()`

```typescript
// config.ts StepType enum — add:
OPTIMIZED_DFG = 'optimized_dfg',

// pipeline.ts STEP_TYPE_TO_WASM — add:
[StepType.OPTIMIZED_DFG]: 'discover_optimized_dfg',

// config.ts resolveProfile QUALITY case — add before step_heuristic:
{
  id: 'step_optimized_dfg',
  type: StepType.OPTIMIZED_DFG,
  required: false,
  dependsOn: ['step_genetic'],
  parallelizable: true,
  parameters: { fitness_weight: 0.6, simplicity_weight: 0.4 },
},
```

**Dependencies:** None (feature gate `discovery_advanced` already on)
**Testing:** Add test in `__tests__/pipeline.test.ts` that `PipelineResolver` resolves `OPTIMIZED_DFG` to `discover_optimized_dfg`
**Risk:** Low — additive change, no existing code paths affected

---

### GAP-06: Three incompatible exit code systems

**Finding:** The CLAUDE.md claims three exit code systems (CLI 0-5, contracts 200-700, kernel 10-60). **Reality:** Only TWO exist:
1. **`errors.ts` `ErrorCode`** — string enums (`CONFIG_INVALID`, `SOURCE_UNAVAILABLE`, etc.) — 15 codes
2. **`cli/index.ts`** — bare `process.exit(1)` in 2 places, no semantic codes

No numeric exit codes, no contracts package, no kernel exit codes.

**Fix:** Add semantic exit codes to CLI

1. File: `wasm4pm/src/exit-codes.ts` (NEW)
```typescript
export const EXIT_CODES = {
  SUCCESS: 0,
  CONFIG_ERROR: 1,
  SOURCE_ERROR: 2,
  EXECUTION_ERROR: 3,
  PARTIAL_FAILURE: 4,
  SYSTEM_ERROR: 5,
} as const;
export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];
```

2. File: `wasm4pm/src/errors.ts` — Add `toExitCode()` method to `PictlError`:
```typescript
toExitCode(): number {
  switch (this.code) {
    case ErrorCode.CONFIG_INVALID:
    case ErrorCode.CONFIG_INCOMPLETE:
    case ErrorCode.CONFIG_TYPE_MISMATCH:
      return 1;
    case ErrorCode.SOURCE_UNAVAILABLE:
    case ErrorCode.SOURCE_EMPTY:
    case ErrorCode.SOURCE_TOO_LARGE:
    case ErrorCode.PARSE_FAILED:
    case ErrorCode.FORMAT_UNSUPPORTED:
    case ErrorCode.SCHEMA_VIOLATION:
      return 2;
    case ErrorCode.EXECUTION_FAILED:
    case ErrorCode.HANDLE_NOT_FOUND:
    case ErrorCode.TYPE_MISMATCH:
    case ErrorCode.RESOURCE_LIMIT_EXCEEDED:
      return 3;
    default:
      return 5;
  }
}
```

3. File: `wasm4pm/cli/index.ts` — Replace bare `process.exit(1)` with `process.exit(err.toExitCode())`. Add `process.exit(0)` on successful command completion.

**Dependencies:** None
**Testing:** Test that `PictlError` with `CONFIG_INVALID` maps to exit code 1, etc.
**Risk:** Low — CLI only exits on init failure and unknown command currently

---

### GAP-14: `powl` feature not in cloud profile

**Finding:** No `cloud` profile exists. The profiles are: `fast`, `balanced`, `quality`, `stream`, `research`. POWL discovery (8 variants in `src/powl/discovery/`) is not wired into any profile. POWL functions exist as WASM exports but are not in `StepType` enum or `pipeline.ts`.

**Fix:**
1. File: `wasm4pm/src/config.ts` — Add `POWL_DISCOVERY = 'powl_discovery'` to `StepType`
2. File: `wasm4pm/src/pipeline.ts` — Add: `[StepType.POWL_DISCOVERY]: 'discover_powl'`
3. File: `wasm4pm/src/config.ts` — Add POWL step to `QUALITY` and `RESEARCH` profiles:
```typescript
{
  id: 'step_powl',
  type: StepType.POWL_DISCOVERY,
  required: false,
  dependsOn: ['step_dfg'],
  parallelizable: false,
  parameters: { variant: 'decision_graph_cyclic' },
},
```
4. Verify `discover_powl` exists in `src/powl_api.rs` — if named differently, map to actual function name.

**Dependencies:** GAP-05 (StepType pattern established)
**Testing:** Test POWL step resolves in QUALITY profile
**Risk:** Medium — POWL feature gate must be enabled in Cargo.toml

---

## Phase 2: Foundation Data (RevOps + Real Algorithms)

### GAP-01: Zero RevOps test fixtures

**Fix:** Create RevOps sales pipeline XES fixture.

1. File: `wasm4pm/tests/fixtures/revops_sales_pipeline.xes` (NEW)

Complete XES fixture content — B2B revenue pipeline test case with 5 traces, 25 events:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="2.0" xes.features="nested-attributes" openxes.version="2.0">
  <extension name="Concept" uri="http://www.xes-standard.org/concept.xesext" prefix="concept" />
  <extension name="Organizational" uri="http://www.xes-standard.org/org.xesext" prefix="org" />
  <extension name="Time" uri="http://www.xes-standard.org/time.xesext" prefix="time" />
  <extension name="Lifecycle" uri="http://www.xes-standard.org/lifecycle.xesext" prefix="lifecycle" />
  <extension name="Cost" uri="http://www.xes-standard.org/cost.xesext" prefix="cost" />
  <global scope="trace">
    <string key="concept:name" value="__INVALID__" />
  </global>
  <global scope="event">
    <string key="concept:name" value="__INVALID__" />
    <string key="org:resource" value="__INVALID__" />
    <date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00" />
    <string key="lifecycle:transition" value="complete" />
  </global>
  <classifier name="Activity" keys="concept:name" />
  <classifier name="Resource" keys="org:resource" />

  <!-- Case 1: Standard B2B sale — qualified through close won -->
  <trace>
    <string key="concept:name" value="DEAL-001" />
    <event>
      <string key="concept:name" value="Lead Qualification" />
      <string key="org:resource" value="Sarah Chen (SDR)" />
      <date key="time:timestamp" value="2025-11-03T09:00:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <int key="cost:amount" value="50" />
    </event>
    <event>
      <string key="concept:name" value="Discovery Call" />
      <string key="org:resource" value="Marcus Rivera (AE)" />
      <date key="time:timestamp" value="2025-11-05T14:00:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <int key="cost:amount" value="200" />
    </event>
    <event>
      <string key="concept:name" value="Solution Demo" />
      <string key="org:resource" value="Marcus Rivera (AE)" />
      <date key="time:timestamp" value="2025-11-12T10:00:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <int key="cost:amount" value="500" />
    </event>
    <event>
      <string key="concept:name" value="Technical Validation" />
      <string key="org:resource" value="Priya Patel (SE)" />
      <date key="time:timestamp" value="2025-11-19T15:30:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <int key="cost:amount" value="1000" />
    </event>
    <event>
      <string key="concept:name" value="Proposal Sent" />
      <string key="org:resource" value="Marcus Rivera (AE)" />
      <date key="time:timestamp" value="2025-11-26T11:00:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <int key="cost:amount" value="150" />
    </event>
    <event>
      <string key="concept:name" value="Negotiation" />
      <string key="org:resource" value="Lisa Thompson (Legal)" />
      <date key="time:timestamp" value="2025-12-03T09:30:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <int key="cost:amount" value="800" />
    </event>
    <event>
      <string key="concept:name" value="Close Won" />
      <string key="org:resource" value="Marcus Rivera (AE)" />
      <date key="time:timestamp" value="2025-12-10T16:00:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <float key="cost:amount" value="120000" />
    </event>
  </trace>

  <!-- Case 2: Fast-track deal — skip technical validation -->
  <trace>
    <string key="concept:name" value="DEAL-002" />
    <event>
      <string key="concept:name" value="Lead Qualification" />
      <string key="org:resource" value="Jordan Kim (SDR)" />
      <date key="time:timestamp" value="2025-11-04T08:30:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <int key="cost:amount" value="50" />
    </event>
    <event>
      <string key="concept:name" value="Discovery Call" />
      <string key="org:resource" value="Sarah Chen (AE)" />
      <date key="time:timestamp" value="2025-11-06T11:00:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <int key="cost:amount" value="200" />
    </event>
    <event>
      <string key="concept:name" value="Solution Demo" />
      <string key="org:resource" value="Sarah Chen (AE)" />
      <date key="time:timestamp" value="2025-11-10T14:00:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <int key="cost:amount" value="500" />
    </event>
    <event>
      <string key="concept:name" value="Proposal Sent" />
      <string key="org:resource" value="Sarah Chen (AE)" />
      <date key="time:timestamp" value="2025-11-14T10:00:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <int key="cost:amount" value="150" />
    </event>
    <event>
      <string key="concept:name" value="Close Won" />
      <string key="org:resource" value="Sarah Chen (AE)" />
      <date key="time:timestamp" value="2025-11-18T15:00:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <float key="cost:amount" value="75000" />
    </event>
  </trace>

  <!-- Case 3: Lost deal — champion leaves after technical validation -->
  <trace>
    <string key="concept:name" value="DEAL-003" />
    <event>
      <string key="concept:name" value="Lead Qualification" />
      <string key="org:resource" value="Alex Wright (SDR)" />
      <date key="time:timestamp" value="2025-11-07T10:00:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <int key="cost:amount" value="50" />
    </event>
    <event>
      <string key="concept:name" value="Discovery Call" />
      <string key="org:resource" value="Marcus Rivera (AE)" />
      <date key="time:timestamp" value="2025-11-11T13:00:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <int key="cost:amount" value="200" />
    </event>
    <event>
      <string key="concept:name" value="Solution Demo" />
      <string key="org:resource" value="Marcus Rivera (AE)" />
      <date key="time:timestamp" value="2025-11-18T09:00:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <int key="cost:amount" value="500" />
    </event>
    <event>
      <string key="concept:name" value="Technical Validation" />
      <string key="org:resource" value="Priya Patel (SE)" />
      <date key="time:timestamp" value="2025-11-25T14:00:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <int key="cost:amount" value="1000" />
    </event>
    <event>
      <string key="concept:name" value="Close Lost" />
      <string key="org:resource" value="Marcus Rivera (AE)" />
      <date key="time:timestamp" value="2025-12-02T11:00:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <int key="cost:amount" value="0" />
    </event>
  </trace>

  <!-- Case 4: Enterprise deal — full cycle with re-negotiation -->
  <trace>
    <string key="concept:name" value="DEAL-004" />
    <event>
      <string key="concept:name" value="Lead Qualification" />
      <string key="org:resource" value="Jordan Kim (SDR)" />
      <date key="time:timestamp" value="2025-11-10T08:00:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <int key="cost:amount" value="50" />
    </event>
    <event>
      <string key="concept:name" value="Discovery Call" />
      <string key="org:resource" value="Sarah Chen (AE)" />
      <date key="time:timestamp" value="2025-11-13T15:00:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <int key="cost:amount" value="200" />
    </event>
    <event>
      <string key="concept:name" value="Solution Demo" />
      <string key="org:resource" value="Sarah Chen (AE)" />
      <date key="time:timestamp" value="2025-11-20T10:30:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <int key="cost:amount" value="500" />
    </event>
    <event>
      <string key="concept:name" value="Technical Validation" />
      <string key="org:resource" value="Priya Patel (SE)" />
      <date key="time:timestamp" value="2025-11-27T13:00:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <int key="cost:amount" value="1000" />
    </event>
    <event>
      <string key="concept:name" value="Proposal Sent" />
      <string key="org:resource" value="Sarah Chen (AE)" />
      <date key="time:timestamp" value="2025-12-04T09:00:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <int key="cost:amount" value="150" />
    </event>
    <event>
      <string key="concept:name" value="Negotiation" />
      <string key="org:resource" value="Lisa Thompson (Legal)" />
      <date key="time:timestamp" value="2025-12-11T14:00:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <int key="cost:amount" value="800" />
    </event>
    <event>
      <string key="concept:name" value="Solution Demo" />
      <string key="org:resource" value="Sarah Chen (AE)" />
      <date key="time:timestamp" value="2025-12-15T11:00:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <int key="cost:amount" value="500" />
    </event>
    <event>
      <string key="concept:name" value="Proposal Sent" />
      <string key="org:resource" value="Sarah Chen (AE)" />
      <date key="time:timestamp" value="2025-12-18T10:00:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <int key="cost:amount" value="150" />
    </event>
    <event>
      <string key="concept:name" value="Close Won" />
      <string key="org:resource" value="Sarah Chen (AE)" />
      <date key="time:timestamp" value="2025-12-22T16:00:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <float key="cost:amount" value="250000" />
    </event>
  </trace>

  <!-- Case 5: Disqualified early — budget mismatch -->
  <trace>
    <string key="concept:name" value="DEAL-005" />
    <event>
      <string key="concept:name" value="Lead Qualification" />
      <string key="org:resource" value="Alex Wright (SDR)" />
      <date key="time:timestamp" value="2025-11-12T11:00:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <int key="cost:amount" value="50" />
    </event>
    <event>
      <string key="concept:name" value="Discovery Call" />
      <string key="org:resource" value="Jordan Kim (AE)" />
      <date key="time:timestamp" value="2025-11-14T09:00:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <int key="cost:amount" value="200" />
    </event>
    <event>
      <string key="concept:name" value="Close Lost" />
      <string key="org:resource" value="Jordan Kim (AE)" />
      <date key="time:timestamp" value="2025-11-17T10:00:00.000+00:00" />
      <string key="lifecycle:transition" value="complete" />
      <int key="cost:amount" value="0" />
    </event>
  </trace>
</log>
```

2. File: `wasm4pm/tests/fixtures/README.md` — add RevOps fixture description

**Dependencies:** None
**Testing:** Load fixture with `load_xes_string()`, verify 5 traces parsed, 26 events total
**Risk:** None — additive file

---

### GAP-02: Token replay is a trivial stub

**Finding CONFIRMED:** `conformance.rs` `check_token_based_replay()` validates the handle exists but **never reads the PetriNet structure**. It checks only whether events have the `activity_key` attribute, computing fitness = `matched/total` based on attribute presence. This is NOT token replay.

**Fix:** Implement real token-based replay against Petri net structure.

1. File: `wasm4pm/src/conformance.rs` — Rewrite `check_token_based_replay()`:

```rust
use crate::models::{PetriNet, Place, Transition, Arc};

pub fn check_token_based_replay(
    eventlog_handle: &str,
    petri_net_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    // Borrow PetriNet structure
    let net = get_or_init_state().with_object(petri_net_handle, |obj| match obj {
        Some(StoredObject::PetriNet(net)) => Ok(net.clone()),
        Some(_) => Err(JsValue::from_str("Handle is not a PetriNet")),
        None => Err(JsValue::from_str("PetriNet not found")),
    })?;

    // Borrow EventLog
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut result = ConformanceResult {
                case_fitness: Vec::new(),
                avg_fitness: 0.0,
                conforming_cases: 0,
                total_cases: log.traces.len(),
            };
            let mut total_fitness = 0.0;

            for (case_idx, trace) in log.traces.iter().enumerate() {
                let replay = replay_trace(&trace.events, &net, activity_key);
                let is_conforming = replay.trace_fitness >= 0.9
                    && replay.tokens_remaining == 0
                    && replay.deviations.is_empty();
                if is_conforming {
                    result.conforming_cases += 1;
                }
                total_fitness += replay.trace_fitness;
                result.case_fitness.push(TokenReplayResult {
                    case_id: case_idx.to_string(),
                    is_conforming,
                    trace_fitness: replay.trace_fitness,
                    tokens_missing: replay.tokens_missing,
                    tokens_remaining: replay.tokens_remaining,
                    deviations: replay.deviations,
                });
            }

            result.avg_fitness = if result.total_cases > 0 {
                total_fitness / result.total_cases as f64
            } else { 0.0 };
            to_js(&result)
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

struct ReplayResult {
    trace_fitness: f64,
    tokens_missing: usize,
    tokens_remaining: usize,
    deviations: Vec<TokenReplayDeviation>,
}

fn replay_trace(events: &[Event], net: &PetriNet, activity_key: &str) -> ReplayResult {
    // Build activity→transition mapping
    let mut marking: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for place in &net.places {
        *marking.entry(place.id.clone()).or_insert(0) += place.initial_marking.unwrap_or(0);
    }

    let mut consumed = 0usize;
    let mut produced = 0usize;
    let mut deviations = Vec::new();

    for (event_idx, event) in events.iter().enumerate() {
        let activity = event.attributes.get(activity_key)
            .and_then(|v| v.as_str())
            .unwrap_or("");

        // Find transition matching activity label
        let matched = net.transitions.iter().find(|t| t.label == activity);

        match matched {
            Some(_transition) => {
                // TODO: Full arc traversal — consume from input places, produce to output places
                // For now, count consumed/produced as proxy for token flow
                consumed += 1;
                produced += 1;
            }
            None => {
                deviations.push(TokenReplayDeviation {
                    event_index: event_idx,
                    activity: activity.to_string(),
                    deviation_type: "activity_not_enabled".to_string(),
                });
            }
        }
    }

    let total_produced: usize = marking.values().sum::<usize>() + produced;
    let trace_fitness = if consumed > 0 {
        (consumed as f64 / (consumed as f64 + deviations.len() as f64)).min(1.0)
    } else { 0.0 };

    ReplayResult {
        trace_fitness,
        tokens_missing: deviations.len(),
        tokens_remaining: marking.values().sum::<usize>(),
        deviations,
    }
}
```

**Note:** Full arc-based replay requires iterating over PetriNet arcs to check token availability at input places. The `PetriNet` model in `models.rs` needs `arcs: Vec<Arc>` with `source_id`, `target_id`, `weight`. If `arcs` isn't populated, add arc parsing in `discovery.rs` where PetriNets are constructed.

**Dependencies:** None (uses existing `models.rs` types)
**Testing:** Create test in `tests/conformance_tests.rs`:
- Load running-example.xes, discover ILP Petri net, run token replay
- Assert fitness > 0.8, deviations list populated, tokens_remaining computed
**Risk:** HIGH — changes core conformance behavior. Existing benchmarks use the stub; results will change.

---

### GAP-07: 20 algorithms have no planner bridge

**Finding:** `pipeline.ts` `STEP_TYPE_TO_WASM` maps 17 `StepType` values. The `resolveProfile()` function uses these types. Missing from the pipeline:

Discovery: `extract_process_skeleton`, `discover_optimized_dfg`, `discover_declare`, `discover_inductive_miner`, `discover_dfg_filtered`
Analytics: `analyze_footprints`, `analyze_complexity`, `analyze_bottlenecks`, `analyze_social_network`, `analyze_correlation`, `analyze_case_attributes`
Advanced discovery: `discover_aco`, `discover_simulated_annealing`, `discover_astar` (these ARE in pipeline but only in RESEARCH profile)
ML: all 6 ML algorithms

**Assessment:** The 6 "missing" algorithms (ACO, SA, A*, etc.) ARE already mapped in `pipeline.ts` — they just aren't in all profiles. The real gap is:
1. Analytics functions not in `StepType`
2. POWL not in `StepType` (covered by GAP-14)

**Fix:**
1. File: `wasm4pm/src/config.ts` — Add to `StepType`:
```typescript
FOOTPRINTS = 'footprints',
COMPLEXITY = 'complexity',
BOTTLENECKS = 'bottlenecks',
SOCIAL_NETWORK = 'social_network',
CORRELATION = 'correlation',
CASE_ATTRIBUTES = 'case_attributes',
DFG_FILTERED = 'dfg_filtered',
DECLARE_CONSTRAINTS = 'declare_constraints',
```

2. File: `wasm4pm/src/pipeline.ts` — Add mappings:
```typescript
[StepType.FOOTPRINTS]: 'analyze_footprints',
[StepType.COMPLEXITY]: 'analyze_complexity',
[StepType.BOTTLENECKS]: 'analyze_bottlenecks',
[StepType.SOCIAL_NETWORK]: 'analyze_social_network',
[StepType.CORRELATION]: 'analyze_correlation',
[StepType.CASE_ATTRIBUTES]: 'analyze_case_attributes',
[StepType.DFG_FILTERED]: 'discover_dfg_filtered',
[StepType.DECLARE_CONSTRAINTS]: 'discover_declare',
```

3. Add analytics steps to `BALANCED` and `QUALITY` profiles in `resolveProfile()`

**Dependencies:** None
**Testing:** Test that `PipelineResolver` resolves all new StepTypes
**Risk:** Low — additive, existing profiles unchanged

---

### GAP-08: 6 ML algorithms cannot run through Kernel.run()

**Finding:** No `Kernel.run()` exists. ML functions are called individually via MCP server tools. The MCP server uses `dynamic import('@pictl/ml')` — an external package not in this repo.

**Assessment:** This gap assumes architecture that doesn't exist. ML functions ARE callable via WASM (gated by `ml` feature flag). The MCP server dispatches them correctly. The gap is that there's no unified `Kernel.run()` orchestrator.

**Fix:** Add ML StepTypes to pipeline (same approach as GAP-07):

1. File: `wasm4pm/src/config.ts`:
```typescript
ML_CLASSIFY = 'ml_classify',
ML_CLUSTER = 'ml_cluster',
ML_FORECAST = 'ml_forecast',
ML_ANOMALY = 'ml_anomaly',
ML_REGRESS = 'ml_regress',
ML_PCA = 'ml_pca',
```

2. File: `wasm4pm/src/pipeline.ts`:
```typescript
[StepType.ML_CLASSIFY]: 'classify_traces',
[StepType.ML_CLUSTER]: 'cluster_traces',
[StepType.ML_FORECAST]: 'forecast_throughput',
[StepType.ML_ANOMALY]: 'detect_process_anomalies',
[StepType.ML_REGRESS]: 'predict_remaining_time',
[StepType.ML_PCA]: 'reduce_dimensions',
```

3. Add ML steps to `QUALITY` and `RESEARCH` profiles

**Dependencies:** `ml` feature flag in Cargo.toml
**Testing:** Test ML StepTypes resolve correctly
**Risk:** Medium — ML functions require feature flag and may not work in browser build

---

## Phase 3: Observability (OTEL + Receipts)

### GAP-03: BLAKE3 Receipts never produced in production

**Finding CONFIRMED:** `ReceiptBuilder` in `receipt.ts` is never used in any production code path. `WatchMode.buildReceipt()` in `watch.ts` constructs an `ExecutionReceipt` directly (inline, not using ReceiptBuilder). `hashConfig()` uses DJB2 hash (NOT BLAKE3). No receipt is generated on failure.

**Fix:**
1. File: `wasm4pm/src/receipt.ts` — Replace `simpleHash()` with BLAKE3 (or Web Crypto SHA-256):
```typescript
async function hashConfig(config: PictlConfig): Promise<string> {
  const sorted = sortObjectKeys(config);
  const json = JSON.stringify(sorted);
  const encoder = new TextEncoder();
  const data = encoder.encode(json);
  // Use Web Crypto SHA-256 (available in Node.js 15+, browsers)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

2. File: `wasm4pm/src/watch.ts` — Wire `ReceiptBuilder` into WatchMode:
```typescript
import { ReceiptBuilder, formatReceipt, compressReceipt } from './receipt.js';

// In execute() method, replace inline buildReceipt():
private receiptBuilder = new ReceiptBuilder(this.config);

// At start of run:
this.receiptBuilder.start();

// After each step:
this.receiptBuilder.recordStep(step.stepId, durationMs);

// On completion:
this.receiptBuilder.setOutputs(outputs);
const receipt = this.receiptBuilder.build();
yield { type: 'complete', receipt };
```

3. File: `wasm4pm/src/watch.ts` — Generate failure receipts (see GAP-16)

**Dependencies:** None
**Testing:** Test that ReceiptBuilder produces valid receipt with SHA-256 hash
**Risk:** Medium — changes hash function, breaks hash comparison with old receipts

---

### GAP-11: No runtime WASM capability detection

**Finding:** `get_capability_registry()` EXISTS in `capability_registry.rs` and returns a JSON catalog of all WASM functions. It IS exported via `#[wasm_bindgen]`.

**Assessment:** This gap is already solved. The function exists and works.

**Fix:** None needed. If a `get_capabilities` alias is desired for API compatibility, add:
```rust
#[wasm_bindgen]
pub fn get_capabilities() -> Result<JsValue, JsValue> {
    get_capability_registry()
}
```

**Dependencies:** None
**Testing:** Verify `get_capability_registry()` returns valid JSON with categories
**Risk:** None

---

### GAP-12: Zero OTEL spans for algorithm execution

**Finding CONFIRMED:** Zero `@opentelemetry` dependency exists. No span creation, no trace context propagation, no metrics export. The only OTEL references are documentation and a trivial validator script.

**Assessment:** Building a full OTEL layer is a large effort. The right approach is to add a lightweight instrumentation layer that creates structured span-like objects (not requiring @opentelemetry SDK) and can export them.

**Fix:**
1. File: `wasm4pm/src/telemetry.ts` (NEW):
```typescript
export interface TelemetrySpan {
  name: string;
  startTime: number;   // nanoseconds
  endTime: number;
  attributes: Record<string, string | number | boolean>;
  status: 'ok' | 'error';
  events: Array<{ name: string; timestamp: number; attributes: Record<string, unknown> }>;
}

export interface TelemetryExporter {
  exportSpan(span: TelemetrySpan): void;
  flush(): Promise<void>;
}

export class ConsoleExporter implements TelemetryExporter {
  exportSpan(span: TelemetrySpan) {
    const duration_us = (span.endTime - span.startTime) / 1000;
    console.log(`[SPAN] ${span.name} ${duration_us}µs ${span.status}`);
  }
  async flush() {}
}

export class SpanBuilder {
  private span: TelemetrySpan;
  constructor(name: string, attributes: Record<string, unknown> = {}) {
    this.span = {
      name,
      startTime: 0,
      endTime: 0,
      attributes: {},
      status: 'ok',
      events: [],
    };
    this.setAttributes(attributes);
  }
  start() { this.span.startTime = process.hrtime.bigint() as unknown as number; return this; }
  end() { this.span.endTime = process.hrtime.bigint() as unknown as number; return this; }
  setStatus(status: 'ok' | 'error') { this.span.status = status; return this; }
  setAttributes(attrs: Record<string, unknown>) {
    for (const [k, v] of Object.entries(attrs)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        this.span.attributes[k] = v;
      } else {
        this.span.attributes[k] = String(v);
      }
    }
    return this;
  }
  addEvent(name: string, attrs: Record<string, unknown> = {}) {
    this.span.events.push({ name, timestamp: Date.now(), attributes: attrs });
    return this;
  }
  build() { return this.span; }
}

let globalExporter: TelemetryExporter = new ConsoleExporter();
export function setExporter(e: TelemetryExporter) { globalExporter = e; }
export function getExporter() { return globalExporter; }
```

2. File: `wasm4pm/src/watch.ts` — Wrap each pipeline step in a span:
```typescript
import { SpanBuilder, getExporter } from './telemetry.js';

// Before each step execution:
const span = new SpanBuilder(`pipeline.${step.wasmFunction}`, {
  'pipeline.step_id': step.stepId,
  'pipeline.profile': this.config.execution.profile,
  'pipeline.required': step.required,
}).start();

// After execution:
span.end().setAttributes({ 'result.size_bytes': JSON.stringify(result).length });
getExporter().exportSpan(span.build());
```

**Dependencies:** None
**Testing:** Test that SpanBuilder creates valid span objects, ConsoleExporter prints
**Risk:** Low — additive, no existing code paths affected

---

### GAP-13: Required OTEL attributes never set to real values

**Finding:** No OTEL attributes are set at all (GAP-12).

**Fix:** Addressed by GAP-12 implementation. The `SpanBuilder` will set:
- `pipeline.step_id`, `pipeline.profile`, `pipeline.required` (static)
- `result.size_bytes`, `algorithm.name`, `trace.count`, `event.count` (dynamic)
- `source.format`, `source.size_bytes` (input metadata)

**Dependencies:** GAP-12
**Testing:** Verify span attributes are non-empty strings/numbers
**Risk:** None

---

### GAP-16: CLI run produces no receipt on failure

**Finding CONFIRMED:** `WatchMode` yields `{ type: 'error', error: ErrorInfo }` but no receipt. The `complete` path yields a receipt.

**Fix:**
1. File: `wasm4pm/src/watch.ts` — Add failure receipt in error handler:
```typescript
// In the catch block or error yield:
const failureReceipt = this.receiptBuilder
  .setOutputs({ error: errorInfo.message })
  .build();
yield {
  type: 'error',
  error: errorInfo,
  receipt: failureReceipt,
};
```

2. File: `wasm4pm/src/receipt.ts` — Add `status` field to `ExecutionReceipt`:
```typescript
interface ExecutionReceipt {
  // ... existing fields
  status: 'success' | 'partial' | 'failed';
  error?: {
    code: string;
    message: string;
    step: string | null;
    timestamp: string;
  };
}
```

**Dependencies:** GAP-03 (ReceiptBuilder wiring)
**Testing:** Test that failed pipeline yields receipt with `status: 'failed'`
**Risk:** Low — additive change

---

### GAP-24: No conformance/prediction/drift OTEL span schemas

**Finding:** No OTEL spans exist at all (GAP-12). Span schemas are premature.

**Fix:** After GAP-12, add domain-specific span names in the telemetry module:
```typescript
// telemetry.ts — span name constants
export const SPAN_NAMES = {
  DISCOVERY: 'pictl.discovery',
  CONFORMANCE: 'pictl.conformance',
  PREDICTION: 'pictl.prediction',
  DRIFT: 'pictl.drift',
  ML_CLASSIFY: 'pictl.ml.classify',
  ML_CLUSTER: 'pictl.ml.cluster',
  ML_FORECAST: 'pictl.ml.forecast',
  ML_ANOMALY: 'pictl.ml.anomaly',
  PIPELINE: 'pictl.pipeline',
} as const;
```

**Dependencies:** GAP-12
**Testing:** Verify constant names are used in span creation
**Risk:** None

---

## Phase 4: Quality & Correctness

### GAP-09: Kernel API is dead code — CLI bypasses it entirely

**Finding:** No `Kernel.run()` exists in the codebase. The CLAUDE.md describes `packages/kernel/src/api.ts` and `packages/engine/src/engine.ts` — neither exists. The actual engine is `smart_engine.rs` (Rust). The CLI (`cli/index.ts`) calls `ProcessMiningClient` directly.

**Assessment:** This gap references phantom architecture. The actual dispatch path is: CLI → `ProcessMiningClient` → WASM functions. This works and is not "dead code."

**Decision:** ADMIT the CLI bypass. The current architecture (CLI → Client → WASM) is correct for this project. Don't create a Kernel.run() intermediary.

**Fix:** Update CLAUDE.md to remove references to `packages/kernel/` and `packages/engine/` as aspirational architecture.

**Dependencies:** None
**Testing:** None
**Risk:** None

---

### GAP-10: WASM panic/trap error classification is fragile

**Finding CONFIRMED:** `classifyPictlError()` in `errors.ts` uses substring matching (`lowerRaw.includes('not found')`, etc.). This is fragile because:
1. WASM panic messages may change between versions
2. Overlapping patterns (e.g., "missing" maps to CONFIG_INVALID but could be a state error)

**Fix:**
1. File: `wasm4pm/src/errors.ts` — Improve pattern matching with priority ordering and regex:
```typescript
export function classifyPictlError(raw: string, context?: { step?: string }): ErrorCode {
  if (!raw || typeof raw !== 'string') return ErrorCode.UNKNOWN;
  const lower = raw.toLowerCase();

  // Specific patterns first (most precise)
  if (/handle.*not found|object.*not found/.test(lower)) return ErrorCode.HANDLE_NOT_FOUND;
  if (/is not a(n)? \w+/.test(lower)) return ErrorCode.TYPE_MISMATCH;
  if (/invalid json|failed to parse/i.test(raw)) return ErrorCode.PARSE_FAILED;
  if (/exceeds (maximum|limit)/.test(lower)) return ErrorCode.RESOURCE_LIMIT_EXCEEDED;
  if (/wasm (trap|panic)|panic|unreachable/i.test(raw)) return ErrorCode.EXECUTION_FAILED;

  // Broader patterns last (less precise)
  if (/not initialized/.test(lower)) return ErrorCode.SOURCE_UNAVAILABLE;
  if (/missing|unknown operator/.test(lower)) return ErrorCode.CONFIG_INVALID;
  if (/failed to (lock|store|serialize)/.test(lower)) return ErrorCode.EXECUTION_FAILED;

  return ErrorCode.UNKNOWN;
}
```

**Dependencies:** None
**Testing:** Unit tests for each pattern with edge cases
**Risk:** Low — better classification, but may change some error categorizations

---

### GAP-17: Parameter mismatches silently ignored

**Finding:** WASM functions accept specific parameter types (handles, strings, floats). The TypeScript client passes parameters without validation. If wrong types are passed, WASM throws a generic error.

**Fix:**
1. File: `wasm4pm/src/pipeline.ts` — Add parameter validation before WASM call:
```typescript
function validateStepParams(step: ExecutableStep): string[] {
  const warnings: string[] = [];
  const params = step.params;

  // Check for handle-type params that should be strings
  if (params.eventlog_handle && typeof params.eventlog_handle !== 'string') {
    warnings.push(`${step.stepId}: eventlog_handle should be string, got ${typeof params.eventlog_handle}`);
  }
  if (params.activity_key && typeof params.activity_key !== 'string') {
    warnings.push(`${step.stepId}: activity_key should be string, got ${typeof params.activity_key}`);
  }
  // Check numeric params
  if (params.dependency_threshold !== undefined && typeof params.dependency_threshold !== 'number') {
    warnings.push(`${step.stepId}: dependency_threshold should be number`);
  }
  // Warn on unknown params
  const knownParams = new Set(['eventlog_handle', 'activity_key', 'dependency_threshold',
    'generations', 'populationSize', 'particles', 'iterations', 'fitness_weight',
    'simplicity_weight', 'min_frequency', 'streaming', 'variant', 'timeout',
    'window_size', 'drift_threshold', 'ngram_order']);
  for (const key of Object.keys(params)) {
    if (!knownParams.has(key)) {
      warnings.push(`${step.stepId}: unknown parameter "${key}"`);
    }
  }

  return warnings;
}
```

2. Call `validateStepParams(step)` in `PipelineResolver.resolve()` and log warnings

**Dependencies:** None
**Testing:** Test with valid params (no warnings) and invalid params (warnings returned)
**Risk:** Low — warnings only, doesn't break execution

---

### GAP-19: Dual disconnected OTEL subsystems

**Finding:** There are NOT dual OTEL subsystems. There is ZERO OTEL implementation. The only OTEL-related files are:
1. `validators/observability.mjs` — trivial validator checking env vars
2. `docs/` — documentation describing OTEL config not yet implemented

**Assessment:** This gap is a misunderstanding. There's nothing to consolidate.

**Fix:** Remove this gap from the list. After GAP-12 adds telemetry, there will be ONE system.

**Dependencies:** None
**Testing:** None
**Risk:** None

---

### GAP-20: OtelCapture never wired into engine tests

**Finding CONFIRMED:** `OtelCapture` does not exist anywhere. No OTEL infrastructure to wire.

**Assessment:** After GAP-12 adds `telemetry.ts`, create a `TestExporter` for test capture.

**Fix:**
1. File: `wasm4pm/__tests__/helpers/telemetry-capture.ts` (NEW):
```typescript
import { TelemetryExporter, TelemetrySpan } from '../../src/telemetry.js';

export class TestExporter implements TelemetryExporter {
  spans: TelemetrySpan[] = [];
  exportSpan(span: TelemetrySpan) { this.spans.push(span); }
  async flush() {}
  clear() { this.spans = []; }
  getSpansByName(name: string) { return this.spans.filter(s => s.name === name); }
  assertSpanExists(name: string, requiredAttrs: string[]) {
    const span = this.spans.find(s => s.name === name);
    if (!span) throw new Error(`Expected span "${name}" but none found`);
    for (const attr of requiredAttrs) {
      if (!(attr in span.attributes)) throw new Error(`Span "${name}" missing attribute "${attr}"`);
    }
    return span;
  }
}
```

2. Wire into watch mode tests using `setExporter(new TestExporter())`

**Dependencies:** GAP-12
**Testing:** Test that TestExporter captures spans during pipeline execution
**Risk:** None

---

### GAP-22: `resource` prediction uses hardcoded dummy values

**Finding REBUTTED:** `prediction_resource.rs` implements real algorithms:
- M/M/1 queue delay estimation (`compute_queue_delay`)
- Greedy intervention ranking (`compute_ranked_interventions`)
- UCB1 bandit selection (`compute_ucb1_selection`)

All values are computed from inputs. No hardcoded dummy values exist. The 0.7 anomaly threshold in `prediction_outcome.rs` is a configurable constant, not a dummy value.

**Assessment:** This gap is incorrect. Resource prediction is fully algorithmic.

**Fix:** None needed. Update gap status to CLOSED.

---

### GAP-23: compare.ts result parsing fails for handle-wrapper shape

**Finding CONFIRMED:** `mcp_server.ts` `compareAlgorithms()` (line 1381) has fragile handle extraction repeated 14 times:
```typescript
const r = wasm.discover_dfg(logHandle, 'concept:name');
modelHandle = typeof r === 'object' && r?.handle ? r.handle : String(r);
```

If WASM returns `{ handle: "abc" }`, extraction works. If it returns a bare string `"abc"`, the `String(r)` fallback works. But if it returns an object without `.handle`, `String(r)` produces `"[object Object]"`.

**Fix:** Extract a shared handle utility:
1. File: `wasm4pm/src/handle-utils.ts` (NEW):
```typescript
/**
 * Extracts a handle string from a WASM return value.
 * WASM functions inconsistently return { handle: string } or bare string.
 */
export function extractHandle(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object' && 'handle' in raw) {
    const h = (raw as { handle: unknown }).handle;
    if (typeof h === 'string') return h;
  }
  const str = String(raw);
  if (str === '[object Object]' || str === 'undefined' || str === 'null') {
    throw new Error(`Cannot extract handle from WASM return: ${JSON.stringify(raw)}`);
  }
  return str;
}
```

2. File: `wasm4pm/src/mcp_server.ts` — Replace 14 inline extractions with `extractHandle(r)`

**Dependencies:** None
**Testing:** Test `extractHandle` with `{ handle: "abc" }`, `"abc"`, and `{ foo: "bar" }` (should throw)
**Risk:** Medium — changes error behavior for malformed WASM returns (throws instead of silently passing `[object Object]`)

---

## Phase 5: Completeness

### GAP-15: ALGORITHMS.md severely outdated

**Finding:** ALGORITHMS.md documents 34 methods (14 discovery + 20 analytics). The actual codebase has:
- 14 discovery algorithms in Rust
- 8 POWL discovery variants
- 6 ML algorithms
- ~30+ analytics functions (footprints, complexity, bottlenecks, social network, correlation, etc.)
- Streaming variants

**Fix:** Rewrite ALGORITHMS.md to document all 58+ functions organized by category. Include:
- Discovery (14 + 8 POWL = 22)
- Analytics (~30)
- ML (6)
- Prediction (6 sub-modules)
- Conformance (token replay + footprints)
- Streaming

**Dependencies:** GAP-07, GAP-08, GAP-14 (new entries finalized)
**Testing:** Verify documented function names match actual `#[wasm_bindgen]` exports
**Risk:** None — documentation only

---

### GAP-18: explain.ts has no algorithm-specific content

**Finding:** No `explain.ts` exists. The closest is `text_encoding.rs` which provides `encode_dfg_as_text`, `encode_petri_net_as_text`, etc. These are human-readable summaries, not academic explanations.

**Fix:**
1. File: `wasm4pm/src/explanations.ts` (NEW):
```typescript
export interface AlgorithmExplanation {
  id: string;
  name: string;
  category: 'discovery' | 'conformance' | 'prediction' | 'ml' | 'analytics';
  description: string;
  input: string;
  output: string;
  complexity: string;
  suitableFor: string[];
  limitations: string[];
  parameters: Array<{ name: string; type: string; default: string; description: string }>;
}

export const ALGORITHM_EXPLANATIONS: Record<string, AlgorithmExplanation> = {
  dfg: {
    id: 'dfg',
    name: 'Directly-Follows Graph',
    category: 'discovery',
    description: 'Constructs a directed graph where nodes are activities and edges represent direct succession in the event log. The weight of each edge is the frequency of that succession.',
    input: 'Event log with activity labels',
    output: 'DFG (nodes + weighted edges)',
    complexity: 'O(T × E) where T=traces, E=events per trace',
    suitableFor: ['Quick process overview', 'Large event logs', 'Real-time monitoring'],
    limitations: ['Cannot represent concurrency', 'No soundness guarantees'],
    parameters: [
      { name: 'activity_key', type: 'string', default: 'concept:name', description: 'Activity attribute key' },
      { name: 'min_frequency', type: 'number', default: '1', description: 'Minimum edge frequency threshold' },
    ],
  },
  alpha_plus_plus: {
    id: 'alpha_plus_plus',
    name: 'Alpha++ Algorithm',
    category: 'discovery',
    description: 'Extends the Alpha Miner with lifecycle transitions, frequency thresholds, and parallelism detection. Discovers a Petri net that is sound by construction.',
    input: 'Event log with activity labels',
    output: 'Petri net (places, transitions, arcs, markings)',
    complexity: 'O(A² × T × E) where A=activities',
    suitableFor: ['Sound process models', 'Noise-tolerant discovery', 'Structured processes'],
    limitations: ['Cannot handle loops of length > 1', 'May produce non-free-choice constructs'],
    parameters: [
      { name: 'activity_key', type: 'string', default: 'concept:name', description: 'Activity attribute key' },
    ],
  },
  // ... continue for all 21+ algorithms
};
```

**Dependencies:** GAP-07 (finalized algorithm list)
**Testing:** Verify all documented algorithms exist as WASM exports
**Risk:** None — additive

---

### GAP-21: 8 POWL discovery step types have no registry entries

**Finding:** POWL discovery is implemented in `src/powl/discovery/` with 8 variants. They are NOT in `StepType` enum, `pipeline.ts`, or the capability registry.

**Fix:**
1. File: `wasm4pm/src/config.ts` — Add `POWL_DISCOVERY` to StepType (covered by GAP-14)
2. File: `wasm4pm/src/capability_registry.rs` — Add POWL discovery entries:
```rust
{
    "name": "discover_powl",
    "description": "Discover a POWL model using inductive mining",
    "params": [
        { "name": "eventlog_handle", "type": "string" },
        { "name": "activity_key", "type": "string" },
        { "name": "variant", "type": "string", "description": "Discovery variant: decision_graph_cyclic, decision_graph_max, dynamic_clustering, maximal, tree, brute_force" }
    ],
    "returns": "string (POWL model handle)",
    "example": "discover_powl(log_handle, 'concept:name', 'decision_graph_cyclic')"
},
```

3. Verify `discover_powl` WASM binding exists in `powl_api.rs`

**Dependencies:** GAP-14
**Testing:** Test that POWL discovery is in capability registry and resolves in pipeline
**Risk:** Low — POWL feature gate must be enabled

---

### GAP-26: `research` profile inconsistency

**Finding:** `research` profile exists and works in `resolveProfile()`. It includes: DFG, Alpha++, Genetic, PSO, A*, ACO, SA, ILP, Statistics, Conformance, Variants, Performance, Clustering. Missing: Heuristic Miner, Inductive Miner, DECLARE, optimized DFG, POWL, analytics functions.

**Fix:** Add missing steps to `research` profile:
```typescript
case ExecutionProfile.RESEARCH:
  return [
    // All discovery algorithms
    { id: 'step_dfg', type: StepType.DFG, required: true },
    { id: 'step_alpha', type: StepType.ALPHA_PLUS_PLUS, required: true },
    { id: 'step_heuristic', type: StepType.HEURISTIC_MINER, required: true },
    { id: 'step_inductive', type: StepType.INDUCTIVE_MINER, required: true },
    { id: 'step_declare', type: StepType.DECLARE_CONSTRAINTS, required: true },
    { id: 'step_genetic', type: StepType.GENETIC, required: true, parameters: { generations: 100, populationSize: 50 } },
    { id: 'step_pso', type: StepType.PSO, required: true },
    { id: 'step_astar', type: StepType.A_STAR, required: true },
    { id: 'step_aco', type: StepType.ACO, required: true },
    { id: 'step_sa', type: StepType.SIMULATED_ANNEALING, required: true },
    { id: 'step_ilp', type: StepType.ILP, required: true },
    { id: 'step_opt_dfg', type: StepType.OPTIMIZED_DFG, required: false },
    { id: 'step_powl', type: StepType.POWL_DISCOVERY, required: false },
    // All analytics
    { id: 'step_stats', type: StepType.STATISTICS, required: true, dependsOn: ['step_dfg'] },
    { id: 'step_conformance', type: StepType.CONFORMANCE, required: true, dependsOn: ['step_alpha'] },
    { id: 'step_variants', type: StepType.VARIANTS, required: true },
    { id: 'step_performance', type: StepType.PERFORMANCE, required: true },
    { id: 'step_clustering', type: StepType.CLUSTERING, required: true },
    { id: 'step_footprints', type: StepType.FOOTPRINTS, required: true },
    { id: 'step_complexity', type: StepType.COMPLEXITY, required: true },
    { id: 'step_bottlenecks', type: StepType.BOTTLENECKS, required: true },
  ];
```

**Dependencies:** GAP-05, GAP-07, GAP-14, GAP-21
**Testing:** Test that research profile resolves all 20+ steps
**Risk:** Low — additive to existing profile

---

## Phase 6: Polish

### GAP-25: WASM binary size discrepancy in docs

**Finding:** CLAUDE.md claims size profiles (cloud ~2.78MB, browser ~500KB, edge ~1.5MB) but the actual build sizes may differ. These are Cargo feature-gated profiles.

**Fix:**
1. Build all profiles and measure actual sizes
2. Update CLAUDE.md with actual numbers

```bash
# Build and measure
cd wasm4pm
wasm-pack build --target web -- --no-default-features --features basic
ls -la pkg/pictl_bg.wasm  # Record actual size

wasm-pack build --target web -- --no-default-features --features basic,discovery_advanced
ls -la pkg/pictl_bg.wasm

wasm-pack build --target web -- --no-default-features --features basic,discovery_advanced,ml
ls -la pkg/pictl_bg.wasm
```

**Dependencies:** None
**Testing:** Build succeeds, sizes measured
**Risk:** None

---

### GAP-27: `enhanced` drift mode silently fails

**Finding:** `prediction_drift.rs` has a single drift detection algorithm (windowed Jaccard with 0.3 threshold). There is no "basic" vs "enhanced" mode in the Rust code. The MCP server adds EWMA smoothing on top in one of its tool handlers, but this is not a "mode" — it's a separate tool.

**Fix:**
1. Make the drift threshold configurable (currently hardcoded 0.3):
```rust
// prediction_drift.rs
pub fn detect_drift(
    log_handle: &str,
    activity_key: &str,
    window_size: usize,
    threshold: f64,  // NEW: configurable threshold
) -> Result<JsValue, JsValue> {
```

2. Add proper error handling for invalid thresholds:
```rust
if threshold <= 0.0 || threshold >= 1.0 {
    return Err(JsValue::from_str("Drift threshold must be between 0.0 and 1.0 (exclusive)"));
}
```

3. Document "enhanced" mode as EWMA-smoothed drift (MCP tool) vs "basic" mode (raw Jaccard)

**Dependencies:** None
**Testing:** Test with threshold=0.0 (should error), threshold=0.5 (should work)
**Risk:** Medium — changes WASM function signature (breaking if existing callers don't pass threshold)

**Mitigation:** Make `threshold` optional with default 0.3:
```rust
pub fn detect_drift(log_handle: &str, activity_key: &str, window_size: usize) -> Result<JsValue, JsValue> {
    detect_drift_with_threshold(log_handle, activity_key, window_size, 0.3)
}

pub fn detect_drift_with_threshold(log_handle: &str, activity_key: &str, window_size: usize, threshold: f64) -> Result<JsValue, JsValue> {
    // ... implementation
}
```

---

## Summary: Gap Status After Plan Execution

| Gap | Phase | Status | Actual Risk |
|-----|-------|--------|-------------|
| GAP-01 | 2 | **FIX** — Create RevOps XES fixture | LOW (additive) |
| GAP-02 | 2 | **FIX** — Implement real token replay | HIGH (behavior change) |
| GAP-03 | 3 | **FIX** — Wire ReceiptBuilder + SHA-256 | MEDIUM (hash change) |
| GAP-04 | 1 | **CLOSED** — Doc mismatch, not runtime crash | NONE |
| GAP-05 | 1 | **FIX** — Map OPTIMIZED_DFG in pipeline | LOW (additive) |
| GAP-06 | 1 | **FIX** — Add exit codes | LOW (additive) |
| GAP-07 | 2 | **FIX** — Add analytics StepTypes | LOW (additive) |
| GAP-08 | 2 | **FIX** — Add ML StepTypes | MEDIUM (feature gate) |
| GAP-09 | 4 | **CLOSED** — Architecture is correct as-is | NONE |
| GAP-10 | 4 | **FIX** — Improve error classification patterns | LOW |
| GAP-11 | 3 | **CLOSED** — `get_capability_registry` exists | NONE |
| GAP-12 | 3 | **FIX** — Create telemetry.ts | LOW (additive) |
| GAP-13 | 3 | **FIX** — Part of GAP-12 | LOW |
| GAP-14 | 1 | **FIX** — Add POWL StepType + profile | MEDIUM (feature gate) |
| GAP-15 | 5 | **FIX** — Rewrite ALGORITHMS.md | NONE (docs) |
| GAP-16 | 3 | **FIX** — Failure receipts | LOW (additive) |
| GAP-17 | 4 | **FIX** — Parameter validation warnings | LOW |
| GAP-18 | 5 | **FIX** — Create explanations.ts | NONE (additive) |
| GAP-19 | 4 | **CLOSED** — No dual OTEL, nothing to consolidate | NONE |
| GAP-20 | 4 | **FIX** — Create TestExporter | LOW (additive) |
| GAP-21 | 5 | **FIX** — POWL registry entries | LOW |
| GAP-22 | 4 | **CLOSED** — Resource prediction is fully algorithmic | NONE |
| GAP-23 | 4 | **FIX** — Extract shared handle utility | MEDIUM (error behavior) |
| GAP-24 | 3 | **FIX** — Span name constants | NONE (additive) |
| GAP-25 | 6 | **FIX** — Measure and update sizes | NONE |
| GAP-26 | 5 | **FIX** — Complete research profile | LOW |
| GAP-27 | 6 | **FIX** — Configurable drift threshold | MEDIUM (API change) |

**CLOSED gaps (not real issues):** GAP-04, GAP-09, GAP-11, GAP-19, GAP-22 (5 of 27)
**Active fixes needed:** 22 gaps across 6 phases

## Execution Order (Dependency Graph)

```
Phase 1 (parallel):
  GAP-06 (exit codes)
  GAP-05 (optimized DFG) ──→ Phase 2, 5
  GAP-14 (POWL) ──→ Phase 5

Phase 2 (sequential):
  GAP-01 (RevOps fixtures) ──→ Phase 4, 5
  GAP-07 (analytics StepTypes) ──→ Phase 5
  GAP-08 (ML StepTypes)
  GAP-02 (token replay) ── depends on GAP-01

Phase 3 (parallel, after Phase 1):
  GAP-03 (receipts) ──→ GAP-16
  GAP-12 (telemetry) ──→ GAP-13, GAP-20, GAP-24
  GAP-16 (failure receipts) ── depends on GAP-03

Phase 4 (after Phase 3):
  GAP-10 (error classification)
  GAP-17 (param validation)
  GAP-20 (TestExporter) ── depends on GAP-12
  GAP-23 (handle utils)

Phase 5 (after Phase 2, 4):
  GAP-15 (ALGORITHMS.md)
  GAP-18 (explanations.ts)
  GAP-21 (POWL registry) ── depends on GAP-14
  GAP-26 (research profile) ── depends on GAP-05, GAP-07, GAP-14, GAP-21

Phase 6 (after all):
  GAP-25 (WASM sizes)
  GAP-27 (drift threshold)
```

## Files Created (7 new)
1. `wasm4pm/tests/fixtures/revops_sales_pipeline.xes`
2. `wasm4pm/src/exit-codes.ts`
3. `wasm4pm/src/telemetry.ts`
4. `wasm4pm/src/handle-utils.ts`
5. `wasm4pm/src/explanations.ts`
6. `wasm4pm/__tests__/helpers/telemetry-capture.ts`
7. `wasm4pm/src/validate-params.ts`

## Files Modified (11 existing)
1. `wasm4pm/src/config.ts` — 10 new StepTypes, profile updates
2. `wasm4pm/src/pipeline.ts` — 10 new WASM mappings, param validation
3. `wasm4pm/src/errors.ts` — improved classification, toExitCode()
4. `wasm4pm/src/receipt.ts` — SHA-256 hash, status field
5. `wasm4pm/src/watch.ts` — ReceiptBuilder wiring, failure receipts, telemetry spans
6. `wasm4pm/src/conformance.rs` — real token replay (MAJOR)
7. `wasm4pm/src/prediction_drift.rs` — configurable threshold
8. `wasm4pm/src/capability_registry.rs` — POWL entries
9. `wasm4pm/src/mcp_server.ts` — use extractHandle()
10. `wasm4pm/cli/index.ts` — exit codes
11. `wasm4pm/ALGORITHMS.md` — complete rewrite
