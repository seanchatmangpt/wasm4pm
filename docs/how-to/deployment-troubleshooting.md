# How-To: Deployment Troubleshooting

**Time required**: 25 minutes  
**Difficulty**: Intermediate  
**Prereq**: [Deployment Profiles](../archive/implementation/DEPLOYMENT_PROFILES_IMPLEMENTATION_SUMMARY.md) familiarity

---

## Quick Reference: Troubleshooting Checklist

Before diving into details, use this 5-point checklist for 80% of issues:

- [ ] **Profile mismatch?** Check `execution.profile` in config matches deployment target (fast/balanced/quality/stream)
- [ ] **Binary too large?** Verify profile-specific build was used, not default cloud build
- [ ] **Out of memory?** Reduce `execution.maxMemory` or use `fast` profile
- [ ] **Algorithm timeout?** Increase `execution.timeout` or switch to faster algorithm (DFG → Heuristic)
- [ ] **Config won't load?** Validate TOML syntax with `pmctl init --validate pictl.toml`

If none apply, continue to symptom-specific sections below.

---

## Issue 1: Profile Mismatch

### Symptom

You deployed with a profile but behavior doesn't match expectations:

- **Browser**: Binary is 2.5MB (should be ~500KB)
- **IoT**: App crashes with out-of-memory error
- **Edge**: Performance degraded compared to quality profile
- **Fog**: Missing POWL discovery features

### Root Cause

One of these happened:

1. Wrong build profile was deployed
2. Runtime profile config doesn't match deployed binary
3. Build cache was stale (old binary in use)

### Fix

#### Step 1: Verify Deployed Binary Profile

Check the actual binary size to infer which profile was deployed:

```bash
# Deployed binary (check size)
ls -lh wasm4pm.wasm          # Or wherever your binary is

# Expected sizes
# ~500KB (gzipped ~150KB)  → browser
# ~1.0MB (gzipped ~300KB)  → iot
# ~1.5MB (gzipped ~450KB)  → edge
# ~2.0MB (gzipped ~600KB)  → fog
# ~2.78MB (gzipped ~800KB) → cloud (full)
```

**Example: Deployed binary is 2.5MB**
```
ls -lh: -rw-r--r--  1 user  staff  2.8M Apr  9 15:30 wasm4pm.wasm
```

This is the **cloud profile**, not browser/edge/iot/fog.

#### Step 2: Verify Config Profile

Check what profile your config specifies:

```bash
# In pictl.toml
cat pictl.toml | grep -A 5 "\[execution\]"

# Output:
# [execution]
# profile = "balanced"
```

The **config profile** is different from the **deployment profile**. Config controls algorithm behavior (fast/balanced/quality/stream). Deployment profile controls binary size (browser/edge/fog/iot/cloud).

#### Step 3: Rebuild with Correct Profile

If you deployed the wrong binary:

```bash
# From repository root
cd wasm4pm

# Build specific profile
npm run build:browser    # ~500KB
# or
npm run build:edge       # ~1.5MB
# or
npm run build:iot        # ~1.0MB
# or
npm run build:fog        # ~2.0MB
# or
npm run build:cloud      # ~2.78MB (full)

# Verify output
ls -lh dist/pkg/wasm4pm.wasm

# Deploy the new binary
cp dist/pkg/wasm4pm.wasm /path/to/deployment/
```

#### Step 4: Document in Deployment

Add a comment to your Dockerfile or deployment manifest:

```dockerfile
# Use browser profile for web deployment
# Binary size: ~500KB (gzipped ~150KB)
COPY --from=builder /build/wasm4pm/dist/pkg/wasm4pm.wasm /app/
```

Or in Kubernetes:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: pmctl-config
data:
  deployment-profile: "browser"  # Matches binary
  config-profile: "balanced"      # Config setting
```

### Verification

After redeploying:

```bash
# Check new binary size
ls -lh wasm4pm.wasm

# Verify config matches
pmctl explain --config pictl.toml | grep -A 3 execution

# Run test
pmctl run -i test.xes --config pictl.toml
```

---

## Issue 2: Binary Size Too Large

### Symptom

Binary is larger than expected for the target platform:

- Browser binary is 2MB instead of 500KB
- IoT binary is 2.5MB (doesn't fit in 1GB device storage)
- Zip package exceeds CDN size limits
- Bundle transfer time is unacceptable

### Root Cause

One of these occurred:

1. **Wrong build command** — used `npm run build` instead of `npm run build:browser`
2. **Stale build cache** — old artifacts not cleaned
3. **Features not stripped** — built with full feature set
4. **Gzip not applied** — binary isn't compressed for transfer

### Fix

#### Step 1: Clean Build

Remove old artifacts and rebuild:

```bash
cd wasm4pm

# Full clean
npm run clean
rm -rf dist/ target/

# Rebuild
npm run build:browser

# Verify size
ls -lh dist/pkg/wasm4pm.wasm
# Expected: ~500KB
```

#### Step 2: Check Build Command

Verify you're using profile-specific command:

```bash
# Good: Specific profile
npm run build:browser    # ~500KB
npm run build:edge       # ~1.5MB
npm run build:iot        # ~1.0MB

# Bad: Generic build (produces cloud profile)
npm run build            # ~2.78MB
pnpm build:wasm         # ~2.78MB
```

#### Step 3: Enable Compression

For web deployment, compress the binary:

```bash
# Gzip the binary (recommended for HTTP transfer)
gzip -9 dist/pkg/wasm4pm.wasm -c > dist/pkg/wasm4pm.wasm.gz

# Check compressed size
ls -lh dist/pkg/wasm4pm.wasm.gz
# Browser profile gzipped: ~150KB

# For HTTP delivery, serve with Content-Encoding: gzip header
# Nginx example:
# gzip on;
# location /wasm/ {
#   add_header Content-Encoding gzip;
#   types { application/wasm wasm; }
# }
```

#### Step 4: Validate Feature Stripping

For minimal builds, verify features were actually stripped:

```bash
# Check Cargo.toml has minimal features
grep "features.*=" wasm4pm/Cargo.toml

# For browser profile, should NOT include:
# - powl (POWL discovery modules)
# - ml (ML prediction tasks)
# - streaming_full (some streaming features)
# - conformance_full (full conformance checking)

# Rebuild with explicit features if needed
cd wasm4pm
cargo build --target wasm32-unknown-unknown --release --features browser
```

#### Step 5: Measure Actual Reduction

Compare before and after:

```bash
# Before: Cloud build
npm run build
ls -lh dist/pkg/wasm4pm.wasm    # Suppose: 2.78MB

# After: Browser build
npm run build:browser
ls -lh dist/pkg/wasm4pm.wasm    # Expect: ~500KB

# Reduction
# (2.78 - 0.5) / 2.78 * 100 = 82% reduction
```

### Verification

Test the smaller binary works:

```bash
# Run on target device
pmctl run -i small-log.xes --config pictl.toml
```

If it fails with "algorithm not found", the profile was too minimal for your use case. Try the next larger profile:

```bash
# Too minimal? Try next size up
npm run build:iot        # 1.0MB (more features than browser)
```

---

## Issue 3: Out of Memory

### Symptom

Deployment fails with memory error:

- `WASM_MEMORY_EXCEEDED` or similar error
- Process killed by OOM killer (Linux)
- "JavaScript heap out of memory"
- Intermittent crashes under load

### Root Cause

One of these:

1. **Default memory limit too low** — config specifies 1GB, device has less
2. **Large input file** — event log doesn't fit in memory
3. **Memory leak in algorithm** — certain algorithms consume excessive memory
4. **No streaming enabled** — processing entire log at once

### Fix

#### Step 1: Check Device Capacity

Verify what memory is available:

```bash
# Linux/macOS
free -h              # Total memory
# or
sysctl hw.memsize   # macOS

# Docker
docker inspect CONTAINER | grep -A 5 "Memory"

# Kubernetes
kubectl describe node NODE_NAME | grep -A 10 "Allocated resources"
```

#### Step 2: Lower Memory Ceiling

Reduce the config limit to match device:

```toml
# pictl.toml

[execution]
profile = "fast"           # Use faster algorithm first
maxMemory = 536870912      # 512MB (half of 1GB default)
timeout = 300000
```

Or via CLI:

```bash
# Temporary override
pmctl run -i events.xes --config pictl.toml \
  --override execution.maxMemory=536870912
```

#### Step 3: Switch to Fast Profile

Fast profile uses simpler algorithms needing less memory:

```toml
[execution]
profile = "fast"      # DFG, Alpha (low memory)
# Avoid "quality" or "stream" until memory improves
```

Algorithms by memory usage (low to high):
- **DFG**: Lowest memory
- **Alpha**: Low memory
- **Heuristic**: Medium memory
- **Genetic**: High memory (skip if constrained)
- **Streaming**: Lower memory (chunks input)

#### Step 4: Enable Streaming (If Available)

Process input in chunks instead of all at once:

```toml
[execution]
profile = "stream"    # Streaming algorithm
# and/or
[source]
kind = "stream"       # Stream input instead of file
```

#### Step 5: Filter Input

Reduce event log size:

```bash
# Filter by activity (keep only frequent activities)
pmctl run -i events.xes --filter-activity-min-freq 2

# Filter by trace (process subset)
pmctl run -i events.xes --max-traces 1000

# Pre-process (outside pictl)
# Filter, sample, or compress the input file
```

### Verification

After fixes, monitor memory during execution:

```bash
# Watch memory in real-time
while true; do free -h | grep Mem; sleep 1; done &
pmctl run -i events.xes --config pictl.toml
```

Or check resource limits:

```bash
# Docker
docker run --memory=512m --memory-swap=512m wasm4pm-image

# Kubernetes
resources:
  limits:
    memory: "512Mi"
```

---

## Issue 4: Algorithm Timeout

### Symptom

Execution never completes or times out:

- `ALGORITHM_TIMEOUT` error message
- Partial results (some sinks succeeded)
- Process killed after waiting minutes
- Exit code 3 (EXECUTION_ERROR)

### Root Cause

One of these:

1. **Timeout too short** — config timeout is shorter than algorithm needs
2. **Algorithm too complex** — genetic/ILP on large logs
3. **Device too slow** — CPU-limited environment
4. **Memory swapping** — algorithm swapped to disk (very slow)

### Fix

#### Step 1: Identify Which Algorithm

Check config:

```bash
cat pictl.toml | grep -A 3 "\[algorithm\]"

# Output example:
# [algorithm]
# name = "genetic"
```

#### Step 2: Try Faster Algorithm

Switch to a simpler algorithm (if timeout allows time for config change):

```toml
[algorithm]
# Try in order of speed (fastest first)
name = "dfg"          # Fastest: 1–10 seconds
# name = "alpha"      # Fast: 5–30 seconds
# name = "heuristic"  # Medium: 10–120 seconds
# name = "genetic"    # Slow: 30–600+ seconds
```

#### Step 3: Increase Timeout

Extend the timeout to match algorithm complexity:

```toml
[execution]
timeout = 600000      # 10 minutes (up from 5 min default)
profile = "quality"   # Slower profile needs more time
```

Or via CLI:

```bash
pmctl run -i events.xes --config pictl.toml --timeout 600000
```

#### Step 4: Match Profile to Timeout

Profiles affect both speed and timeout expectations:

| Profile | Typical Time | Recommended Timeout |
|---------|--------------|-------------------|
| fast | 1–10 sec | 30–60 sec |
| balanced | 5–30 sec | 60–300 sec |
| quality | 30–300 sec | 300–1800 sec |
| stream | 10–120 sec | 120–600 sec |

```toml
[execution]
profile = "balanced"
timeout = 60000       # 60 sec (for balanced profile)
```

#### Step 5: Use Streaming (If Supported)

Process large logs in chunks:

```bash
pmctl run -i events.xes --profile stream --timeout 600000
```

### Verification

Test with small input first:

```bash
# Create minimal test log (e.g., 10 traces)
head -100 events.xes > test-small.xes

# Try it
pmctl run -i test-small.xes --timeout 30000  # 30 sec

# If that works, scale up
pmctl run -i events.xes --timeout 300000
```

---

## Issue 5: Config Loading Failure

### Symptom

Config file won't load or validation fails:

- `CONFIG_ERROR` exit code
- "Invalid TOML syntax" or similar
- Specific field validation error
- Exit code 1

### Root Cause

One of these:

1. **TOML syntax error** — typo in config file
2. **Missing required field** — schema requires field not in config
3. **Invalid enum value** — profile="invalid" (not in allowed list)
4. **Type mismatch** — string where number expected
5. **File not found** — config file path doesn't exist

### Fix

#### Step 1: Validate Config Syntax

Use pictl's validator:

```bash
pmctl init --validate pictl.toml

# Output on success:
# ✓ Configuration valid

# Output on error:
# Error: CONFIG_INVALID
# Line 5: [execution]
# Issue: Missing required field "profile"
```

#### Step 2: Fix TOML Syntax

Common TOML errors:

```toml
# Bad: Missing colon in section
[execution
profile = "fast"

# Good:
[execution]
profile = "fast"

# Bad: Unquoted string value
[execution]
profile = fast

# Good:
[execution]
profile = "fast"

# Bad: Invalid number (string syntax)
[execution]
timeout = "600000"

# Good (no quotes for numbers):
[execution]
timeout = 600000

# Bad: Duplicate section
[execution]
profile = "fast"
[execution]     # Duplicate!
timeout = 60000

# Good:
[execution]
profile = "fast"
timeout = 60000
```

#### Step 3: Check Required Fields

View example config:

```bash
pmctl init --sample > example.toml
cat example.toml | head -20
```

Compare to your config:

```bash
diff example.toml pictl.toml
```

Add any missing sections (e.g., if `[execution]` is missing):

```toml
[execution]
profile = "balanced"
timeout = 300000
```

#### Step 4: Validate Enum Values

For enum fields, check valid options:

```bash
# Valid execution profiles
execution.profile = "fast" | "balanced" | "quality" | "stream"

# Valid algorithms
algorithm.name = "dfg" | "alpha" | "heuristic" | "genetic" | ...

# Valid log levels
observability.logLevel = "debug" | "info" | "warn" | "error"
```

Common invalid values:

```toml
# Bad (not an enum option)
profile = "premium"

# Good:
profile = "quality"

# Bad (underscore, not hyphen)
profile = "high_quality"

# Good:
profile = "quality"
```

#### Step 5: Check Field Types

Numbers vs. strings:

```toml
# Good (number, no quotes)
timeout = 600000

# Bad (string)
timeout = "600000"

# Good (boolean, no quotes)
metricsEnabled = true

# Bad (quoted boolean)
metricsEnabled = "true"

# Good (string, with quotes)
path = "/path/to/file"

# Bad (string without quotes, only valid for simple identifiers)
path = /path/to/file
```

#### Step 6: File Not Found

Verify config file exists:

```bash
ls -la pictl.toml

# If not found, create it
pmctl init > pictl.toml

# Or specify explicit path
pmctl run -i events.xes --config /full/path/to/pictl.toml
```

### Verification

After fixes, validate:

```bash
pmctl init --validate pictl.toml
# Should output: ✓ Configuration valid

# Then test
pmctl run -i events.xes --config pictl.toml
```

---

## Issue 6: Observability Not Working

### Symptom

OTel traces aren't being collected:

- `observability.otel.enabled = true` but no traces appear
- JSONL output file is empty or doesn't exist
- Jaeger/Tempo shows no spans from pictl
- OTel endpoint errors in logs

### Root Cause

One of these:

1. **OTel disabled in config** — `enabled = false`
2. **Endpoint unreachable** — network connectivity issue
3. **Wrong endpoint** — misconfigured URL
4. **Exporter misconfigured** — "otlp" vs "console"
5. **No output sink** — traces sent to collector, not local file

### Fix

#### Step 1: Enable OTel in Config

Check if OTel is enabled:

```bash
cat pictl.toml | grep -A 10 "\[observability.otel\]"

# Should show:
# [observability.otel]
# enabled = true
```

Enable if disabled:

```toml
[observability.otel]
enabled = true
exporter = "otlp"           # or "console" for local testing
endpoint = "http://localhost:4318"  # OTel collector endpoint
```

#### Step 2: Test Connectivity to Endpoint

Verify endpoint is reachable:

```bash
# Test connection to OTel collector
curl -i http://localhost:4318/v1/traces

# Expected: 400 Bad Request (no data sent, but connection works)
# If refused: Collector is not running or port is wrong

# Check if Jaeger/Tempo is running
docker ps | grep jaeger
docker ps | grep tempo

# Start collector if needed
docker run -p 4318:4318 otel/opentelemetry-collector:latest
```

#### Step 3: Check Endpoint Configuration

Verify endpoint is correct:

```toml
# Common endpoints:

# OTel Collector (localhost)
endpoint = "http://localhost:4318"

# Datadog Agent
endpoint = "http://localhost:8126"

# New Relic
endpoint = "https://otlp.nr-data.net"

# Honeycomb
endpoint = "https://api.honeycomb.io"
```

#### Step 4: Switch Exporter to Console (Local Testing)

For debugging, use console exporter (outputs to stderr):

```toml
[observability.otel]
enabled = true
exporter = "console"    # Outputs spans to console
# endpoint = ...        # Not needed for console
```

Then run and check output:

```bash
pmctl run -i events.xes --config pictl.toml 2>&1 | grep -i span
```

#### Step 5: Check Sink Configuration

Verify output sink is configured:

```bash
# Check output destination
cat pictl.toml | grep -A 5 "\[output\]"

# Should show:
# [output]
# destination = "stdout"
# or
# [sink]
# kind = "file"
# path = "./output.pnml"
```

For JSONL output (common for OTel):

```toml
[sink]
kind = "file"
path = "./.wasm4pm/otel-traces.jsonl"
```

#### Step 6: View Raw Traces

Check if traces are being written locally:

```bash
# If console exporter
pmctl run -i events.xes --config pictl.toml 2>&1 | head -50

# If file exporter
cat .wasm4pm/otel-traces.jsonl | jq '.' | head -20

# If no output file exists, OTel is not writing
```

### Verification

After fixes:

```bash
# Enable OTel and console exporter for testing
cat > test-otel.toml <<'EOF'
[observability.otel]
enabled = true
exporter = "console"

[source]
kind = "file"
path = "events.xes"
EOF

# Run and check for span output
pmctl run -i events.xes --config test-otel.toml 2>&1 | grep -i "span\|trace"
```

---

## Issue 7: Exit Code Interpretation

### Symptom

Command failed with unclear exit code:

```bash
pmctl run -i events.xes
echo $?
# Output: 3
```

What does exit code 3 mean? How do I fix it?

### Reference

Exit codes are standardized:

| Code | Category | Cause | Fix |
|------|----------|-------|-----|
| 0 | Success | Completed successfully | None needed |
| 1 | Config | Configuration invalid | Validate with `pmctl init --validate` |
| 2 | Source | Input file not found | Check file path exists |
| 3 | Execution | Algorithm timeout or OOM | Increase timeout or reduce memory usage |
| 4 | Partial | Some outputs succeeded, some failed | Check receipt for failed sinks |
| 5 | System | WASM initialization failed | Check Node.js version and environment |

### Step 1: Identify Category

```bash
pmctl run -i events.xes
EXIT_CODE=$?

case $EXIT_CODE in
  0) echo "Success!" ;;
  1) echo "Configuration error" ;;
  2) echo "Source error (file not found?)" ;;
  3) echo "Execution error (timeout/OOM)" ;;
  4) echo "Partial success (check receipt)" ;;
  5) echo "System error (environment issue)" ;;
  *) echo "Unknown error: $EXIT_CODE" ;;
esac
```

### Step 2: Read Error Message

pictl outputs error details to stderr:

```bash
# Capture both stdout and stderr
pmctl run -i events.xes 2>&1 | tee execution.log

# Extract error message
pmctl run -i events.xes 2>&1 | grep -i "error:"
```

### Step 3: Fix Based on Category

**Exit 1 (Config):**
```bash
pmctl init --validate pictl.toml
# Fix reported errors
```

**Exit 2 (Source):**
```bash
ls -la events.xes    # Verify file exists
cat pictl.toml | grep -A 3 "\[source\]"  # Check path
```

**Exit 3 (Execution):**
```bash
# Increase timeout or switch algorithm
cat pictl.toml | grep -A 5 "\[execution\]"
# Edit timeout = 600000 (10 min)
# or algorithm = "dfg" (faster)
```

**Exit 4 (Partial):**
```bash
cat output/receipt.json | jq '.sink_results'
# Check which sink failed
```

**Exit 5 (System):**
```bash
pmctl doctor
pmctl status
# Check Node.js version, WASM support
```

---

## Debugging Checklist

Use this before filing an issue:

- [ ] **Validate config:** `pmctl init --validate pictl.toml`
- [ ] **Check file exists:** `ls -la events.xes`
- [ ] **View provenance:** `pmctl explain --show-provenance --config pictl.toml`
- [ ] **Check environment:** `pmctl doctor`
- [ ] **Try minimal config:** `pmctl run -i small-test.xes` (no config file)
- [ ] **Check logs:** `cat output/execution.log | tail -50`
- [ ] **Verify binary:** `ls -lh wasm4pm.wasm` (check size for profile)
- [ ] **Test connectivity:** `curl http://localhost:4318/v1/traces` (for OTel)
- [ ] **Memory usage:** `pmctl run ... --verbose 2>&1 | grep -i memory`
- [ ] **Exit code:** `echo $?` (after running command)

---

## Real Example: End-to-End Troubleshooting

**Scenario:** Browser deployment times out on large event log.

```bash
# 1. Check exit code
pmctl run -i events.xes
# Output: timeout after 5 min
# Exit code: 3 (EXECUTION_ERROR)

# 2. Validate config
pmctl init --validate pictl.toml
# Output: ✓ Configuration valid

# 3. Check which algorithm
cat pictl.toml | grep "algorithm.name"
# Output: genetic (slow!)

# 4. Check which profile
ls -lh wasm4pm.wasm
# Output: 2.5MB (should be 500KB for browser)

# 5. Problem identified:
# - Cloud binary (2.5MB) instead of browser (500KB)
# - Genetic algorithm on large log
# - Default 5-min timeout

# 6. Fix:
# - Rebuild with: npm run build:browser
# - Use faster algorithm: algorithm = "dfg"
# - Increase timeout: timeout = 60000 (1 min, enough for DFG)

# 7. Verify
pmctl run -i events.xes --config pictl.toml
# Success!
```

---

## Summary

Most deployment issues fall into 7 categories. Use this guide to quickly identify and fix:

1. **Profile Mismatch** — Check binary size, rebuild if needed
2. **Binary Too Large** — Clean build, use profile-specific command
3. **Out of Memory** — Lower maxMemory, use fast profile, enable streaming
4. **Algorithm Timeout** — Switch to faster algorithm or increase timeout
5. **Config Loading** — Validate TOML syntax, check enum values
6. **Observability** — Enable OTel, verify endpoint connectivity
7. **Exit Codes** — Use standard codes to identify issue category

Always start with the 5-point checklist and `pmctl explain --show-provenance` for debugging.

---

## See Also

- [Reference: Exit Codes](../reference/exit-codes.md) — Complete exit code reference
- [Reference: Error Codes](../reference/error-codes.md) — Detailed error messages
- [Deployment Profiles](../archive/implementation/DEPLOYMENT_PROFILES_IMPLEMENTATION_SUMMARY.md) — Profile details and usage
- [How-To: Error Recovery](./error-recovery.md) — Recovery strategies
- [How-To: Debug Config](./debug-config.md) — Config-specific debugging
- [How-To: Monitor Jobs](./monitor-jobs.md) — Long-running job monitoring
