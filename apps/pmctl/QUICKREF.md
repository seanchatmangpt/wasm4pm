# pmctl CLI - Quick Reference

## Build & Test

```bash
# Build
npm run build

# Watch mode development
npm run dev

# Run tests
npm test

# Watch tests
npm run test:watch

# Clean
npm run clean
```

## Commands

### run - Discover process model
```bash
pmctl run --config pmctl.json --input log.xes --output model.json
pmctl run -c config.json -a genetic -i log.xes -o result.json
pmctl run --config pmctl.json --format json --verbose
```

**Args:** config, algorithm, input, output, format, verbose, quiet

### watch - Auto-rerun on changes
```bash
pmctl watch --config pmctl.json --interval 1000
pmctl watch -c pmctl.json --format json
```

**Args:** config, interval, format, verbose, quiet

### status - Show system status
```bash
pmctl status
pmctl status --format json --verbose
```

**Args:** format, verbose, quiet

### explain - Explain model/algorithm
```bash
pmctl explain --algorithm genetic
pmctl explain --model model.json --level detailed
pmctl explain --algorithm alpha --format json
```

**Args:** model, algorithm, level, format, verbose, quiet

### init - Create new project
```bash
pmctl init --template basic --output ./my-project
pmctl init -t advanced -o ./project --force
```

**Args:** template, output, force, format, verbose, quiet

## Output Formats

### Human (default)
```
✔ Discovery completed
Process model discovered with 5 activities
Memory usage: 12.4 MB
```

### JSON
```json
{
  "status": "success",
  "message": "Discovery completed",
  "model": { ... }
}
```

## Exit Codes

```
0 - Success
1 - Config error (missing/invalid config file)
2 - Source error (bad input data)
3 - Execution error (algorithm failure)
4 - Partial failure (some operations failed)
5 - System error (I/O, permission, etc)
```

## File Structure

```
src/
├── bin.ts              # Entry point (#!/usr/bin/env node)
├── cli.ts              # Main CLI router
├── index.ts            # Public API
├── exit-codes.ts       # Exit code constants
├── output.ts           # Formatters (human/json/streaming)
└── commands/
    ├── run.ts          # run command
    ├── watch.ts        # watch command
    ├── status.ts       # status command
    ├── explain.ts      # explain command
    └── init.ts         # init command

dist/                   # Compiled JavaScript
__tests__/              # Test suite
```

## Key Classes

### HumanFormatter
```typescript
const fmt = new HumanFormatter({ verbose: true, quiet: false });
fmt.success('Done');
fmt.info('Info message');
fmt.warn('Warning');
fmt.error('Error');
fmt.debug('Debug (verbose only)');
```

### JSONFormatter
```typescript
const fmt = new JSONFormatter();
fmt.success('Done', { data: value });
fmt.error('Error', error);
```

### StreamingOutput
```typescript
const stream = new StreamingOutput({ format: 'json' });
stream.startStream();
stream.emitEvent('change', { file: path });
stream.endStream();
```

## Exit Code Usage

```typescript
try {
  // do work
  formatter.success('Success');
} catch (error) {
  formatter.error(`Failed: ${error.message}`);
  process.exit(3); // execution_error
}
```

## Common Patterns

### Get formatter based on args
```typescript
const formatter = getFormatter({
  format: ctx.args.format as 'human' | 'json',
  verbose: ctx.args.verbose,
  quiet: ctx.args.quiet,
});
```

### Parse string args as numbers
```typescript
const timeout = ctx.args.timeout ? parseInt(ctx.args.timeout, 10) : 5000;
```

### Type formatter instance check
```typescript
if (formatter instanceof JSONFormatter) {
  // JSON-specific code
} else {
  // Human formatter code
}
```

## TODO for Phase 2

In each command's `async run()` function:
```typescript
// TODO: Wire to engine.run() when engine is implemented
```

Find all TODOs:
```bash
grep -r "TODO" src/
```

## Package Info

- **Name:** @wasm4pm/pmctl
- **Version:** 26.4.5
- **Type:** ESM (module)
- **Node:** 18.0.0+
- **Main:** dist/index.js
- **Bin:** dist/bin.js → pmctl

## Testing

### Run all tests
```bash
npm test
```

### Run specific test
```bash
npm test -- cli.test.ts
```

### Coverage
```bash
npm test -- --coverage
```

## Dependencies

### Runtime
- citty@^0.1.6 - CLI routing
- consola@^3.2.3 - Terminal output

### Dev
- typescript@^5.3.3 - Type safety
- vitest@^1.1.0 - Testing
- @types/node@^20.10.0 - Node types

## Tips

1. **Enable verbosity:** Add `-v` or `--verbose` to any command
2. **Suppress output:** Add `-q` or `--quiet` to any command
3. **JSON output:** Add `--format json` for scripting
4. **Help text:** Run command without args (or `pmctl --help` when integrated)
5. **Watch mode:** Good for development, auto-reruns on input changes

## Troubleshooting

**Module not found:**
```bash
npm run build
```

**TypeScript errors:**
```bash
npx tsc --noEmit
```

**Type definitions missing:**
```bash
npm install --save-dev @types/node
```

**Test failures:**
- Check test file includes correct imports
- Verify vitest is installed
- Run `npm test -- --reporter=verbose`

## Documentation

- **README.md** - User guide
- **ARCHITECTURE.md** - Technical details
- **TESTING.md** - Test guide
- **CHECKLIST.md** - Verification status
- **IMPLEMENTATION_SUMMARY.md** - Build details

---

**Version:** 26.4.5
**Status:** Scaffolding Complete
**Phase:** Ready for Engine Integration
