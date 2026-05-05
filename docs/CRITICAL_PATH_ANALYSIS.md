# wasm4pm Critical Path Analysis

**Version:** v26.4.17  
**Status:** DETAILED MAPPING OF CONTROL & DATA FLOW  
**Last Updated:** 2026-05-05  
**Agent:** Agent 9 (Integration Testing & Certification Gates)

---

## Critical Paths Map

This document traces the exact control flow and data transformations through pictl's core subsystems. Each path is a **sequence of function calls** that must be tested end-to-end.

---

## Path 1: Discovery Pipeline

**Entry point:** `wpm run <log.xes> --algorithm <algo>`

```
CLI Entry (cli.ts:main)
    ↓
Command Router (cli.ts:runCommand)
    ↓ [command='run']
Run Handler (apps/wasm4pm/src/commands/run.ts:run)
    ├─→ Config Resolution (packages/config/src/resolver.ts:resolveConfig)
    │   ├─→ Read: CLI args
    │   ├─→ Read: TOML file (wasm4pm.toml)
    │   ├─→ Read: JSON file (wasm4pm.json)
    │   ├─→ Read: ENV vars (WASM4PM_* prefix)
    │   └─→ Merge with 5-layer precedence
    │
    ├─→ EventLog Loading (packages/kernel/src/backend/pm4wasm.ts:loadEventLog)
    │   ├─→ Parse XES (wasm4pm/src/xes_parser.rs:parse_xes)
    │   ├─→ Validate attributes (all required attributes present?)
    │   ├─→ Build trace list
    │   └─→ Create EventLog handle
    │
    ├─→ Engine Bootstrap (packages/engine/src/bootstrap.ts:bootstrapEngine)
    │   ├─→ Load WASM module (packages/engine/src/wasm-loader.ts:loadWasm)
    │   ├─→ Initialize WASM memory
    │   ├─→ Register algorithm dispatch table
    │   └─→ Emit span: engine.bootstrap
    │
    ├─→ Planning (packages/planner/src/planner.ts:plan)
    │   ├─→ Create ExecutionPlan DAG
    │   ├─→ Assign profile (fast/balanced/quality/stream)
    │   ├─→ Select algorithm based on profile
    │   └─→ Emit span: planner.plan
    │
    ├─→ Execution (packages/kernel/src/step-dispatcher.ts:runStep)
    │   ├─→ Dispatch to discovery algorithm
    │   │   ├─→ wasm4pm/src/discovery.rs (algorithm implementation)
    │   │   └─→ Return DFG/Petrinet/Tree
    │   ├─→ Emit span: kernel.run (algorithm, log_size, duration_ms)
    │   └─→ Validate output (non-empty DFG, valid edges)
    │
    ├─→ Result Hashing (packages/contracts/src/hashing.ts:hashResult)
    │   ├─→ BLAKE3(config_json)
    │   ├─→ BLAKE3(log_xes)
    │   ├─→ BLAKE3(result_json)
    │   └─→ BLAKE3(config || input || output)
    │
    ├─→ Receipt Creation (packages/contracts/src/receipt.ts:createReceipt)
    │   ├─→ Set run_id (UUID v4)
    │   ├─→ Set status (success/partial/failed)
    │   ├─→ Capture summary (event_count, edge_count, execution_time)
    │   └─→ Sign receipt (HMAC-SHA256)
    │
    └─→ Output Formatting (apps/wasm4pm/src/output.ts:formatOutput)
        ├─→ If --format=json: JSON.stringify(receipt)
        ├─→ If --format=human: Pretty-print with colors
        ├─→ Emit span: output.format
        └─→ Write to stdout/file

Exit Code Logic:
    - Success: EXIT_CODE=0
    - Config error (bad --algorithm, missing file): EXIT_CODE=1
    - Source error (invalid XES, bad attributes): EXIT_CODE=2
    - Execution error (algorithm crash, OOM): EXIT_CODE=3
    - System error (WASM load fail): EXIT_CODE=5
```

**Critical checks:**
- [ ] EventLog is non-empty (≥1 trace, ≥1 event)
- [ ] All required attributes present (concept:name, time:timestamp)
- [ ] Timestamps are valid ISO-8601 or Unix timestamps
- [ ] Algorithm exists in registry (41 algorithms)
- [ ] Config precedence is correct (CLI > ENV > JSON > TOML > defaults)
- [ ] WASM module loads and initializes successfully
- [ ] DFG output is valid (no null edges, positive frequencies)
- [ ] Receipt hash is deterministic (same input → same hash)
- [ ] Exit code matches error type

**Test scenarios:** E2E-01, E2E-02, E2E-03, E2E-04, E2E-05, E2E-06

---

## Path 2: Prediction Pipeline (6 Perspectives)

**Entry point:** `wpm predict <perspective> -i <log.xes>`

```
CLI Entry (cli.ts:main)
    ↓
Command Router → Predict Handler (apps/wasm4pm/src/commands/predict.ts:predict)
    ├─→ Config Resolution (resolveConfig with perspective param)
    │
    ├─→ EventLog Loading (loadEventLog from -i file)
    │
    ├─→ Prefix Extraction (parsePrefix from --prefix CLI arg)
    │   └─→ Split by comma: "A,B,C" → [A, B, C]
    │
    ├─→ Prediction Dispatcher (packages/kernel/src/prediction/dispatcher.ts:PredictionDispatcher.execute)
    │   │
    │   ├─→ SWITCH on perspective:
    │   │
    │   ├─→ "next_activity":
    │   │   ├─→ NextActivityPredictor::fit_predict()
    │   │   │   ├─→ Build n-gram model from traces
    │   │   │   ├─→ Laplace smoothing (add 1 to all counts)
    │   │   │   ├─→ Rank candidates by P(activity | prefix)
    │   │   │   ├─→ Emit span: predict.next_activity
    │   │   │   └─→ Return top-k candidates with probabilities
    │   │   ├─→ Invariant: sum(probabilities) = 1.0 ± 0.01
    │   │   └─→ Check: top candidate is most frequent successor
    │   │
    │   ├─→ "remaining_time":
    │   │   ├─→ RemainingTimePredictor::fit_predict()
    │   │   │   ├─→ Extract timestamp deltas for all traces
    │   │   │   ├─→ Fit Weibull/exponential distribution
    │   │   │   ├─→ Compute median/mean remaining time
    │   │   │   ├─→ Emit span: predict.remaining_time
    │   │   │   └─→ Return remaining_time_ms
    │   │   ├─→ Invariant: remaining_time ≥ 0
    │   │   └─→ Check: longer prefix → shorter remaining_time (monotonic)
    │   │
    │   ├─→ "outcome":
    │   │   ├─→ OutcomePredictor::fit_predict()
    │   │   │   ├─→ Extract trace features (length, activity_count, rework)
    │   │   │   ├─→ Compute anomaly score (boundary distance)
    │   │   │   ├─→ Emit span: predict.outcome
    │   │   │   └─→ Return {default: prob, anomaly: prob}
    │   │   ├─→ Invariant: default_prob + anomaly_prob = 1.0
    │   │   └─→ Check: scores in [0,1]
    │   │
    │   ├─→ "drift":
    │   │   ├─→ DriftDetector::detect()
    │   │   │   ├─→ Partition log into time windows
    │   │   │   ├─→ Compute Jaccard distance between windows
    │   │   │   ├─→ Apply EWMA smoothing (alpha=0.3)
    │   │   │   ├─→ Emit span: predict.drift
    │   │   │   └─→ Return drift_score_timeline
    │   │   ├─→ Invariant: all drift_scores in [0,1]
    │   │   └─→ Check: drift_score increases when process changes
    │   │
    │   ├─→ "features":
    │   │   ├─→ FeatureExtractor::extract()
    │   │   │   ├─→ Compute prefix length (activity count in prefix)
    │   │   │   ├─→ Compute rework score (activity repetitions / total)
    │   │   │   ├─→ Compute resource count (distinct resources in prefix)
    │   │   │   ├─→ Emit span: predict.features
    │   │   │   └─→ Return feature_vector [0..1]
    │   │   └─→ Invariant: all features in [0,1], normalized
    │   │
    │   └─→ "resource":
    │       ├─→ ResourcePredictor::fit_predict()
    │       │   ├─→ Count resource handovers
    │       │   ├─→ Fit M/M/1 queue model
    │       │   ├─→ Apply UCB1 bandit (upper confidence bound)
    │       │   ├─→ Emit span: predict.resource
    │       │   └─→ Return top-k resources with scores
    │       └─→ Invariant: probabilities sum to 1.0
    │
    ├─→ Result Hashing & Receipt Creation
    │   └─→ Same as Path 1
    │
    └─→ Output Formatting

Exit Code Logic:
    - Same as Path 1 (0, 1, 2, 3, 5)
```

**Critical checks:**
- [ ] Prefix is valid (activities exist in log)
- [ ] Perspective is recognized (one of 6 canonical perspectives)
- [ ] Probabilities sum to 1.0 (or declared as partial)
- [ ] All features are normalized to [0,1]
- [ ] Monotonicity invariants hold (remaining_time decreases with longer prefix)
- [ ] OTEL spans are emitted for each perspective
- [ ] Output schema matches perspective (different fields for each)

**Test scenarios:** E2E-07, E2E-08, E2E-09

---

## Path 3: RL Orchestrator Pipeline (Autonomic Loop)

**Entry point:** Internal loop in `autoprocess` command or background task

```
Autonomic Loop (wasm4pm/src/autoprocess.rs:run_autonomic_loop)
    │
    ├─→ Cycle Start
    │   ├─→ Increment cycle counter
    │   ├─→ Capture start timestamp
    │   └─→ Emit span: autonomic.cycle_start
    │
    ├─→ State Construction (RlState::from_features)
    │   ├─→ Extract 8-dimensional feature vector:
    │   │   [0] health_level (u8: 0=normal, 1=watch, 2=degraded, 3=escalated, 4=failed)
    │   │   [1] event_rate_q (u8: 0-7, quantized from [0, inf) → [0, 1])
    │   │   [2] activity_count_q (u8: 0-7, quantized)
    │   │   [3] spc_alert_level (u8: 0-3, count of active SPC alerts)
    │   │   [4] drift_status (u8: 0=stable, 1=low, 2=high)
    │   │   [5] rework_ratio_q (u8: 0-7, quantized from [0, 1])
    │   │   [6] circuit_state (u8: 0=closed, 1=half-open, 2=open)
    │   │   [7] cycle_phase (u8: 0-3, quantized cycle count)
    │   ├─→ Validate: all features in [0,1] ✓ (invariant FM-5)
    │   └─→ Emit span: rl.state_construction (features, health_level)
    │
    ├─→ Agent Selection (LinUCB Bandit)
    │   ├─→ Initialize context: [health_level, event_rate_q, ...]
    │   ├─→ Compute UCB bonus for each agent:
    │   │   UCB(agent) = Q(state, agent) + bonus
    │   │       where bonus = sqrt(alpha * ln(t) / N_agent)
    │   ├─→ Select agent = argmax UCB
    │   ├─→ Emit span: rl.agent_selection (selected_agent, ucb_value)
    │   └─→ Return agent_type (QLearning|SARSA|Double|ExpectedSARSA|REINFORCE)
    │
    ├─→ Action Selection (Agent-specific)
    │   ├─→ Get Q(state, *) for all actions
    │   ├─→ IF exploration_rate > rand():
    │   │   └─→ action = random_action() [epsilon-greedy]
    │   ├─→ ELSE:
    │   │   └─→ action = argmax Q(state, action) [greedy]
    │   ├─→ Validate action in allowed_actions (guards)
    │   ├─→ Emit span: rl.action_selection (action, q_value, exploration)
    │   └─→ Return action (Continue|Scale|Retry|Restart|Fallback)
    │
    ├─→ Guard Check (Lawful Action Clipping)
    │   ├─→ Check circuit state:
    │   │   IF circuit=Open AND action=Scale:
    │   │       └─→ action = Continue [blocked by circuit]
    │   ├─→ Check health state:
    │   │   IF health=Failed AND action=Scale:
    │   │       └─→ action = Restart [escalated recovery]
    │   ├─→ Emit span: rl.guard_check (action, guard_passed, reason)
    │   └─→ guard_result = bool (pass/fail)
    │
    ├─→ Action Dispatch (Autonomic Execution)
    │   ├─→ Execute action (wasm4pm/src/action_dispatch.rs:dispatch)
    │   │   ├─→ Continue: no-op (health monitoring)
    │   │   ├─→ Scale: adjust memory/worker count
    │   │   ├─→ Retry: exponential backoff, max_retries
    │   │   ├─→ Restart: reset state, clear cache
    │   │   └─→ Fallback: switch to slower/more-reliable algorithm
    │   ├─→ Capture execution outcome
    │   └─→ Emit span: rl.action_dispatch (action, outcome, duration_ms)
    │
    ├─→ Reward Computation (compute_reward)
    │   ├─→ Input: old_health, new_health, spc_alert_count, guard_pass, circuit_allow, is_terminal
    │   ├─→ Compute components:
    │   │   health_change = (old_health > new_health) ? +1.0 : (old_health == new_health ? +0.2 : -1.0)
    │   │   spc_penalty = -0.3 * min(spc_alert_count, 5)  [max -1.5]
    │   │   guard_penalty = (guard_pass && circuit_allow) ? +0.1 : -0.5
    │   │   terminal_penalty = is_terminal ? -2.0 : 0.0
    │   ├─→ Sum components (bounded range: [-3.5, +1.1])
    │   ├─→ Emit span: rl.compute_reward (reward, components)
    │   └─→ Return reward: f64
    │
    ├─→ Bellman Update (Agent-specific Q-learning)
    │   ├─→ Get next_state (same extraction as State Construction)
    │   ├─→ Compute target:
    │   │   IF done:
    │   │       target = reward  [no bootstrapping]
    │   │   ELSE:
    │   │       target = reward + gamma * max_a Q(next_state, a)  [Bellman eq]
    │   ├─→ Compute delta:
    │   │   delta = target - Q(state, action)
    │   ├─→ Update Q-value:
    │   │   Q(state, action) += alpha * delta
    │   ├─→ Verify mutation test FM-1: next_state != state ✓
    │   ├─→ Emit span: rl.bellman_update (delta, q_change, target)
    │   └─→ Assert: Q(state, action) changed in predicted direction
    │
    ├─→ SPC Analysis (Western Electric Rules)
    │   ├─→ Add data point: health_score = f(state)
    │   ├─→ Check Rule 1: One point beyond 3σ
    │   │   └─→ Triggers if |point - mean| > 3*sigma
    │   ├─→ Check Rule 2: 9 consecutive points on one side
    │   │   └─→ Triggers at exactly the 9th point
    │   ├─→ Check Rule 3: 6 consecutive increasing/decreasing points
    │   │   └─→ Triggers at exactly the 6th point
    │   ├─→ Verify mutation test TS-1: use timestamp, not String::len() ✓
    │   ├─→ Emit span: spc.check_rules (rule1, rule2, rule3, alerts)
    │   └─→ Return spc_alert_count (0-3, one per triggered rule)
    │
    ├─→ Circuit Breaker Update (State Machine)
    │   ├─→ Input: action_outcome (success/failure)
    │   ├─→ IF outcome=failure:
    │   │   ├─→ fail_count++
    │   │   ├─→ IF fail_count >= failure_threshold (3):
    │   │   │   └─→ state = Open, fail_count = 0, last_failure_time = now()
    │   ├─→ IF state=Open AND now() - last_failure_time >= timeout:
    │   │   └─→ state = HalfOpen, success_count = 0
    │   ├─→ IF state=HalfOpen AND outcome=success:
    │   │   ├─→ success_count++
    │   │   ├─→ IF success_count >= success_threshold (1):
    │   │   │   └─→ state = Closed, success_count = 0, fail_count = 0
    │   ├─→ Verify mutation test CB-1: advance_clock() called to track time ✓
    │   ├─→ Emit span: circuit_breaker.update (state, fail_count, success_count)
    │   └─→ Return circuit_state (Closed|HalfOpen|Open)
    │
    ├─→ Telemetry Recording (CycleTelemetry)
    │   ├─→ cycle_count++
    │   ├─→ last_health_state = new_health
    │   ├─→ cumulative_reward += reward
    │   ├─→ last_reward = reward
    │   ├─→ cycle_duration_ms = elapsed time
    │   └─→ Emit span: rl.telemetry (cycle_count, reward, health_state)
    │
    ├─→ Cycle End
    │   ├─→ Persist state to checkpoint file (.wasm4pm/checkpoint)
    │   ├─→ Emit span: autonomic.cycle_end (total_duration_ms)
    │   └─→ Sleep: 100ms (configurable)
    │
    └─→ Repeat until shutdown signal

State Persistence:
    - Write RlOrchestrator state to JSON: .wasm4pm/checkpoint
    - On restart: load checkpoint and resume from saved state
    - Invariant: cycle_count strictly increases (even after restart)
```

**Critical checks:**
- [ ] Features are normalized to [0,1] (invariant FM-5)
- [ ] State space is bounded (460,800 states max)
- [ ] Bellman update uses next_state, not state (test FM-1)
- [ ] SPC rules use timestamp, not String::len() (test TS-1)
- [ ] Circuit breaker advances clock and transitions correctly (test CB-1)
- [ ] Reward is bounded [-3.5, +1.1]
- [ ] Q-values converge to optimal policy over 50+ cycles
- [ ] All OTEL spans are emitted
- [ ] Checkpoint is persisted and restored correctly

**Test scenarios:** E2E-10, E2E-11, E2E-12

---

## Path 4: Conformance Checking Pipeline

**Entry point:** `wpm conformance -i <log.xes> -m <model.pnml>`

```
CLI Entry → Conformance Handler (apps/wasm4pm/src/commands/conformance.ts:conformance)
    ├─→ Config Resolution
    │
    ├─→ EventLog Loading (from -i)
    │
    ├─→ Model Loading (from -m)
    │   ├─→ PNML import (wasm4pm/src/pnml_io.rs:parse_pnml)
    │   │   ├─→ Extract places, transitions, arcs
    │   │   ├─→ Build initial marking
    │   │   └─→ Validate Petri net structure
    │   ├─→ OR Process tree import (wasm4pm/src/process_tree.rs:parse_tree)
    │   ├─→ OR DFG import (from result of previous discovery)
    │   └─→ Emit span: model.load (model_type, place_count, transition_count)
    │
    ├─→ Conformance Checking (Token-Based Replay)
    │   ├─→ For each trace:
    │   │   ├─→ Initialize marking = initial_marking
    │   │   ├─→ For each event in trace:
    │   │   │   ├─→ Find transitions that match event (concept:name)
    │   │   │   ├─→ Try to fire transition (consume input tokens)
    │   │   │   ├─→ If success:
    │   │   │   │   ├─→ Produce output tokens
    │   │   │   │   └─→ consumed_count++
    │   │   │   ├─→ If fail:
    │   │   │   │   ├─→ missing_count++  [required token not available]
    │   │   │   │   └─→ Add missing tokens (skip event)
    │   │   ├─→ At trace end:
    │   │   │   ├─→ remaining_count += remaining tokens
    │   │   │   └─→ produced_count += total tokens produced
    │   │   └─→ Emit span: conformance.replay_trace (trace_id, missing, consumed, remaining, produced)
    │
    ├─→ Fitness Calculation
    │   ├─→ Compute: fitness = 1 - (missing + consumed) / (produced + remaining)
    │   ├─→ Invariant: fitness in [0, 1]
    │   ├─→ Check: fitness > 0.85 for valid models
    │   └─→ Emit span: conformance.fitness (fitness_score, missing_count, consumed_count)
    │
    ├─→ Precision Calculation (Optional, slower)
    │   ├─→ Execute all possible traces from model (up to max_traces)
    │   ├─→ Build set of model edges: set(model)
    │   ├─→ Build set of observed edges: set(log)
    │   ├─→ Compute: precision = |model ∩ log| / |model|
    │   ├─→ Invariant: precision in [0, 1]
    │   └─→ Emit span: conformance.precision (precision_score, model_edges, observed_edges)
    │
    ├─→ Result Hashing & Receipt Creation
    │
    └─→ Output Formatting (JSON with fitness, precision, trace deviations)

Exit Code Logic:
    - 0: fitness ≥ 0.85 (valid model)
    - 1: config error (bad model type)
    - 2: source error (missing model file)
    - 3: execution error (conformance calculation failed)
```

**Critical checks:**
- [ ] Token counts are correct (missing + consumed + remaining = events * places)
- [ ] Fitness is in [0,1]
- [ ] Models with fitness >0.85 are marked valid
- [ ] Precision is in [0,1] and ≤ fitness
- [ ] OTEL spans are emitted for each trace replay

**Test scenarios:** Part of E2E-04 (discovery produces valid models for conformance)

---

## Path 5: ML Algorithm Pipeline

**Entry point:** `wpm ml <task> -i <log.xes>`

```
CLI Entry → ML Handler (apps/wasm4pm/src/commands/ml.ts:ml)
    ├─→ Config Resolution
    │
    ├─→ EventLog Loading
    │
    ├─→ Feature Extraction (bridge.ts:buildFeatureMatrix)
    │   ├─→ For each trace:
    │   │   ├─→ Extract features:
    │   │   │   - Trace length (activity count)
    │   │   │   - Activity distribution
    │   │   │   - Resource count
    │   │   │   - Duration
    │   │   │   - Rework count
    │   │   └─→ Normalize to [0,1]
    │   ├─→ Build feature matrix: n_traces × n_features
    │   ├─→ Emit span: ml.feature_extraction (n_traces, n_features, normalization_time_ms)
    │   └─→ Return X: f64[][]
    │
    ├─→ Label Extraction (for supervised tasks)
    │   ├─→ For each trace:
    │   │   ├─→ Extract label from trace attribute (e.g., "defective", "on_time")
    │   │   └─→ Encode as u8 (0, 1, 2, ...)
    │   ├─→ Emit span: ml.label_extraction (n_labels, label_counts)
    │   └─→ Return y: u8[]
    │
    ├─→ ML Algorithm Execution (SWITCH on task)
    │   ├─→ TASK = "classify":
    │   │   ├─→ ml_classify(X, y) [supervised]
    │   │   │   ├─→ K-NN classifier (k=5)
    │   │   │   ├─→ OR Logistic Regression
    │   │   │   ├─→ Train on 80% of data, test on 20%
    │   │   │   ├─→ Compute accuracy, precision, recall, F1
    │   │   │   └─→ Emit span: ml.classify (accuracy, f1_score, time_ms)
    │   │   └─→ Return { labels, accuracies, feature_importance }
    │   │
    │   ├─→ TASK = "cluster":
    │   │   ├─→ ml_cluster(X) [unsupervised]
    │   │   │   ├─→ K-means (k=3, auto-tuned)
    │   │   │   ├─→ OR DBSCAN
    │   │   │   ├─→ Compute silhouette score
    │   │   │   └─→ Emit span: ml.cluster (silhouette_score, n_clusters, time_ms)
    │   │   └─→ Return { cluster_assignments, centroids, silhouette }
    │   │
    │   ├─→ TASK = "forecast":
    │   │   ├─→ ml_forecast(X) [time series]
    │   │   │   ├─→ Linear/polynomial/exponential regression
    │   │   │   ├─→ Compute MAE, RMSE, MAPE
    │   │   │   └─→ Emit span: ml.forecast (mae, rmse, mape, time_ms)
    │   │   └─→ Return { predictions, coefficients, errors }
    │   │
    │   ├─→ TASK = "anomaly":
    │   │   ├─→ ml_anomaly(X) [unsupervised]
    │   │   │   ├─→ EMA smoothing or isolation forest
    │   │   │   ├─→ Compute anomaly scores (normalized)
    │   │   │   └─→ Emit span: ml.anomaly (n_anomalies, anomaly_ratio, time_ms)
    │   │   └─→ Return { anomaly_scores, threshold, anomaly_indices }
    │   │
    │   ├─→ TASK = "regress":
    │   │   ├─→ ml_regress(X, y) [supervised]
    │   │   │   ├─→ Linear regression
    │   │   │   ├─→ Compute R², MAE
    │   │   │   └─→ Emit span: ml.regress (r_squared, mae, time_ms)
    │   │   └─→ Return { coefficients, r_squared, predictions }
    │   │
    │   └─→ TASK = "pca":
    │       ├─→ ml_pca(X) [dimensionality reduction]
    │       │   ├─→ Compute principal components
    │       │   ├─→ Compute variance explained per component
    │       │   └─→ Emit span: ml.pca (n_components, variance_explained, time_ms)
    │       └─→ Return { components, variance_explained, transformed_data }
    │
    ├─→ Result Hashing & Receipt Creation
    │
    └─→ Output Formatting (task-specific result structure)

ML Invariants:
    - Feature matrix: all values in [0,1] (normalized)
    - Classification accuracy in [0,1]
    - Silhouette score in [-1, 1]
    - Anomaly scores in [0,1]
    - R² in [0, 1] (for well-behaved data)
    - PCA variance explained ≥ 0 and sum ≤ 1

Exit Code Logic:
    - 0: success
    - 1: config error (bad --task or --params)
    - 2: source error (insufficient traces or features)
    - 3: execution error (algorithm failed to converge)
```

**Critical checks:**
- [ ] Feature matrix is normalized to [0,1]
- [ ] All ML output values are in valid ranges (see invariants)
- [ ] Training/test split is valid (80/20 or specified)
- [ ] OTEL spans include timing and accuracy metrics
- [ ] Results are deterministic with seeded RNG

**Test scenarios:** E2E-06 (all 6 ML algorithms execute), packages/ml/__tests__/

---

## Path 6: Configuration Resolution (5-Layer Precedence)

**Entry point:** `resolveConfig(options?)`

```
Config Resolver (packages/config/src/resolver.ts:resolveConfig)
    ├─→ INPUT: options object
    │   ├─→ options.cli: { algorithm?, profile?, output_format?, ... }
    │   ├─→ options.config_file?: string  (override search path)
    │   └─→ options.env_prefix?: string   (default: "WASM4PM_")
    │
    ├─→ LAYER 1: CLI Arguments (Highest Priority)
    │   ├─→ Read options.cli.*
    │   └─→ Store in resolved_config
    │
    ├─→ LAYER 2: Config File (TOML)
    │   ├─→ Search for wasm4pm.toml in CWD
    │   ├─→ If found: parse TOML
    │   ├─→ Merge into resolved_config (ONLY fill missing keys)
    │   ├─→ Emit span: config.load_toml (path, sections_found)
    │   └─→ Skip if --config points elsewhere
    │
    ├─→ LAYER 3: Config File (JSON)
    │   ├─→ Search for wasm4pm.json in CWD
    │   ├─→ If found: parse JSON
    │   ├─→ Merge into resolved_config (ONLY fill missing keys)
    │   ├─→ Emit span: config.load_json (path, sections_found)
    │   └─→ Skip if already populated by TOML
    │
    ├─→ LAYER 4: Environment Variables
    │   ├─→ Read all env vars matching prefix (default: WASM4PM_)
    │   │   ├─→ WASM4PM_ALGORITHM
    │   │   ├─→ WASM4PM_PROFILE
    │   │   ├─→ WASM4PM_OUTPUT_FORMAT
    │   │   ├─→ WASM4PM_LOG_LEVEL
    │   │   └─→ ... (20 total)
    │   ├─→ Parse and merge into resolved_config (ONLY fill missing keys)
    │   ├─→ Emit span: config.load_env (vars_count, vars_found)
    │   └─→ Validate types (algorithm must be string, profile must be enum, etc.)
    │
    ├─→ LAYER 5: Defaults (Lowest Priority)
    │   ├─→ Load hardcoded defaults from Zod schema
    │   │   ├─→ algorithm: "heuristic_miner"
    │   │   ├─→ profile: "balanced"
    │   │   ├─→ output_format: "human"
    │   │   ├─→ log_level: "info"
    │   │   └─→ ... (30 total)
    │   ├─→ Merge into resolved_config (ONLY fill missing keys)
    │   └─→ Emit span: config.load_defaults (defaults_count)
    │
    ├─→ Schema Validation (Zod)
    │   ├─→ Parse resolved_config against schema
    │   ├─→ If parse error:
    │   │   ├─→ Emit span: config.validation_error (error_message)
    │   │   └─→ Throw ConfigError (exit code 1)
    │   ├─→ Coerce types (string "true" → boolean true)
    │   └─→ Emit span: config.validation_ok (validated_fields_count)
    │
    ├─→ Hashing (Provenance)
    │   ├─→ Compute config_hash = BLAKE3(JSON.stringify(resolved_config))
    │   ├─→ Record provenance for each field:
    │   │   {
    │   │     algorithm: { source: "CLI", value: "dfg" },
    │   │     profile: { source: "ENV", value: "quality" },
    │   │     output_format: { source: "DEFAULTS", value: "human" }
    │   │   }
    │   ├─→ Emit span: config.hash (config_hash, provenance_entries)
    │   └─→ Store metadata.provenance
    │
    ├─→ Return Config object:
    │   {
    │     source: { kind, path, url },
    │     sink: { kind, path, url },
    │     algorithm: { name, parameters },
    │     execution: { profile, timeout, maxMemory },
    │     observability: { otel, logLevel, metricsEnabled },
    │     watch: { enabled, poll_interval, checkpoint_dir },
    │     output: { format, destination, pretty, colorize },
    │     prediction: { enabled, activityKey, ngramOrder, driftWindowSize, tasks },
    │     metadata: { loadTime, hash, provenance }
    │   }
    │
    └─→ Assert: all required fields are populated ✓

Invariants:
    - Exactly one value per field (no conflicts)
    - Field value comes from highest-priority layer that provides it
    - Validation passes (no schema errors)
    - config_hash is deterministic (same config → same hash)
    - All enum values are from allowed set (algorithm in 41 algorithms, profile in [fast, balanced, quality, stream])

Exit Code Logic:
    - 0: config valid
    - 1: config validation error (schema mismatch, unknown algorithm, etc.)
```

**Critical checks:**
- [ ] Layer precedence is strict: CLI > ENV > JSON > TOML > defaults
- [ ] Validation errors are specific and actionable
- [ ] config_hash is deterministic
- [ ] Provenance is tracked for each field
- [ ] OTEL spans are emitted at each layer

**Test scenarios:** E2E-14, packages/config/src/__tests__/

---

## Path 7: CLI Entry & Command Routing

**Entry point:** `wpm <command> [args]`

```
CLI Main (apps/wasm4pm/src/cli.ts:main)
    ├─→ Parse command-line arguments
    │   ├─→ Command name (run, predict, ml, etc.)
    │   ├─→ Global flags (--json, --config, --version, --help)
    │   └─→ Command-specific flags
    │
    ├─→ Emit span: cli.parse (command, args_count, global_flags)
    │
    ├─→ Command Routing (SWITCH on command)
    │   ├─→ "run": → Path 1 (Discovery Pipeline)
    │   ├─→ "predict": → Path 2 (Prediction Pipeline)
    │   ├─→ "ml": → Path 5 (ML Pipeline)
    │   ├─→ "conformance": → Path 4
    │   ├─→ "autoprocess": → Path 3 (RL Pipeline)
    │   ├─→ "compare": → run 2+ algorithms, compare results
    │   ├─→ "diff": → compare two logs
    │   ├─→ "watch": → watch file, re-run on change
    │   ├─→ "status": → report engine health
    │   ├─→ "explain": → call planner.explain()
    │   ├─→ "init": → scaffold wasm4pm.toml
    │   ├─→ "results": → list saved results
    │   ├─→ "doctor": → run 17-point diagnostics
    │   ├─→ "quality": → multi-dimensional quality assessment
    │   ├─→ "validate": → validate event log schema
    │   ├─→ "simulate": → Monte Carlo simulation
    │   ├─→ "temporal": → temporal analysis
    │   ├─→ "social": → social network mining
    │   ├─→ "drift-watch": → streaming drift monitor
    │   ├─→ "powl": → POWL model analysis
    │   ├─→ "swarm": → multi-worker coordination
    │   └─→ "agent": → agentic framework control
    │
    ├─→ Output Handling
    │   ├─→ Emit span: cli.run (command, start_time)
    │   ├─→ Capture result (success, partial, failed)
    │   ├─→ Format output (human or JSON based on --json flag)
    │   └─→ Write to stdout / file (based on config.output.destination)
    │
    ├─→ Exit Code Assignment
    │   ├─→ 0: success (all operations completed)
    │   ├─→ 1: config error (CLI args, config validation)
    │   ├─→ 2: source error (file not found, invalid log)
    │   ├─→ 3: execution error (algorithm crashed, OOM)
    │   ├─→ 4: partial failure (some steps succeeded, some failed)
    │   └─→ 5: system error (WASM not available, critical infrastructure)
    │
    ├─→ Emit span: cli.exit (exit_code, command, duration_ms)
    │
    └─→ process.exit(code)

Global Flags:
    --json: output as JSON (default: human-readable)
    --config: override config file path
    --version: show version and exit
    --help: show help and exit
    --verbose: increase log level
    --quiet: suppress non-error output

Exit Code Contract:
    - process.exit(code) must be called with one of: 0, 1, 2, 3, 4, 5
    - Never throw uncaught exceptions (all errors must be caught and converted to exit codes)
    - Never exit silently (must emit error message or OTEL span)
```

**Critical checks:**
- [ ] All 20 commands are routable
- [ ] Exit codes match contract (0, 1, 2, 3, 4, 5)
- [ ] Help and version work correctly
- [ ] Global flags are parsed correctly
- [ ] OTEL spans are emitted for CLI entry and exit

**Test scenarios:** E2E-15 and beyond

---

## Cross-Path Dependencies

### Data Flow Across Paths

```
EventLog (Path 1)
    ↓ (used by)
    ├─→ Path 2 (Prediction: input log)
    ├─→ Path 3 (RL: monitor health metrics from log)
    ├─→ Path 4 (Conformance: input log for fitness check)
    ├─→ Path 5 (ML: extract features from traces)
    └─→ Path 7 (CLI: validates source file)

Config (Path 6)
    ↓ (used by)
    ├─→ Path 1 (Discovery: algorithm, profile)
    ├─→ Path 2 (Prediction: perspective, params)
    ├─→ Path 3 (RL: timeout, profile)
    ├─→ Path 4 (Conformance: model file path)
    ├─→ Path 5 (ML: task, hyperparams)
    └─→ Path 7 (CLI: output format, log level)

Receipt (Result of all paths)
    ↓ (used by)
    ├─→ CLI output formatting
    ├─→ .wasm4pm/results/ persistence
    ├─→ OTEL tracing (fields in span attributes)
    └─→ Config hashing (input_hash for determinism)

OTEL Spans (Observability)
    ↓ (emitted by)
    └─→ ALL paths (instrument every function)
```

---

## OTEL Span Hierarchy

```
cli.run (command, args_count)
    ├─→ config.resolve (config_hash)
    │   ├─→ config.load_cli
    │   ├─→ config.load_toml
    │   ├─→ config.load_json
    │   ├─→ config.load_env
    │   └─→ config.validation
    ├─→ engine.bootstrap (wasm_module)
    ├─→ (command-specific spans)
    │   ├─→ kernel.run (algorithm, log_size)
    │   ├─→ discovery.dfg (edge_count)
    │   ├─→ prediction.next_activity (candidates_count)
    │   ├─→ rl.agent_selection (agent_type, ucb_value)
    │   ├─→ rl.bellman_update (delta, q_change)
    │   ├─→ spc.check_rules (rule1, rule2, rule3)
    │   ├─→ circuit_breaker.update (state, fail_count)
    │   └─→ ... (30+ more)
    └─→ cli.exit (exit_code, duration_ms)
```

---

## Summary: Critical Path Coverage

| Path | Entry | Exit | Spans | Tests |
|------|-------|------|-------|-------|
| **1: Discovery** | `wpm run` | DFG/Petrinet | 10+ | E2E-01 to E2E-06 |
| **2: Prediction** | `wpm predict` | Predictions (6 perspectives) | 15+ | E2E-07 to E2E-09 |
| **3: RL** | `autoprocess` loop | Action + Reward | 20+ | E2E-10 to E2E-12 |
| **4: Conformance** | `wpm conformance` | Fitness score | 5+ | Part of E2E-04 |
| **5: ML** | `wpm ml` | ML results | 10+ | E2E-06, packages/ml/ |
| **6: Config** | `resolveConfig()` | Config object | 5+ | E2E-14 |
| **7: CLI** | `wpm <cmd>` | Exit code | 5+ | E2E-15 |

**Total OTEL spans to be created:** 80+ (one per critical function)

**Total E2E scenarios:** 15+ (covering happy path, edge cases, error cases)

**Total test files:** 49 Rust + 9 TypeScript = 58 test files

---

**Document Version:** 1.0  
**Agent:** Agent 9 (Integration Testing & Certification Gates)  
**Date:** 2026-05-05  
**Status:** REFERENCE IMPLEMENTATION — Ready for test harness development
