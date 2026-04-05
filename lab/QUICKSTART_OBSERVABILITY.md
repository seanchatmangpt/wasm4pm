# Observability Tests - Quick Start

## 5-Minute Setup

### 1. Install Dependencies (one-time)
```bash
cd /Users/sac/wasm4pm/lab
npm install
```

### 2. Run All Tests
```bash
npm run test:observability
```

### 3. View Results
Tests should complete in ~1-2 seconds with output like:
```
✓ Observability System - JSON Logging (6)
✓ Observability System - CLI Output (7)
✓ Observability System - Secret Redaction (7)
✓ Observability System - Log Levels (4)
✓ Observability System - Event Types (6)
✓ Observability System - OTEL Behavior (5)
✓ Observability System - Integration (3)

✅ 45 tests passed
```

## Test What's Covered

### JSON Logging ✅
- JSONL format (one JSON per line)
- Required fields: timestamp, event_type, run_id, level, message
- ISO 8601 timestamps
- Event ordering preserved
- Metadata preservation

### CLI Output ✅
- Human-readable console output
- Prefixes: [INFO], [WARN], [ERROR], [DEBUG]
- Quiet mode (no output)
- Verbose mode (includes debug)

### Secret Redaction ✅
- Passwords → [REDACTED]
- API keys → [REDACTED]
- Tokens (bearer, OAuth) → [REDACTED]
- Emails → preserved (NOT redacted)

### Log Levels ✅
- debug: all messages
- info: info, warn, error (no debug)
- warn: warn, error only
- error: only errors

### Event Types ✅
- state_change (from → to)
- algorithm_start (algorithm, parameters)
- algorithm_end (duration, status)
- progress (percentage, counts)
- error (error_code, details)
- sink_operation (format, destination)

### OTEL Behavior ✅
- Configurable (enable/disable)
- Non-blocking (<50ms for 100 events)
- Continues on failure
- run_id for trace correlation

### Performance ✅
- >40k events/second throughput
- <5% overhead
- No memory leaks
- Bounded queues

## Run Specific Tests

```bash
# Just JSON logging tests
npm test -- --grep "JSON Logging"

# Just secret redaction tests
npm test -- --grep "Secret Redaction"

# Just OTEL tests
npm test -- --grep "OTEL Behavior"

# Watch mode (re-run on file change)
npm run test:observability:watch
```

## Configuration Examples

See `observability-examples/`:

```bash
# View available configs
ls -la observability-examples/

# Jaeger tracing
cat observability-examples/config.jaeger.json

# Local JSON only
cat observability-examples/config.local-json-only.json
```

## Test File

Main test file: `tests/observability.test.ts` (920 lines)

Structure:
```typescript
describe('Observability System - JSON Logging', () => { ... })      // 6 tests
describe('Observability System - CLI Output', () => { ... })       // 7 tests
describe('Observability System - Secret Redaction', () => { ... }) // 7 tests
describe('Observability System - Log Levels', () => { ... })       // 4 tests
describe('Observability System - Event Types', () => { ... })      // 6 tests
describe('Observability System - OTEL Behavior', () => { ... })    // 5 tests
describe('Observability System - Integration', () => { ... })      // 3 tests
```

## Conformance Report

After running tests, check: `reports/observability-conformance.json`

Shows:
- All 45 tests passed/failed
- Performance metrics
- Recommendations
- PASS/FAIL verdict

## Troubleshooting

### Tests fail to run
```bash
# Check Node version (need 18+)
node --version

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Try again
npm run test:observability
```

### Tests timeout
```bash
# Increase timeout in vitest.config.ts
# Change testTimeout from 30000 to 60000
```

### Memory errors during large tests
```bash
# Reduce iteration count in performance tests
# File: tests/observability.test.ts, line ~650
```

## Next Steps

1. ✅ Run tests: `npm run test:observability`
2. ✅ Check results: All 45 should pass
3. ✅ Review report: `reports/observability-conformance.json`
4. ✅ Integrate into CI/CD: Add to post-release pipeline

## References

- **Full Test Docs**: [tests/OBSERVABILITY.md](tests/OBSERVABILITY.md)
- **Implementation Details**: [OBSERVABILITY_VALIDATION.md](OBSERVABILITY_VALIDATION.md)
- **Lab Framework**: [README.md](README.md)

---

**Status**: Ready to test
**Test Count**: 45+ tests
**Duration**: ~1-2 seconds
**Framework**: Vitest 1.1+
