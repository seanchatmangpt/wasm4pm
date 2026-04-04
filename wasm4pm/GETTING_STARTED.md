# Getting Started with process_mining_wasm

A quick start guide to get you up and running with the process_mining WebAssembly bindings.

## Installation

### Via npm

```bash
npm install process_mining_wasm
```

### Via yarn

```bash
yarn add process_mining_wasm
```

## Quick Start

### Node.js Environment

```javascript
const pm = require('process_mining_wasm');

// Initialize the module
pm.init();

// Load an event log from XES
const xesContent = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <event>
      <string key="concept:name" value="Activity A"/>
    </event>
    <event>
      <string key="concept:name" value="Activity B"/>
    </event>
  </trace>
</log>`;

const logHandle = pm.load_eventlog_from_xes(xesContent);

// Get basic statistics
const eventStats = pm.analyze_event_statistics(logHandle);
const statsJson = JSON.parse(pm.object_to_json(eventStats));
console.log('Event Statistics:', statsJson);

// Discover a process model (Petri net) using Alpha++
const petriNet = pm.discover_alpha_plus_plus(logHandle, 0.1);

// Export the log
const exportedXes = pm.export_eventlog_to_xes(logHandle);

// Clean up
pm.delete_object(logHandle);
pm.delete_object(petriNet);
pm.delete_object(eventStats);
```

### Browser Environment (ES Modules)

```javascript
import * as pm from 'process_mining_wasm';

// Initialize
pm.init();

// Load data
fetch('eventlog.xes')
  .then(response => response.text())
  .then(xesContent => {
    const logHandle = pm.load_eventlog_from_xes(xesContent);
    
    // Perform analysis
    const dfg = pm.discover_dfg(logHandle);
    const dfgJson = JSON.parse(pm.object_to_json(dfg));
    
    console.log('DFG:', dfgJson);
  });
```

### Browser Environment (Script Tag)

```html
<!DOCTYPE html>
<html>
<head>
  <script src="./node_modules/wasm4pm/pkg/wasm4pm.js"></script>
</head>
<body>
  <input type="file" id="xesFile" accept=".xes"/>
  <button onclick="analyzeLog()">Analyze</button>
  <pre id="results"></pre>

  <script>
    async function analyzeLog() {
      // Initialize
      wasm4pm.init();

      // Read file
      const file = document.getElementById('xesFile').files[0];
      const content = await file.text();

      // Load and analyze
      const logHandle = wasm4pm.load_eventlog_from_xes(content);
      const stats = wasm4pm.analyze_event_statistics(logHandle);
      const results = JSON.parse(wasm4pm.object_to_json(stats));

      // Display results
      document.getElementById('results').textContent = 
        JSON.stringify(results, null, 2);
    }
  </script>
</body>
</html>
```

## Common Workflows

### Loading and Analyzing Event Logs

```javascript
const pm = require('process_mining_wasm');
pm.init();

// Load from XES
const logHandle = pm.load_eventlog_from_xes(xesContent);

// Get event statistics
const eventStats = pm.analyze_event_statistics(logHandle);
console.log(JSON.parse(pm.object_to_json(eventStats)));

// Analyze case durations
const durations = pm.analyze_case_duration(logHandle);
console.log(JSON.parse(pm.object_to_json(durations)));

// Cleanup
pm.delete_object(logHandle);
pm.delete_object(eventStats);
pm.delete_object(durations);
```

### Discovering Process Models

```javascript
const pm = require('process_mining_wasm');
pm.init();

const logHandle = pm.load_eventlog_from_xes(xesContent);

// List available algorithms
const algorithms = JSON.parse(pm.available_discovery_algorithms());
console.log('Available algorithms:', algorithms);

// Discover Petri net
const petriNet = pm.discover_alpha_plus_plus(logHandle, 0.1);

// Discover DFG
const dfg = pm.discover_dfg(logHandle);

// Get results
const dfgJson = JSON.parse(pm.object_to_json(dfg));
console.log('DFG:', dfgJson);
```

### Working with OCEL (Object-Centric Event Logs)

```javascript
const pm = require('process_mining_wasm');
pm.init();

// Load OCEL from JSON
const ocelContent = `{
  "ocel:version": "2.0",
  "ocel:objectTypes": ["Order", "Item"],
  "ocel:events": [
    {
      "ocel:eid": "e1",
      "ocel:type": "CreateOrder",
      "ocel:timestamp": "2023-01-01T10:00:00",
      "ocel:omap": ["o1"]
    }
  ],
  "ocel:objects": []
}`;

const ocelHandle = pm.load_ocel_from_json(ocelContent);

// Get OCEL statistics
const stats = pm.analyze_ocel_statistics(ocelHandle);
console.log(JSON.parse(pm.object_to_json(stats)));

// Discover object-centric DFG
const ocDfg = pm.discover_oc_dfg(ocelHandle);
console.log(JSON.parse(pm.object_to_json(ocDfg)));

// Export OCEL
const exportedJson = pm.export_ocel_to_json(ocelHandle);
console.log(exportedJson);
```

### Memory Management

```javascript
const pm = require('process_mining_wasm');
pm.init();

const logHandle = pm.load_eventlog_from_xes(xesContent);
const model = pm.discover_dfg(logHandle);
const stats = pm.analyze_event_statistics(logHandle);

// Check object count
console.log(`Stored objects: ${pm.object_count()}`); // Output: 3

// Delete individual objects
pm.delete_object(stats);
console.log(`Stored objects: ${pm.object_count()}`); // Output: 2

// Clear all objects
pm.clear_all_objects();
console.log(`Stored objects: ${pm.object_count()}`); // Output: 0
```

## Error Handling

```javascript
const pm = require('process_mining_wasm');

try {
  pm.init();
  
  // Invalid XES will throw an error
  const handle = pm.load_eventlog_from_xes('<invalid>');
} catch (error) {
  console.error('Failed to load event log:', error.message);
}
```

## Advanced Features

### Threshold Configuration in Discovery

The `discover_alpha_plus_plus()` function accepts a threshold parameter:

```javascript
const logHandle = pm.load_eventlog_from_xes(xesContent);

// No filtering (all activities included)
const model1 = pm.discover_alpha_plus_plus(logHandle, 0.0);

// Filter out activities with <10% frequency
const model2 = pm.discover_alpha_plus_plus(logHandle, 0.1);

// Filter out activities with <50% frequency  
const model3 = pm.discover_alpha_plus_plus(logHandle, 0.5);
```

### Batch Processing Multiple Files

```javascript
const pm = require('process_mining_wasm');
const fs = require('fs');
const path = require('path');

pm.init();

const logDir = './logs';
const files = fs.readdirSync(logDir).filter(f => f.endsWith('.xes'));

files.forEach(file => {
  try {
    const content = fs.readFileSync(path.join(logDir, file), 'utf8');
    const handle = pm.load_eventlog_from_xes(content);
    
    const stats = pm.analyze_event_statistics(handle);
    const result = JSON.parse(pm.object_to_json(stats));
    
    console.log(`${file}:`, result);
    
    pm.delete_object(handle);
    pm.delete_object(stats);
  } catch (error) {
    console.error(`Error processing ${file}:`, error.message);
  }
});

pm.clear_all_objects();
```

## Building from Source

If you want to build the WASM module from source:

```bash
cd process_mining_wasm

# Install dependencies
npm install

# Build for all targets
npm run build:all

# Run tests
npm test

# Build documentation
npm run docs
```

## Version Information

```javascript
const pm = require('process_mining_wasm');
pm.init();
console.log(`process_mining version: ${pm.get_version()}`);
```

## Next Steps

- Read the [API Reference](./API.md) for detailed function documentation
- Check the [ARCHITECTURE.md](./ARCHITECTURE.md) for design details
- Explore [examples](./examples/) for more use cases
- View the main [README.md](./README.md) for additional information

## Troubleshooting

### Module not found

Ensure the module is installed:
```bash
npm install process_mining_wasm
```

### "init() was not called" error

Always call `pm.init()` before using other functions:
```javascript
const pm = require('process_mining_wasm');
pm.init();  // Required!
```

### Memory issues with large logs

Use memory management functions to free up space:
```javascript
pm.delete_object(handle);  // Delete individual objects
pm.clear_all_objects();    // Clear everything
```

### Browser compatibility

This package requires WebAssembly support. Modern browsers (released after 2017) support WebAssembly natively.

## Performance Tips

1. Load data once and reuse handles when possible
2. Delete objects when no longer needed
3. Use appropriate thresholds in discovery algorithms to filter noise
4. Consider batch processing for multiple files
5. Use the nodejs target for server-side processing

## Support

For issues, questions, or contributions, visit:
https://github.com/seanchatmangpt/wasm4pm

## License

MIT OR Apache-2.0
