# @wasm4pm/pmctl - Professional CLI Tool

**Professional command-line interface for process mining discovery, analysis, and automation.**

Version: 26.4.5  
Status: Production Ready

---

## Features

- **init** - Bootstrap new projects with configuration templates
- **run** - Execute discovery algorithms with profile optimization
- **watch** - File system watcher for continuous processing
- **status** - Real-time system and engine status
- **explain** - Interactive algorithm and model explanation
- **Profile-based execution** - fast, balanced, quality, stream
- **Configuration support** - TOML, JSON, environment variables
- **Structured output** - Human-readable or JSON format
- **Exit codes** - For CI/CD scripting
- **Non-blocking design** - Efficient async operations

---

## Installation

### Global Installation
```bash
npm install -g @wasm4pm/pmctl
pmctl --version
```

### Local Installation
```bash
npm install @wasm4pm/pmctl
npx pmctl --help
```

### From Workspace
```bash
pnpm install
pnpm --filter @wasm4pm/pmctl build
node apps/pmctl/dist/bin.js --help
```

---

## Quick Start

### 1. Initialize Project
```bash
# Create configuration files
pmctl init

# With specific format
pmctl init --configFormat json

# Override existing files
pmctl init --force
```

Output:
```
✓ Created wasm4pm.toml
✓ Created .env.example
✓ Created .gitignore
✓ Created README.md

Next steps:
  1. Edit wasm4pm.toml with your preferences
  2. Run: pmctl run data/log.xes --profile balanced
  3. Check: pmctl status
```

### 2. Run Discovery
```bash
# Basic usage
pmctl run data/eventlog.xes

# With algorithm selection
pmctl run data/eventlog.xes --algorithm genetic

# With profile optimization
pmctl run data/eventlog.xes --profile quality

# Specify output file
pmctl run data/eventlog.xes --output result.json

# JSON output format
pmctl run data/eventlog.xes --format json > result.json
```

### 3. Watch Directory
```bash
# Watch for new files
pmctl watch data/ --output results/

# With specific profile
pmctl watch data/ --profile fast --output results/

# Verbose logging
pmctl watch data/ --verbose
```

### 4. Check Status
```bash
# Quick status
pmctl status

# Detailed status
pmctl status --verbose

# JSON output
pmctl status --format json
```

### 5. Get Explanations
```bash
# Explain an algorithm
pmctl explain --algorithm genetic

# Detailed explanation
pmctl explain --algorithm genetic --level detailed

# Academic details
pmctl explain --algorithm genetic --level academic

# Explain with current config
pmctl explain --config
```

---

## Commands

### pmctl init

Initialize a new wasm4pm project with configuration templates.

**Usage:**
```bash
pmctl init [OPTIONS]
```

**Options:**
```
--configFormat [toml|json]  Configuration format (default: toml)
--force                     Override existing files
--format [human|json]       Output format (default: human)
--verbose                   Show detailed messages
--help                      Show help text
```

**Output Files:**
- `wasm4pm.toml` - Main configuration file
- `.env.example` - Environment variables template
- `.gitignore` - Git ignore patterns
- `README.md` - Project documentation

**Example:**
```bash
pmctl init --configFormat toml --force
```

---

### pmctl run

Execute a discovery algorithm on event log(s).

**Usage:**
```bash
pmctl run <LOG_FILE> [OPTIONS]
```

**Arguments:**
- `<LOG_FILE>` - Path to event log (XES, JSON, or CSV)

**Options:**
```
--algorithm <ALG>       Algorithm to use (default: dfg)
--profile <PROFILE>     Execution profile: fast|balanced|quality|stream
--config <FILE>         Configuration file path
--output <FILE>         Output file path (default: stdout)
--format [human|json]   Output format (default: human)
--verbose               Show debug information
--help                  Show help text
```

**Available Algorithms:**
- `dfg` - Directly-Follows Graph (fastest)
- `alpha++` - Alpha++ Petri net
- `genetic` - Genetic algorithm (best quality)
- `pso` - Particle Swarm Optimization
- `astar` - A* Search
- `ilp` - ILP Optimization
- `declare` - DECLARE constraints
- `heuristic` - Heuristic Miner
- `inductive` - Inductive Miner
- `hill` - Hill Climbing
- `aco` - Ant Colony Optimization
- `annealing` - Simulated Annealing
- `skeleton` - Process Skeleton
- `dfg_optimized` - Optimized DFG

**Profiles:**
- `fast` - Real-time (~100ms, low memory)
- `balanced` - Production default
- `quality` - Offline analysis (best quality)
- `stream` - IoT/streaming data

**Example:**
```bash
pmctl run data/log.xes --algorithm genetic --profile quality --output model.json
```

---

### pmctl watch

Monitor a directory for new event logs and process them continuously.

**Usage:**
```bash
pmctl watch <DIRECTORY> [OPTIONS]
```

**Arguments:**
- `<DIRECTORY>` - Directory to watch for log files

**Options:**
```
--algorithm <ALG>       Algorithm to use (default: dfg)
--profile <PROFILE>     Execution profile
--output <DIR>          Output directory
--format [human|json]   Output format
--pattern <GLOB>        File pattern to match (default: *.xes)
--poll <MS>             Poll interval in ms (default: 5000)
--config <FILE>         Configuration file
--verbose               Show debug information
--help                  Show help text
```

**Behavior:**
- Watches for new files matching pattern
- Processes files in order (FIFO)
- Outputs results to specified directory
- Renames processed files with `.processed` suffix
- Non-blocking async processing

**Example:**
```bash
pmctl watch data/ \
  --algorithm alpha++ \
  --profile balanced \
  --output results/ \
  --pattern "*.xes"
```

---

### pmctl status

Show system status and engine information.

**Usage:**
```bash
pmctl status [OPTIONS]
```

**Options:**
```
--config <FILE>         Configuration file
--format [human|json]   Output format (default: human)
--verbose               Show detailed information
--help                  Show help text
```

**Output Includes:**
- Engine status (CREATED, RUNNING, COMPLETE, FAILED)
- System information (Node version, platform)
- Memory usage (heap, rss, external)
- WASM module status (loaded, memory, tables)
- Configuration status (file, hash, validation)
- Error count (if any)

**Example:**
```bash
pmctl status --verbose --format json
```

**Output:**
```json
{
  "engine": {
    "status": "RUNNING",
    "activeOperations": 1,
    "completedOperations": 5
  },
  "system": {
    "nodeVersion": "20.10.0",
    "platform": "linux",
    "arch": "x64"
  },
  "memory": {
    "heapUsed": "45MB",
    "heapTotal": "100MB",
    "rss": "120MB"
  },
  "wasm": {
    "loaded": true,
    "memoryPages": 512,
    "version": "26.4.5"
  },
  "config": {
    "source": "./wasm4pm.toml",
    "hash": "abc123...",
    "valid": true
  }
}
```

---

### pmctl explain

Get detailed explanations of algorithms and models.

**Usage:**
```bash
pmctl explain [OPTIONS]
```

**Options:**
```
--algorithm <ALG>       Algorithm to explain
--model <FILE>          Model file to explain
--config                Show configuration explanation
--level [brief|detailed|academic]  Detail level (default: brief)
--format [human|json]   Output format (default: human)
--help                  Show help text
```

**Detail Levels:**

**brief** - Quick overview
```
DFG (Directly-Follows Graph)
Fast, simple process model based on activity sequences.
Best for: Real-time, large logs, quick analysis.
Time: <1ms per 100 events
Memory: <1MB
```

**detailed** - Full explanation with parameters
```
DFG (Directly-Follows Graph)
A process model that captures the directly-follows relationship
between activities...
[Full description with use cases]
```

**academic** - Research-level details
```
DFG (Directly-Follows Graph)
Formal definition: G = (A, >) where A is activities
and > is the directly-follows relation...
[Academic formulation, complexity analysis, references]
```

**Example:**
```bash
pmctl explain --algorithm genetic --level detailed
```

---

## Configuration

### Configuration File (wasm4pm.toml)

```toml
# Engine settings
[engine]
profile = "balanced"              # fast, balanced, quality, stream
log_level = "info"                # debug, info, warn, error
max_memory_mb = 2048
timeout_seconds = 300

# Discovery settings
[discovery]
default_algorithm = "dfg"
genetic_populations = 50
genetic_generations = 100
ilp_timeout_seconds = 60

# Output settings
[output]
format = "human"                  # human, json
destination = "stdout"            # stdout, stderr, or filepath

# Observability
[observability]
enabled = true
level = "info"
sinks = ["console"]               # console, file, http
file_path = "./wasm4pm.log"
```

### Configuration Resolution

Priority (high to low):
1. CLI arguments (`--profile quality`)
2. TOML file (`./wasm4pm.toml`)
3. JSON file (`./wasm4pm.json`)
4. Environment variables (`WASM4PM_PROFILE=quality`)
5. Defaults

### Environment Variables

```bash
# Engine configuration
WASM4PM_PROFILE=quality
WASM4PM_LOG_LEVEL=info
WASM4PM_MAX_MEMORY_MB=2048
WASM4PM_TIMEOUT_SECONDS=300

# Discovery configuration
WASM4PM_DEFAULT_ALGORITHM=genetic
WASM4PM_GENETIC_POPULATIONS=50

# Output configuration
WASM4PM_OUTPUT_FORMAT=json
WASM4PM_OUTPUT_DESTINATION=./results/

# Feature flags
WASM4PM_WATCH_ENABLED=true
WASM4PM_VERBOSE=true
```

---

## Exit Codes

For scripting and CI/CD integration:

```
0   SUCCESS              Completed successfully
1   CONFIG_ERROR         Configuration loading/validation failed
2   INPUT_ERROR          Input file not found or invalid
3   EXECUTION_ERROR      Algorithm execution failed
4   VALIDATION_ERROR     Output validation failed
5   SYSTEM_ERROR         System resource error
6   TIMEOUT_ERROR        Execution timeout
7   CANCELLED            User cancelled operation
127 NOT_FOUND            Command not found
```

**Example:**
```bash
pmctl run data.xes || exit $?
```

---

## Examples

### Example 1: Basic Discovery
```bash
pmctl run data/eventlog.xes --output model.json
```

### Example 2: Quality Analysis
```bash
pmctl run data/eventlog.xes \
  --algorithm genetic \
  --profile quality \
  --output result.json \
  --format json
```

### Example 3: Continuous Monitoring
```bash
pmctl watch data/ \
  --profile fast \
  --output results/ \
  --verbose
```

### Example 4: Scripted Pipeline
```bash
#!/bin/bash
set -e

# Initialize
pmctl init --force

# Run discovery
pmctl run data/log.xes --algorithm alpha++ --output model.json

# Check status
pmctl status --verbose

# Explain results
pmctl explain --model model.json
```

### Example 5: Docker Deployment
```dockerfile
FROM node:20-alpine

WORKDIR /app

RUN npm install -g @wasm4pm/pmctl

COPY wasm4pm.toml .
COPY data/ ./data/

CMD ["pmctl", "run", "data/eventlog.xes", "--profile", "balanced"]
```

---

## Troubleshooting

### Issue: "Command not found"
**Solution:** Install globally or use npx
```bash
npm install -g @wasm4pm/pmctl
pmctl --version
```

### Issue: "File not found"
**Solution:** Verify file path and extension
```bash
# Check file exists
ls -la data/eventlog.xes

# Use absolute path if relative doesn't work
pmctl run /absolute/path/to/eventlog.xes
```

### Issue: "Config validation error"
**Solution:** Run init to generate valid config
```bash
pmctl init --force
# Edit wasm4pm.toml as needed
```

### Issue: "Memory exceeded"
**Solution:** Use streaming profile or reduce algorithm complexity
```bash
pmctl run data.xes --profile stream --algorithm dfg
```

### Issue: "Timeout"
**Solution:** Increase timeout or use faster profile
```bash
WASM4PM_TIMEOUT_SECONDS=600 pmctl run data.xes
# OR
pmctl run data.xes --profile fast
```

---

## Performance Tips

1. **Choose Right Profile**
   - `fast` for real-time monitoring
   - `balanced` for production
   - `quality` for research

2. **Select Algorithm Wisely**
   - DFG: fastest, simplest
   - Alpha++: balanced
   - Genetic: best quality (slower)

3. **Monitor Memory**
   ```bash
   pmctl status --format json | jq .memory
   ```

4. **Use Watch Mode for Batches**
   ```bash
   pmctl watch data/ --profile fast
   ```

5. **Enable Logging Strategically**
   ```bash
   WASM4PM_LOG_LEVEL=warn pmctl run data.xes
   ```

---

## Development

### Building from Source
```bash
# Install dependencies
pnpm install

# Build pmctl
pnpm --filter @wasm4pm/pmctl build

# Run tests
pnpm --filter @wasm4pm/pmctl test

# Watch mode
pnpm --filter @wasm4pm/pmctl dev
```

### Adding New Commands
1. Create file: `src/commands/mycommand.ts`
2. Export from: `src/commands/index.ts`
3. Register in: `src/cli.ts`
4. Add tests: `__tests__/mycommand.test.ts`

---

## API Reference

### Programmatic Usage

```typescript
import { pmctl } from '@wasm4pm/pmctl';

// Run discovery
const result = await pmctl.run('data.xes', {
  algorithm: 'genetic',
  profile: 'quality',
  output: 'result.json'
});

// Watch directory
pmctl.watch('data/', {
  profile: 'fast',
  output: 'results/'
}).on('processed', (file) => {
  console.log(`Processed: ${file}`);
});

// Get status
const status = await pmctl.status();
console.log(status.engine.status);
```

---

## Resources

- **Main Repository:** https://github.com/seanchatmangpt/wasm4pm
- **Main Documentation:** [../docs/](../../docs/)
- **Configuration Guide:** [../../packages/config/README.md](../../packages/config/README.md)
- **API Reference:** [../../docs/API.md](../../docs/API.md)
- **Examples:** [../../examples/](../../examples/)

---

## License

MIT OR Apache-2.0

---

## Support

- **Issues:** https://github.com/seanchatmangpt/wasm4pm/issues
- **Discussions:** https://github.com/seanchatmangpt/wasm4pm/discussions
- **Documentation:** [../../docs/FAQ.md](../../docs/FAQ.md)

---

**Questions?** Create an issue or discussion on GitHub.
