# Config Module Testing Guide

## Quick Start

```bash
cd /Users/sac/wasm4pm/packages/config

# Install dependencies
npm install

# Build the module
npm run build

# Run all tests
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## What's Tested

### Configuration Loading (config.test.ts)

**Priority Resolution**
- ✅ CLI overrides take precedence over all sources
- ✅ Environment variables override file config
- ✅ File config (TOML) overrides JSON
- ✅ File config (JSON) overrides environment
- ✅ Defaults apply when nothing else specified

**File Format Support**
- ✅ Load TOML files (`./wasm4pm.toml`)
- ✅ Load JSON files (`./wasm4pm.json`)
- ✅ TOML preferred over JSON when both exist
- ✅ Search paths: `./` and `~/.wasm4pm/`
- ✅ Invalid TOML syntax rejected with helpful error
- ✅ Invalid JSON syntax rejected with helpful error

**Environment Variables**
- ✅ `WASM4PM_PROFILE` → execution.profile
- ✅ `WASM4PM_LOG_LEVEL` → observability.logLevel
- ✅ `WASM4PM_WATCH` → watch.enabled (with boolean conversion)
- ✅ `WASM4PM_OUTPUT_FORMAT` → output.format
- ✅ `WASM4PM_OUTPUT_DESTINATION` → output.destination

**Provenance Tracking**
- ✅ Each value tracks its source (config/env/default/cli)
- ✅ File config includes file path in provenance
- ✅ All values have complete provenance records
- ✅ Provenance accessible in metadata

**Default Values**
- ✅ Sensible defaults for all required fields
- ✅ Default execution profile: 'balanced'
- ✅ Default log level: 'info'
- ✅ Default output format: 'human'

**Metadata**
- ✅ loadTime timestamp recorded
- ✅ BLAKE3 hash computed
- ✅ Provenance for each setting

### Configuration Validation (validate.test.ts)

**Enum Validation**
- ✅ Execution profiles: fast, balanced, quality, stream
- ✅ Log levels: debug, info, warn, error
- ✅ Output formats: human, json
- ✅ Source kinds: file, env, cli
- ✅ Rejects invalid enum values

**Numeric Validation**
- ✅ Timeout must be positive integer
- ✅ maxMemory must be positive integer
- ✅ Watch interval must be positive integer
- ✅ Watch debounce must be non-negative integer
- ✅ Rejects zero/negative invalid values

**Version Validation**
- ✅ Accepts semantic versioning (26.4.5)
- ✅ Rejects invalid version formats
- ✅ Rejects non-string versions

**Optional Fields**
- ✅ Observability section optional
- ✅ Watch section optional
- ✅ Output section optional
- ✅ OTEL config optional

**Error Messages**
- ✅ Clear error messages with field paths
- ✅ Remediation hints for common issues
- ✅ Helpful suggestions for valid values

### Configuration Hashing (hash.test.ts)

**Determinism**
- ✅ Same config produces same hash
- ✅ Order-independent hashing
- ✅ Consistent across serialization rounds
- ✅ 1000 hashes computed in < 1 second

**Hash Properties**
- ✅ Hex string output
- ✅ Consistent length
- ✅ Different for different configs
- ✅ Ignores source paths and timestamps

**Short Fingerprints**
- ✅ 8-character hex fingerprints
- ✅ Suitable for logging/UI
- ✅ Deterministic

**Config Comparison**
- ✅ Detects changes between configs
- ✅ Tracks before/after values
- ✅ Reports all differences
- ✅ Includes both hashes in diff

**Integrity Verification**
- ✅ Verify hash matches config
- ✅ Detect tampering/changes
- ✅ Usable for caching

### Integration Tests (integration.test.ts)

**Complete Workflows**
- ✅ Load → validate → hash → diff
- ✅ Multi-source resolution with correct priority
- ✅ Provenance tracking across all sources
- ✅ Migration from JSON to TOML
- ✅ Gradual config updates

**Real-World Scenarios**
- ✅ Development environment (debug logging, watch mode)
- ✅ Production environment (quality profile, JSON output)
- ✅ Containerized deployment (ENV vars, no config file)
- ✅ CI/CD validation (validation + hash + fingerprint)

**Error Handling**
- ✅ Recover from invalid TOML
- ✅ Recover from invalid JSON
- ✅ Reject invalid config values
- ✅ Clear error messages

**Example Configs**
- ✅ TOML example is valid and loadable
- ✅ JSON example is valid and loadable
- ✅ Examples follow documented schema

**Performance**
- ✅ Config loads in < 1 second
- ✅ 1000 hashes computed in < 1 second

## Test File Locations

```
src/__tests__/
├── config.test.ts      (config loading tests)
├── validate.test.ts    (validation tests)
├── hash.test.ts        (hashing tests)
└── integration.test.ts (end-to-end tests)
```

## Running Specific Tests

```bash
# Run only config loading tests
npm test config.test.ts

# Run only validation tests
npm test validate.test.ts

# Run only hash tests
npm test hash.test.ts

# Run only integration tests
npm test integration.test.ts

# Run tests matching a pattern
npm test -- --grep "resolution order"

# Run a single test
npm test -- --grep "should load default configuration"
```

## Coverage Goals

Target coverage:
- **Lines**: 95%+
- **Branches**: 90%+
- **Functions**: 95%+
- **Statements**: 95%+

Run coverage:
```bash
npm run test:coverage
```

## Test Statistics

- **Total Tests**: 150+
- **Configuration Loading**: 25+ tests
- **Validation**: 40+ tests
- **Hashing**: 35+ tests
- **Integration**: 50+ tests

## Debugging Tests

### Run with verbose output
```bash
npm test -- --reporter=verbose
```

### Run with detailed errors
```bash
npm test -- --reporter=tap
```

### Debug a specific test
```bash
node --inspect-brk node_modules/.bin/vitest run config.test.ts
```

## Example Test Cases

### Loading Config from TOML
```typescript
const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
const tomlContent = `
version = "26.4.5"
[execution]
profile = "fast"
timeout = 60000
`;
await fs.writeFile(tomlPath, tomlContent);

const config = await loadConfig({
  configSearchPaths: [tmpDir]
});

expect(config.execution.profile).toBe('fast');
expect(config.execution.timeout).toBe(60000);
```

### Validating Configuration
```typescript
import { validate } from '@wasm4pm/config';

const config = {
  version: '26.4.5',
  source: { kind: 'file' },
  execution: { profile: 'balanced' }
};

expect(() => validate(config)).not.toThrow();
```

### Computing Hashes
```typescript
import { hashConfig, fingerprintConfig } from '@wasm4pm/config';

const hash = hashConfig(config);        // Full hash
const fp = fingerprintConfig(config);   // 8-char fingerprint

expect(hash).toBeDefined();
expect(fp.length).toBe(8);
```

### Comparing Configs
```typescript
import { diffConfigs } from '@wasm4pm/config';

const diff = diffConfigs(config1, config2);
if (diff.changed) {
  console.log('Changed fields:');
  for (const change of diff.differences) {
    console.log(`  ${change.path}: ${change.before} → ${change.after}`);
  }
}
```

## Continuous Integration

To use in CI/CD:

```bash
# Run all tests with coverage
npm test -- --coverage

# Generate JUnit XML for CI
npm test -- --reporter=junit --outputFile=test-results.xml

# Run with specific environment
WASM4PM_PROFILE=quality npm test
```

## Known Limitations & TODOs

1. **Streaming Config**: Config hot-reload not implemented
   - Planned for future version

2. **JSON Schema Export**: Schema generation from Zod
   - Could be added with `@valibot/to-json-schema` equivalent

3. **Config Merge Strategies**: Only supports basic deep merge
   - Array merging could be enhanced

4. **Environment Variable Nesting**: Only top-level config vars
   - Nested vars (e.g., `WASM4PM_EXECUTION_PROFILE`) not supported

## Troubleshooting

### Tests timeout
Increase timeout in vitest.config.ts:
```typescript
export default defineConfig({
  test: {
    testTimeout: 10000
  }
});
```

### TOML parsing fails
Verify TOML syntax:
```bash
npm test -- --grep "invalid TOML"
```

### Hash mismatches
Ensure configs are normalized:
```typescript
import { hashConfig } from '@wasm4pm/config';

// These should produce same hash
const hash1 = hashConfig(config1);
const hash2 = hashConfig(JSON.parse(JSON.stringify(config1)));
expect(hash1).toBe(hash2);
```

## Next Steps

After passing all tests:

1. Integrate with `@wasm4pm/cli` package
2. Integrate with `@wasm4pm/engine` package
3. Add configuration hot-reload
4. Generate JSON Schema documentation
5. Add configuration migration utilities
