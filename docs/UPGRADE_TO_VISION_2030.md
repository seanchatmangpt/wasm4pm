# Upgrade Guide: Vision 2030 (v26.4.16)

This guide walks you through upgrading from pictl v26.4.10 (or earlier) to v26.4.16, which introduces the **AutoProcess autonomic loop**.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Upgrade Steps](#upgrade-steps)
4. [Verification](#verification)
5. [Troubleshooting](#troubleshooting)
6. [Rollback](#rollback)

---

## Overview

Vision 2030 adds autonomous process monitoring via a closed-loop MAPE-K cycle embedded in the WASM core. Key capabilities:

- **Autonomic Loop**: Monitors, analyzes, plans, executes, and learns from process behavior
- **Five RL Agents**: Competing algorithms with contextual bandit selection
- **SPC Monitoring**: Real-time Western Electric statistical process control
- **Circuit Breaker**: Automatic fault isolation on repeated failures
- **State Persistence**: Q-table and SPC history survive restarts

**Backward Compatible**: Existing commands and workflows are unchanged. The autonomic loop runs alongside your existing process mining operations.

---

## Prerequisites

### Required

- **pictl v26.4.x**: Upgrade from v26.4.10 or later
- **Node.js 18+**: Runtime for TypeScript/WASM
- **Disk space**: 200 MB for WASM binaries + state files

### Optional

- **OTEL Collector**: To visualize autonomic loop spans (recommended for production)
- **Docker**: For containerized deployments (same as v26.4.10)

### Not Required

- No configuration file changes
- No environment variable changes
- No database migrations
- No manual state initialization

---

## Upgrade Steps

### Step 1: Backup Existing State (Recommended)

Create a backup of your current pictl installation and results:

```bash
# Backup results and configuration
mkdir -p ~/.pictl-backup/v26.4.10
cp -r .pictl ~/.pictl-backup/v26.4.10/
cp wasm4pm.toml ~/.pictl-backup/v26.4.10/ 2>/dev/null || true

# Backup package lock (if using pnpm/npm)
cp pnpm-lock.yaml ~/.pictl-backup/v26.4.10/ 2>/dev/null || true
cp package-lock.json ~/.pictl-backup/v26.4.10/ 2>/dev/null || true
```

This allows you to rollback if needed (see [Rollback](#rollback) section).

### Step 2: Update pictl Package

#### Option A: Global Installation (npm)

```bash
# Remove old version
npm uninstall -g @wasm4pm/cli

# Install new version
npm install -g @wasm4pm/cli@26.4.16
```

**Verify**:
```bash
pictl --version
# Output: pictl 26.4.16 (or similar)
```

#### Option B: Project-Local Installation (pnpm/npm)

```bash
cd your-project

# Update in package.json
pnpm update @wasm4pm/cli --latest
# or
npm update @wasm4pm/cli --latest

# Verify
npx wpm --version
```

#### Option C: Docker Image

```bash
docker pull @wasm4pm/cli:26.4.16
docker run @wasm4pm/cli:26.4.16 pictl --version
```

### Step 3: Verify Installation

Run the built-in health check:

```bash
wpm doctor
```

**Expected output**:
```
✓ WASM module loaded
✓ Config resolution working
✓ State persistence enabled
✓ OTEL instrumentation ready
✓ Autonomic loop active
✓ Circuit breaker initialized
```

**All checks should show ✓ (green).**

If any check fails, see [Troubleshooting](#troubleshooting).

### Step 4: Verify WASM Module

Test that the WASM core is properly loaded with Vision 2030 capabilities:

```bash
wpm status
```

**Expected output**:
```json
{
  "state": "ready",
  "wasm": {
    "loaded": true,
    "algorithms": 41,
    "autonomic_loop": "active"
  },
  "circuit_breaker": {
    "state": "Closed",
    "failures": 0
  },
  "spc_buffer": {
    "size": 100,
    "snapshots": 0
  }
}
```

### Step 5: Try AutoProcess on Sample Log

Test the new autonomic loop with a sample event log:

```bash
# Using a sample log (replace with your own)
wpm autoprocess sample.xes --cycles 3 --format json > autoprocess-test.json

# View the output
cat autoprocess-test.json | jq '.' | head -50
```

**Expected output structure**:
```json
{
  "run_id": "...",
  "cycles": [
    {
      "cycle_num": 1,
      "state_id": 12345,
      "health_level": 0,
      "spc_alert_level": 0,
      "agent_selected": "Q-Learning",
      "action_taken": 2,
      "reward": 0.2,
      "next_state_id": 12346,
      "spc_alerts": []
    },
    ...
  ]
}
```

### Step 6: Verify State Persistence

Check that the autonomic state is being saved:

```bash
ls -la .wasm4pm/autoprocess-state.json

# View the state file
cat .wasm4pm/autoprocess-state.json | jq '.metadata'
```

**Expected output**:
```json
{
  "saved_at": "2026-04-16T20:30:45.123Z",
  "cycle_count": 3,
  "agent_selected": "Q-Learning",
  "q_table_hash": "abc123...",
  "circuit_breaker_state": "Closed"
}
```

### Step 7: Update Configuration (Optional)

If you want to customize the autonomic loop behavior, update `wasm4pm.toml`:

```toml
[observability]
# Increase SPC history depth (default: 100 snapshots)
spc_buffer_size = 500

# Enable verbose autonomic logging (default: false)
autonomic_debug = false

[execution]
# RL exploration trade-off (default: 0.1)
epsilon = 0.1

# Learning rate (default: 0.1)
learning_rate = 0.1

# Discount factor (default: 0.99)
discount = 0.99
```

All settings are optional. If omitted, defaults are used.

### Step 8: Run Existing Commands

Verify that existing commands still work as before:

```bash
# Process discovery (unchanged)
wpm run sample.xes --algorithm dfg --format json

# Algorithm comparison (unchanged)
wpm compare "dfg,heuristic_miner,genetic_algorithm" -i sample.xes

# Conformance checking (unchanged)
wpm conformance model.pnml -i sample.xes
```

**Expected**: All commands produce identical output to v26.4.10.

---

## Verification

### Full Integration Test

Run this comprehensive test to verify all Vision 2030 components:

```bash
#!/bin/bash
set -e

echo "=== Vision 2030 Integration Test ==="

# 1. Doctor check
echo "1. Running doctor..."
wpm doctor || exit 1

# 2. Status check
echo "2. Checking status..."
wpm status | jq '.autonomic_loop' || exit 1

# 3. AutoProcess test
echo "3. Testing AutoProcess..."
wpm autoprocess sample.xes --cycles 1 --format json > /tmp/test-autoprocess.json
test -f /tmp/test-autoprocess.json || exit 1

# 4. Verify state persistence
echo "4. Verifying state persistence..."
test -f .wasm4pm/autoprocess-state.json || exit 1

# 5. Existing command test
echo "5. Running existing discovery command..."
wpm run sample.xes --algorithm dfg --format json > /tmp/test-discovery.json
test -f /tmp/test-discovery.json || exit 1

# 6. Circuit breaker test
echo "6. Checking circuit breaker..."
wpm status | jq '.circuit_breaker.state' | grep -q "Closed" || exit 1

echo "=== All Tests Passed ✓ ==="
```

Save this as `test-vision-2030.sh`, make it executable, and run:

```bash
chmod +x test-vision-2030.sh
./test-vision-2030.sh
```

### Performance Baseline

Measure autonomic loop performance:

```bash
# Measure cycle latency (should be <100ms)
time wpm autoprocess sample.xes --cycles 100 > /dev/null

# Expected output: real 0m0.1s (100 cycles in ~0.1 seconds)
```

If cycle time is significantly higher (>1 second for 100 cycles), see [Troubleshooting](#troubleshooting).

---

## Troubleshooting

### Issue 1: "WASM module not loaded"

**Symptoms**:
```
✗ WASM module not loaded
Error: load_eventlog_from_xes is not exported
```

**Cause**: WASM binary is missing or corrupt.

**Solution**:

```bash
# Clear cache and rebuild
rm -rf node_modules/.vite
rm -rf .wasm4pm/wasm-cache/

# Reinstall
npm install @wasm4pm/cli@26.4.16 --force
wpm doctor
```

If issue persists:
```bash
# Check WASM binary
ls -lah node_modules/@wasm4pm/cli/dist/wasm4pm.js

# Should be ~2.7 MB for browser profile
# If <100 KB, download failed
```

### Issue 2: "State persistence not working"

**Symptoms**:
```
✗ State persistence enabled
Error: Cannot write to .wasm4pm/autoprocess-state.json
```

**Cause**: Insufficient disk permissions or full disk.

**Solution**:

```bash
# Check disk space
df -h .pictl

# Check permissions
touch .wasm4pm/test-write && rm .wasm4pm/test-write

# Create directory if missing
mkdir -p .pictl

# Set proper permissions (user-readable)
chmod 755 .pictl
```

### Issue 3: "Circuit breaker stuck in Open state"

**Symptoms**:
```
Circuit breaker state: Open
Failures: 3
```

**Cause**: Three consecutive algorithm timeouts. Requires manual reset.

**Solution**:

```bash
# Option 1: Manual reset via CLI
wpm status --circuit-breaker-reset

# Option 2: Delete state file (full reset)
rm .wasm4pm/autoprocess-state.json
wpm doctor --bootstrap-fresh

# Option 3: Scheduled reset (cron)
# Reset circuit every 6 hours if open
0 */6 * * * [ -f .wasm4pm/autoprocess-state.json ] && wpm status --circuit-breaker-reset
```

After reset, the circuit breaker returns to `Closed` state.

### Issue 4: "SPC alerts too frequent"

**Symptoms**:
```
SPC alert: 6 consecutive points increasing
SPC alert: 1 point beyond 3-sigma
```

**Cause**: Process is naturally variable or configuration is too sensitive.

**Solution**:

Option 1: Increase SPC buffer size (more history for baseline):
```toml
[observability]
spc_buffer_size = 500  # Increase from 100
```

Option 2: Increase alert threshold:
```toml
[observability]
spc_sigma_threshold = 4.0  # Increase from 3.0 (less sensitive)
```

Option 3: Temporarily disable SPC:
```bash
WASM4PM_OBSERVABILITY_SPC_ENABLED=false wpm autoprocess sample.xes
```

### Issue 5: "Autonomic loop not responding"

**Symptoms**:
```
$ wpm autoprocess sample.xes --cycles 5
# Hangs for >10 seconds
```

**Cause**: Q-table allocation may be slow on first run (9.2 MB).

**Solution**:

```bash
# Increase stack size for Rust
RUST_MIN_STACK=16777216 wpm autoprocess sample.xes --cycles 5

# Or run with fewer cycles first
wpm autoprocess sample.xes --cycles 1  # Primes the Q-table
wpm autoprocess sample.xes --cycles 10 # Should be faster
```

If hangs persist, check system resources:
```bash
# Check available memory
free -h

# Check CPU load
top -n1 | head -5
```

### Issue 6: "Rollback needed - how to downgrade?"

See [Rollback](#rollback) section below.

---

## Rollback

If you need to downgrade to v26.4.10:

### Step 1: Uninstall v26.4.16

```bash
npm uninstall -g @wasm4pm/cli
# or
pnpm remove @wasm4pm/cli
```

### Step 2: Restore Backup (Optional)

If you created a backup in Step 1:

```bash
# Restore results
cp -r ~/.pictl-backup/v26.4.10/.pictl .pictl

# Restore configuration
cp ~/.pictl-backup/v26.4.10/wasm4pm.toml wasm4pm.toml 2>/dev/null || true
```

### Step 3: Install Previous Version

```bash
npm install -g @wasm4pm/cli@26.4.10
```

### Step 4: Verify

```bash
pictl --version
# Output: pictl 26.4.10

wpm doctor
```

**Note**: The `.wasm4pm/autoprocess-state.json` file created by v26.4.16 will be ignored by v26.4.10. You can safely delete it:

```bash
rm .wasm4pm/autoprocess-state.json
```

---

## What's Different in Vision 2030?

### New Features

| Feature | v26.4.10 | v26.4.16 |
|---------|----------|----------|
| AutoProcess loop | ✗ | ✓ |
| RL agents | ✗ (hardcoded) | ✓ (5 agents, LinUCB) |
| SPC monitoring | ✗ | ✓ (Western Electric) |
| Circuit breaker | ✓ (manual) | ✓ (automatic) |
| State persistence | ✗ | ✓ (auto-save) |
| `wpm autoprocess` command | ✗ | ✓ |

### Unchanged

| Component | Status |
|-----------|--------|
| `wpm run` | Same |
| `wpm compare` | Same |
| `wpm diff` | Same |
| `wpm conformance` | Same |
| `wpm ml` | Same |
| `wpm powl` | Same |
| Config format | Same (backward compatible) |
| WASM algorithms (41 total) | Same |
| Exit codes | Same |
| OTEL spans (existing types) | Same |

### Breaking Changes

**None**. Vision 2030 is fully backward compatible.

However, new OTEL span types are available:
- `autoprocess.cycle` — Autonomic loop execution
- `spc_alert_detected` — Statistical process control alert

These are optional and don't break existing observability pipelines.

---

## Production Deployment

### Recommended Configuration for Production

```toml
# wasm4pm.toml (production)

[execution]
profile = "cloud"  # Full feature set
timeout_ms = 30000 # 30 second timeout for long-running algorithms

[observability]
otel = { enabled = true, exporter = "otlp" }
spc_buffer_size = 100  # Default

# AutoProcess settings
epsilon = 0.05  # Lower exploration (more exploitation)
learning_rate = 0.05  # Slower learning (more stable)
discount = 0.99

[watch]
enabled = false  # Disable file watching in production
```

### Kubernetes Deployment

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: pictl-config
data:
  wasm4pm.toml: |
    [execution]
    profile = "cloud"
    timeout_ms = 30000
    [observability]
    otel = { enabled = true }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pictl-service
spec:
  template:
    spec:
      containers:
      - name: pictl
        image: pictl:26.4.16
        volumeMounts:
        - name: config
          mountPath: /app/wasm4pm.toml
          subPath: wasm4pm.toml
        - name: state
          mountPath: /app/.pictl
      volumes:
      - name: config
        configMap:
          name: pictl-config
      - name: state
        emptyDir: {}  # Or persistent volume for production
```

### Health Checks

```bash
# Kubernetes liveness probe
wpm doctor | grep -q "Autonomic loop active" && exit 0 || exit 1

# Circuit breaker status (readiness probe)
wpm status | jq -e '.circuit_breaker.state == "Closed"' && exit 0 || exit 1
```

---

## Next Steps

1. **Read the Release Notes**: `RELEASE_NOTES_VISION_2030.md`
2. **Review AutoProcess Design**: `AUTOPROCESS_VISION2030.md`
3. **Check WASM API**: `WASM_API.md` (new autonomic functions)
4. **Explore Observability**: Set up OTEL to view autonomic loop spans in Jaeger

---

## Support

- **GitHub Issues**: https://github.com/seanchatmangpt/wasm4pm/issues
- **Discussions**: https://github.com/seanchatmangpt/wasm4pm/discussions
- **Email**: info@chatmangpt.com

---

**Welcome to Vision 2030. Your processes now monitor themselves.**
