# wpm autoprocess — Usage Examples

The `wpm autoprocess` command runs the four-phase autonomic loop: **Perception → Decision → Protection → Optimization**. Each cycle analyzes the event log, evaluates system health, checks statistical process control alerts, and dispatches RL-selected actions.

State (RL, SPC, circuit breaker) persists to `.wasm4pm/autoprocess-state.json` across runs, enabling long-horizon learning and failure recovery.

---

## Example 1: Basic Usage

Run a single AutoProcess cycle on an event log, using default activity key.

```bash
wpm autoprocess data/purchase_process.xes
```

**Expected output (human format):**

```
AutoProcess Results

  Perception:
    Events: 4521
    Activities: 12
    Traces: 342
    Health: normal (score 0.92)

  Decision:
    Guard: PASS
    Pattern: q_learning (127 ticks)

  Protection:
    Circuit: closed
    SPC rule1: + OK
    SPC rule2: + OK
    SPC rule3: - ALERT
    Special Causes: 1

  Optimization:
    Action: increase_sampling

  Timing:
    Total: 34580000 ns (see benchmarks for nanosecond measurements)

  Result: Cycle completed successfully
```

---

## Example 2: Multiple Runs with State Persistence

Run AutoProcess 9 times on the same log, observing RL state growth and health improvement.

```bash
# First run — cold start (RL state initialized from scratch)
wpm autoprocess data/purchase_process.xes

# Run 2-9 — warm start (RL state restored from .wasm4pm/autoprocess-state.json)
for i in {2..9}; do
  echo "=== Run $i ==="
  wpm autoprocess data/purchase_process.xes
  sleep 1
done
```

**Expected behavior:**

- **Run 1:** RL state fresh. Action = `explore` (high epsilon ~0.3). Health score: 0.92.
- **Run 2-5:** Policy learning. Actions become more targeted. SPC rule violations remain stable. Health score: 0.92-0.95.
- **Run 6-9:** Policy converged. Epsilon decays (~0.05). Actions increasingly select `maintain_buffer`. Health score climbs to 0.96-0.98.

State file grows as RL agent explores Q-table (`~500 entries after 9 runs`).

**Check state growth:**

```bash
ls -lh .wasm4pm/autoprocess-state.json
# -rw-r--r--  5.2K  Apr 16 10:23  .wasm4pm/autoprocess-state.json

cat .wasm4pm/autoprocess-state.json | jq '.rl_state | keys | length'
# 487  (487 unique state-action pairs learned)
```

---

## Example 3: State Recovery from Previous Run

Restore RL and SPC state from a saved checkpoint, continue learning from that point.

```bash
# Assume .wasm4pm/autoprocess-state.json exists from previous session
cat .wasm4pm/autoprocess-state.json | jq '.saved_at'
# "2026-04-16T09:15:23.456Z"

# Run next cycle — RL state is restored automatically
wpm autoprocess data/purchase_process.xes --format json | jq '.result.cycle_result.optimization.rl_action'
# "maintain_buffer"  (action from learned policy, not random exploration)
```

**Why this matters:**

- **Episode continuity:** RL agent remembers which actions worked in similar states, avoiding re-exploration.
- **SPC history:** Circuit breaker and Western Electric rules maintain 100-event history, enabling multi-cycle drift detection.
- **Failure recovery:** If a cycle failed (e.g., network timeout during analysis), the next cycle resumes with all prior learning intact.

---

## Example 4: Monitoring SPC Alerts in JSON Output

Run AutoProcess with JSON output to programmatically inspect which SPC rules fired.

```bash
wpm autoprocess data/purchase_process.xes --format json | jq '.result.cycle_result.protection'
```

**Expected JSON output:**

```json
{
  "circuit_state": "closed",
  "spc_results": {
    "rule1_beyond_3sigma": "OK",
    "rule2_nine_consecutive": "ALERT",
    "rule3_six_increasing": "OK"
  },
  "special_causes": [
    {
      "rule": "rule2_nine_consecutive",
      "metric": "event_rate",
      "value": 45.2,
      "expected": 38.5,
      "deviation_percent": 17.4
    }
  ]
}
```

**Alert interpretation:**

- **rule1_beyond_3sigma:** One measurement exceeded 3 standard deviations from mean. Rare special cause (0.3% probability).
- **rule2_nine_consecutive:** 9 consecutive samples on one side of centerline. Indicates trend or shift.
- **rule3_six_increasing:** 6 consecutive increasing values. Indicates degradation.

**Scripted alert response:**

```bash
wpm autoprocess data/purchase_process.xes --format json | jq -r '.result.cycle_result.protection.special_causes[] | select(.rule == "rule2_nine_consecutive") | "SHIFT DETECTED: \(.metric) at \(.value) (expected \(.expected))"'
# Output: SHIFT DETECTED: event_rate at 45.2 (expected 38.5)
```

---

## Example 5: Action Dispatch and Policy Effects

Run AutoProcess with a custom RL configuration, observe epsilon decay and health score changes.

```bash
# Configuration with explicit epsilon decay rate
wpm autoprocess data/purchase_process.xes \
  --config '{"epsilon_decay": 0.95, "learning_rate": 0.1}' \
  --format json \
  > run1.json

wpm autoprocess data/purchase_process.xes \
  --config '{"epsilon_decay": 0.95, "learning_rate": 0.1}' \
  --format json \
  > run2.json
```

**Compare epsilon and health across runs:**

```bash
echo "Run 1 vs Run 2 comparison:"
jq -r '.result.cycle_result.optimization | "Run: action=\(.rl_action), epsilon≈\(.epsilon // "N/A")"' run1.json
jq -r '.result.cycle_result.optimization | "Run: action=\(.rl_action), epsilon≈\(.epsilon // "N/A")"' run2.json

echo ""
echo "Health score progression:"
jq -r '.result.cycle_result.perception.health_score' run1.json run2.json
```

**Expected output:**

```
Run 1 vs Run 2 comparison:
Run: action=explore, epsilon≈0.30
Run: action=increase_sampling, epsilon≈0.28

Health score progression:
0.92
0.93
```

**Action effects (observed in protection phase):**

| Action | Effect |
|--------|--------|
| `explore` | Epsilon stays high. Random actions. High variance in rewards. |
| `increase_sampling` | Event window grows. Captures more traces. Better statistical power. Health +0.5-1.0%. |
| `decrease_latency` | Circuit breaker tightens timeout. Risks early abort. SPC alerts may spike. |
| `maintain_buffer` | Steady state. Epsilon low (~0.05). Most Q-values used. Minimal exploration. |
| `escalate` | Forces health check. May temporarily degrade health as system recalibrates. |

**Reward signal (from WASM):**

```rust
// +1.0 if health improved
// +0.2 if health unchanged (stability bonus)
// -1.0 if health degraded
// -0.3 per SPC alert (max -1.5)
// +0.1 if guard AND circuit allowed
// -0.5 if guard OR circuit denied
// -2.0 if health == 4 (failed state)
```

**Health scores by state:**

| Health Level | Score | Meaning |
|---|---|---|
| 0 | 0.98+ | Normal |
| 1 | 0.85-0.97 | Degraded |
| 2 | 0.70-0.84 | At-risk |
| 3 | 0.50-0.69 | Critical |
| 4 | <0.50 | Failed |

---

## Example 6: Custom Activity Key

Process logs where activity names are stored in a custom attribute.

```bash
# Standard XES (concept:name is the activity)
wpm autoprocess data/standard_log.xes

# Custom attribute (e.g., "activity_type" instead of "concept:name")
wpm autoprocess data/custom_log.xes --activity-key activity_type

# Short form
wpm autoprocess data/custom_log.xes -k activity_type
```

---

## Example 7: Verbose and Quiet Modes

Control output verbosity.

```bash
# Verbose — includes debug info (not yet implemented, but reserved)
wpm autoprocess data/purchase_process.xes --verbose

# Quiet — suppress non-error output (useful in scripts)
wpm autoprocess data/purchase_process.xes --quiet
echo "Exit code: $?"
```

---

## Example 8: Integration with CI/CD

Run AutoProcess as part of a continuous process monitoring pipeline.

```bash
#!/bin/bash
set -e

# Daily autonomic execution
wpm autoprocess data/production_log.xes \
  --format json \
  --no-save > /tmp/autoprocess_result.json

# Extract metrics
HEALTH=$(jq -r '.result.cycle_result.perception.health_score' /tmp/autoprocess_result.json)
SPC_ALERTS=$(jq '.result.cycle_result.protection.special_causes | length' /tmp/autoprocess_result.json)
ACTION=$(jq -r '.result.cycle_result.optimization.rl_action' /tmp/autoprocess_result.json)

# Check health threshold
if (( $(echo "$HEALTH < 0.80" | bc -l) )); then
  echo "⚠️  Health critical: $HEALTH"
  exit 1
fi

if [ "$SPC_ALERTS" -gt 2 ]; then
  echo "⚠️  Multiple SPC alerts detected: $SPC_ALERTS"
fi

echo "✅ Process healthy: score=$HEALTH, alerts=$SPC_ALERTS, action=$ACTION"
exit 0
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success — cycle completed |
| 1 | Config error — invalid JSON config or missing required fields |
| 2 | Source error — XES file not found or unreadable |
| 3 | Execution error — WASM failure, RL state corruption, or internal error |

---

## Output Files

### `.wasm4pm/autoprocess-state.json`

Persisted autonomic state (auto-saved after each cycle).

```json
{
  "rl_state": {
    "(0, 1, 2, 0, 2, 4, 0, 1)": {
      "explore": 0.5,
      "increase_sampling": 0.8,
      "maintain_buffer": 0.6
    },
    // ... 486 more states
  },
  "spc_history": {
    "rule1_beyond_3sigma": [38.2, 38.5, 38.1, ...],  // 100-event ring buffer
    "rule2_nine_consecutive": [1, 1, 1, 1, 1, 1, 1, 1, 1, ...],
    "rule3_six_increasing": [...]
  },
  "circuit_breaker_state": {
    "state": "closed",
    "failure_count": 0,
    "last_failure": null,
    "step": 127
  },
  "saved_at": "2026-04-16T10:30:45.123Z"
}
```

---

## Troubleshooting

### Issue: "Circuit breaker open" warning

**Cause:** 3+ consecutive failures detected. RL agent is in protection mode.

**Recovery:**
```bash
# Wait for circuit to half-open (30 seconds default), then probe
sleep 30
wpm autoprocess data/purchase_process.xes
```

### Issue: SPC alerts every run (rule2_nine_consecutive)

**Cause:** Sustained process shift. RL agent should adapt via reward signal.

**Check:** Inspect health score trend across 5+ runs. If declining, escalate to DevOps.

```bash
for i in {1..5}; do
  wpm autoprocess data/purchase_process.xes --format json | \
    jq -r '.result.cycle_result.perception.health_score'
done
```

### Issue: RL state file is too large (>10MB)

**Cause:** Agent has explored excessively (pathological learning scenario).

**Recovery:**
```bash
# Reset state, start fresh
rm .wasm4pm/autoprocess-state.json
wpm autoprocess data/purchase_process.xes
```

---

## References

- [AutoProcess Architecture](../ARCHITECTURE.md) — 4-phase lifecycle
- [RL System Overview](../RL_SYSTEM.md) — 5 agents, 8D state space, LinUCB selection
- [SPC Rules](../SPC_RULES.md) — Western Electric rules for drift detection
- [Circuit Breaker Pattern](../CIRCUIT_BREAKER.md) — Failure protection and recovery
