# Troubleshooting Guide

Common issues and solutions for pictl process mining platform.

---

## Installation & Setup

### "Module not found: @wasm4pm/..."

**Problem:** Package not installed or build incomplete.

**Solutions:**
1. Install all dependencies:
   ```bash
   pnpm install
   ```

2. Build packages:
   ```bash
   pnpm build
   ```

3. For WASM (Node.js examples):
   ```bash
   cd wasm4pm && npm run build:nodejs
   ```

4. Check installed packages:
   ```bash
   pnpm list | grep "@wasm4pm"
   ```

---

### "WASM initialization failed"

**Problem:** WebAssembly module failed to load.

**Causes & fixes:**

| Cause | Fix |
|-------|-----|
| Old Node.js | Update to Node 14+ |
| Missing WASM binary | Run `cd wasm4pm && npm run build` |
| Corrupted node_modules | Delete and rebuild: `rm -rf node_modules && pnpm install` |
| Running from wrong directory | Use absolute paths or `cd` to project root |

**Diagnostic:**
```bash
wpm doctor
```

---

### "command not found: wpm"

**Problem:** CLI not installed or not in PATH.

**Solutions:**
```bash
# Install globally
npm install -g @wasm4pm/cli

# Or use locally
cd apps/wasm4pm && npm install
npx wpm run log.xes

# Or use tsx
tsx apps/wasm4pm/src/cli.ts run log.xes
```

---

## Configuration Issues

### "Config validation failed: ..."

**Problem:** Invalid configuration file or option.

**Common mistakes:**

| Mistake | Fix |
|---------|-----|
| Unknown algorithm name | Run `wpm status` to see valid names |
| Invalid profile name | Must be: `fast`, `balanced`, `quality`, or `stream` |
| Missing required field | Check `wasm4pm.toml` or CLI args |
| Wrong data type | `timeout` should be number, `format` should be string |

**Debug:**
```bash
wpm doctor
# or
WASM4PM_LOG_LEVEL=debug wpm run log.xes
```

---

### Environment variables not recognized

**Problem:** `WASM4PM_*` variables not applied.

**Solutions:**
1. Check prefix is `WASM4PM_` (not `PICTL_`)
2. Use underscores for nested keys: `WASM4PM_OTEL_ENDPOINT` not `WASM4PM_OTEL.ENDPOINT`
3. Export before running:
   ```bash
   export WASM4PM_PROFILE=quality
   wpm run log.xes
   ```

4. Verify precedence: CLI args > file > ENV > defaults
   ```bash
   # This will use "quality" from CLI, ignoring ENV or file
   wpm run log.xes --profile quality
   ```

---

## Log Loading Issues

### "File not found: ..."

**Problem:** Event log file cannot be located.

**Solutions:**
1. Check file exists and is readable:
   ```bash
   ls -la my-log.xes
   ```

2. Use absolute path:
   ```bash
   wpm run /absolute/path/to/log.xes
   ```

3. Check working directory:
   ```bash
   pwd
   ```

4. Check file permissions:
   ```bash
   chmod 644 my-log.xes
   ```

---

### "Invalid XES/JSON format"

**Problem:** Event log format is malformed.

**Fixes:**

| Format | Validation |
|--------|-----------|
| XES | Well-formed XML, valid XES schema |
| JSON | Valid JSON (use `jq` to validate) |
| OCEL | Proper OCEL 1.0 or 2.0 structure |

**Test:**
```bash
# Validate XES
xmllint --noout my-log.xes

# Validate JSON
jq empty my-log.json

# Test with pictl
wpm validate -i my-log.xes
```

---

### "Out of memory" or OOM killer triggered

**Problem:** Log too large for WASM memory.

**Solutions (in order):**

1. **Use faster profile:**
   ```bash
   wpm run huge-log.xes --profile fast
   ```

2. **Reduce feature matrix complexity:**
   ```bash
   # Use fewer attributes
   ```

3. **Process subset of log:**
   ```bash
   # Use first 10K events
   head -n 10000 huge.xes > subset.xes
   wpm run subset.xes
   ```

4. **Run on server with more memory:**
   ```bash
   # Deploy to machine with >4GB available
   ```

5. **Upgrade WASM build:**
   ```bash
   cd wasm4pm && npm run build:fog  # 2MB, more features
   ```

---

## Algorithm Issues

### "Unknown algorithm: xyz"

**Problem:** Algorithm name is invalid or typo.

**Fix:**
```bash
wpm status  # See all 41 algorithms
```

**Common typos:**
- `dfgs` → `dfg`
- `alpha_plus` → `alpha_plus_plus`
- `heuristic` → `heuristic_miner`

---

### "Algorithm timeout exceeded"

**Problem:** Algorithm takes too long.

**Solutions:**

1. **Increase timeout:**
   ```bash
   wpm run log.xes --timeout 120000  # 2 minutes
   ```

2. **Use faster algorithm:**
   ```bash
   # Instead of ilp (80 score):
   wpm run log.xes --algorithm heuristic_miner
   ```

3. **Use faster profile:**
   ```bash
   wpm run log.xes --profile fast
   ```

4. **Process smaller log:**
   ```bash
   # Sample or subset
   ```

---

### Algorithm produces empty or suspicious results

**Problem:** Discovery returns 0 nodes or 0 edges.

**Likely causes:**
1. **Empty log** — Validate with `wpm validate -i log.xes`
2. **Wrong activity key** — Log uses `task` but config uses `concept:name`
3. **Algorithm filtered everything** — Try lower threshold

**Debug:**
```bash
wpm validate -i log.xes  # Check structure
wpm run log.xes --algorithm dfg --log-level debug  # Verbose output
```

---

## ML Algorithm Issues

### "All predictions identical"

**Problem:** Classifier always predicts one class.

**Causes:**
1. Training data has only one class
2. Features don't separate classes
3. Holdout fraction too large

**Fixes:**
1. Check data:
   ```bash
   wpm ml classify -i log.xes --method decision_tree --verbose
   ```

2. Increase training data:
   ```typescript
   const result = await classifyTraces(matrix, {
     method: 'naive_bayes',
     holdoutFraction: 0.1,  // Smaller = more training data
   });
   ```

3. Try different method:
   ```typescript
   await classifyTraces(matrix, { method: 'decision_tree' });
   ```

---

### Low classification accuracy

**Problem:** Model accuracy <50%.

**Causes & fixes:**

| Cause | Fix |
|-------|-----|
| Features don't predict label | Use `features` task to check importance |
| Too many features | Use PCA to reduce to top 5-10 |
| Imbalanced data (e.g., 95% class A) | Class weight or stratified sampling |
| Too little data | Collect more traces |

---

### Regression gives NaN or Inf

**Problem:** Prediction results contain NaN or Infinity.

**Causes:**
1. Division by zero (all identical values)
2. Numerical overflow (exponential model)
3. Empty matrix

**Fixes:**
1. Validate data:
   ```typescript
   console.assert(matrix.data.length > 0, 'Empty matrix');
   console.assert(matrix.targets.every(t => isFinite(t)), 'Non-finite targets');
   ```

2. Use simpler model:
   ```typescript
   await regressRemainingTime(matrix, { method: 'linear_regression' });
   ```

3. Pre-process features:
   ```typescript
   // Normalize or remove outliers
   ```

---

### PCA gives all zeros explained variance

**Problem:** PCA output variance is all 0.

**Cause:** All features are identical.

**Fix:**
```bash
# Check feature variance
# If low, features don't have useful signal
```

---

## RL System Issues

### "RL orchestrator reward always negative"

**Problem:** Mean reward < 0 across all cycles.

**Likely cause:** Telemetry signals poor health.

**Fixes:**
1. Check telemetry is realistic:
   ```typescript
   // Ensure health_level starts at 0 (normal), not 4 (failed)
   // Ensure SPC alerts and drift are reasonable
   ```

2. Reduce SPC alert count:
   ```typescript
   // spc_alerts should be 0-2, not 5+
   ```

3. Run more cycles:
   ```bash
   tsx examples/rl-monitoring.ts 100  # Not just 50
   ```

---

### Policy never improves (mean reward stable)

**Problem:** Mean reward same in first 10 and last 10 cycles.

**Causes:**
1. System converged to local optimum
2. Telemetry doesn't change
3. Need more cycles

**Fixes:**
1. Run 100+ cycles minimum:
   ```bash
   tsx examples/rl-monitoring.ts 200
   ```

2. Vary telemetry more (inject dynamics):
   ```typescript
   function syntheticTelemetry(cycle) {
     // Make SPC alerts vary
     // Make drift change gradually
   }
   ```

3. Use different seed:
   ```bash
   # New seed = different random exploration
   ```

---

### Circuit breaker stuck in Open state

**Problem:** Circuit breaker never transitions from Open.

**Cause:** `advance_clock()` not called or called too slowly.

**Fix:**
```typescript
for (let i = 0; i < cycles; i++) {
  const result = orchestrator.run_cycle(...);
  orchestrator.advance_clock(1);  // MUST call every cycle
}
```

---

## Prediction Issues

### Next-activity predictions always same activity

**Problem:** Top prediction is 100% same activity every time.

**Cause:** Log is linear (same sequence every time).

**Verify:**
```bash
wpm compare dfg,alpha_plus_plus -i log.xes
```

If DFG has few edges, this is expected.

**Workaround:** Use prefix-based prediction:
```typescript
const prediction = await predictNextActivity(handle, {
  prefix: ['A', 'B', 'C'],  // Condition on recent activities
});
```

---

### Remaining-time CI (confidence interval) very wide

**Problem:** Prediction ±50% of actual duration.

**Causes:**
1. Log has high variance (some cases 1 hour, others 1 day)
2. Process is unpredictable
3. External factors not in log affect duration

**Fixes:**
1. Segment by variant first:
   ```bash
   # Analyze fast vs. slow variants separately
   ```

2. Add more features (if available)

3. Use baseline SLA instead of prediction

---

### Drift never alerts

**Problem:** Drift score always <threshold.

**Likely cause:** Threshold too high or process is stable.

**Solutions:**
1. Lower threshold:
   ```bash
   wpm predict drift -i log.xes --threshold 0.2
   ```

2. Increase alpha (more responsive):
   ```bash
   wpm drift-watch -i log.xes --alpha 0.5
   ```

3. Check if drift actually exists:
   ```bash
   # Compare windows manually with diff
   ```

---

## Performance & Optimization

### Slow discovery

**Problem:** `wpm run` takes >30 seconds.

**Solutions (fastest first):**

1. **Switch algorithm:**
   ```bash
   # 0.5ms:   dfg
   # 5ms:     alpha_plus_plus
   # 80ms:    ilp (slow!)
   wpm run log.xes --algorithm dfg
   ```

2. **Use fast profile:**
   ```bash
   wpm run log.xes --profile fast
   ```

3. **Parallel processing** (if available):
   ```bash
   export RAYON_NUM_THREADS=8
   wpm run log.xes
   ```

---

### High memory usage

**Problem:** Process consumes >2GB RAM.

**Solutions:**

1. **Check log size:**
   ```bash
   wc -l my-log.xes
   ```

2. **Use streaming:**
   ```bash
   wpm run log.xes --profile stream --algorithm simd_streaming_dfg
   ```

3. **Reduce features:**
   ```bash
   # Fewer attributes = less memory
   ```

4. **Segment processing:**
   ```bash
   # Process in chunks
   ```

---

## Observability & Debugging

### OTEL spans not appearing in Jaeger

**Problem:** Enabled OTEL but no spans in Jaeger UI.

**Check:**

1. **Jaeger running:**
   ```bash
   curl http://localhost:6831/  # Should respond
   ```

2. **Config correct:**
   ```bash
   wpm status | grep OTEL
   ```

3. **Enable tracing:**
   ```bash
   WASM4PM_OTEL_ENABLED=true wpm run log.xes --log-level debug
   ```

**Jaeger UI:** http://localhost:16686 (search by service `wpm`)

---

### Not enough log output

**Problem:** Can't debug issue due to sparse logs.

**Fix:**
```bash
WASM4PM_LOG_LEVEL=debug wpm run log.xes 2>&1 | tee debug.log
```

**Then search debug.log for errors:**
```bash
grep -i error debug.log
```

---

## Platform-Specific Issues

### macOS: "SIGABRT signal (abort)" when running tests

**Problem:** Tests pass but process exits with error.

**Cause:** Known wasm-bindgen cleanup issue.

**Solution:** Ignore the exit code; tests actually passed.

```bash
cargo test --lib 2>&1 | grep -c "test .* ok"  # Count passing tests
```

---

### Windows: File permissions on mounted volumes

**Problem:** Cannot write to results on WSL/mounted volume.

**Fix:**
```bash
# Give broader permissions
chmod -R 777 .wasm4pm/
```

---

### Linux: "Too many open files"

**Problem:** System runs out of file descriptors.

**Fix:**
```bash
ulimit -n 4096  # Increase from 1024 to 4096
wpm run log.xes
```

---

## Getting Help

If troubleshooting doesn't solve it:

1. **Check FAQ:** [`docs/faq/ml-rl-faq.md`](./faq/ml-rl-faq.md)

2. **Search docs:**
   ```bash
   grep -r "your error message" docs/
   ```

3. **Run diagnostics:**
   ```bash
   wpm doctor
   ```

4. **Provide details for issue report:**
   ```bash
   wpm doctor > diagnostic-report.txt
   wpm run log.xes --log-level debug > error.log 2>&1
   # Attach both files to issue
   ```

5. **Check version compatibility:**
   ```bash
   wpm --version
   node --version
   ```

---

**See also:**
- [`docs/guides/cli-guide.md`](./guides/cli-guide.md)
- [`docs/faq/ml-rl-faq.md`](./faq/ml-rl-faq.md)
- [`CLAUDE.md`](../CLAUDE.md) (gotchas section)
