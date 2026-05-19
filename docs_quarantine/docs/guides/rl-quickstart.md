# RL System Quickstart

Get started with autonomous process health management in 5 steps.

**Time to first result:** ~10 minutes | **Difficulty:** Intermediate

---

## What is the RL system?

The RL (Reinforcement Learning) system in wasm4pm autonomously optimizes process health by learning from feedback. It runs a loop:

1. **Perceive:** Extract health signals from the log (SPC alerts, drift, rework)
2. **Decide:** RL agent selects an action (Continue, Scale, Retry, Fallback, Restart)
3. **Execute:** Apply the action
4. **Learn:** Update agent's policy based on reward

**5 agents compete (LinUCB selects best):**
- Q-Learning (fastest convergence)
- SARSA (safe, on-policy)
- Double Q-Learning (avoids overestimation)
- Expected SARSA (smoother)
- REINFORCE (policy gradient)

---

## Step 1: Understand the state space

The RL system monitors 8 dimensions:

```
┌─ health_level       (0-4: Normal→Failed)
├─ event_rate         (0-7: quantized events/trace)
├─ activity_count     (0-7: quantized unique activities)
├─ spc_alert_level    (0-3: Western Electric rules triggered)
├─ drift_status       (0-2: No drift, Low drift, High drift)
├─ rework_ratio       (0-7: % of repeated activities)
├─ circuit_breaker    (0-2: Closed, HalfOpen, Open)
└─ cycle_phase        (0-3: quantized cycle count)
```

The agent sees this 8-dimensional state and must pick an action.

**Example state:**
```json
{
  "health_level": 1,        // Warning
  "event_rate_q": 4,        // Medium event rate
  "activity_count_q": 5,    // 6-7 activities
  "spc_alert_level": 2,     // 2 SPC alerts
  "drift_status": 1,        // Low drift detected
  "rework_ratio_q": 2,      // ~10% rework
  "circuit_state": 0,       // Circuit closed (healthy)
  "cycle_phase": 2          // Mid-cycle
}
```

---

## Step 2: Initialize the orchestrator

```typescript
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const wasm = require('../wasm4pm/pkg/wasm4pm.js');

// Create a single orchestrator (persistent across cycles)
const orchestrator = new wasm.RlOrchestrator(42n); // seed for determinism
```

**What you get:**
- A persistent agent that learns across cycles
- Deterministic behavior (seeded RNG)
- Memory-efficient (no JS allocation per cycle)

---

## Step 3: Implement perception

Gather telemetry from your system:

```typescript
interface Telemetry {
  event_count: number;          // Total events processed
  trace_count: number;          // Total completed cases
  unique_activities: number;    // Distinct activity names
  spc_alerts: number;           // Western Electric rule hits this cycle
  drift_status: 0 | 1 | 2;      // None, Low, High
  rework_ratio: number;         // 0.0-1.0: % repeated activities
  guard_pass: boolean;          // All constraints passed?
  circuit_allowed: boolean;     // Circuit breaker allows new requests?
}

function perceive(): Telemetry {
  return {
    event_count: logBuffer.length,
    trace_count: completedCases.size,
    unique_activities: new Set(activities).size,
    spc_alerts: spcCheck(recentMetrics),
    drift_status: driftLevel,
    rework_ratio: reworkCount / eventCount,
    guard_pass: allGuardsPassed,
    circuit_allowed: breaker.allowRequest(),
  };
}
```

**Guidance on each signal:**

| Field | Source | How to compute |
|-------|--------|----------------|
| `event_count` | Event log size | `log.length` |
| `trace_count` | Completed cases | Count distinct case IDs |
| `unique_activities` | Distinct activity names | `new Set(activities).size` |
| `spc_alerts` | SPC check | Western Electric rules on metrics |
| `drift_status` | Drift detector | EWMA on Jaccard distance (see drift guide) |
| `rework_ratio` | Repeated activities | `(repeated / total)` |
| `guard_pass` | Validation gates | All business rules satisfied? |
| `circuit_allowed` | Circuit breaker | `breaker.allowRequest()` |

---

## Step 4: Run the orchestrator cycle

```typescript
function decideThenExecute(telemetry: Telemetry): void {
  // Pass telemetry to RL agent
  const result = JSON.parse(
    orchestrator.run_cycle(JSON.stringify(telemetry))
  );
  
  // result contains:
  // - action: 'Continue' | 'Scale' | 'Retry' | 'Fallback' | 'Restart'
  // - reward: -2.0 to +1.1
  // - agent: 'QLearning' | 'SARSA' | ... (winner for this cycle)
  // - health: 0-4
  
  console.log(`Action: ${result.action}, Reward: ${result.reward.toFixed(2)}`);
  
  // Execute the action
  switch (result.action) {
    case 'Continue':
      // Keep running as-is
      break;
    case 'Scale':
      // Increase parallelism or batch size
      processPool.scaleUp();
      break;
    case 'Retry':
      // Retry failed operations
      failedQueue.retryAll();
      break;
    case 'Fallback':
      // Switch to fallback mechanism
      switchFallback();
      break;
    case 'Restart':
      // Full restart of pipeline
      pipeline.restart();
      break;
  }
}
```

---

## Step 5: Monitor convergence

Run multiple cycles and track whether the policy is improving:

```typescript
async function runAutonomicLoop(numCycles: number): Promise<void> {
  const rewards: number[] = [];
  
  for (let i = 0; i < numCycles; i++) {
    const telemetry = perceive();
    decideThenExecute(telemetry);
    
    // Extract reward from last cycle
    const result = JSON.parse(orchestrator.run_cycle(JSON.stringify(telemetry)));
    rewards.push(result.reward);
    
    // Advance internal clock for circuit breaker
    orchestrator.advance_clock(1);
    
    // Log every 5 cycles
    if (i % 5 === 0) {
      const recent = rewards.slice(Math.max(0, i - 10));
      const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
      console.log(`Cycle ${i}: avg reward (last 10) = ${avg.toFixed(2)}`);
    }
  }
  
  // Final convergence check
  const first10 = rewards.slice(0, 10).reduce((a, b) => a + b) / 10;
  const last10 = rewards.slice(-10).reduce((a, b) => a + b) / 10;
  const improved = last10 > first10;
  
  console.log(`\nConvergence: ${first10.toFixed(3)} → ${last10.toFixed(3)} ${improved ? '✓' : '✗'}`);
  orchestrator.free();
}
```

---

## Understanding rewards

The RL system computes reward based on health transitions:

```
┌─ Health improves (e.g., degraded → normal)
│  └─ Reward: +1.0
├─ Health stable
│  └─ Reward: +0.2
├─ Health degrades (e.g., normal → warning)
│  └─ Reward: -1.0
├─ SPC alerts fired (per alert, max 5)
│  └─ Penalty: -0.3 each (max -1.5)
├─ Guard pass + circuit allowed
│  └─ Bonus: +0.1
├─ Guard fail OR circuit open
│  └─ Penalty: -0.5
└─ Terminal state (health = 4, Failed)
   └─ Penalty: -2.0
```

**Range:** -5.0 (worst) to +1.1 (best)

**Interpretation:**
- `reward > 0.5` → Excellent (health improving or stable with no alerts)
- `reward 0.0-0.5` → Good (stable, minor issues)
- `reward -0.5-0.0` → Neutral (mixed signals)
- `reward < -0.5` → Poor (health degrading, alerts firing)

---

## Tuning tips

### Seed for reproducibility

```typescript
const orchestrator = new wasm.RlOrchestrator(42n);
// Same seed → deterministic behavior across runs
```

### Agent selection (manual override)

If you know which agent works best for your domain:

```typescript
// Note: LinUCB automatically selects best agent
// To force a specific agent (for testing):
// This is not exposed in public API — use for research only
```

### Convergence criteria

Check convergence after N cycles:

```typescript
const isConverged = (rewards: number[], windowSize: number = 10): boolean => {
  if (rewards.length < windowSize * 2) return false;
  const first = rewards.slice(0, windowSize).reduce((a, b) => a + b) / windowSize;
  const last = rewards.slice(-windowSize).reduce((a, b) => a + b) / windowSize;
  return Math.abs(last - first) < 0.1; // Threshold: 0.1
};
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| All actions are 'Continue' | Agent still learning; increase cycle count |
| Reward always negative | Telemetry signals unhealthy state; fix root cause |
| `NaN` in reward | Ensure `guard_pass` and `circuit_allowed` are booleans |
| Policy not improving | Try different seed; run 100+ cycles minimum |
| Circuit breaker stuck Open | Must call `advance_clock()` regularly |

---

## Next steps

- **Deep dive:** [`rl-complete.md`](../rl-complete.md)
- **Convergence details:** [`convergence-envelope-analysis.md`](../convergence-envelope-analysis.md)
- **API reference:** [`wasm4pm-rl.md`](../api/wasm4pm-rl.md)
- **Examples:** [`examples/rl-monitoring.ts`](../../examples/rl-monitoring.ts)
- **Testing:** [`.claude/rules/ml-rl-testing.md`](./.claude/rules/ml-rl-testing.md)

---

**Still have questions?** See [`rl-faq.md`](../faq/rl-faq.md).
