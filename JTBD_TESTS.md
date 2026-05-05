# JTBD End-to-End Tests — Real Business Challenges

**Adversarial E2E testing where the LLM cannot know the answer.**

## Philosophy

> The test fails if the code says it worked but the event log cannot prove it.

These tests are structured to be **LLM-proof**: no amount of reasoning, training data, or pattern matching can produce the correct answer without actually executing the algorithms against real event logs.

### What Makes a Test LLM-Proof?

| Property | Why It Matters |
|----------|----------------|
| **Stochastic outcome** | Random seeds, RL exploration, or ML convergence → non-deterministic |
| **Large input space** | 10K+ events with complex patterns → impossible to memorize |
| **Multi-step compounding** | Each step affects the next → errors cascade |
| **Resource constraints** | Time/memory/CPU limits → tradeoffs must be computed |
| **Adversarial injection** | Impossible logs, edge cases, drift → system must reject or adapt |
| **Observable proof** | OTEL spans + event logs → independently verifiable |

### Verification Standard (AND Logic)

Every JTBD test passes only when ALL THREE are true:

1. **OTEL span exists** in Jaeger with service=`wpm` (wasm4pm), span_name=`operation`, status=`ok`
2. **Test assertion passes** with claim directly checked (not a proxy)
3. **Event log proves it** — mined result matches claim (fitness > 0.85, timestamps consistent, causal soundness)

## JTBD Scenarios

### JTBD-1: Bottleneck Discovery Under Drift

**Business Problem:** A loan approval process slowed down over 6 months. Which activity caused the degradation, and when did the drift start?

**Test:**

```typescript
describe('JTBD-1: Bottleneck discovery under drift', () => {
  it('identifies the slowing activity and drift point without being told', async () => {
    // Setup: Generate 6 months of synthetic loan approval logs
    // - Month 1-2: "Credit Check" takes 2 hours (baseline)
    // - Month 3-4: "Credit Check" gradually slows to 8 hours (drift starts)
    // - Month 5-6: "Credit Check" at 12 hours (degraded state)
    // - Random noise: ±20% variance, occasional outliers
    // - 50,000 events total
    
    const logHandle = await generateDriftedLoanLog({
      baselineDuration: { activity: 'Credit Check', hours: 2 },
      degradedDuration: { activity: 'Credit Check', hours: 12 },
      driftStart: 'Month 3',
      variance: 0.2
    });
    
    // Execute: Autonomic loop detects drift, identifies bottleneck
    const result = await pictl.autoprocess(logHandle, {
      prediction: { tasks: ['drift', 'bottleneck'] }
    });
    
    // Assert: The system MUST discover the correct answer
    // No LLM can predict this without running the algorithms
    expect(result.bottleneck.activity).toBe('Credit Check');
    expect(result.drift.detected).toBe(true);
    expect(result.drift.startMonth).toBeGreaterThanOrEqual(2);
    expect(result.drift.startMonth).toBeLessThanOrEqual(4);
    
    // Verify: OTEL span exists
    expect(otelSpans).toContainSpan('autoprocess.execute', { status: 'ok' });
    
    // Verify: Event log proves it (mine the log yourself)
    const mined = await pictl.run('temporal', { input: logHandle });
    const creditCheckDuration = mined.activities['Credit Check'].avgDuration;
    expect(creditCheckDuration).toBeGreaterThan(8 * 3600 * 1000); // > 8 hours
  });
});
```

**Why LLM-Proof:**
- Exact drift month depends on random noise in synthetic data
- Bottleneck identification requires mining 50K events
- Duration computations from timestamps (cannot be reasoned about)

---

### JTBD-2: Rework Detection in Manufacturing

**Business Problem:** A manufacturing line has hidden rework loops. Which process step has the most rework, and what's the cost impact?

**Test:**

```typescript
describe('JTBD-2: Rework detection in manufacturing', () => {
  it('finds rework loops and quantifies cost without being told the process', async () => {
    // Setup: Generate manufacturing logs with hidden rework
    // - Process: A → B → C → D → E → F
    // - Hidden: C → B (rework loop) occurs 15% of the time
    // - Hidden: E → D (rework loop) occurs 8% of the time
    // - Each rework adds 2 hours of cycle time
    // - 100,000 events, 2,000 cases
    // - LLM cannot see the rework loops in the data without mining
    
    const logHandle = await generateManufacturingLog({
      process: ['A', 'B', 'C', 'D', 'E', 'F'],
      reworkLoops: [
        { from: 'C', to: 'B', probability: 0.15 },
        { from: 'E', to: 'D', probability: 0.08 }
      ],
      reworkCost: 2 * 3600 * 1000 // 2 hours in ms
    });
    
    // Execute: Discover DFG, detect rework
    const result = await pictl.run('advanced_algorithms', {
      input: logHandle,
      algorithm: 'detect_rework'
    });
    
    // Assert: System finds BOTH rework loops (no partial credit)
    expect(result.rework.detected).toBe(true);
    expect(result.rework.loops).toHaveLength(2);
    
    const cToB = result.rework.loops.find(l => l.from === 'C' && l.to === 'B');
    const eToD = result.rework.loops.find(l => l.from === 'E' && l.to === 'D');
    
    expect(cToB).toBeDefined();
    expect(eToD).toBeDefined();
    
    // Frequencies must be approximately correct (±3% tolerance)
    expect(cToB.frequency).toBeGreaterThan(0.12);
    expect(cToB.frequency).toBeLessThan(0.18);
    
    expect(eToD.frequency).toBeGreaterThan(0.05);
    expect(eToD.frequency).toBeLessThan(0.11);
    
    // Cost impact: ~23% of cases hit C→B (15% / (1-15%)), ~17% hit E→D
    // Expected cost: ~40% additional cycle time
    expect(result.rework.costImpact).toBeGreaterThan(0.35);
    expect(result.rework.costImpact).toBeLessThan(0.45);
    
    // Verify: OTEL span
    expect(otelSpans).toContainSpan('detect_rework.execute', { status: 'ok' });
    
    // Verify: Mine DFG yourself to confirm loops exist
    const dfg = await pictl.run('dfg', { input: logHandle });
    expect(dfg.edges).toContainEqual({ from: 'C', to: 'B' });
    expect(dfg.edges).toContainEqual({ from: 'E', to: 'D' });
  });
});
```

**Why LLM-Proof:**
- Rework loops are hidden in trace variants, not visible without mining
- Frequency depends on random probability in 2,000 cases
- Cost impact requires computing cycle time differences across all cases

---

### JTBD-3: RL Policy Convergence Under Resource Constraints

**Business Problem:** The autonomic loop must learn which discovery algorithm to use under time pressure. Which agent converges fastest, and what's the final reward?

**Test:**

```typescript
describe('JTBD-3: RL convergence under resource constraints', () => {
  it('learns optimal policy without being told which algorithm is best', async () => {
    // Setup: Resource-constrained environment
    // - 100 different event logs (varying size, complexity)
    // - 5 algorithms: dfg (fast, low quality), alpha (balanced), ilp (slow, high quality), genetic (slow, high), heuristic (balanced)
    // - Time budget: 100ms per discovery (hard cutoff)
    // - Reward: +1 for fitness > 0.85, -0.5 for timeout, -0.1 for low fitness
    // - RL must learn which algorithm maximizes reward under time pressure
    // - Seeded RNG makes it deterministic but LLM cannot compute the outcome
    
    const logs = await generate100DiverseLogs({
      sizeRange: [100, 10000],
      complexityRange: [0.1, 0.9]
    });
    
    const orchestrator = new RlOrchestrator({
      seed: 42, // Deterministic but unpredictable to LLM
      timeBudget: 100, // ms
      agents: ['QLearning', 'SARSA', 'DoubleQLearning', 'ExpectedSARSA'],
      linucb: true
    });
    
    // Execute: Run 100 learning cycles
    let totalReward = 0;
    for (let i = 0; i < 100; i++) {
      const log = logs[i % logs.length];
      const result = await orchestrator.executeCycle(log);
      totalReward += result.reward;
    }
    
    // Assert: Policy has converged (improvement over baseline)
    // First 10 cycles vs last 10 cycles
    const first10 = orchestrator.rewards.slice(0, 10);
    const last10 = orchestrator.rewards.slice(-10);
    const first10Avg = mean(first10);
    const last10Avg = mean(last10);
    
    expect(last10Avg).toBeGreaterThan(first10Avg);
    
    // Final reward should be positive (learned to avoid timeouts)
    expect(totalReward / 100).toBeGreaterThan(0);
    
    // Active agent should be stable (not switching every cycle)
    const agentSwitches = countAgentSwitches(orchestrator.history);
    expect(agentSwitches).toBeLessThan(30); // < 30% of cycles
    
    // Verify: OTEL spans for all cycles
    expect(otelSpans).toContainSpanCount('autonomic_execute_cycle', 100);
    
    // Verify: RL state is serializable and restoreable
    const serialized = await pictl.rl_orchestrator_serialize();
    await pictl.rl_orchestrator_reset();
    await pictl.rl_orchestrator_restore(serialized);
    
    const restoredTelemetry = await pictl.rl_orchestrator_get_telemetry();
    expect(restoredTelemetry.cycleCount).toBe(100);
  });
});
```

**Why LLM-Proof:**
- RL policy depends on 100 sequential decisions with reward feedback
- Seed 42 makes it deterministic but requires running the actual Bellman updates
- Time constraints cause algorithm-specific timeouts (cannot be predicted)
- LinUCB selection depends on 8D feature vectors computed per cycle

---

### JTBD-4: Conformance Checking on Deviating Process

**Business Problem:** A declared process model exists, but the actual log shows deviations. Which deviations are real, and what's the fitness score?

**Test:**

```typescript
describe('JTBD-4: Conformance checking on deviating process', () => {
    it('identifies deviations and computes fitness without being told the model', async () => {
      // Setup: Generate log that ALMOST follows a model
      // - Declared model: A → B → C → D → E
      // - Actual log has deviations:
      //   - 5% skip B (A → C)
      //   - 3% repeat C (C → C)
      //   - 2% insert X (B → X → C)
      // - LLM cannot see deviations without alignment/replay
      // - Fitness = 1 - (missing + consumed) / (produced + remaining)
      // - Expected fitness ≈ 0.90 (10% deviation)
      
      const logHandle = await generateDeviatingLog({
        model: ['A', 'B', 'C', 'D', 'E'],
        deviations: [
          { type: 'skip', from: 'A', to: 'C', probability: 0.05 },
          { type: 'repeat', activity: 'C', probability: 0.03 },
          { type: 'insert', from: 'B', to: 'X', to: 'C', probability: 0.02 }
        ]
      });
      
      // Execute: Discover model, check conformance
      const discovered = await pictl.run('alpha_plus_plus', { input: logHandle });
      const conformance = await pictl.run('conformance', {
        input: logHandle,
        model: discovered.handle
      });
      
      // Assert: Fitness is approximately correct (±0.05 tolerance)
      expect(conformance.fitness).toBeGreaterThan(0.85);
      expect(conformance.fitness).toBeLessThan(0.95);
      
      // Deviations detected (at least the major ones)
      expect(conformance.deviations.length).toBeGreaterThanOrEqual(2);
      
      // Specific deviations (tolerance for detection)
      const skipB = conformance.deviations.find(d => d.type === 'skip' && d.activity === 'B');
      const repeatC = conformance.deviations.find(d => d.type === 'repeat' && d.activity === 'C');
      
      // At least one deviation must be detected
      expect(skipB || repeatC).toBeDefined();
      
      // Verify: OTEL spans
      expect(otelSpans).toContainSpan('conformance.check', { status: 'ok' });
      
      // Verify: Mine the log yourself, count deviations manually
      const log = await pictl.export_eventlog_to_json(logHandle);
      const manualDeviationCount = countManualDeviations(log, ['A', 'B', 'C', 'D', 'E']);
      expect(manualDeviationCount).toBeGreaterThan(80); // ~10% of 1000 cases
      expect(manualDeviationCount).toBeLessThan(120);
    });
  });
```

**Why LLM-Proof:**
- Deviation frequencies depend on random probability in 1,000 cases
- Fitness computation requires token replay (counting missing/consumed tokens)
- Alignment must find optimal deviation paths (NP-hard, cannot be guessed)

---

### JTBD-5: ML Anomaly Detection on Seasonal Data

**Business Problem:** A retail process has seasonal patterns. Which cases are anomalous, and what's the anomaly score distribution?

**Test:**

```typescript
describe('JTBD-5: ML anomaly detection on seasonal data', () => {
  it('identifies anomalies in seasonal data without being told the pattern', async () => {
    // Setup: Generate retail order logs with seasonal patterns
    // - Baseline: 100 orders/day with normal cycle time (24h)
    // - Seasonal: 5x volume on Black Friday (day 330)
    // - Anomalies: 20 cases with extreme cycle time (> 7 days)
    // - Anomalies: 15 cases with wrong activity sequence
    // - ML must learn normal pattern, then flag anomalies
    // - LLM cannot know which cases are anomalous without running the algorithm
    
    const logHandle = await generateSeasonalRetailLog({
      baseline: { ordersPerDay: 100, cycleTime: 24 * 3600 * 1000 },
      seasonal: { day: 330, multiplier: 5 },
      anomalies: [
        { type: 'cycle_time', threshold: 7 * 24 * 3600 * 1000, count: 20 },
        { type: 'sequence', wrong: true, count: 15 }
      ]
    });
    
    // Execute: Train ML model, detect anomalies
    const result = await pictl.ml('anomaly', {
      input: logHandle,
      training: 0.8, // 80% for training
      threshold: 0.9 // 90th percentile
    });
    
    // Assert: Anomalies detected (approximately correct)
    expect(result.anomalies.length).toBeGreaterThan(30); // At least 35, maybe some false positives
    expect(result.anomalies.length).toBeLessThan(50);   // Not too many
    
    // Anomaly scores should be bimodal (normal vs anomalous)
    const scores = result.anomalies.map(a => a.score);
    const normalScore = mean(scores.slice(0, -20));
    const anomalyScore = mean(scores.slice(-20));
    
    expect(anomalyScore).toBeGreaterThan(normalScore * 2);
    
    // Precision and recall (±10% tolerance)
    expect(result.precision).toBeGreaterThan(0.6); // At least 60% of flagged are true anomalies
    expect(result.recall).toBeGreaterThan(0.6);    // At least 60% of true anomalies are flagged
    
    // Verify: OTEL span
    expect(otelSpans).toContainSpan('ml_anomaly.execute', { status: 'ok' });
    
    // Verify: Manually check 5 flagged anomalies
    const sample = result.anomalies.slice(0, 5);
    for (const anomaly of sample) {
      const caseData = await pictl.get_case(anomaly.caseId);
      // Either cycle time or sequence is wrong
      const isWrongCycleTime = caseData.cycleTime > 7 * 24 * 3600 * 1000;
      const isWrongSequence = !isValidSequence(caseData.activities);
      expect(isWrongCycleTime || isWrongSequence).toBe(true);
    }
  });
});
```

**Why LLM-Proof:**
- Anomaly detection uses EMA smoothing and information-theoretic scoring
- Which cases are flagged depends on ML training on random data split
- Threshold at 90th percentile requires sorting and computing quantiles
- Cannot predict which specific cases will be anomalous

---

## Running JTBD Tests

```bash
# All JTBD tests
cd lab && pnpm test jtbd

# Specific scenario
cd lab && pnpm test jtbd-1

# With OTEL verification
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
cd lab && pnpm test jtbd -- --telemetry=on
```

## Writing New JTBD Tests

Follow this template:

```typescript
describe('JTBD-N: [Business problem]', () => {
  it('[what it does] without being told [key unknown]', async () => {
    // 1. Setup: Generate synthetic data with hidden ground truth
    //    - Use randomness (seeds ok, but must run code)
    //    - Hide the answer in large input space
    //    - Multi-step compounding
    
    // 2. Execute: Run the algorithms (RL/ML/Auto)
    
    // 3. Assert: Check the answer (no partial credit)
    //    - Specific claims, not "works"
    //    - Tolerance allowed for stochasticity
    
    // 4. Verify: OTEL span + event log mining
  });
});
```

## Anti-Patterns (Do Not Do These)

| Anti-Pattern | Why It's Wrong |
|--------------|----------------|
| `assert(result.success)` | Tests nothing about actual behavior |
| Hardcoded expected values | LLM can memorize them |
| Tests on tiny inputs (5 events) | Too easy to reason about |
| Tests on deterministic data | No stochasticity → predictable |
| Tests without OTEL verification | No proof of execution |
| Tests that mine nothing | Trusting code, not event evidence |

## Success Criteria

A JTBD test suite passes when:

- [ ] All tests pass (green)
- [ ] OTEL spans visible in Jaeger for every operation
- [ ] Event logs can be independently mined to verify claims
- [ ] Tests are deterministic with seeded RNG
- [ ] Tests fail if the algorithm is broken (mutation testing)
- [ ] No LLM can pass the test without running the code
