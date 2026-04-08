# pictl CLI Architecture

## Overview

pictl is a modular CLI tool built with:
- **citty** - Command routing and argument parsing
- **consola** - Human-friendly terminal output
- **TypeScript** - Type-safe implementation

## Directory Structure

```
apps/pmctl/
├── src/
│   ├── bin.ts              # Entry point (#!/usr/bin/env node)
│   ├── cli.ts              # Main command definition
│   ├── index.ts            # Public API exports
│   ├── exit-codes.ts       # Exit code constants
│   ├── output.ts           # Output formatting system
│   └── commands/
│       ├── run.ts          # Discovery execution command
│       ├── watch.ts        # Watch mode command
│       ├── status.ts       # System status command
│       ├── explain.ts      # Model explanation command
│       └── init.ts         # Project initialization command
├── dist/                   # Compiled JavaScript
├── __tests__/
│   ├── cli.test.ts         # Command structure tests
│   ├── exit-codes.test.ts  # Exit code tests
│   └── output.test.ts      # Formatter tests
├── package.json            # npm manifest
├── tsconfig.json           # TypeScript configuration
└── README.md               # User documentation
```

## Command Architecture

### citty Structure

Each command uses citty's `defineCommand`:

```typescript
defineCommand({
  meta: {
    name: 'command-name',
    description: 'Human-readable description'
  },
  args: {
    arg_name: {
      type: 'string' | 'boolean',
      description: 'Argument help text'
    }
  },
  async run(ctx) {
    // ctx.args contains parsed arguments
    // Execute command logic
  }
})
```

### Command Registration

All commands registered in `cli.ts`:

```typescript
export const main = defineCommand({
  meta: { name: 'pictl', version: '26.4.5' },
  subCommands: {
    run,      // Discovery execution
    watch,    // File watching mode
    status,   // System status
    explain,  // Model explanation
    init,     // Project initialization
  }
})
```

### Command Invocation

```
pictl [COMMAND] [OPTIONS]
│      │         └─ Command-specific arguments
│      └─ Routed to corresponding defineCommand()
└─ Entry point (bin.ts) → runMain(cli.ts)
```

## Output System

### Three Output Handlers

#### HumanFormatter
- Terminal-friendly output
- Uses consola for colors and symbols
- Supports verbose/quiet modes
- Methods: success(), info(), warn(), error(), debug(), box(), log()

#### JSONFormatter
- Machine-readable JSON output
- No colors/formatting
- For programmatic consumption
- Methods: output(), success(), error(), warn()

#### StreamingOutput
- Event-based streaming
- For watch mode continuous output
- Emits typed events (initialized, watching, change, error)
- Methods: startStream(), emitEvent(), endStream()

### Formatter Factory

```typescript
getFormatter(options)
├─ format: 'json' → JSONFormatter
├─ format: 'human' → HumanFormatter
└─ default → HumanFormatter
```

## Exit Code System

```
EXIT_CODES = {
  success: 0,           // Normal completion
  config_error: 1,      // Config file issues
  source_error: 2,      // Input data issues
  execution_error: 3,   # Algorithm failure
  partial_failure: 4,   // Some operations failed
  system_error: 5       // I/O, permission, resources
}
```

Exit codes propagate to shell:
```bash
pictl run --config bad.json
# Returns: exit code 1 (config_error)

echo $?  # Prints: 1
```

## Data Flow

### Run Command Flow

```
User Input
    ↓
citty arg parsing
    ↓
run.ts handler
    ↓
getFormatter() → HumanFormatter | JSONFormatter
    ↓
[TODO: engine.run()]
    ↓
Format & output
    ↓
Exit with appropriate code
```

### Watch Command Flow

```
User Input
    ↓
citty arg parsing
    ↓
watch.ts handler
    ↓
StreamingOutput
    ↓
startStream()
    ↓
[TODO: File watcher setup]
    ↓
emitEvent() on each change
    ↓
Format & output
    ↓
Keep running until interrupt
```

## Type Safety

All commands are fully typed:

```typescript
export interface RunOptions extends OutputOptions {
  config?: string;
  algorithm?: string;
  input?: string;
  output?: string;
}

export const run = defineCommand({
  args: {
    config: { type: 'string' },
    // TypeScript ensures ctx.args.config is string | undefined
  }
})
```

## Integration Points

### Phase 2: Engine Integration

Connect commands to engine:

```typescript
// In run.ts
import { engine } from '@pictl/engine';

async run(ctx) {
  const config = loadConfigFile(ctx.args.config);
  const result = await engine.run(config);
  formatter.success('Model discovered', result);
}
```

### Phase 2: Configuration Loading

```typescript
// New: config-loader.ts
export function loadConfigFile(path: string): EngineConfig {
  const json = readFileSync(path, 'utf-8');
  return parseConfig(JSON.parse(json));
}
```

### Phase 3: File Watching

```typescript
// In watch.ts
import chokidar from 'chokidar';

const watcher = chokidar.watch(input);
watcher.on('change', () => {
  streaming.emitEvent('change', { file: path });
  // Re-run discovery
});
```

## Patterns & Conventions

### Error Handling Pattern

```typescript
try {
  // Do work
  formatter.success('Success message');
} catch (error) {
  formatter.error(`Error: ${error.message}`);
  process.exit(3); // execution_error
}
```

### Output Pattern

```typescript
const formatter = getFormatter(ctx.args as OutputOptions);

if (formatter instanceof JSONFormatter) {
  formatter.success('Message', { data: value });
} else {
  formatter.info('Message');
  formatter.log('Additional details');
}
```

### Argument Parsing Pattern

```typescript
// citty provides ctx.args with typed values
// All args are string | boolean | string[] (citty limitation)
// Parse as needed:

const timeout = ctx.args.timeout ? parseInt(ctx.args.timeout, 10) : 5000;
const isVerbose = Boolean(ctx.args.verbose);
```

## Testing Strategy

### Unit Tests
- Command definitions
- Exit codes
- Formatter instantiation
- Argument types

### Integration Tests (Phase 2)
- Engine integration
- File I/O
- Configuration loading
- Result formatting

### Manual Tests (Phase 3)
- End-to-end CLI flows
- Real event logs
- Performance benchmarks

## Performance Considerations

### Binary Size
- Type definitions excluded from dist
- No unused dependencies
- Tree-shakeable exports

### Startup Time
- Minimal CLI overhead
- Fast argument parsing
- Lazy loading of subcommands (citty feature)

### Memory
- Single formatter instance per command
- Streaming output for large result sets
- No in-process caching (defer to engine)

## Security Considerations

### File Access
- All file paths user-specified
- No path traversal protections (add in Phase 2)
- Consider sandboxing for untrusted configs

### Input Validation
- Config file format validation (Phase 2)
- Event log format validation (Phase 2)
- Algorithm parameter bounds checking (Phase 2)

### Error Messages
- Don't expose internal paths in output
- Don't leak sensitive configuration details
- Sanitize user input in error messages

## Future Enhancements

### Interactive Mode
```bash
pictl interactive
# Guided wizard for configuration
```

### Plugin System
```bash
pictl plugin install custom-algorithm
pictl run --algorithm custom-algorithm
```

### Streaming Results
```bash
pictl run --stream results.ndjson
# Outputs NDJSON for large result sets
```

### Debugging
```bash
pictl run --debug
# Verbose logging, performance metrics
```

## Dependencies

### Runtime
- **citty** (0.1.6) - CLI routing
- **consola** (3.2.3) - Terminal output

### Dev
- **typescript** (5.3.3) - Type safety
- **vitest** (1.1.0) - Testing
- **@types/node** (20.10.0) - Node types

### Deferred
- **@pictl/engine** - Algorithm execution (workspace:*)
- **chokidar** - File watching (Phase 2)
- **yaml** - YAML config support (Phase 2)

## Version

- **CLI Version**: 26.4.5
- **Node Version**: 18.0.0+
- **TypeScript**: 5.3+
