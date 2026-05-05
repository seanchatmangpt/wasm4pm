# wasm4pm WASM API Reference — Vision 2030

**Complete catalog of WebAssembly exports for process mining and autonomic control.**

> **Last Updated:** 2026-04-16  
> **Stability:** Production  
> **Feature Flags:** See deployment profiles (browser, iot, edge, fog, cloud)

---

## Quick Start: The Autonomic Loop

The Vision 2030 autonomic system executes a **5-phase closed loop** every cycle:

```javascript
import initWasm, {
  load_eventlog_from_xes,
  autonomic_execute_cycle,
  serialize_rl_state,
  restore_rl_state,
  get_spc_history,
  set_spc_history,
  circuit_breaker_get_state,
  circuit_breaker_set_state,
  delete_object,
} from "@wasm4pm/cli";

// 1. Initialize WASM
await initWasm();

// 2. Load event log
const logHandle = load_eventlog_from_xes(xesString);

// 3. Execute autonomic cycle (Perception → Decision → Protection → Optimization → Adaptation)
const cycleResult = autonomic_execute_cycle(
  logHandle,
  "concept:name",  // activity_key
  "{}"             // config_json (empty for defaults)
);
const result = JSON.parse(cycleResult);
console.log(`Health: ${result.health_label}, Reward: ${result.reward}`);

// 4. Save state for recovery
const rlState = serialize_rl_state();
const spcHistory = get_spc_history();
const cbState = circuit_breaker_get_state();

// 5. Store and later restore
localStorage.setItem("rl_state", rlState);
localStorage.setItem("spc_history", spcHistory);
localStorage.setItem("cb_state", cbState);

// 6. On restart, restore state
restore_rl_state(rlState);
set_spc_history(spcHistory);
circuit_breaker_set_state(cbState);

// 7. Clean up
delete_object(logHandle);
```

---

## Core API

### Initialization & Lifecycle

#### `init() → Result<String, JsValue>`

**Purpose:** Initialize WASM module and all global state (RL orchestrator, SPC history, circuit breaker).

**Returns:** `"WASM initialized"` on success.

**Errors:** Throws `JsValue` if initialization fails.

**Example:**
```javascript
const result = init();
console.log(result); // "WASM initialized"
```

**Related:** `get_version()`, `get_capabilities()`, `clear_all_caches()`

---

#### `get_version() → String`

**Purpose:** Return pictl version in CalVer format (e.g., `"v26.4.16"`).

**Returns:** Version string.

**Example:**
```javascript
const version = get_version();
console.log(version); // "v26.4.16"
```

---

#### `get_capabilities() → String`

**Purpose:** Return JSON describing available algorithms and feature flags.

**Returns:** JSON string with algorithm registry, enabled features, deployment profile.

**Example:**
```javascript
const caps = JSON.parse(get_capabilities());
console.log(caps.algorithms.length); // 41 (browser profile)
console.log(caps.features); // ["ml", "streaming", "ocel", "powl"]
```

---

### Memory Management

#### `clear_all_caches() → void`

**Purpose:** Clear all internal caches (parsed logs, discovered models, etc.).

**Use case:** Between test runs, or when memory is constrained.

**Example:**
```javascript
clear_all_caches();
```

---

#### `get_cache_stats() → String`

**Purpose:** Return JSON with cache hit/miss statistics and memory usage.

**Returns:** JSON string with cache performance metrics.

**Example:**
```javascript
const stats = JSON.parse(get_cache_stats());
console.log(`Hits: ${stats.hits}, Misses: ${stats.misses}`);
```

---

## Event Log Management

### Load & Export

#### `load_eventlog_from_xes(xes_content: &str) → Result<String, JsValue>`

**Purpose:** Parse XES (eXtensible Event Stream) XML and store event log in memory.

**Arguments:**
- `xes_content` — XES XML string (UTF-8)

**Returns:** `Ok(handle)` where `handle` is a string identifier for the loaded log.

**Errors:**
- Invalid XML → `JsValue` error message
- Empty log → `JsValue` error

**Example:**
```javascript
const xesString = `
  <log>
    <trace>
      <event>
        <string key="concept:name" value="Register"/>
        <date key="time:timestamp" value="2026-01-01T10:00:00+00:00"/>
      </event>
    </trace>
  </log>
`;
const handle = load_eventlog_from_xes(xesString);
```

**Related:** `load_eventlog_from_json()`, `export_eventlog_to_json()`, `delete_object()`

---

#### `load_eventlog_from_json(content: &str) → Result<String, JsValue>`

**Purpose:** Load event log from JSON format.

**Arguments:**
- `content` — JSON string with traces/events structure

**Returns:** `Ok(handle)` — Event log handle

**Example:**
```javascript
const json = {
  traces: [
    {
      events: [
        {
          attributes: {
            "concept:name": "Register",
            "time:timestamp": "2026-01-01T10:00:00Z"
          }
        }
      ]
    }
  ]
};
const handle = load_eventlog_from_json(JSON.stringify(json));
```

---

#### `export_eventlog_to_json(handle: &str) → Result<String, JsValue>`

**Purpose:** Export event log to JSON format (for storage or transport).

**Arguments:**
- `handle` — Log handle from `load_eventlog_from_xes()` or `load_eventlog_from_json()`

**Returns:** `Ok(json_string)` — Serialized event log

**Example:**
```javascript
const json = export_eventlog_to_json(handle);
const parsed = JSON.parse(json);
console.log(`Traces: ${parsed.traces.length}`);
```

---

#### `delete_object(handle: &str) → void`

**Purpose:** Delete a stored object (event log, model, etc.) and free memory.

**Arguments:**
- `handle` — Object handle

**Use case:** Clean up after analysis is complete.

**Example:**
```javascript
delete_object(logHandle);
```

---

## Autonomic Control — Vision 2030

### The Main Loop

#### `autonomic_execute_cycle(log_handle: &str, activity_key: &str, config_json: &str) → Result<String, JsValue>`

**Purpose:** Execute one full 5-phase autonomic cycle:
1. **Perception** — Extract event log metrics (trace count, event rate, health, rework)
2. **Decision** — RL agent selects action based on state
3. **Protection** — Circuit breaker validates action is safe
4. **Optimization** — Execute chosen action (discover/analyze)
5. **Adaptation** — Update telemetry and SPC state

**Arguments:**
- `log_handle` — Event log handle
- `activity_key` — Activity attribute key (e.g., `"concept:name"`)
- `config_json` — Configuration (currently unused, pass `"{}"`)

**Returns:** `Ok(json_result)` with fields:
- `cycle_result.perception` — Metrics from Perception layer
- `cycle_result.decision` — RL agent action and reward
- `cycle_result.protection` — Circuit breaker state
- `cycle_result.optimization` — Algorithm results
- `cycle_result.adaptation` — Updated SPC alerts
- `timing_ns` — Wall-clock nanoseconds for profiling

**Errors:** `JsValue` if log handle invalid or execution fails.

**Response Structure:**
```json
{
  "cycle_result": {
    "perception": {
      "trace_count": 100,
      "event_count": 542,
      "unique_activities": 8,
      "avg_trace_length": 5.42,
      "event_rate": 0.02,
      "activity_freq": {"Register": 100, "Approve": 80, ...},
      "health_state": 0,
      "health_label": "Normal",
      "rework_ratio": 0.15,
      "max_activity_count_quantized": 5
    },
    "decision": {
      "active_agent": "QLearning",
      "action_index": 3,
      "action_label": "run_genetic_algorithm",
      "reward": 0.8,
      "linucb_selected": true
    },
    "protection": {
      "circuit_state": "Closed",
      "failure_count": 0,
      "half_open_probes": 0,
      "action_allowed": true
    },
    "optimization": {
      "algorithm": "genetic_algorithm",
      "fitness": 0.87,
      "precision": 0.91,
      "generalization": 0.85,
      "simplicity": 12
    },
    "adaptation": {
      "spc_alert_count": 0,
      "spc_rules_fired": []
    }
  },
  "timing_ns": 34523000
}
```

**Example:**
```javascript
const cycleJson = autonomic_execute_cycle(logHandle, "concept:name", "{}");
const cycle = JSON.parse(cycleJson);

if (cycle.cycle_result.protection.action_allowed) {
  console.log(`Action: ${cycle.cycle_result.decision.action_label}`);
  console.log(`Reward: ${cycle.cycle_result.decision.reward}`);
  console.log(`Health: ${cycle.cycle_result.perception.health_label}`);
} else {
  console.log("Circuit breaker blocked action");
}
```

**Related:** `serialize_rl_state()`, `get_spc_history()`, `circuit_breaker_get_state()`

---

## RL Agent Control

### Agent Selection

#### `rl_orchestrator_reset() → Result<String, JsValue>`

**Purpose:** Reset all RL agents to initial state (zero Q-tables, zero telemetry).

**Returns:** `"RL orchestrator reset"` on success.

**Use case:** Start fresh learning from a known state.

**Example:**
```javascript
rl_orchestrator_reset();
```

---

#### `rl_orchestrator_active_agent() → Result<u8, JsValue>`

**Purpose:** Get ID of currently active RL agent.

**Returns:** Agent ID (0=QLearning, 1=SARSA, 2=DoubleQLearning, 3=ExpectedSARSA, 4=REINFORCE)

**Example:**
```javascript
const agentId = rl_orchestrator_active_agent();
const agentNames = ["QLearning", "SARSA", "DoubleQLearning", "ExpectedSARSA", "REINFORCE"];
console.log(`Active: ${agentNames[agentId]}`);
```

---

#### `rl_orchestrator_switch_agent(agent_type: u8) → Result<String, JsValue>`

**Purpose:** Switch to a different RL agent.

**Arguments:**
- `agent_type` — Agent ID (0-4)

**Returns:** `"Switched to {AgentName}"` on success.

**Errors:** Invalid agent_type → `JsValue` error.

**Example:**
```javascript
rl_orchestrator_switch_agent(0); // Switch to QLearning
```

---

#### `rl_orchestrator_set_linucb(enabled: bool) → Result<String, JsValue>`

**Purpose:** Enable/disable LinUCB contextual bandit for agent selection.

**Arguments:**
- `enabled` — true to use LinUCB, false for fixed agent

**Returns:** `"LinUCB selection: {true|false}"`.

**Note:** LinUCB automatically selects best agent based on current feature vector.

**Example:**
```javascript
rl_orchestrator_set_linucb(true); // Enable automatic selection
```

---

### Telemetry

#### `rl_orchestrator_get_telemetry() → Result<JsValue, JsValue>`

**Purpose:** Get RL orchestrator telemetry as a JavaScript object (NOT JSON string).

**Returns:** JavaScript object with fields:
- `cycle_count` — Total autonomic cycles executed
- `last_health_state` — System health (0-4)
- `cumulative_reward` — Total reward accumulated
- `last_reward` — Most recent cycle reward
- `last_spc_alert_count` — SPC alerts in last cycle

**Example:**
```javascript
const telemetry = rl_orchestrator_get_telemetry();
console.log(`Cycles: ${telemetry.cycle_count}`);
console.log(`Cumulative Reward: ${telemetry.cumulative_reward}`);
console.log(`Health: ${telemetry.last_health_state}`);
```

**Related:** `rl_orchestrator_telemetry()` (returns JSON string instead)

---

#### `rl_orchestrator_telemetry() → Result<String, JsValue>`

**Purpose:** Get RL orchestrator telemetry as JSON string.

**Returns:** JSON string (same data as `rl_orchestrator_get_telemetry()`, different format).

---

## State Persistence

### RL State (Agent Learning)

#### `serialize_rl_state() → Result<String, JsValue>`

**Purpose:** Serialize entire RL orchestrator state (all 5 agents' Q-tables, active agent, LinUCB config, telemetry) to JSON.

**Returns:** `Ok(json_string)` — Serialized RL state

**Use case:** Save learning progress to localStorage or database between sessions.

**Serialized Fields:**
```json
{
  "telemetry": {
    "cycle_count": 1000,
    "last_health_state": 0,
    "last_action_label": "run_genetic_algorithm",
    "last_spc_alert_count": 0,
    "cumulative_reward": 850.0
  },
  "active_agent": 0,
  "linucb_enabled": true,
  "agent_q_tables": [
    { "agent_id": 0, "q_table": {...} },
    ...
  ]
}
```

**Example:**
```javascript
const rlState = serialize_rl_state();
localStorage.setItem("rl_state", rlState);
```

---

#### `restore_rl_state(json: &str) → Result<String, JsValue>`

**Purpose:** Restore RL orchestrator state from previously serialized JSON.

**Arguments:**
- `json` — JSON string from `serialize_rl_state()`

**Returns:** `"Restored RL state from cycle {count} ..."` on success.

**Errors:** Invalid JSON or malformed state → `JsValue` error.

**Example:**
```javascript
const rlState = localStorage.getItem("rl_state");
if (rlState) {
  const result = restore_rl_state(rlState);
  console.log(result);
}
```

**Critical:** Call this AFTER `init()` and before `autonomic_execute_cycle()`.

---

### SPC History (Process Control)

#### `get_spc_history() → Result<String, JsValue>`

**Purpose:** Get Statistical Process Control history (100 recent snapshots) as JSON.

**Returns:** `Ok(json_string)` with:
- `snapshots` — Array of SPC snapshots (Western Electric rule states)
- `cycle_count` — Current cycle number

**Snapshot Fields:**
```json
{
  "snapshots": [
    {
      "cycle": 100,
      "event_rate_q": 3,
      "activity_count_q": 5,
      "health_level": 0,
      "alert_level": 0,
      "rules_fired": []
    }
  ],
  "cycle_count": 100
}
```

**Example:**
```javascript
const spcJson = get_spc_history();
const spc = JSON.parse(spcJson);
console.log(`Snapshots: ${spc.snapshots.length}`);
console.log(`Current cycle: ${spc.cycle_count}`);
```

---

#### `set_spc_history(json: &str) → Result<String, JsValue>`

**Purpose:** Restore SPC history from previously saved JSON.

**Arguments:**
- `json` — JSON string from `get_spc_history()`

**Returns:** `"SPC history restored"` on success.

**Errors:** Invalid JSON → `JsValue` error.

**Example:**
```javascript
const spcJson = localStorage.getItem("spc_history");
if (spcJson) {
  set_spc_history(spcJson);
}
```

---

### Circuit Breaker State

#### `circuit_breaker_get_state() → Result<String, JsValue>`

**Purpose:** Get circuit breaker state (Closed/HalfOpen/Open) as JSON.

**Returns:** `Ok(json_string)` with:
- `state` — `"Closed"` | `"HalfOpen"` | `"Open"`
- `failure_count` — Consecutive failures
- `half_open_probes` — Probes sent while half-open
- `step_counter` — Internal clock for Open→HalfOpen transition

**Example:**
```javascript
const cbJson = circuit_breaker_get_state();
const cb = JSON.parse(cbJson);
console.log(`State: ${cb.state}`);
console.log(`Failures: ${cb.failure_count}`);
```

---

#### `circuit_breaker_set_state(json: &str) → Result<String, JsValue>`

**Purpose:** Restore circuit breaker state from previously saved JSON.

**Arguments:**
- `json` — JSON string from `circuit_breaker_get_state()`

**Returns:** `"Circuit breaker state restored"` on success.

**Errors:** Invalid JSON → `JsValue` error.

**Example:**
```javascript
const cbJson = localStorage.getItem("cb_state");
if (cbJson) {
  circuit_breaker_set_state(cbJson);
}
```

---

#### `circuit_breaker_get_config() → Result<String, JsValue>`

**Purpose:** Get circuit breaker configuration (thresholds and timeouts).

**Returns:** `Ok(json_string)` with:
- `failure_threshold` — Failures before Open (default: 3)
- `success_threshold` — Successes before Closed (default: 2)
- `open_timeout_ms` — Time before HalfOpen (default: 30000)
- `half_open_timeout_ms` — Probe timeout (default: 5000)

**Example:**
```javascript
const config = JSON.parse(circuit_breaker_get_config());
console.log(`Failure threshold: ${config.failure_threshold}`);
```

---

#### `circuit_breaker_reset() → Result<String, JsValue>`

**Purpose:** Reset circuit breaker to Closed state with zero failures.

**Returns:** `"Circuit breaker reset"` on success.

**Use case:** After diagnosing and fixing an underlying failure.

**Example:**
```javascript
circuit_breaker_reset();
```

---

## Process Discovery

### Directly-Follows Graph

#### `discover_dfg(eventlog_handle: &str, activity_key: &str) → Result<JsValue, JsValue>`

**Purpose:** Discover a Directly-Follows Graph (fastest algorithm, ~0.5ms/100 events).

**Arguments:**
- `eventlog_handle` — Log handle
- `activity_key` — Activity attribute key (e.g., `"concept:name"`)

**Returns:** `Ok(dfg_json)` — Directed graph with nodes (activities) and edges (transitions)

**DFG Structure:**
```json
{
  "nodes": [
    {"id": "Register", "frequency": 100},
    {"id": "Approve", "frequency": 80}
  ],
  "edges": [
    {"source": "Register", "target": "Approve", "frequency": 78},
    {"source": "Approve", "target": "Register", "frequency": 2}
  ]
}
```

**Example:**
```javascript
const dfgJson = discover_dfg(logHandle, "concept:name");
const dfg = JSON.parse(dfgJson);
console.log(`Activities: ${dfg.nodes.length}`);
console.log(`Transitions: ${dfg.edges.length}`);
```

**Performance:** O(n) where n = event count. Linear scalability.

**Related:** `discover_declare()`, `discover_ocel_dfg()`

---

## Drift Detection

#### `set_drift_thresholds(low: f32, high: f32) → Result<String, JsValue>`

**Purpose:** Set low/high thresholds for drift detection (Jaccard similarity).

**Arguments:**
- `low` — Low threshold (0.0-1.0, default 0.3)
- `high` — High threshold (0.0-1.0, default 0.7)

**Returns:** `"Drift thresholds set"` on success.

**Semantics:**
- Below `low` → High drift detected
- Between `low` and `high` → Moderate drift
- Above `high` → No drift

**Example:**
```javascript
set_drift_thresholds(0.2, 0.6); // Stricter drift detection
```

---

#### `get_drift_thresholds() → String`

**Purpose:** Get current drift thresholds.

**Returns:** JSON string with `low` and `high` values.

**Example:**
```javascript
const thresholds = JSON.parse(get_drift_thresholds());
console.log(`Low: ${thresholds.low}, High: ${thresholds.high}`);
```

---

#### `reset_drift_thresholds() → String`

**Purpose:** Reset drift thresholds to defaults (0.3 and 0.7).

**Returns:** `"Drift thresholds reset"`.

---

## Utility Functions

#### `simd_token_replay(log_handle: &str, activity_key: &str) → String`

**Purpose:** Fast token-based replay fitness using SIMD acceleration.

**Arguments:**
- `log_handle` — Event log handle
- `activity_key` — Activity attribute key

**Returns:** JSON string with fitness score and metrics.

**Example:**
```javascript
const fitness = simd_token_replay(logHandle, "concept:name");
const parsed = JSON.parse(fitness);
console.log(`Fitness: ${parsed.fitness}`);
```

---

## Object State API

#### `create_rl_state() → RlState`

**Purpose:** Create a new RlState object for testing (Rust struct, not JSON).

**Returns:** `RlState` — Opaque Rust struct exported via wasm_bindgen.

---

#### `rl_state_from_features(features: &[f32], health_level: u8, rework_ratio: f32) → RlState`

**Purpose:** Create RlState from feature vector (8 dimensions).

**Arguments:**
- `features` — 8-element array: [event_rate_q, activity_count_q, spc_alert_level, drift_status, rework_ratio_q, circuit_state, cycle_phase, (unused)]
- `health_level` — Health (0-4)
- `rework_ratio` — Rework ratio (0.0-1.0)

**Example:**
```javascript
const features = new Float32Array([3, 5, 1, 0, 2, 0, 1, 0]);
const state = rl_state_from_features(features, 0, 0.15);
```

---

#### `rl_state_health_level(state: &RlState) → u8`

**Purpose:** Extract health level from RlState.

**Arguments:**
- `state` — RlState object

**Returns:** Health level (0-4)

---

## Error Handling

All functions return `Result<T, JsValue>` for interop with JavaScript `Promise` rejection.

**Error codes by function:**

| Function | Error Condition | Error Message |
|----------|---|---|
| `autonomic_execute_cycle` | Invalid log handle | `"handle does not reference an EventLog"` |
| `serialize_rl_state` | Serialization failure | `"Serialization failed: ..."` |
| `restore_rl_state` | Invalid JSON | `"Invalid JSON: ..."` |
| `circuit_breaker_set_state` | Invalid JSON | `"Invalid JSON: ..."` |

---

## Performance Characteristics

| Operation | Latency | Throughput | Notes |
|-----------|---------|-----------|-------|
| `autonomic_execute_cycle` | ~34ns (closed loop) | 1 cycle/~34ns | 5-phase pipeline |
| `discover_dfg` | 0.5ms/100 events | 100K+ events/sec | Linear scalability |
| `serialize_rl_state` | ~2ms | — | JSON serialization |
| `get_spc_history` | ~0.5ms | — | 100 snapshots |
| `circuit_breaker_get_state` | <0.1ms | — | Simple struct access |

---

## Feature Flags & Deployment Profiles

| Profile | Size | Algorithms | Notes |
|---------|------|-----------|-------|
| `cloud` | ~2.78MB | 41 (all) | Default, all features |
| `fog` | ~2.0MB | 35-40 | No POWL, reduced ML |
| `edge` | ~1.5MB | 18-25 | Streaming only, no GPU |
| `iot` | ~1.0MB | 12-18 | Basic discovery, stats |
| `browser` | ~500KB | 10-15 | Minimal, mobile-safe |

All profiles support the Vision 2030 autonomic API (autonomic_execute_cycle, RL state, SPC, circuit breaker).

---

## See Also

- [WASM_API.md](./WASM_API.md) — Full 70+ function reference
- [Autonomic System Architecture](./diataxis/explanation/autonomic_system.md)
- [RL Orchestrator Guide](./diataxis/reference/rl_agents.md)
- [Circuit Breaker & SPC](./diataxis/explanation/self_healing.md)
- [Testing Guide](../TESTING.md)

---

**Generated:** 2026-04-16 | **Package:** @wasm4pm/cli v26.4.16
