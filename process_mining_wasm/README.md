# Process Mining WASM Bindings

WebAssembly and JavaScript bindings for the [rust4pm](https://github.com/aarkue/rust4pm) process mining library.

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

```bash
cd process_mining_wasm

# For bundler (recommended)
wasm-pack build --target bundler

# For Node.js
wasm-pack build --target nodejs

# For browser
wasm-pack build --target web
```

## Development

To install development dependencies:

```bash
npm install
```

To build:

```bash
npm run build
```

## License

MIT OR Apache-2.0
