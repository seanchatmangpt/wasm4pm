# pmctl CLI

High-performance process mining and workflow discovery command-line interface.

## Overview

`pmctl` is the CLI tool for orchestrating process discovery operations using the wasm4pm engine. It provides commands for discovering process models from event logs, monitoring progress, and interpreting results.

## Installation

```bash
npm install -g @wasm4pm/pmctl
```

## Quick Start

```bash
# Initialize a new project
pmctl init --template basic --output ./my-project

# Run process discovery
pmctl run --config pmctl.json --input log.xes --output model.json

# Check status
pmctl status

# Watch for changes and re-run
pmctl watch --config pmctl.json

# Get explanation
pmctl explain --model model.json
```

## Commands

### run - Run process discovery

Discover a process model from an event log using specified algorithm.

```bash
pmctl run [OPTIONS]

OPTIONS:
  -c, --config <path>      Configuration file (JSON/YAML)
  -a, --algorithm <name>   Algorithm (dfg, alpha, heuristic, genetic, ilp)
  -i, --input <path>       Input event log (XES/CSV)
  -o, --output <path>      Output file for results
  -t, --timeout <ms>       Timeout in milliseconds
  --format <fmt>           Output format (human|json) [default: human]
  -v, --verbose            Verbose logging
  -q, --quiet              Suppress non-error output
```

### watch - Watch mode

Automatically re-run discovery when input files change.

```bash
pmctl watch [OPTIONS]

OPTIONS:
  -c, --config <path>      Configuration file
  -i, --interval <ms>      Polling interval [default: 1000]
  --format <fmt>           Output format (human|json)
  -v, --verbose            Verbose logging
```

### status - System status

Show status of running operations and system health.

```bash
pmctl status [OPTIONS]

OPTIONS:
  --format <fmt>           Output format (human|json) [default: human]
  -v, --verbose            Verbose output
```

### explain - Model explanation

Get human-readable explanation of a discovered model or algorithm.

```bash
pmctl explain [OPTIONS]

OPTIONS:
  -m, --model <path>       Model file or handle
  -a, --algorithm <name>   Algorithm to explain
  --level <level>          Explanation level (brief|detailed|academic) [default: detailed]
  --format <fmt>           Output format (human|json)
```

### init - Initialize project

Create a new pmctl project with configuration template.

```bash
pmctl init [OPTIONS]

OPTIONS:
  -t, --template <tmpl>    Template (basic|advanced|custom) [default: basic]
  -o, --output <path>      Output directory [default: ./pmctl-project]
  -f, --force              Overwrite existing files
```

## Output Formats

### Human-readable (default)

Formatted for terminal display with colors and symbols:

```
✔ Discovery completed
Process Model:
  Activities: 5
  Transitions: 8
  Start: CreateRequest
```

### JSON

Machine-readable JSON for integration:

```json
{
  "status": "success",
  "message": "Discovery completed",
  "model": {
    "activities": 5,
    "transitions": 8,
    "startActivity": "CreateRequest"
  }
}
```

## Exit Codes

- `0` - Success
- `1` - Configuration error
- `2` - Source/input error
- `3` - Execution error
- `4` - Partial failure
- `5` - System error

## Configuration

Create a `pmctl.json` configuration file:

```json
{
  "algorithm": "genetic",
  "input": {
    "path": "logs/process.xes",
    "format": "xes"
  },
  "output": {
    "path": "models/discovered.json",
    "format": "json"
  },
  "options": {
    "timeout": 30000,
    "maxGenerations": 50,
    "populationSize": 100
  }
}
```

## Architecture

### Command Structure

Commands are defined using citty, a lightweight CLI router. Each command:
- Has metadata (name, description)
- Accepts typed arguments
- Returns structured output via formatters
- Uses exit codes for status

### Output System

Three output handlers:
- **HumanFormatter** - Terminal-friendly output with colors
- **JSONFormatter** - Structured JSON for integration
- **StreamingOutput** - Event stream for watch mode

### Error Handling

All commands:
1. Validate configuration
2. Check input files
3. Execute with timeout
4. Return appropriate exit code
5. Format error details

## Development

Build:
```bash
npm run build
```

Test:
```bash
npm test
npm run test:watch
```

Watch mode:
```bash
npm run dev
```

## Project Status

Status: **Scaffolding Complete**

This is the CLI command structure and routing layer. Implementation of:
- Engine integration (wiring commands to algorithm execution)
- File I/O for configuration and results
- Watch mode file monitoring
- Detailed output formatting

...is deferred to next implementation phase.

## See Also

- [wasm4pm Engine](../../packages/engine/) - Algorithm execution
- [Process Mining Library](../../packages/wasm4pm/) - Core WASM module
