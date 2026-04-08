# pictl CLI Testing Guide

This document describes how to test the pictl CLI scaffolding.

## Unit Tests

Run all tests:
```bash
npm test
```

Run in watch mode:
```bash
npm run test:watch
```

## Test Coverage

Tests verify:

### Command Structure (cli.test.ts)
- Main command metadata (name, version)
- All subcommands defined (run, watch, status, explain, init)
- Command metadata (name, description)
- Argument definitions for each command
- Argument defaults

### Exit Codes (exit-codes.test.ts)
- success = 0
- config_error = 1
- source_error = 2
- execution_error = 3
- partial_failure = 4
- system_error = 5
- Exit codes follow increasing severity

### Output Formatters (output.test.ts)
- HumanFormatter instantiation
- JSONFormatter instantiation
- StreamingOutput instantiation
- All formatter methods exist
- getFormatter returns correct type

## Manual Testing

### Build the CLI

```bash
npm run build
```

### Check Help Text

The CLI displays help when no command is provided:

```bash
node dist/bin.js
```

Expected output:
```
pictl v26.4.5
High-performance process mining and workflow discovery CLI

USAGE:
  pictl [COMMAND] [OPTIONS]

COMMANDS:
  run       Run process discovery on input event log
  watch     Watch for changes and re-run discovery automatically
  status    Show status of discovery operations and system health
  explain   Explain a discovered model or algorithm
  init      Initialize a new pictl project with configuration
```

### Test Individual Commands

Each command is a stub that shows the structure:

```bash
# run command
node dist/bin.js run --config test.json --input log.xes --format json

# watch command
node dist/bin.js watch --config test.json --format human

# status command
node dist/bin.js status --format json

# explain command
node dist/bin.js explain --algorithm genetic --format json

# init command
node dist/bin.js init --template basic --output ./test-project
```

## What Works Now

### Command Routing
- All 5 commands are recognized and routed
- Help text displays correctly
- Version shows as 26.4.5

### Output System
- Human-readable formatter with verbosity/quiet options
- JSON formatter for machine-readable output
- Streaming output handler for watch mode
- Formatter factory function

### Exit Codes
- All 6 exit codes defined
- Proper values for Unix conventions
- Used by command error handlers

### Argument Parsing
- All arguments properly typed
- Aliases available (where applicable)
- Defaults properly set
- Format and verbosity options on all commands

## What's Not Implemented Yet

These are deferred to next phase (engine integration):

- Actual algorithm execution (engine.run())
- File I/O for configuration
- Event log parsing
- Model generation and export
- File watching and change detection
- System status reporting
- Model explanation generation

## Testing Strategy

### Phase 1: Structure (Current)
- Command definitions
- Routing
- Help text
- Exit codes
- Output formatters
- Argument parsing

### Phase 2: Integration (Next)
- Wire to engine
- File I/O
- Configuration loading
- Algorithm execution
- Result formatting

### Phase 3: Polish (Future)
- Error messages
- Progress reporting
- Performance optimization
- Interactive mode

## Command Stubs

Each command has a stub `run()` function that:
1. Gets the appropriate formatter
2. Demonstrates using it
3. Returns a placeholder response
4. Exits with proper code on error

Example (run command):
```typescript
async run(ctx) {
  const formatter = getFormatter({
    format: ctx.args.format as 'human' | 'json',
    verbose: ctx.args.verbose,
    quiet: ctx.args.quiet,
  });

  try {
    // TODO: Wire to engine.run()
    formatter.success('Discovery initiated (engine integration pending)');
  } catch (error) {
    formatter.error(`Failed: ${error}`);
    process.exit(3); // execution_error
  }
}
```

## Verification Checklist

- [ ] All commands defined
- [ ] Help text shows all commands
- [ ] Version displays as 26.4.5
- [ ] Exit codes all defined (0-5)
- [ ] Output formats (human/json) selectable
- [ ] Verbose/quiet flags work
- [ ] Command stubs execute without errors
- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] No TypeScript errors

## Next Steps

1. Implement engine integration in Phase 2
2. Add file I/O for configuration
3. Wire algorithm execution
4. Enhance error messages
5. Add interactive features
