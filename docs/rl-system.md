# RL System Guide

The pictl reinforcement-learning subsystem provides autonomous monitoring and
self-healing for process-mining pipelines. It is exposed through the
`RlOrchestrator` (Rust/WASM) and consumed by `pictl autoprocess` and the MCP
server.

This guide is intended for **users**, not RL researchers — it explains what the
system does, how to interpret its decisions, and how to tune it.

---

## 1. The five RL agents

| Agent               | Family            | Update rule                           | When it shines                          |
|---------------------|-------------------|----------------------------------------|------------------------------------------|
| `QLearning`         | Off-policy TD     | `Q ← Q + α(r + γ max Q' − Q)`          | Stable, deterministic environments      |
| `SARSA`             | On-policy TD      | `Q ← Q + α(r + γ Q(s',a') − Q)`        | When safety / on-policy matters         |
| `DoubleQLearning`   | Off-policy TD     | Decoupled selection / evaluation       | Reduces overestimation bias             |
| `ExpectedSARSA`     | On-policy TD      | Expectation over action distribution   | Lower variance than SARSA               |
| `REINFORCE`         | Policy gradient   | `θ ← θ + α ∇log π(a|s) G_t`            | Long episodes, stochastic policies      |

Agents are interchangeable behind a common `RlAgent` trait. The orchestrator
selects one per cycle using **LinUCB** (see §3).

## 2. State space and rewards

### 8-dimensional discretized state (460 800 states)

| Dimension          | Range | Source signal                          |
|--------------------|-------|----------------------------------------|
| `health_level`     | 0–4   | Composite health score (0 = healthy)   |
| `event_rate_q`     | 0–7   | Quantized events/sec                   |
| `activity_count_q` | 0–7   | Quantized distinct activities          |
| `spc_alert_level`  | 0–3   | Western Electric rule severity         |
| `drift_status`     | 0–2   | EWMA drift band                        |
| `rework_ratio_q`   | 0–7   | Quantized rework fraction              |
| `circuit_state`    | 0–2   | Closed / HalfOpen / Open               |
| `cycle_phase`      | 0–3   | Quantized cycle counter                |

### Reward function

| Component                   | Reward    | Trigger                              |
|-----------------------------|-----------|--------------------------------------|
| Health improved             | `+1.0`    | `health_t < health_{t-1}`            |
| Health stable               | `+0.2`    | unchanged                            |
| Health degraded             | `−1.0`    | increased                            |
| SPC alert penalty           | `−0.3` ea | up to `−1.5`                         |
| Guard pass + circuit allow  | `+0.1`    | both true                            |
| Guard fail / circuit open   | `−0.5`    | either false                         |
| Terminal (failed)           | `−2.0`    | `health == 4`                        |

Range: `[−5.0, +1.1]`.

> **Why these numbers?** The shaping rewards (`+0.1 / −0.5`) keep agents
> exploring safe actions; the dominant `±1.0` health term is what they learn
> to optimise; the terminal `−2.0` makes failure unambiguously bad.

## 3. Agent selection — LinUCB contextual bandit

LinUCB picks the best of the five agents *for the current 8-D context*. It
balances:

- **Exploitation** — favour agents that historically scored well in similar
  contexts.
- **Exploration** — give under-tested agents a confidence-bound bonus.

The exploration parameter `α` (default `1.0`) controls aggressiveness:

- `α < 1.0` → conservative, sticks with proven agents sooner.
- `α > 1.0` → more random, useful in rapidly-changing environments.

Selection runs every cycle (~10–100 ms in WASM).

## 4. Convergence behaviour

Empirical convergence on synthetic logs (50 cycles, 5 seeds):

| Metric                      | Cycle 0–10 | Cycle 40–50 |
|-----------------------------|------------|-------------|
| Mean reward                 | −0.6       | +0.4        |
| Health mode                 | 2          | 0–1         |
| Action variance             | high       | low         |

Tests under `wasm4pm/tests/` enforce monotonic mean-reward improvement
(`Rank 4` statistical oracle, see `chicago-tdd.md`). If your deployment does
**not** converge after 50 cycles you likely have:

1. Misconfigured reward weights (check `compute_reward`).
2. State aliasing (different situations → same discretised state).
3. Non-stationary dynamics — switch to `REINFORCE`.

## 5. Self-healing integration

The orchestrator pairs RL with three protective primitives:

- **Circuit breaker** — Open after 3 consecutive failures; half-opens after a
  caller-driven `advance_clock(threshold)` tick.
- **SPC controller** — Western Electric rules over a 100-snapshot ring buffer.
- **Guards** — Pre-condition checks before each action.

Together these ensure the RL agent never executes an action while the system is
already in a known-bad state — the agent only sees survivable transitions.

## 6. Observability

Every cycle emits OTEL spans:

- `rl.cycle` — outer span, attributes: `agent_id`, `health`, `reward`.
- `rl.select_action` — LinUCB selection.
- `rl.update` — value-function update.
- `circuit.transition` — when state changes.
- `spc.alert` — Western Electric rule firings.

View in Jaeger (`http://localhost:16686`, service `pictl`).

## 7. WASM constraints

- No threads → `RefCell<HashMap>` instead of `Arc<RwLock>`.
- No `std::time::Instant` → monotonic step counter (`advance_clock`).
- RNG → `fastrand` (seedable for determinism).

Always pass a seed in tests:

```rust
let mut orch = RlOrchestrator::new_with_seed(42);
```

---

## See also

- [`ml-rl-testing.md`](../.claude/rules/ml-rl-testing.md) — Statistical oracles.
- [`drift-detection.md`](./drift-detection.md).
- [`examples/rl-monitoring.ts`](../examples/rl-monitoring.ts).
