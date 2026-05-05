# wpm autoprocess — Help Text Reference

This document specifies the canonical help text for the `wpm autoprocess` command. Use this as the reference for what `wpm autoprocess --help` should display.

---

## Usage

```
wpm autoprocess <log.xes> [options]
```

---

## Description

**Run AutoProcess: Perception → Decision → Protection → Optimization**

Executes a single cycle of the autonomic loop on an event log. Analyzes process health, applies reinforcement learning policy, monitors statistical process control alerts, and manages circuit breaker state.

State (RL agent Q-table, SPC history, circuit breaker) persists to `.wasm4pm/autoprocess-state.json` across invocations, enabling long-horizon learning and multi-cycle failure recovery.

---

## Arguments

### `input` (required, positional)

**Type:** `string`

**Description:** Path to XES event log file

**Example:** `wpm autoprocess data/purchase_process.xes`

**Error if missing:** `Config error (exit 1)` — logs cannot be discovered automatically

---

## Options

### `--activity-key` / `-k`

**Type:** `string`

**Default:** `concept:name`

**Description:** Attribute key for activity names in the event log. Use this if your log stores activity identifiers in a custom field rather than the standard XES `concept:name` attribute.

**Example:**
```bash
wpm autoprocess data/log.xes --activity-key activity_type
wpm autoprocess data/log.xes -k task_name
```

---

### `--config`

**Type:** `string` (JSON)

**Default:** `{}`

**Description:** AutoProcess configuration as a JSON object. Passed directly to the WASM autonomic loop. Configuration options determine RL learning rate, epsilon decay, circuit breaker thresholds, etc.

**Example:**
```bash
wpm autoprocess data/log.xes --config '{"epsilon_decay": 0.95, "learning_rate": 0.1}'
```

**Invalid JSON will cause:** `Config error (exit 1)`

---

### `--format`

**Type:** `string`

**Default:** `human`

**Allowed values:** `human`, `json`

**Description:** Output format.
- `human` — Colored, human-readable table format (via consola)
- `json` — Machine-readable JSON with full result object

**Example:**
```bash
wpm autoprocess data/log.xes --format json | jq '.result.cycle_result.perception.health_score'
```

---

### `--verbose` / `-v`

**Type:** `boolean`

**Default:** `false`

**Description:** Enable verbose output. (Reserved for future use; currently has no effect.)

**Example:**
```bash
wpm autoprocess data/log.xes --verbose
```

---

### `--quiet` / `-q`

**Type:** `boolean`

**Default:** `false`

**Description:** Suppress non-error output. Useful in scripts where you only care about exit code.

**Example:**
```bash
wpm autoprocess data/log.xes --quiet
if [ $? -eq 0 ]; then echo "Success"; fi
```

---

## Output (Human Format)

```
AutoProcess Results

  Perception:
    Events: <count>
    Activities: <count>
    Traces: <count>
    Health: <level> (score <0.0-1.0>)

  Decision:
    Guard: <PASS | FAIL>
    Pattern: <agent_name> (<tick_count> ticks)

  Protection:
    Circuit: <closed | open | half_open>
    SPC <rule>: <+ | -| !> <OK | ALERT | CHECK>
    Special Causes: <count>

  Optimization:
    Action: <action_name>

  Timing:
    Total: <nanoseconds> ns (see benchmarks for nanosecond measurements)

  Result: <message>
```

### Human Format Fields

| Field | Meaning |
|-------|---------|
| **Events** | Total event count in the log |
| **Activities** | Distinct activity (task) names |
| **Traces** | Process instances (case IDs) |
| **Health** | Process health state (normal/degraded/at-risk/critical/failed) with 0-1 score |
| **Guard** | Permission gate — PASS if conditions met for action dispatch |
| **Pattern** | RL agent name (e.g., q_learning, sarsa) and internal tick counter |
| **Circuit** | Circuit breaker state — closed (healthy), open (failed, blocking), half_open (recovery probe) |
| **SPC \<rule\>** | Statistical Process Control rule status. Icon: `+` (OK), `!` (ALERT), `-` (CHECK). Detects drift via Western Electric rules. |
| **Special Causes** | Count of rule violations (root causes detected by SPC) |
| **Action** | RL-selected action (e.g., increase_sampling, maintain_buffer, explore) |
| **Total** | Cycle execution time in nanoseconds |
| **Result** | Success or warning message |

---

## Output (JSON Format)

```json
{
  "status": "success",
  "message": "AutoProcess cycle completed",
  "result": {
    "cycle_result": {
      "success": true,
      "perception": {
        "event_count": 4521,
        "unique_activities": 12,
        "trace_count": 342,
        "health_state": "normal",
        "health_score": 0.92
      },
      "decision": {
        "guard_result": true,
        "pattern_result": "q_learning",
        "pattern_ticks": 127
      },
      "protection": {
        "circuit_state": "closed",
        "spc_results": {
          "rule1_beyond_3sigma": "OK",
          "rule2_nine_consecutive": "OK",
          "rule3_six_increasing": "ALERT"
        },
        "special_causes": [
          {
            "rule": "rule3_six_increasing",
            "metric": "event_rate",
            "value": 45.2,
            "expected": 38.5,
            "deviation_percent": 17.4
          }
        ]
      },
      "optimization": {
        "rl_action": "increase_sampling"
      }
    },
    "timing": {
      "total_ns": 34580000
    }
  }
}
```

---

## Exit Codes

| Code | Name | Meaning | Common Cause |
|------|------|---------|--------------|
| **0** | SUCCESS | Cycle completed | Normal completion |
| **1** | CONFIG_ERROR | Configuration invalid | Invalid JSON in `--config`, missing required fields |
| **2** | SOURCE_ERROR | Input file error | XES file not found (ENOENT), permission denied, unreadable format |
| **3** | EXECUTION_ERROR | WASM/runtime failure | RL state corruption, WASM module load failure, internal panic |

---

## State Persistence

### File: `.wasm4pm/autoprocess-state.json`

Automatically created after each successful cycle. Contains:

- **rl_state**: Q-table from RL agent (state → action → Q-value mapping)
- **spc_history**: 100-event ring buffer for each SPC metric
- **circuit_breaker_state**: Current state (closed/open/half_open), failure count, step counter
- **saved_at**: ISO-8601 timestamp

**Restore behavior:** On next invocation, state is automatically loaded and used. No explicit flag required.

**Clear state:** `rm .wasm4pm/autoprocess-state.json` (then next run starts fresh).

**Note:** State file is NOT created if the cycle fails (exit code ≠ 0).

---

## Behavior

### Per Cycle

1. **Initialize WASM:** Load pictl WASM kernel (auto-compiled, cached)
2. **Restore State:** Load RL/SPC/circuit breaker from `.wasm4pm/autoprocess-state.json` (if exists)
3. **Parse Log:** Read XES file, load into WASM memory
4. **Perception:** Analyze event log — counts, activities, traces, health score
5. **Decision:** Evaluate guard condition, select RL agent pattern
6. **Protection:** Check circuit breaker, run SPC rules on metrics, detect special causes
7. **Optimization:** Dispatch RL action, update reward estimate
8. **Save State:** Persist RL/SPC/circuit breaker to `.wasm4pm/autoprocess-state.json`
9. **Format Output:** Human or JSON based on `--format` flag
10. **Exit:** Return appropriate exit code

### Timing

- **Typical cycle:** 30-50ms (milliseconds)
- **Reported in nanoseconds:** For benchmark correlation with low-level profiling

### Learning Across Cycles

- Run 1: RL agent is fresh (cold start). High epsilon (~0.3), exploration-driven actions.
- Runs 2+: Prior Q-table restored. Epsilon decays (~0.95 decay factor). Policy converges toward learned behavior.
- Run 10+: Fully learned. Epsilon near 0. Actions are deterministic (exploit phase).

---

## Examples

### Basic Usage

```bash
wpm autoprocess data/purchase_process.xes
```

### JSON Output for Scripting

```bash
wpm autoprocess data/purchase_process.xes --format json | jq '.result.cycle_result.protection.special_causes'
```

### Custom Activity Key

```bash
wpm autoprocess data/log.xes --activity-key activity_type
```

### Quiet Mode (Exit Code Only)

```bash
wpm autoprocess data/log.xes --quiet
echo "Exit: $?"
```

### With RL Configuration

```bash
wpm autoprocess data/log.xes --config '{"epsilon_decay": 0.95}'
```

---

## Common Errors

### Config error (exit 1)

**Input:** `--config '{"invalid json"`

**Output:** `Config error (exit 1)`

**Fix:** Ensure JSON is valid. Use `jq` to validate:
```bash
echo '{"epsilon_decay": 0.95}' | jq empty && echo "Valid JSON"
```

---

### Source error (exit 2)

**Input:** `wpm autoprocess nonexistent.xes`

**Output:** `Source error (exit 2) — file not found`

**Fix:** Check file path:
```bash
ls -l data/purchase_process.xes
```

---

### Execution error (exit 3)

**Cause 1:** WASM module failed to load

**Cause 2:** Corrupted RL state file

**Fix:** Clear state and retry:
```bash
rm .wasm4pm/autoprocess-state.json
wpm autoprocess data/log.xes
```

---

## Related Commands

- `wpm run` — Process discovery with algorithm selection
- `wpm predict` — Predictive mining (next-activity, remaining-time, drift)
- `wpm status` — System health and WASM engine info
- `wpm watch` — Continuous autonomic monitoring (runs autoprocess repeatedly)

---

## See Also

- `docs/AUTOPROCESS_EXAMPLES.md` — Detailed usage examples with expected outputs
- `docs/ARCHITECTURE.md` — 4-phase autonomic loop design
- `docs/RL_SYSTEM.md` — Reinforcement learning agents and Q-learning policy
- `docs/SPC_RULES.md` — Statistical Process Control rules (Western Electric)
