# wasm4pm - Process Mining WebAssembly

High-performance process mining algorithms compiled to WebAssembly for use in browsers and Node.js.

## Overview

**wasm4pm** brings sophisticated process mining capabilities to JavaScript environments through WebAssembly. It enables:

- **Process Discovery**: Extract process models from event logs using multiple algorithms
- **Conformance Checking**: Verify if event logs conform to discovered models
- **Process Analysis**: Analyze process characteristics, bottlenecks, and quality metrics
- **Data Import/Export**: Load and save logs in XES and JSON formats

All computation happens in Rust/WebAssembly for optimal performance.

## Key Features

### Discovery Algorithms
- **DFG** - Directly-Follows Graph discovery
- **Alpha++** - Petri net discovery with noise tolerance
- **ILP Optimization** - Constraint-based optimization for optimal models
- **Genetic Algorithm** - Population-based evolutionary discovery
- **Particle Swarm Optimization** - Intelligence-based model evolution
- **DECLARE** - Constraint discovery
- **Heuristic Miner** - Dependency-threshold-based discovery

### Quick Installation

```bash
npm install wasm4pm
```

## Quick Start

### Browser

```html
<script src="node_modules/wasm4pm/pkg/wasm4pm.js"></script>
<script>
  const { ProcessMiningClient } = wasm4pm;
  const client = new ProcessMiningClient();
  await client.init();
  
  const log = client.loadEventLogFromJSON(xesJson);
  const dfg = log.discoverDFG({ minFrequency: 1 });
</script>
```

### Node.js

```javascript
const { ProcessMiningClient } = require('wasm4pm');

const client = new ProcessMiningClient();
await client.init();

const log = client.loadEventLogFromXES(xesContent);
const dfg = log.discoverDFG();
const petriNet = log.discoverAlphaPlusPlus();
```

### CLI

```bash
npx wasm4pm discover data/log.xes dfg -o result.json
npx wasm4pm discover data/log.xes genetic -o evolved.json
npx wasm4pm analyze data/log.xes --verbose
```

## Documentation

See [process_mining_wasm/README.md](.) for complete API documentation, examples, and performance characteristics.

## Version

0.5.4 - Supports all discovery algorithms with ILP and genetic evolution

## License

MIT OR Apache-2.0
