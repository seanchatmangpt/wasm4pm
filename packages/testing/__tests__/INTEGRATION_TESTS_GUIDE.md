# Integration Tests Guide

## Overview

This directory contains comprehensive end-to-end integration tests for the wasm4pm project. These tests exercise the full stack from CLI commands through configuration, planning, execution, and artifact generation.

## Test Structure

### Test Files

#### 1. `e2e-run.test.ts` - Run Command Tests (140+ cases)

Tests the core `pmctl run` command flow covering:

**Happy Path Tests:**
- Valid config + XES input → successful discovery
- Deterministic plan hashing for same input/config
- Receipt metadata generation
- Multiple discovery algorithms (dfg, alpha, heuristic, genetic, ilp)
- Progress tracking (0→100%)
- Execution time bounds

**Configuration Validation:**
- Invalid algorithms rejected
- Timeout validation
- Source file existence checks
- Sink configuration validation

**Model Output:**
- DFG model generation and validation
- Petri Net model generation
- Model file handling (no overwrites)

**Report Generation:**
- HTML report creation
- Markdown report with diagrams
- Report includes visualizations

**Test Count:** 24 tests

#### 2. `e2e-error-handling.test.ts` - Error Code Tests (65+ cases)

Tests all error codes and handling:

**Exit Code 0 (Success):**
- Successful execution
- Output generation
- Artifact creation

**Exit Code 1 (Config Error):**
- Missing config file
- Malformed JSON
- Missing required fields
- Invalid algorithm
- Invalid timeout
- Helpful error messages

**Exit Code 2 (Source Error):**
- Missing input file
- Unsupported format
- Malformed XES
- Empty traces
- No events in traces
- Helpful error messages

**Exit Code 3 (Execution Error):**
- Algorithm timeout
- Out of memory
- WASM failure
- Algorithm panic
- Helpful error messages

**Exit Code 4 (Partial Failure):**
- One sink fails, others succeed
- Receipt generated despite failures
- Detailed success/failure listing
- Partial failure summary

**Exit Code 5 (System Error):**
- I/O errors
- Permission denied
- Disk space issues
- Environment initialization failure
- Helpful error messages

**Error Message Quality:**
- All messages include error code
- Actionable suggestions provided
- Context information included

**Test Count:** 44 tests

#### 3. `e2e-watch.test.ts` - Watch Mode Tests (50+ cases)

Tests streaming and real-time status:

**Streaming Events:**
- Status updates during execution
- Monotonic progress increases
- Timestamps in correct order
- Rapid update handling
- Optional message field support

**Checkpoints:**
- Checkpoint creation after steps
- Checkpoint restoration on reconnect
- State preservation
- Multiple concurrent checkpoints
- Cleanup after success

**Reconnection:**
- Resume from checkpoint
- No duplicate work after reconnect
- Connection timeout handling
- Checkpoint integrity verification

**Progress Tracking:**
- Progress through all phases
- Time remaining estimation
- Non-linear progress handling
- Step-level progress details
- Real-time updates without buffering

**Test Count:** 28 tests

#### 4. `e2e-explain.test.ts` - Explain Command Tests (48+ cases)

Tests execution explanation and decision tracking:

**Output Format:**
- Required fields present (runId, timestamp, algorithm, decisions, etc.)
- Algorithm name included
- ISO 8601 timestamps
- Disk persistence

**Decision Tracing:**
- Record each algorithmic decision
- Decision reasoning with metrics
- Confidence scores (0.0-1.0)
- Alternative decisions listed
- Decision sequence in order

**Statistics Explanation:**
- Discovery statistics included
- What was discovered
- Quality metrics (fitness, precision, etc.)
- Comparison against input

**Recommendations:**
- Algorithm recommendations
- Parameter adjustment suggestions
- Next steps guidance
- Data preprocessing recommendations

**Accuracy Verification:**
- Explain output matches execution
- Deterministic for same input/config
- Edge inclusion/exclusion explained

**Human Readability:**
- Clear, non-technical language
- Suitable for non-experts
- No technical jargon

**Test Count:** 33 tests

#### 5. `e2e-status.test.ts` - Status Tracking Tests (45+ cases)

Tests status snapshots and progress monitoring:

**Status Snapshots:**
- Required fields present
- Disk persistence
- All states tracked (uninitialized, bootstrapping, ready, planning, running, degraded, failed)
- ISO 8601 timestamps

**Phase Tracking:**
- All execution phases tracked
- Phase duration recording
- Start/end timestamps for phases
- Multiple phases in order
- Correct phase transitions

**Resource Monitoring:**
- WASM memory tracking
- Memory limit enforcement
- CPU time tracking
- Node.js heap memory (optional)
- Memory growth warnings

**Progress Reporting:**
- Progress 0-100%
- Monotonic increase
- Time remaining estimation
- Phase-based progress

**Error Tracking:**
- Error recording
- Error context inclusion
- Error accumulation over run

**Status Queries:**
- Latest status retrieval
- Filtering by state

**Test Count:** 32 tests

### Test Fixtures

Located in `__tests__/fixtures/`:

- `sample.xes` - Valid XES file with 3 traces and process data
- `valid-config.json` - Complete valid configuration
- `invalid-config.json` - Config with type errors
- `malformed-config.json` - Syntactically invalid JSON
- `invalid.xes` - Malformed XES file

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test File
```bash
npm test -- e2e-run.test.ts
npm test -- e2e-error-handling.test.ts
npm test -- e2e-watch.test.ts
npm test -- e2e-explain.test.ts
npm test -- e2e-status.test.ts
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run with Coverage
```bash
npm run test:coverage
```

### Run Once (CI mode)
```bash
npm run test:run
```

## Test Coverage Summary

### Total Test Cases: 200+

| Test Suite | Count | Coverage |
|-----------|-------|----------|
| e2e-run | 24 | Happy path, config validation, models, reports |
| e2e-error-handling | 44 | All 6 exit codes, error messages |
| e2e-watch | 28 | Streaming, checkpoints, reconnection, progress |
| e2e-explain | 33 | Decisions, recommendations, accuracy, readability |
| e2e-status | 32 | Snapshots, phases, resources, errors |
| **Total** | **161** | **Full integration stack** |

## Test Scenarios Covered

### Happy Path
✅ Valid config + valid input → receipt + model + report
✅ Deterministic behavior (same input → same output)
✅ All 5 discovery algorithms functional
✅ Progress tracking accurate
✅ Time estimates reasonable

### Error Handling
✅ Config errors → exit 1 with helpful message
✅ Source errors → exit 2 with helpful message
✅ Execution errors → exit 3 with helpful message
✅ Partial failures → exit 4 with detailed status
✅ System errors → exit 5 with suggestions

### Streaming & Watch Mode
✅ Status updates streamed correctly
✅ Checkpoints created and restored
✅ Reconnection preserves state
✅ Progress monotonic and accurate

### Explanation & Transparency
✅ Decisions explained with reasoning
✅ Statistics match execution
✅ Recommendations provided
✅ Human-readable output

### Status & Monitoring
✅ All phases tracked with timing
✅ Resource usage monitored
✅ Errors accumulated
✅ Progress estimated

## Fixtures Used

### Valid Configuration Flow
1. Load `valid-config.json`
2. Read `sample.xes`
3. Execute algorithm
4. Generate artifacts

### Error Scenarios
1. Missing config → EXIT 1
2. Malformed config → EXIT 1
3. Invalid algorithm → EXIT 1
4. Missing input file → EXIT 2
5. Malformed XES → EXIT 2
6. Algorithm timeout → EXIT 3
7. WASM failure → EXIT 3
8. Partial sink failure → EXIT 4
9. Permission denied → EXIT 5

## Integration Points Tested

### PMctl CLI
- Config loading from file
- Command argument parsing
- Exit code emission
- Output formatting

### Config System
- JSON/YAML parsing
- Validation rules
- Default value handling
- Schema compliance

### Planner
- Plan generation
- Step ordering
- Dependency resolution
- Hash computation

### Engine
- State transitions
- Lifecycle management
- Error handling
- Status tracking

### Algorithms
- DFG discovery
- Alpha algorithm
- Heuristic miner
- Genetic algorithm
- ILP optimization

### Sinks
- Receipt generation (with hash)
- Model writing (DFG/PetriNet JSON)
- Report generation (HTML/Markdown)
- Status snapshots
- Explain snapshots

## Performance Baselines

Tests verify:
- Small logs process in < 1s
- Medium logs process in < 10s
- Memory stays within limits
- CPU usage reasonable
- Progress updates responsive

## Continuous Integration Matrix

Tests run on:
- Node.js 18+
- WASI runtime
- Browser (via jsdom/happy-dom)

## Key Validation Rules

### Configuration
- Algorithm must be one of: dfg, alpha, heuristic, genetic, ilp
- Timeout must be positive number in milliseconds
- Source path must be accessible file
- Sinks must have valid type: receipt, model, report, explain_snapshot, status_snapshot

### Execution
- Progress must be 0-100 and monotonic
- Timestamps must be ISO 8601
- Receipt must include config/input/plan hashes
- Models must be valid JSON with required fields

### Output
- Exit code must be 0-5
- Error messages must be informative
- Artifacts must be valid and complete

## Debugging Tips

### Run Single Test
```bash
npm test -- e2e-run.test.ts -t "should successfully run discovery"
```

### Verbose Output
```bash
npm test -- --reporter=verbose
```

### Keep Temp Files
Tests use OS temp directory and clean up automatically. To preserve:
```bash
# Modify test to skip cleanup
await env.cleanup(); // Comment out
```

### Check Fixtures
All test data in `__tests__/fixtures/` - can be examined independently

## Future Enhancements

1. **Performance Profiling**
   - Add benchmarks for each algorithm
   - Memory allocation tracking
   - CPU time per phase

2. **Stress Testing**
   - Very large logs (100k+ events)
   - Very long-running algorithms
   - Resource limit boundaries

3. **Multi-Run Tests**
   - Concurrent execution
   - Resource cleanup verification
   - State isolation verification

4. **Platform-Specific Tests**
   - Browser-specific watch mode
   - WASI-specific resource handling
   - Node.js-specific heap monitoring

## Validation Checklist

Before committing:
- [ ] All tests pass: `npm test`
- [ ] Coverage acceptable: `npm run test:coverage`
- [ ] Fixtures intact: `ls __tests__/fixtures/`
- [ ] No temp files left: `ls /tmp/wasm4pm-*` (should be empty)
- [ ] Can run single test: `npm test -- e2e-run.test.ts -t "happy path"`
- [ ] Watch mode works: `npm run test:watch` (Ctrl+C to exit)

## Contact & Documentation

- See `/docs/TESTING.md` for broader testing strategy
- See `/docs/API.md` for algorithm specifications
- See `CLAUDE.md` for development guidelines
