# @wasm4pm/config Quick Start

## Installation & Setup

```bash
cd /Users/sac/wasm4pm/packages/config

# Install dependencies
npm install

# Build the module
npm run build

# Run all tests
npm test
```

## Basic Usage

### Load Configuration

```typescript
import { loadConfig } from '@wasm4pm/config';

// Load with defaults
const config = await loadConfig();

// Load with CLI overrides
const config = await loadConfig({
  cliOverrides: {
    profile: 'quality',
    outputFormat: 'json'
  }
});

console.log(config.execution.profile);        // 'quality'
console.log(config.metadata.hash);            // BLAKE3 hash
console.log(config.metadata.provenance);      // Provenance tracking
```

### Create Configuration Files

**TOML** (`./wasm4pm.toml`):
```toml
[execution]
profile = "balanced"
timeout = 300000

[output]
format = "human"
destination = "stdout"
```

**JSON** (`./wasm4pm.json`):
```json
{
  "execution": {
    "profile": "balanced",
    "timeout": 300000
  },
  "output": {
    "format": "human",
    "destination": "stdout"
  }
}
```

### Environment Variables

```bash
WASM4PM_PROFILE=quality
WASM4PM_LOG_LEVEL=debug
WASM4PM_OUTPUT_FORMAT=json
WASM4PM_WATCH=true
```

## Common Tasks

### Validate Configuration

```typescript
import { validate } from '@wasm4pm/config';

try {
  const valid = validate(config);
  console.log('Config is valid');
} catch (error) {
  console.error(error.message);
}
```

### Compute Config Hash

```typescript
import { hashConfig, fingerprintConfig } from '@wasm4pm/config';

const hash = hashConfig(config);              // Full hash
const fingerprint = fingerprintConfig(config); // 8-char fingerprint

console.log(`Config: ${fingerprint}`);
```

### Compare Configs

```typescript
import { diffConfigs } from '@wasm4pm/config';

const diff = diffConfigs(oldConfig, newConfig);

if (diff.changed) {
  console.log('Config changed:');
  for (const change of diff.differences) {
    console.log(`  ${change.path}: ${change.before} → ${change.after}`);
  }
}
```

## Configuration Options

### Execution Profile
- `'fast'` - Minimal processing
- `'balanced'` - Default, balanced
- `'quality'` - Maximum accuracy
- `'stream'` - Streaming/incremental

### Log Levels
- `'debug'` - Verbose
- `'info'` - Normal (default)
- `'warn'` - Warnings only
- `'error'` - Errors only

### Output Formats
- `'human'` - Pretty-printed (default)
- `'json'` - Machine-readable

## Running Tests

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --grep "config loading"

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

## API Reference

### loadConfig(options?)
Load configuration from multiple sources.

```typescript
const config = await loadConfig({
  cliOverrides?: CliOverrides,
  configSearchPaths?: string[],
  env?: NodeJS.ProcessEnv
});
```

### validate(config)
Validate configuration against schema.

```typescript
const valid = validate(config);  // throws if invalid
```

### hashConfig(config)
Compute BLAKE3 hash.

```typescript
const hash = hashConfig(config);
```

### fingerprintConfig(config)
Generate 8-character fingerprint.

```typescript
const fp = fingerprintConfig(config);  // e.g., "a1b2c3d4"
```

### verifyConfigHash(config, hash)
Verify configuration integrity.

```typescript
const valid = verifyConfigHash(config, storedHash);
```

### diffConfigs(config1, config2)
Compare two configurations.

```typescript
const diff = diffConfigs(oldConfig, newConfig);
// {
//   changed: boolean,
//   hash1: string,
//   hash2: string,
//   differences: Array<{ path, before, after }>
// }
```

## Troubleshooting

### Tests fail after installation
```bash
# Clean and reinstall
rm -rf node_modules package-lock.json
npm install
npm test
```

### Type errors
```bash
# Check TypeScript
npm run lint

# Rebuild
npm run build
```

### Config not loading
```typescript
// Debug: check what files are found
import { loadConfig } from '@wasm4pm/config';

const config = await loadConfig({
  configSearchPaths: [process.cwd(), `${process.env.HOME}/.wasm4pm`]
});

console.log(config.source);  // Shows source kind and path
```

## Performance Notes

- Config loading: <1 second
- Hash computation: <1ms
- 1000 hashes: <1 second
- Memory efficient

## Supported Formats

- **TOML**: `./wasm4pm.toml` or `~/.wasm4pm/config.toml`
- **JSON**: `./wasm4pm.json` or `~/.wasm4pm/config.json`
- **Environment**: `WASM4PM_*` variables
- **CLI**: Direct overrides

## Resolution Priority

1. CLI arguments (highest)
2. TOML files
3. JSON files
4. Environment variables
5. Defaults (lowest)

## Next Steps

1. Review `README.md` for detailed documentation
2. Check `IMPLEMENTATION.md` for technical details
3. See `TESTING.md` for comprehensive test guide
4. Review `CHECKLIST.md` for requirements validation

## Support

- **Documentation**: See README.md, IMPLEMENTATION.md, TESTING.md
- **Examples**: Check test files in `src/__tests__/`
- **Schema**: Use `getSchemaDescription()` for reference
- **Example Config**: Call `getExampleTomlConfig()` or `getExampleJsonConfig()`

---

**Ready to integrate with CLI and Engine packages!**
