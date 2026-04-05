# Performance Tests - Quick Start

## 5-Minute Setup

### 1. Install Dependencies
```bash
cd lab
npm install
```

### 2. Run Performance Tests
```bash
npm run test:performance
```

### 3. View Results
```bash
npm run report
open reports/performance-charts.html
```

## Test Commands

| Command | Purpose |
|---------|---------|
| `npm test` | Run all tests (conformance + performance) |
| `npm run test:performance` | Run only performance tests |
| `npm run test:performance:watch` | Watch mode for performance tests |
| `npm run validate` | Full artifact validation (installs from npm) |
| `npm run validate:verbose` | Validation with detailed logging |
| `npm run report` | Generate HTML and JSON reports |

## What Gets Tested

### Small Logs (100-1K events)
- All profiles: fast, balanced, quality
- Latency: <1000ms
- Consistency: ±10% variance
- No spikes

### Medium Logs (10K-100K events)
- Latency: <5000ms (10K), <30000ms (100K)
- Memory: reasonable bounds
- No out-of-memory errors

### Scaling
- Linear O(n) detection
- Not super-linear growth
- Growth factors correct

### Profiles
- Ordering: fast ≤ balanced ≤ quality
- Memory hierarchy maintained

### Algorithms
- DFG fastest
- Genetic slowest but best quality
- ILP completes within timeout
- A* stays in bounds

### Stress Cases
- Deep traces (1000+ events per trace)
- Wide logs (10K+ activities)
- High diversity
- No crashes

### Memory
- Grows with input
- Linear not quadratic
- Properly released

### Repeatability
- Consistent results (±10%)
- No degradation over time
- Runs don't interfere

## Understanding Results

### Test Output
```
✓ Small Log (100 events) - fast profile (< 1000ms)
✓ Scaling Analysis (O(n) detection)
✓ Profile Tiers - Latency Ordering
✗ Some Test (FAILED)
  Latency: 1500ms, Expected: <1000ms
```

### Reports

**HTML Report** (`reports/performance-charts.html`)
- Summary cards (pass/fail counts)
- Latency distribution chart
- Category breakdown
- Detailed test results
- Performance metrics

**JSON Report** (`reports/performance-conformance.json`)
- Artifact metadata
- Test details
- Performance metrics
- Regression indicators

## Common Issues

### Tests Timeout
```bash
# Increase timeout in vitest.config.ts
testTimeout: 120000  # 120 seconds
```

### Module Not Found
```bash
# Ensure dependencies are installed
npm install

# Force reinstall
rm -rf node_modules package-lock.json
npm install
```

## Example Commands

```bash
# Run all performance tests
npm run test:performance

# Run specific test category
vitest run tests/performance.test.ts -t "Small Log"

# Watch mode for development
npm run test:performance:watch

# Generate report from existing results
npm run report

# Verbose validation
npm run validate:verbose
```

## File Structure

```
lab/
├── tests/
│   ├── performance.test.ts          # Main test suite (38+ tests)
│   ├── performance-fixtures.ts      # Log generators
│   ├── performance-reporter.ts      # Report generation
│   ├── validate.ts                  # Test orchestration
│   ├── generate-report.ts           # Report CLI
│   └── README.md                    # Test documentation
├── fixtures/
│   ├── expected-results.json        # Baseline (regression detection)
│   └── performance-logs/            # Generated test logs
├── reports/                         # Generated at test time
│   ├── performance-charts.html      # Interactive visualization
│   └── performance-conformance.json # Metrics report
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── QUICKSTART.md                    # This file
```

## Test Categories (38+ tests)

| Category | Tests | Focus |
|----------|-------|-------|
| Small Logs | 6 | 100-1K events, <1000ms |
| Medium Logs | 5 | 10K-100K events, reasonable bounds |
| Scaling | 3 | O(n) detection, complexity |
| Profiles | 3 | fast ≤ balanced ≤ quality ordering |
| Algorithms | 5 | DFG, Genetic, ILP, A*, Alpha++ |
| Stress | 5 | Deep, wide, diverse, 1M events |
| Memory | 4 | Bounds, growth, release |
| Repeatability | 4 | Consistency, no degradation |
| Edge Cases | 3 | Minimum logs, patterns |

## Next Steps

1. **Review Results**: Open HTML report to see visualizations
2. **Check Metrics**: Review JSON report for detailed metrics
3. **Regression Detection**: Compare to baseline results
4. **CI/CD Integration**: Add to GitHub Actions workflow
5. **Continuous Monitoring**: Run nightly for trend analysis

## Documentation

- **Complete Guide**: `tests/README.md`
- **Implementation**: `PERFORMANCE_TESTS.md`
- **Lab Overview**: `README.md`
- **API Reference**: `../docs/API.md`
- **Performance Guide**: `../docs/PERFORMANCE.md`

---

**Version**: 1.0.0  
**Last Updated**: April 5, 2026  
**Status**: Ready to Use
