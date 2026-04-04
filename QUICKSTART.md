# Quick Start Guide - wasm4pm

Get started with process mining in 5 minutes.

## Installation (1 minute)

### NPM
```bash
npm install wasm4pm
```

### Yarn
```bash
yarn add wasm4pm
```

### PNPM
```bash
pnpm add wasm4pm
```

## Your First Algorithm (2 minutes)

### Node.js
```javascript
const pm = require('wasm4pm');

async function demo() {
  // Initialize
  await pm.init();
  
  // Create a simple event log
  const log = pm.createEventLog();
  log.addTrace('Case1', [
    { activity: 'A', timestamp: 1000 },
    { activity: 'B', timestamp: 2000 },
    { activity: 'C', timestamp: 3000 }
  ]);
  log.addTrace('Case1', [
    { activity: 'A', timestamp: 1500 },
    { activity: 'B', timestamp: 2500 },
    { activity: 'C', timestamp: 3500 }
  ]);
  
  // Discover a process model
  const dfg = pm.discoverDFG(log);
  console.log(JSON.stringify(dfg, null, 2));
  
  // Visualize
  const diagram = pm.generateMermaidDiagram(dfg);
  console.log(diagram);
}

demo();
```

### Browser
```html
<!DOCTYPE html>
<html>
<head>
  <script src="node_modules/wasm4pm/pkg/wasm4pm.js"></script>
</head>
<body>
  <h1>Process Mining Demo</h1>
  <pre id="output"></pre>
  
  <script>
    const pm = wasm4pm;
    
    async function demo() {
      await pm.init();
      
      const log = pm.createEventLog();
      log.addTrace('Case1', [
        { activity: 'A', timestamp: 1000 },
        { activity: 'B', timestamp: 2000 }
      ]);
      
      const dfg = pm.discoverDFG(log);
      const diagram = pm.generateMermaidDiagram(dfg);
      
      document.getElementById('output').textContent = diagram;
    }
    
    demo();
  </script>
</body>
</html>
```

## Load Real Data (2 minutes)

### From XES File (Process Mining Standard)
```javascript
const fs = require('fs');
const pm = require('wasm4pm');

async function loadAndAnalyze() {
  await pm.init();
  
  // Read XES file
  const xesContent = fs.readFileSync('eventlog.xes', 'utf8');
  
  // Load into wasm4pm
  const logHandle = pm.loadEventLogFromXES(xesContent);
  
  // Analyze
  const stats = pm.analyzeEventStatistics(logHandle);
  console.log('Event Log Statistics:', stats);
  
  // Discover
  const dfg = pm.discoverDFG(logHandle);
  console.log('DFG Model:', dfg);
}

loadAndAnalyze();
```

### From JSON
```javascript
const pm = require('wasm4pm');

async function demo() {
  await pm.init();
  
  const logData = {
    traces: [
      {
        caseId: 'C1',
        events: [
          { activity: 'Start', timestamp: 1000 },
          { activity: 'Process', timestamp: 2000 },
          { activity: 'End', timestamp: 3000 }
        ]
      }
    ]
  };
  
  const logHandle = pm.loadEventLogFromJSON(JSON.stringify(logData));
  const dfg = pm.discoverDFG(logHandle);
}
```

## Try All 14 Algorithms

```javascript
const pm = require('wasm4pm');

async function compareAlgorithms(logHandle) {
  const algorithms = {
    'DFG': () => pm.discoverDFG(logHandle),
    'Alpha++': () => pm.discoverAlphaPlusPlus(logHandle),
    'ILP': () => pm.discoverILPOptimization(logHandle),
    'Genetic': () => pm.discoverGeneticAlgorithm(logHandle, { generations: 50 }),
    'PSO': () => pm.discoverParticleSwarmOptimization(logHandle),
    'A*': () => pm.discoverAStarSearch(logHandle),
    'DECLARE': () => pm.discoverDeclare(logHandle),
    'HeuristicMiner': () => pm.discoverHeuristicMiner(logHandle),
    'InductiveMiner': () => pm.discoverInductiveMiner(logHandle),
    'HillClimbing': () => pm.discoverHillClimbing(logHandle),
    'AntColony': () => pm.discoverAntColonyOptimization(logHandle),
    'SimulatedAnnealing': () => pm.discoverSimulatedAnnealing(logHandle),
    'ProcessSkeleton': () => pm.discoverProcessSkeleton(logHandle),
    'OptimizedDFG': () => pm.discoverOptimizedDFG(logHandle)
  };
  
  for (const [name, fn] of Object.entries(algorithms)) {
    try {
      const model = fn();
      const conformance = pm.checkConformance(logHandle, model);
      console.log(`${name}: Fitness=${conformance.fitness}, Precision=${conformance.precision}`);
    } catch (e) {
      console.log(`${name}: Error - ${e.message}`);
    }
  }
}
```

## Quick Analysis

```javascript
const pm = require('wasm4pm');

async function quickAnalysis(logHandle) {
  // Get basic statistics
  const stats = pm.analyzeEventStatistics(logHandle);
  console.log('Statistics:', stats);
  
  // Find trace variants
  const variants = pm.discoverVariants(logHandle);
  console.log('Trace Variants:', variants);
  
  // Detect bottlenecks
  const bottlenecks = pm.detectBottlenecks(logHandle);
  console.log('Bottlenecks:', bottlenecks);
  
  // Check for concept drift
  const drift = pm.detectConceptDrift(logHandle);
  console.log('Concept Drift:', drift);
  
  // Analyze activity dependencies
  const deps = pm.analyzeActivityDependencies(logHandle);
  console.log('Dependencies:', deps);
}
```

## Visualization

```javascript
const pm = require('wasm4pm');

async function visualize(logHandle, model) {
  // Mermaid diagram (paste into Mermaid Live)
  const mermaid = pm.generateMermaidDiagram(model);
  console.log(mermaid);
  
  // D3 force-directed graph
  const d3Data = pm.generateD3Graph({
    model,
    layout: 'force-directed'
  });
  
  // HTML report
  const html = pm.generateHTMLReport(logHandle, model);
  fs.writeFileSync('report.html', html);
}
```

## Common Parameters

### Discovery Algorithms
```javascript
// Basic (no parameters)
pm.discoverDFG(logHandle);

// With parameters
pm.discoverGeneticAlgorithm(logHandle, {
  populationSize: 50,
  generations: 100,
  mutationRate: 0.1,
  crossoverRate: 0.8
});

pm.discoverILPOptimization(logHandle, {
  timeout: 30000,  // 30 seconds
  solver: 'cplex'
});
```

### Conformance Checking
```javascript
const result = pm.checkConformance(logHandle, model, {
  replaying: 'token_based',
  includeDeviations: true,
  detailedMetrics: true
});

// Result includes:
// - fitness: 0.0 to 1.0
// - precision: 0.0 to 1.0
// - generalization: 0.0 to 1.0
// - simplicity: 0.0 to 1.0
// - deviations: array of non-conforming traces
```

## Memory Management

```javascript
const pm = require('wasm4pm');

// Handles are just strings, WASM memory is managed by Rust
const logHandle = pm.loadEventLogFromXES(xesContent);
const model = pm.discoverDFG(logHandle);

// To free memory explicitly (optional):
pm.freeHandle(logHandle);
pm.freeHandle(model);
```

## Troubleshooting

### Module not found
```bash
npm install wasm4pm
# or
npm install ../process_mining_wasm
```

### WASM module initialization failed
```javascript
// Make sure to initialize first
await pm.init();

// Then use any function
const dfg = pm.discoverDFG(logHandle);
```

### File not found
```javascript
const fs = require('fs');
const path = require('path');

// Use absolute path
const xesPath = path.join(__dirname, 'data', 'eventlog.xes');
const content = fs.readFileSync(xesPath, 'utf8');
```

## Next Steps

- **Full API**: See [API.md](./process_mining_wasm/API.md)
- **Algorithms**: See [ALGORITHMS.md](./process_mining_wasm/ALGORITHMS.md)
- **Examples**: See [TUTORIAL.md](./TUTORIAL.md)
- **Performance**: See [THESIS.md](./process_mining_wasm/THESIS.md)
- **Troubleshooting**: See [FAQ.md](./FAQ.md)

## Sample Event Log (XES)

Save as `eventlog.xes`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org">
  <trace>
    <string key="concept:name" value="Case1"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2024-01-01T10:00:00+00:00"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
      <date key="time:timestamp" value="2024-01-01T11:00:00+00:00"/>
    </event>
    <event>
      <string key="concept:name" value="C"/>
      <date key="time:timestamp" value="2024-01-01T12:00:00+00:00"/>
    </event>
  </trace>
</log>
```

---

**Done!** You're ready to start process mining. Check out [TUTORIAL.md](./TUTORIAL.md) for more advanced examples.
