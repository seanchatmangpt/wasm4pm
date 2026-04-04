# Examples for process_mining_wasm

This directory contains working examples demonstrating how to use process_mining_wasm in different environments.

## Quick Start

### Run Node.js Example

```bash
npm run example:nodejs
# or directly
node examples/nodejs.js
```

### Open Browser Example

```bash
npm run example:browser
```

### React Example

```bash
npm run example:react
```

### Webpack Bundler Example

```bash
npm run example:webpack
```

## Examples Overview

### nodejs.js - Node.js Integration

**Description**: Complete Node.js example with colored output and structured logging.

**Features**:

- Loading XES files
- Loading OCEL JSON files
- Analyzing event logs (statistics, duration, dotted chart)
- Process discovery (DFG, Alpha++, DECLARE)
- State management
- Error handling
- Complete workflow examples

**Run**:

```bash
node examples/nodejs.js
```

**Output**: Colored console output with sections showing:

1. Initialization
2. XES file loading and analysis
3. OCEL file loading and analysis
4. Process discovery algorithms
5. Available algorithms
6. State management
7. Complete workflow

### browser-full.html - Full-Featured Browser Demo

**Description**: Interactive web interface with a modern UI for process mining.

**Features**:

- Tab-based interface (XES, OCEL, File Upload)
- Real-time status indicator
- Multiple analysis and discovery options
- Result viewing with JSON formatting
- Object management
- File upload support
- Sample data loading
- Progress indicators

**Open**: Double-click the file or run:

```bash
npm run example:browser
```

**Sections**:

1. **Input Data** - Load XES, OCEL, or upload files
2. **Analysis & Discovery** - Run various algorithms
3. **Results** - View formatted output

### react-example.tsx - React Component

**Description**: Reusable React component for integrating process mining.

**Features**:

- Custom `useWasm()` hook for WASM initialization
- React state management
- TypeScript support
- File input handling
- Analysis results display
- Error handling
- Loading states

**Usage**:

```tsx
import ProcessMiningDemo from './examples/react-example';

function App() {
  return <ProcessMiningDemo />;
}
```

**Compile**:

```bash
npm run example:react
```

### webpack.config.js - Webpack Configuration

**Description**: Configuration for bundling the WASM module with Webpack.

**Features**:

- WASM module bundling
- TypeScript support
- Development and production modes
- Source maps
- Dev server with hot reload
- CSS and asset handling

**Usage**:

```bash
npm run example:webpack
# Opens dev server at http://localhost:8080
```

## Environment-Specific Setup

### Node.js Environment

Requirements:

- Node.js 14+
- process_mining_wasm package built for Node.js

Build for Node.js:

```bash
npm run build:nodejs
```

Usage:

```javascript
const pm = require('../pkg/process_mining_wasm');
pm.init();
const handle = pm.load_eventlog_from_xes(xesContent);
```

### Browser Environment

Requirements:

- Modern browser with WebAssembly support
- WASM module built for web

Build for browser:

```bash
npm run build:web
```

Usage:

```javascript
import init, * as pm from './pkg/process_mining_wasm.js';

async function setup() {
  await init();
  pm.init();
  const handle = pm.load_eventlog_from_xes(xesContent);
}
```

### React Environment

Requirements:

- React 16.8+ (hooks)
- TypeScript (optional but recommended)
- Webpack or similar bundler

Basic component:

```tsx
function MyComponent() {
  const { pm, isReady, error } = useWasm();

  const loadLog = () => {
    const handle = pm.load_eventlog_from_xes(content);
    // Use handle...
  };

  return <button onClick={loadLog}>Load</button>;
}
```

## Common Patterns

### Loading Files in Node.js

```javascript
const fs = require('fs');
const xesContent = fs.readFileSync('event_log.xes', 'utf-8');
const handle = pm.load_eventlog_from_xes(xesContent);
```

### Loading Files in Browser

```javascript
const input = document.getElementById('fileInput');
input.addEventListener('change', (e) => {
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = (event) => {
    const content = event.target.result;
    const handle = pm.load_eventlog_from_xes(content);
  };
  reader.readAsText(file);
});
```

### Error Handling

```javascript
try {
  const handle = pm.load_eventlog_from_xes(content);
} catch (error) {
  console.error('Failed to load:', error.message);
  // Handle error...
}
```

### Workflow Pattern

```javascript
// 1. Load
const handle = pm.load_eventlog_from_xes(xesContent);

// 2. Analyze
const stats = JSON.parse(pm.analyze_event_statistics(handle));

// 3. Discover
const dfg = JSON.parse(pm.discover_dfg(handle));

// 4. Export/Display
console.log('Statistics:', stats);
console.log('DFG:', dfg);

// 5. Cleanup
pm.delete_object(handle);
```

## API Quick Reference

### Initialization

```javascript
pm.init(); // Initialize WASM
pm.get_version(); // Get version string
```

### Data Loading

```javascript
pm.load_eventlog_from_xes(content); // Load XES file
pm.load_ocel_from_json(content); // Load OCEL JSON
pm.load_ocel_from_xml(content); // Load OCEL XML
```

### Analysis

```javascript
pm.analyze_event_statistics(handle); // Event frequencies
pm.analyze_case_duration(handle); // Case duration stats
pm.analyze_dotted_chart(handle); // Dotted chart data
pm.analyze_ocel_statistics(handle); // OCEL-specific stats
```

### Discovery

```javascript
pm.discover_dfg(handle); // Directly-Follows Graph
pm.discover_alpha_plus_plus(handle, threshold); // Alpha++ Petri Net
pm.discover_declare(handle); // DECLARE constraints
pm.discover_oc_dfg(handle); // Object-Centric DFG
```

### State Management

```javascript
pm.object_count(); // Count stored objects
pm.delete_object(handle); // Delete specific object
pm.clear_all_objects(); // Clear all objects
```

### Info

```javascript
pm.available_discovery_algorithms(); // List algorithms
pm.available_analysis_functions(); // List functions
```

## Sample Data Format

### XES Format

```xml
<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <trace>
    <string key="concept:name" value="Case001"/>
    <event>
      <string key="concept:name" value="Activity A"/>
      <date key="time:timestamp" value="2023-01-01T10:00:00"/>
    </event>
  </trace>
</log>
```

### OCEL Format

```json
{
  "ocel:global-event": {
    "ocel:attribute": []
  },
  "ocel:global-object": {
    "ocel:object-type": [{ "ocel:name": "Order" }, { "ocel:name": "Item" }]
  },
  "ocel:events": {
    "ocel:event": [
      {
        "ocel:id": "e1",
        "ocel:type": "Create Order",
        "ocel:timestamp": "2023-01-01T10:00:00",
        "ocel:omap": { "ocel:o": [{ "ocel:id": "o1" }] }
      }
    ]
  },
  "ocel:objects": {
    "ocel:object": [{ "ocel:id": "o1", "ocel:type": "Order" }]
  }
}
```

## Troubleshooting

### Module Not Found

```bash
# Build the module first
npm run build:all
```

### WASM Not Supported

Ensure your browser supports WebAssembly:

- Chrome 57+
- Firefox 52+
- Safari 11+
- Edge 16+

### File Loading Issues

- Check file encoding (UTF-8)
- Verify file format (XES or OCEL)
- Check CORS headers if loading from URL

### Performance Issues

- Reduce log size for testing
- Use memoization in React
- Profile with browser DevTools

## Contributing

To add new examples:

1. Create a new file in the examples directory
2. Follow existing code style
3. Add documentation in this README
4. Include error handling
5. Test with sample data
6. Add npm script if appropriate

## Further Reading

- [process_mining_wasm README](../README.md)
- [Integration Tests](../__tests__/integration/README.md)
- [Test Fixtures](../__tests__/fixtures/README.md)
- [XES Standard](http://xes-standard.org/)
- [OCEL Standard](https://www.ocelpetrisolver.org/)

## Support

For issues or questions:

1. Check existing examples
2. Review test files for usage patterns
3. See integration tests for edge cases
4. Check main repository README
