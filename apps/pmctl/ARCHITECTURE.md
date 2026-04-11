# pictl CLI Architecture

## Overview

pictl is a modular CLI tool built with:
- **citty** - Command routing and argument parsing
- **consola** - Human-friendly terminal output
- **TypeScript** - Type-safe implementation

**Version:** 26.4.10 | **Total Commands:** 19

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
│       ├── init.ts         # Project initialization command
│       ├── predict.ts      # Predictive mining (6 perspectives)
│       ├── drift-watch.ts  # Real-time EWMA drift monitoring
│       ├── doctor.ts       # Environment diagnostic (17 checks)
│       ├── diff.ts         # Compare two event logs
│       ├── results.ts      # Browse saved results
│       ├── compare.ts      # Side-by-side algorithm comparison
│       ├── ml.ts           # ML-powered analysis (6 tasks)
│       ├── powl.ts         # POWL model analysis
│       ├── conformance.ts  # Log-to-model fitness and precision
│       ├── simulate.ts     # Monte Carlo simulation
│       ├── social.ts       # Social network mining
│       ├── temporal.ts     # Temporal profiles and performance
│       ├── quality.ts      # Multi-dimensional quality assessment
│       └── validate.ts     # Log schema and data quality validation
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
  meta: { name: 'pictl', version: '26.4.10' },
  subCommands: {
    // Discovery (3)
    run,      // Discovery execution
    compare,  // Side-by-side algorithm comparison
    diff,     // Compare two event logs

    // Prediction (1 - with 6 sub-tasks)
    predict,  // Predictive mining (next-activity, remaining-time, outcome, drift, features, resource)

    // Conformance & Quality (3)
    conformance,  // Log-to-model fitness and precision
    quality,      // Multi-dimensional quality assessment
    validate,     // Log schema and data quality validation

    // Analysis & Simulation (3)
    temporal,   // Temporal profiles and performance patterns
    social,     // Social network mining (handover, working together)
    simulate,   // Monte Carlo simulation and process tree playout

    // Monitoring (1)
    driftWatch, // Real-time EWMA drift monitoring

    // ML Analysis (1 - with 6 sub-tasks)
    ml,        // ML-powered analysis (classify, cluster, forecast, anomaly, regress, PCA)

    // POWL (1 - with sub-commands)
    powl,      // Process-Oriented Workflow Language analysis

    // Results & Health (4)
    results,   // Browse saved results
    doctor,    // 17-check environment diagnostic
    status,    // WASM module status and memory usage
    watch,     // Config file watcher

    // Setup (2)
    init,      // Scaffold pictl.toml + .env.example
    explain,   // Human/academic algorithm explanations
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

- **CLI Version**: 26.4.10
- **Node Version**: 18.0.0+
- **TypeScript**: 5.3+

## Complete Command Reference

### Discovery Commands (3)

| Command | Description | Exit Codes |
|---------|-------------|------------|
| `pictl run <log.xes>` | Process discovery with configurable algorithm | 0=success, 1=config, 2=source, 3=execution |
| `pictl compare <algos> -i <log>` | Side-by-side algorithm comparison with ASCII sparklines | 0=success, 1=config, 2=source |
| `pictl diff <log1> <log2>` | Compare two event logs (activities, edges, Jaccard) | 0=success, 1=config, 2=source |

### Prediction Commands (1 with 6 perspectives)

| Command | Description | Exit Codes |
|---------|-------------|------------|
| `pictl predict next-activity -i <log> --prefix "A,B"` | Predict next activity from trace prefix | 0=success, 1=config, 2=source, 3=execution |
| `pictl predict remaining-time -i <log> --prefix "A"` | Predict remaining case duration | 0=success, 1=config, 2=source, 3=execution |
| `pictl predict outcome -i <log>` | Predict case outcome (classification) | 0=success, 1=config, 2=source, 3=execution |
| `pictl predict drift -i <log>` | Detect concept drift in process behavior | 0=success, 1=config, 2=source, 3=execution |
| `pictl predict features -i <log>` | Extract features for ML pipeline | 0=success, 1=config, 2=source, 3=execution |
| `pictl predict resource -i <log>` | Predict resource allocation/intervention | 0=success, 1=config, 2=source, 3=execution |

### Conformance & Quality Commands (3)

| Command | Description | Exit Codes |
|---------|-------------|------------|
| `pictl conformance -i <log>` | Measure log-to-model fitness and precision | 0=success, 1=config, 2=source, 3=execution |
| `pictl quality -i <log>` | Multi-dimensional quality (fitness, precision, generalization, simplicity) | 0=success, 1=config, 2=source, 3=execution |
| `pictl validate <log.xes>` | Validate log schema, required attributes, data quality | 0=valid, 1=invalid |

### Analysis & Simulation Commands (3)

| Command | Description | Exit Codes |
|---------|-------------|------------|
| `pictl temporal -i <log>` | Analyze temporal profiles and performance patterns | 0=success, 1=config, 2=source, 3=execution |
| `pictl social -i <log>` | Mine social networks (handover, working together) | 0=success, 1=config, 2=source, 3=execution |
| `pictl simulate -i <log>` | Monte Carlo simulation and process tree playout | 0=success, 1=config, 2=source, 3=execution |

### Monitoring Commands (1)

| Command | Description | Exit Codes |
|---------|-------------|------------|
| `pictl drift-watch -i <log>` | Live EWMA concept drift monitor (Ctrl+C to stop) | 0=success, 1=config, 2=source, 130=SIGINT |

### ML Analysis Commands (1 with 6 tasks)

| Command | Description | Exit Codes |
|---------|-------------|------------|
| `pictl ml classify -i <log>` | Classify traces (knn, logistic_regression) | 0=success, 1=config, 2=source, 3=execution |
| `pictl ml cluster -i <log>` | Cluster traces (kmeans, dbscan) | 0=success, 1=config, 2=source, 3=execution |
| `pictl ml forecast -i <log>` | Forecast drift trends | 0=success, 1=config, 2=source, 3=execution |
| `pictl ml anomaly -i <log>` | Detect anomalies in drift signal | 0=success, 1=config, 2=source, 3=execution |
| `pictl ml regress -i <log>` | Regress remaining time prediction | 0=success, 1=config, 2=source, 3=execution |
| `pictl ml pca -i <log>` | PCA dimensionality reduction | 0=success, 1=config, 2=source, 3=execution |

### POWL Commands (1 with sub-commands)

| Command | Description | Exit Codes |
|---------|-------------|------------|
| `pictl powl construct -i <log>` | Construct POWL model from event log | 0=success, 1=config, 2=source, 3=execution |
| `pictl powl replay -i <log>` | Replay log against POWL model | 0=success, 1=config, 2=source, 3=execution |

### Results & Health Commands (4)

| Command | Description | Exit Codes |
|---------|-------------|------------|
| `pictl results` | View all saved discovery & prediction results | 0=success, 1=no_results |
| `pictl results --last` | Print the most recent result | 0=success, 1=no_results |
| `pictl doctor` | 17-check environment diagnostic | 0=all_ok, 1=some_failed |
| `pictl status` | WASM module status and memory usage | 0=success |

### Setup Commands (2)

| Command | Description | Exit Codes |
|---------|-------------|------------|
| `pictl init` | Scaffold pictl.toml + .env.example in current dir | 0=success, 1=exists |
| `pictl watch` | Config file watcher — re-run on change | 0=success, 1=config, 130=SIGINT |
| `pictl explain [algorithm]` | Human/academic algorithm explanations | 0=success |

## Algorithm Registry (21 algorithms)

| ID | Name | Speed | Quality | Output |
|----|------|-------:|--------:|--------|
| `dfg` | Directly-Follows Graph | 5 | 30 | DFG |
| `process_skeleton` | Process Skeleton | 3 | 25 | DFG |
| `alpha_plus_plus` | Alpha++ | 20 | 45 | PetriNet |
| `heuristic_miner` | Heuristic Miner | 25 | 50 | DFG |
| `inductive_miner` | Inductive Miner | 30 | 55 | ProcessTree |
| `hill_climbing` | Hill Climbing | 40 | 55 | PetriNet |
| `simulated_annealing` | Simulated Annealing | 55 | 65 | PetriNet |
| `declare` | DECLARE | 35 | 50 | DeclareModel |
| `a_star` | A* Search | 60 | 70 | PetriNet |
| `aco` | Ant Colony Optimization | 65 | 75 | PetriNet |
| `pso` | Particle Swarm Optimization | 70 | 75 | PetriNet |
| `genetic_algorithm` | Genetic Algorithm | 75 | 80 | PetriNet |
| `optimized_dfg` | Optimized DFG | 70 | 85 | DFG |
| `ilp` | Integer Linear Programming | 80 | 90 | PetriNet |

### ML Analysis Algorithms (6)

| ID | Name | Type | Output |
|----|------|------|--------|
| `ml_classify` | Classification | knn, logistic_regression | ClassificationResult |
| `ml_cluster` | Clustering | kmeans, dbscan | ClusteringResult |
| `ml_forecast` | Forecasting | linear_regression | ForecastResult |
| `ml_anomaly` | Anomaly Detection | statistical | AnomalyResult |
| `ml_regress` | Regression | linear_regression | RegressionResult |
| `ml_pca` | PCA | eigendecomposition | PCAResult |
