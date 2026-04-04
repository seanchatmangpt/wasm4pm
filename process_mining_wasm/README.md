# Process Mining WASM Bindings

WebAssembly and JavaScript bindings for the [rust4pm](https://github.com/aarkue/rust4pm) process mining library.

[![npm version](https://img.shields.io/npm/v/process_mining_wasm.svg)](https://www.npmjs.com/package/process_mining_wasm)
[![Build Status](https://github.com/aarkue/rust4pm/actions/workflows/wasm-build.yml/badge.svg)](https://github.com/aarkue/rust4pm/actions)
[![License: MIT OR Apache-2.0](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](LICENSE-MIT)

## Quick Links

- [Getting Started Guide](./GETTING_STARTED.md) - Learn how to use the module quickly
- [API Reference](./API.md) - Complete documentation of all functions
- [Architecture Guide](./ARCHITECTURE.md) - Understand the design and internals
- [Examples](./examples/) - Real-world usage examples

## Installation

```bash
npm install process_mining_wasm
```

## Usage

### Node.js

```javascript
const pm = require('process_mining_wasm');

// Initialize
pm.init();

// Load an EventLog from XES content
const xesContent = `<?xml version="1.0" encoding="UTF-8"?>...`;
const logHandle = pm.load_eventlog_from_xes(xesContent);

// Get basic statistics
const stats = pm.object_count();
console.log('Objects stored:', stats);

// Run discovery algorithm
const petriNet = pm.discover_alpha_plus_plus(logHandle, 0);

// Export results
const json = pm.eventlog_to_json(logHandle);
```

### Browser

```html
<script src="./pkg/process_mining_wasm.js"></script>

<script>
  // Initialize
  rust4pm.init();

  // Load and process data
  const handle = rust4pm.load_eventlog_from_xes(xesContent);
  
  // Run analysis
  const stats = rust4pm.analyze_event_statistics(handle);
  console.log(JSON.parse(stats));
</script>
```

## API Reference

### Initialization

- `init()` - Initialize the WASM module
- `get_version()` - Get library version

### Data Loading

- `load_eventlog_from_xes(content: string): string` - Load EventLog from XES format
- `load_ocel_from_json(content: string): string` - Load OCEL from JSON format
- `load_ocel_from_xml(content: string): string` - Load OCEL from XML format

### Data Export

- `export_eventlog_to_xes(handle: string): string` - Export EventLog to XES format
- `export_ocel_to_json(handle: string): string` - Export OCEL to JSON format
- `export_ocel_to_xml(handle: string): string` - Export OCEL to XML format

### Discovery Algorithms

- `discover_alpha_plus_plus(handle: string, threshold: number): string` - Discover Petri net using Alpha++
- `discover_dfg(handle: string): string` - Discover Directly-Follows Graph
- `discover_oc_dfg(handle: string): string` - Discover Object-Centric DFG
- `discover_declare(handle: string): string` - Discover DECLARE constraints
- `available_discovery_algorithms(): string` - Get list of available algorithms

### Analysis Functions

- `analyze_dotted_chart(handle: string): string` - Perform dotted chart analysis
- `analyze_event_statistics(handle: string): string` - Get event frequency statistics
- `analyze_ocel_statistics(handle: string): string` - Get OCEL statistics
- `analyze_case_duration(handle: string): string` - Analyze case durations
- `available_analysis_functions(): string` - Get list of available analysis functions

### State Management

- `object_count(): number` - Get number of stored objects
- `delete_object(handle: string): boolean` - Delete a stored object
- `clear_all_objects(): void` - Clear all stored objects

## Building from Source

### Quick Build

```bash
cd process_mining_wasm
npm install
npm run build:all
```

### Using Build Script

```bash
./build.sh
```

### Manual Build Targets

```bash
# For bundler (recommended for modern bundlers like webpack, vite)
wasm-pack build --target bundler

# For Node.js
wasm-pack build --target nodejs

# For browser
wasm-pack build --target web
```

## Development

### Install dependencies

```bash
npm install
```

### Build

```bash
npm run build          # Build for bundler (default)
npm run build:nodejs   # Build for Node.js
npm run build:web      # Build for browser
npm run build:all      # Build all targets
```

### Testing

```bash
npm test               # Run all tests
npm run test:unit      # Run unit tests
npm run test:unit:watch # Watch mode
npm run test:integration # Run integration tests
npm run test:browser   # Run browser tests
./test.sh              # Using test script with options
```

### Code Quality

```bash
npm run lint           # Run linting and format checks
npm run format         # Auto-format code
npm run type:check     # TypeScript type checking
npm run docs           # Generate documentation
```

### Publishing

```bash
./publish.sh patch      # Publish patch version
./publish.sh minor      # Publish minor version
./publish.sh major      # Publish major version
```

The publish script:
- Validates repository state
- Runs all tests
- Checks code formatting and linting
- Builds all targets
- Updates version
- Creates git commit and tag
- Publishes to npm

## Scripts Overview

| Script | Purpose |
|--------|---------|
| `build.sh` | Build WASM for all targets |
| `test.sh` | Run test suite with options |
| `publish.sh` | Build, test, and publish to npm |

## NPM Scripts

| Script | Description |
|--------|-------------|
| `build` | Build bundler target |
| `build:nodejs` | Build Node.js target |
| `build:web` | Build web target |
| `build:all` | Build all targets |
| `test` | Run all tests |
| `test:unit` | Run unit tests with vitest |
| `test:unit:watch` | Watch mode for unit tests |
| `test:integration` | Run integration tests |
| `test:browser` | Run browser tests |
| `lint` | Check formatting and types |
| `format` | Auto-format code |
| `format:check` | Check code formatting |
| `type:check` | TypeScript type checking |
| `docs` | Generate API documentation |

## Architecture

For a deep dive into how the WASM module works, see [ARCHITECTURE.md](./ARCHITECTURE.md).

Key topics:
- Component architecture
- Memory management
- Build system
- Data flow
- API binding strategy
- Performance characteristics
- Testing architecture
- Deployment pipeline

## Compatibility

### Browsers
- Chrome 57+
- Firefox 52+
- Safari 11+
- Edge 79+

### Node.js
- 14.x, 16.x, 18.x, 20.x

### Build Tools
- Webpack 4+
- Vite 2+
- esbuild
- Rollup

## Support

For issues, questions, or contributions:
- GitHub Issues: https://github.com/aarkue/rust4pm/issues
- GitHub Discussions: https://github.com/aarkue/rust4pm/discussions

## Contributing

Contributions are welcome! Please see the main [rust4pm](https://github.com/aarkue/rust4pm) repository for contribution guidelines.

## License

MIT OR Apache-2.0

See [LICENSE-MIT](../LICENSE-MIT) and [LICENSE-APACHE](../LICENSE-APACHE) for details.
