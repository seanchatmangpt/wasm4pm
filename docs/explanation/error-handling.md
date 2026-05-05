# Explanation: Error Handling Philosophy

**Time to read**: 10 minutes  
**Level**: Intermediate  

## Exit Codes

wasm4pm uses 6 exit codes with mandatory remediation:

| Code | Category | Cause | Remediation |
|------|----------|-------|-------------|
| 0 | SUCCESS | Completed | Done ✓ |
| 1 | CONFIG | Invalid config | Fix config.toml |
| 2 | SOURCE | File/input error | Check input file |
| 3 | EXECUTION | Algorithm failed | Reduce complexity |
| 4 | PARTIAL | Some outputs failed | Check sink status |
| 5 | SYSTEM | WASM/OTEL error | Check environment |

## Error Categories

### Category 1: CONFIG_ERROR (Exit 1)

```
CONFIG_INVALID
  → Schema validation failed
  → Fix: wpm init --validate config.toml

CONFIG_MISSING
  → Required field missing
  → Fix: Add field to config.toml

CONFIG_INCOMPATIBLE
  → Settings conflict
  → Fix: Resolve conflicting settings
```

### Category 2: SOURCE_ERROR (Exit 2)

```
SOURCE_NOT_FOUND
  → File doesn't exist
  → Fix: Check path, file must exist

SOURCE_INVALID
  → Format unrecognized
  → Fix: Use supported format (XES, JSON)

SOURCE_PERMISSION
  → Access denied
  → Fix: Check file permissions (chmod)
```

### Category 3: EXECUTION_ERROR (Exit 3)

```
ALGORITHM_FAILED
  → Algorithm crashed
  → Fix: Try different algorithm or smaller input

ALGORITHM_TIMEOUT
  → Exceeded timeout_ms
  → Fix: Increase timeout or use faster algorithm

WASM_MEMORY_EXCEEDED
  → Out of memory
  → Fix: Reduce input size or use stream mode
```

### Category 4: PARTIAL_SUCCESS (Exit 4)

```
Some sinks succeeded, others failed
  → Check receipt for details

Possible causes:
  - Output directory not writable
  - Disk full
  - Permission denied
  - Network timeout
```

### Category 5: SYSTEM_ERROR (Exit 5)

```
WASM_INIT_FAILED
  → Module failed to initialize
  → Fix: Update Node.js, check WASM support

OTEL_FAILED
  → Observability system error
  → Fix: Check OTEL endpoint, it's non-fatal
```

## Mandatory Remediation

**Philosophy**: Every error requires action.

```bash
# Don't do this (hides error):
wpm run --config config.toml || echo "Done"

# Do this (address error):
if ! wpm run --config config.toml; then
  exit_code=$?
  
  if [ $exit_code -eq 1 ]; then
    # CONFIG_ERROR: fix config
    wpm init --validate config.toml
  elif [ $exit_code -eq 2 ]; then
    # SOURCE_ERROR: fix input
    ls -la $(grep path config.toml | awk '{print $3}')
  fi
  
  exit $exit_code
fi
```

## Error Propagation

Errors propagate up with context:

```
Level 1: Algorithm error
  "Genetic algorithm timeout after 30s"
  ↓
Level 2: Execution error
  "EXECUTION_ERROR: ALGORITHM_TIMEOUT"
  ↓
Level 3: CLI/Service error
  Exit code 3 or 5xx HTTP response
```

## Retry Strategies

### Exponential Backoff

```bash
attempt=1
delay=1
while [ $attempt -le 5 ]; do
  wpm run --config config.toml && break
  
  sleep $delay
  delay=$((delay * 2))
  attempt=$((attempt + 1))
done
```

### Fallback Algorithms

```bash
try_algorithm "genetic" || \
try_algorithm "heuristic" || \
try_algorithm "dfg"
```

### Circuit Breaker

```bash
failures=0
while [ $failures -lt 3 ]; do
  if wpm run --config config.toml; then
    break
  fi
  failures=$((failures + 1))
done

if [ $failures -eq 3 ]; then
  echo "Circuit breaker: giving up after 3 failures"
  exit 1
fi
```

## Error Recovery

Not all errors are recoverable:

```
Recoverable (retry possible):
  - ALGORITHM_TIMEOUT (increase timeout)
  - WASM_MEMORY_EXCEEDED (reduce input)
  - SOURCE_PERMISSION (fix permissions)

Not Recoverable (fix required):
  - CONFIG_INVALID (fix config)
  - SOURCE_NOT_FOUND (file must exist)
  - ALGORITHM_FAILED (use different algorithm)
```

## Logging

All errors are logged:

```bash
# View errors
wpm run --config config.toml 2>&1 | grep ERROR

# Check exit code
echo $?  # 0=success, 1-5=error
```

---

## Toyota Production System Compliance

**Architectural Principle (v26.4.10+):** Fail fast, not fail silently.

pictl follows Toyota Production System (TPS) principles to ensure defects are always visible. See [`~/.claude/rules/toyota-production.md`](../../../.claude/rules/toyota-production.md) for the authoritative rule file.

### Silent Fallbacks Removed (v26.4.10)

The following patterns have been eliminated from the codebase as TPS violations:

**BEFORE (v26.4.9 and earlier) — Silent fallback defect hidden:**
```typescript
// ❌ WRONG: Silent fallback — defect hidden
if (!wasmModule || !wasmModule.memory) {
  console.warn('WASM unavailable');
  return { status: 'degraded', data: null };  // Exit 0! Operator sees success.
}
```

**AFTER (v26.4.10+) — Fail fast defect visible:**
```typescript
// ✅ RIGHT: Fail fast — defect visible
if (!wasmModule || typeof wasmModule.load_eventlog_from_xes !== 'function') {
  throw new Error('Invalid WASM module: missing required exports');
}
```

### Doctrine Alignment

All error handling now enforces:

- ✅ **Armstrong Let-It-Crash**: Errors propagate, not caught and logged
  - No `try/catch` blocks that log and continue
  - Processes crash visibly; supervisors restart cleanly

- ✅ **Chicago TDD**: No silent fallbacks masking defects
  - Tests verify errors are surfaced, not hidden
  - No sentinel values (-1, 0.0, false) without escalation

- ✅ **WvdA Soundness**: No resource leaks or inconsistent state
  - All blocking operations have timeout_ms
  - No unbounded resource consumption

- ✅ **TPS Visibility**: Defects visible in exit codes and error output
  - Exit codes 1-5 indicate failure (never exit 0 on error)
  - Error messages include actionable remediation steps

### TPS Violation Resolution (v26.4.10)

Comprehensive audit completed 2026-04-12:

| Category | Violations Found | Violations Fixed |
|----------|-----------------|-------------------|
| **Critical** | 14 | 14 |
| **High** | 14 | 14 |
| **Medium** | 24 | 24 |
| **Low** | 2 | 2 |
| **Total** | **54** | **54** |

**Key Changes:**
- **Rust (30)**: Removed `.unwrap()` panics, added proper error returns
- **TypeScript (12)**: Removed silent catches, eliminated graceful degradation
- **Shell/Make (12)**: Removed `|| true` patterns, enforced `set -e`

### Architectural Shift: Graceful Degradation → Fail Fast

**v26.4.9 and earlier:**
- System attempted to continue with degraded functionality
- Operators saw "success" exit codes despite failures
- Defects hidden behind warning logs
- Silent data corruption possible (NaN values, default metrics)

**v26.4.10+ (current):**
- System fails immediately on error
- Operators see error exit codes and clear messages
- Defects visible in logs and monitoring
- No silent data corruption (fail or succeed, never "sort of")

### Example Impact

**Quality Assessment (BEFORE):**
```bash
$ wpm quality broken-log.xes --metrics fitness,precision
[ERROR] Fitness computation failed: WASM crashed
[ERROR] Precision computation failed: WASM crashed
Quality Assessment — broken-log.xes
  Aggregate: 0.0 (poor)
$ echo $?
0  # ← EXIT 0 DESPITE FAILURE — operator thinks success
```

**Quality Assessment (AFTER):**
```bash
$ wpm quality broken-log.xes --metrics fitness,precision
Quality assessment failed: Fitness computation failed: WASM crashed
$ echo $?
3  # ← EXIT 3 (execution_error) — operator sees failure immediately
```

**Key Lesson**: Graceful degradation that continues with default values is deceptive. Visible failure is better than hidden defects.

---

## Recovery and MTTR (Mean Time To Recovery)

**Recovery Philosophy (v26.4.10+):** Fast recovery through state machine transitions and WASM module reuse.

### Recovery Paths

The engine supports multiple recovery paths depending on failure severity:

```
Fast Recovery (~10-100ms):
  degraded → ready
  - Soft reset WASM (preserves compiled module)
  - Re-init kernel only
  - No WASM re-import or re-compilation

Fast Recovery (<1s):
  failed → ready (when WASM intact)
  - Check WASM module accessibility
  - Soft reset + kernel re-init
  - Fallback to full bootstrap if WASM corrupted

Slow Recovery (1-6s):
  failed → bootstrapping → ready
  - Full WASM re-import and re-compilation
  - Complete kernel initialization
  - Used when WASM module is corrupted or unavailable
```

### MTTR Measurement

MTTR is **measured at runtime**, not hardcoded:

```typescript
// StateMachine tracks recovery durations
private recoveryHistory: number[] = [];

recordRecovery(durationMs: number): void {
  this.recoveryHistory.push(durationMs);
  // Keep last 100 recovery times
  if (this.recoveryHistory.length > 100) {
    this.recoveryHistory.shift();
  }
}

getMTTR(): number {
  if (this.recoveryHistory.length === 0) return 0;
  const sum = this.recoveryHistory.reduce((a, b) => a + b, 0);
  return sum / this.recoveryHistory.length;
}
```

**Target:** <1 minute average ✅ (current: <1 second measured)

### Recovery Timeout Protection

All recovery operations are timeout-protected:

```typescript
async recover(options?: { timeout?: number }): Promise<void> {
  const timeoutMs = options?.timeout ?? 30000; // 30 second default

  await Promise.race([
    this.kernel.init(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Recovery timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}
```

### WASM Soft Reset

**Key optimization:** `WasmLoader.softReset()` preserves compiled WASM module:

```typescript
// Soft reset - fast recovery
public softReset(): void {
  this.initialized = false;
  // Keep this.module and this.observability intact
  // Next init() skips expensive import() and re-compile
}

// Hard reset - full re-bootstrap (use only for tests or critical failures)
public static reset(): void {
  WasmLoader.instance = undefined;
}
```

**Impact:**
- Hard reset: 1-5 seconds (WASM re-import + compile)
- Soft reset: 10-100ms (kernel re-init only)

### Fast Recovery from Failed State

Direct `failed → ready` transition when WASM is intact:

```typescript
async fastRecoverFromFailed(): Promise<void> {
  if (this.state() !== 'failed') {
    throw new Error(`Cannot fast recover from state: ${this.state()}`);
  }

  try {
    if (!this.wasmLoader.isInitialized()) {
      return this.bootstrap(); // Fall back to full bootstrap
    }

    this.wasmLoader.softReset();
    await this.kernel.init();

    if (!this.kernel.isReady()) {
      throw new Error('Kernel not ready after fast recovery');
    }

    this.stateMachine.transition('ready', 'Fast recovery completed');
  } catch (err) {
    await this.bootstrap(); // Fall back to full bootstrap
  }
}
```

### OTEL Recovery Spans

All recovery operations emit OpenTelemetry spans:

```typescript
// Recovery start
const recoveryStartEvent = Instrumentation.createStateChangeEvent(
  this.traceId, previousState, 'bootstrapping',
  this.requiredOtelAttrs, { reason: 'Recovery started' }
);
this.observability.emitOtelSafe(recoveryStartEvent.otelEvent);

// Recovery completion with duration
const recoveryDuration = Date.now() - recoveryStart;
const recoveryCompleteEvent = Instrumentation.createStateChangeEvent(
  this.traceId, 'bootstrapping', 'ready',
  this.requiredOtelAttrs, { reason: 'Recovery completed' }
);
recoveryCompleteEvent.event.durationMs = recoveryDuration;
this.observability.emitOtelSafe(recoveryCompleteEvent.otelEvent);

// Track MTTR
this.stateMachine.recordRecovery(recoveryDuration);
```

### Circuit Breaker Pattern

Prevents repeated bootstrap failures:

```typescript
private bootstrapFailures = 0;
private readonly MAX_BOOTSTRAP_FAILURES = 3;

async bootstrap(options?: { timeout?: number }): Promise<void> {
  // Circuit-breaker: if too many failures, require manual intervention
  if (this.bootstrapFailures >= this.MAX_BOOTSTRAP_FAILURES) {
    throw new Error(
      `Circuit breaker open: ${this.bootstrapFailures} consecutive bootstrap failures. ` +
      `Manual intervention required. Reset with engine.reset() to retry.`
    );
  }

  try {
    // ... bootstrap logic ...
    this.bootstrapFailures = 0; // Reset on success
  } catch (err) {
    this.bootstrapFailures++;
    throw err;
  }
}
```

### Recovery Best Practices

1. **Use fast recovery when possible**
   - Check `engine.state()` before calling recovery
   - Prefer `fastRecoverFromFailed()` over full `bootstrap()`
   - Let engine fall back automatically if fast recovery fails

2. **Monitor MTTR metrics**
   ```bash
   wpm status --format json | jq '.mttr'
   ```

3. **Set appropriate timeouts**
   ```typescript
   await engine.recover({ timeout: 10000 }); // 10 second timeout
   ```

4. **Check recovery history**
   ```typescript
   const mttr = engine.stateMachine.getMTTR();
   const recoveryCount = engine.stateMachine.getRecoveryCount();
   ```

### WvdA Soundness Compliance

Recovery paths ensure:
- ✅ **Deadlock Freedom**: All recovery operations have timeout_ms
- ✅ **Liveness**: Recovery always completes or escalates
- ✅ **Boundedness**: Recovery history limited to 100 entries

## See Also

- [Reference: Error Codes](../reference/error-codes.md)
- [How-To: Error Recovery](../how-to/error-recovery.md)
- [How-To: Debug Config](../how-to/debug-config.md)
