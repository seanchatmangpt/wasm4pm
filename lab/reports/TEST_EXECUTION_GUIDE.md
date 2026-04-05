# CLI Validation Test Execution Guide

## Test Suite Overview

This document describes how to execute the CLI validation test suite and interpret results.

## Quick Execution

```bash
# From lab directory
npm test

# Or from project root
npm --prefix lab test
```

## Test Breakdown

### 1. Command Existence & Help (7 tests)
**File**: `tests/cli.test.ts` - `describe('pmctl CLI - Command Existence & Help')`

Tests that verify all CLI commands are discoverable:
- Help displays for all 5 commands
- Version information is available
- Command options are documented

**Expected Results**: All 7 tests PASS

### 2. Run Command (18 tests)
**File**: `tests/cli.test.ts` - `describe('pmctl CLI - Run Command')`

Comprehensive testing of the main discovery command:

**Valid Configuration** (4 tests)
- Config file acceptance
- Algorithm override
- Input file override
- Output path override

**Invalid Configuration** (3 tests)
- Syntax errors detected (exit 1)
- Missing required sections (exit 1)
- Unsupported algorithms (exit 1)

**File Handling** (3 tests)
- Config file not found (exit 2)
- Input file not found (exit 2)
- Output directory creation

**Output Formats** (3 tests)
- Human format output
- JSON format output
- Default format behavior

**Verbosity Options** (3 tests)
- Verbose flag support
- Quiet flag support
- Quiet suppression validation

**Expected Results**: All 18 tests PASS

### 3. Watch Command (4 tests)
**File**: `tests/cli.test.ts` - `describe('pmctl CLI - Watch Command')`

Testing file monitoring functionality:
- Command help display
- Config argument acceptance
- JSON format support
- Interval option support

**Expected Results**: All 4 tests PASS

### 4. Status Command (5 tests)
**File**: `tests/cli.test.ts` - `describe('pmctl CLI - Status Command')`

Testing execution status reporting:
- Basic status display
- JSON format output
- Human format output
- Verbose flag support
- JSON validation

**Expected Results**: All 5 tests PASS

### 5. Explain Command (5 tests)
**File**: `tests/cli.test.ts` - `describe('pmctl CLI - Explain Command')`

Testing algorithm explanation:
- Explain functionality
- JSON format support
- Algorithm option support
- Markdown output by default
- JSON output validation

**Expected Results**: All 5 tests PASS

### 6. Init Command (7 tests)
**File**: `tests/cli.test.ts` - `describe('pmctl CLI - Init Command')`

Testing project initialization:
- Project creation
- Config template generation
- .env.example creation
- Template option support
- Success exit codes
- TOML validation
- Config contents validation

**Expected Results**: All 7 tests PASS

### 7. Exit Codes (9 tests)
**File**: `tests/cli.test.ts` - `describe('pmctl CLI - Exit Codes')`

Verifying correct exit code semantics:

**Exit 0 - Success** (2 tests)
- Help commands
- Version command

**Exit 1 - Config Error** (3 tests)
- Invalid TOML syntax
- Unsupported algorithms
- Missing required sections

**Exit 2 - File Error** (2 tests)
- Config file not found
- Input file not found

**Exit 3 - Execution Error** (2 tests)
- Timeout scenarios
- Runtime failures

**Expected Results**: All 9 tests PASS

### 8. Configuration Resolution (5 tests)
**File**: `tests/cli.test.ts` - `describe('pmctl CLI - Configuration Resolution')`

Testing configuration loading:
- Load from specified path
- Search in working directory
- Environment variable substitution
- TOML format support
- JSON format support

**Expected Results**: All 5 tests PASS

### 9. Output Validation (4 tests)
**File**: `tests/cli.test.ts` - `describe('pmctl CLI - Output Validation')`

Testing output correctness:
- Output file creation
- JSON format validation
- Error message context
- File creation in paths

**Expected Results**: All 4 tests PASS

### 10. Integration Scenarios (3 tests)
**File**: `tests/cli.test.ts` - `describe('pmctl CLI - Integration Scenarios')`

End-to-end workflow testing:
- Init → Run workflow
- Rapid successive commands
- Consistent behavior

**Expected Results**: All 3 tests PASS

## Running Specific Test Categories

```bash
# Run only command existence tests
npm test -- -t "Command Existence"

# Run only run command tests
npm test -- -t "Run Command"

# Run only exit code tests
npm test -- -t "Exit Codes"

# Run only configuration tests
npm test -- -t "Configuration Resolution"

# Run watch command tests
npm test -- -t "Watch Command"

# Run status command tests
npm test -- -t "Status Command"

# Run explain command tests
npm test -- -t "Explain Command"

# Run init command tests
npm test -- -t "Init Command"

# Run integration tests
npm test -- -t "Integration Scenarios"
```

## Test Execution Modes

### Normal Mode (Default)
```bash
npm test
```
Runs all tests once with standard reporter.

### Watch Mode
```bash
npm run test:watch
```
Re-runs tests on file changes. Useful for development.

### Verbose Mode
```bash
npm run test:verbose
```
Shows detailed output for each test.

### UI Mode
```bash
npm run test:ui
```
Opens browser-based test dashboard.

### Coverage Mode
```bash
npm run test:coverage
```
Generates code coverage report.

## Expected Output Format

### Successful Test Run
```
✓ tests/cli.test.ts (63)
  ✓ pmctl CLI - Command Existence & Help (7)
    ✓ should display help with all commands (45ms)
    ✓ should display version (12ms)
    ...
  ✓ pmctl CLI - Run Command (18)
    ...
  ✓ pmctl CLI - Exit Codes (9)
    ...

Test Files  1 passed (1)
Tests  63 passed (63)
Duration  5234ms
```

### Failed Test Output
```
FAIL  tests/cli.test.ts > pmctl CLI - Run Command > should fail when config file does not exist
AssertionError: expected 1 to be 2

 ❯ tests/cli.test.ts:287:7
    285 |  const result = runPmctl(['run', '--config', '/nonexistent/path/config.toml']);
    286 |
    287 |  expect(result.exitCode).toBe(2);
```

## Interpreting Results

### All Tests Pass (63/63)
✅ The CLI fully conforms to specifications:
- All 5 commands work correctly
- Exit codes are correct
- Configuration handling is robust
- Output formats are valid
- Integration workflows succeed

### Partial Failures
⚠️ Investigation required:
1. Check which test category failed
2. Review the specific assertion
3. Run failing test in isolation: `npm test -- -t "Test Name"`
4. Check pmctl implementation for the reported issue
5. Fix the issue and re-run

### Exit Code Issues
Most common failure category. Check:
- Exit code mapping in `apps/pmctl/src/exit-codes.ts`
- Error handling in individual command files
- Configuration validation logic

## Troubleshooting

### "pmctl: command not found"
```bash
# Ensure CLI is installed globally
npm install -g @wasm4pm/pmctl

# Or rebuild locally
npm run build:cli
```

### Test Timeouts
Increase timeout in `vitest.config.ts`:
```ts
test: {
  testTimeout: 15000  // 15 seconds instead of 10
}
```

### Permission Errors
```bash
# Clear temp directories
rm -rf /tmp/pmctl-*

# Ensure /tmp is writable
chmod 755 /tmp
```

### JSON Parse Errors
Indicates output format issue. Run failing test with:
```bash
npm test -- -t "specific test name" --reporter=verbose
```

## Continuous Integration

### GitHub Actions Setup
```yaml
- name: Run CLI validation tests
  working-directory: lab
  run: |
    npm ci
    npm test
    
- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: test-results
    path: lab/reports/
```

### Pre-release Validation
```bash
#!/bin/bash
set -e

echo "Building CLI..."
npm run build:cli

echo "Running validation tests..."
npm test -w lab

echo "Generating conformance report..."
npm run test:coverage -w lab

echo "All validation passed!"
```

## Conformance Report Generation

After tests complete, check `reports/cli-conformance.json` for:
- Test count and pass rate
- Per-command status
- Exit code coverage
- Output format validation
- Configuration handling

## Performance Metrics

Typical test suite execution times:
- Full suite (63 tests): 5-10 seconds
- Command tests: <1 second per command
- File I/O tests: 1-2 seconds
- Integration tests: 2-3 seconds

## Success Criteria

All of the following must be true:
- ✅ 63/63 tests pass
- ✅ All exit codes correct (0/1/2/3/4/5)
- ✅ No timeouts or hangs
- ✅ Clean temporary file cleanup
- ✅ No permission errors
- ✅ JSON output valid when expected
- ✅ Config validation working
- ✅ Init command creates usable projects

## Next Steps

If all tests pass:
1. Review `cli-conformance.json` for full details
2. Check performance metrics
3. Run integration with main test suite
4. Generate release documentation
5. Deploy to production

## Support

For test failures or issues:
1. Run specific failing test in verbose mode
2. Check CLI implementation
3. Verify test environment setup
4. Review test logs for specific error messages
5. Contact maintainer with detailed error output
