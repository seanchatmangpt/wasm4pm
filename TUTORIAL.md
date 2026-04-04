# Tutorial - Real-World Workflows with wasm4pm

Learn by example with practical process mining scenarios.

## Tutorial 1: Order-to-Cash Process Analysis

Analyze a typical sales order processing workflow.

### The Scenario
You have an event log of customer orders going through your system:
1. Order received
2. Inventory check
3. Payment processing
4. Fulfillment
5. Shipping
6. Delivery

Some orders deviate (e.g., inventory issues, payment failures, cancellations).

### Step 1: Load and Explore the Log

```javascript
const fs = require('fs');
const pm = require('wasm4pm');

async function analyzeOrderProcess() {
  await pm.init();
  
  // Load the event log
  const xesContent = fs.readFileSync('orders.xes', 'utf8');
  const logHandle = pm.loadEventLogFromXES(xesContent);
  
  // Get basic statistics
  const stats = pm.analyzeEventStatistics(logHandle);
  console.log('=== LOG STATISTICS ===');
  console.log(`Total Traces: ${stats.traceCount}`);
  console.log(`Total Events: ${stats.eventCount}`);
  console.log(`Unique Activities: ${stats.activities.length}`);
  console.log(`Date Range: ${stats.startTime} to ${stats.endTime}`);
  console.log(`Average Duration: ${stats.averageCaseDuration}ms`);
}

analyzeOrderProcess();
```

### Step 2: Discover the Process Model

```javascript
async function discoverModel(logHandle) {
  console.log('\n=== DISCOVERING MODELS ===');
  
  // Try DFG first (fast and simple)
  const dfg = pm.discoverDFG(logHandle);
  console.log('DFG Model:', JSON.stringify(dfg, null, 2));
  
  // Compare with Alpha++ (stricter, finds structure)
  const alphaPlusPlus = pm.discoverAlphaPlusPlus(logHandle);
  console.log('Alpha++ Model:', JSON.stringify(alphaPlusPlus, null, 2));
  
  // Use Genetic Algorithm for optimization
  const genetic = pm.discoverGeneticAlgorithm(logHandle, {
    populationSize: 100,
    generations: 200,
    fitnessWeight: 0.6,
    precisionWeight: 0.4
  });
  console.log('Optimized Model:', JSON.stringify(genetic, null, 2));
}
```

### Step 3: Check Conformance

```javascript
async function checkConformance(logHandle, model) {
  console.log('\n=== CONFORMANCE ANALYSIS ===');
  
  const result = pm.checkConformance(logHandle, model, {
    includeDeviations: true,
    detailedMetrics: true
  });
  
  console.log(`Fitness: ${result.fitness.toFixed(4)}`);
  console.log(`Precision: ${result.precision.toFixed(4)}`);
  console.log(`Generalization: ${result.generalization.toFixed(4)}`);
  console.log(`Simplicity: ${result.simplicity.toFixed(4)}`);
  
  // Analyze deviations
  if (result.deviations && result.deviations.length > 0) {
    console.log(`\nFound ${result.deviations.length} deviating traces:`);
    result.deviations.slice(0, 5).forEach((dev, i) => {
      console.log(`  ${i+1}. Case ${dev.caseId}: ${dev.deviation}`);
    });
  }
}
```

### Step 4: Find Bottlenecks

```javascript
async function analyzePerformance(logHandle) {
  console.log('\n=== PERFORMANCE ANALYSIS ===');
  
  // Find activities that take longest
  const bottlenecks = pm.detectBottlenecks(logHandle, {
    threshold: 0.75  // Top 25% slowest activities
  });
  
  console.log('Bottleneck Activities:');
  bottlenecks.activities.forEach(act => {
    console.log(`  - ${act.name}: ${act.avgDuration}ms (P95: ${act.p95Duration}ms)`);
  });
  
  // Analyze activity dependencies
  const deps = pm.analyzeActivityDependencies(logHandle);
  console.log('\nCritical Paths:');
  deps.criticalPaths.forEach(path => {
    console.log(`  ${path.join(' → ')} (${path.duration}ms avg)`);
  });
}
```

### Step 5: Visualize Results

```javascript
async function visualize(logHandle, model) {
  console.log('\n=== GENERATING VISUALIZATIONS ===');
  
  // Mermaid diagram (paste into mermaid.live)
  const mermaid = pm.generateMermaidDiagram(model);
  fs.writeFileSync('process_model.md', `\`\`\`mermaid\n${mermaid}\n\`\`\``);
  console.log('✓ Mermaid diagram saved to process_model.md');
  
  // D3 visualization
  const d3Data = pm.generateD3Graph({
    model,
    layout: 'force-directed',
    highlightBottlenecks: true
  });
  fs.writeFileSync('process_model.json', JSON.stringify(d3Data));
  console.log('✓ D3 data saved to process_model.json');
  
  // HTML report
  const html = pm.generateHTMLReport(logHandle, model, {
    includeCharts: true,
    includeStatistics: true,
    includeConformance: true
  });
  fs.writeFileSync('process_report.html', html);
  console.log('✓ HTML report saved to process_report.html');
  
  // PDF (requires additional library)
  // const pdf = pm.generatePDFReport(logHandle, model);
  // fs.writeFileSync('report.pdf', pdf);
}
```

### Complete Example

```javascript
const fs = require('fs');
const pm = require('wasm4pm');

async function analyzeOrderProcess() {
  try {
    // Initialize
    await pm.init();
    
    // Load data
    const xesContent = fs.readFileSync('orders.xes', 'utf8');
    const logHandle = pm.loadEventLogFromXES(xesContent);
    
    // Analyze
    const stats = pm.analyzeEventStatistics(logHandle);
    console.log(`Processing ${stats.eventCount} events from ${stats.traceCount} orders...`);
    
    // Discover models
    const dfg = pm.discoverDFG(logHandle);
    const alphaPlusPlus = pm.discoverAlphaPlusPlus(logHandle);
    const genetic = pm.discoverGeneticAlgorithm(logHandle, { generations: 200 });
    
    // Compare quality
    const dfgFitness = pm.checkConformance(logHandle, dfg).fitness;
    const alphaPlusPlusFitness = pm.checkConformance(logHandle, alphaPlusPlus).fitness;
    const geneticFitness = pm.checkConformance(logHandle, genetic).fitness;
    
    console.log('\nModel Comparison:');
    console.log(`  DFG Fitness: ${dfgFitness.toFixed(4)}`);
    console.log(`  Alpha++ Fitness: ${alphaPlusPlusFitness.toFixed(4)}`);
    console.log(`  Genetic Fitness: ${geneticFitness.toFixed(4)}`);
    
    // Use best model
    let bestModel = dfg;
    let bestName = 'DFG';
    if (alphaPlusPlusFitness > dfgFitness) {
      bestModel = alphaPlusPlus;
      bestName = 'Alpha++';
    }
    if (geneticFitness > Math.max(dfgFitness, alphaPlusPlusFitness)) {
      bestModel = genetic;
      bestName = 'Genetic';
    }
    
    console.log(`\nSelected model: ${bestName}`);
    
    // Generate report
    const html = pm.generateHTMLReport(logHandle, bestModel);
    fs.writeFileSync('order_process_report.html', html);
    console.log('✓ Report saved to order_process_report.html');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

analyzeOrderProcess();
```

---

## Tutorial 2: Concept Drift Detection

Detect when your process changes over time.

### Scenario
Your customer support process might have changed when you upgraded your ticketing system last month. How can you detect and analyze this?

```javascript
const pm = require('wasm4pm');

async function detectProcessChange(logHandle) {
  console.log('=== CONCEPT DRIFT DETECTION ===');
  
  // Detect drift with sliding window
  const drift = pm.detectConceptDrift(logHandle, {
    windowSize: 100,     // events per window
    method: 'attribute'  // or 'activity', 'trace'
  });
  
  if (drift.driftDetected) {
    console.log(`⚠️  Process change detected at event ${drift.changePoint}`);
    console.log(`   Change point date: ${drift.changePointDate}`);
    console.log(`   Before change: ${drift.beforeChangeMetrics}`);
    console.log(`   After change: ${drift.afterChangeMetrics}`);
    
    // Analyze separately
    const beforeLog = pm.filterLogByDateRange(logHandle, {
      start: drift.startDate,
      end: drift.changePointDate
    });
    
    const afterLog = pm.filterLogByDateRange(logHandle, {
      start: drift.changePointDate,
      end: drift.endDate
    });
    
    // Compare models
    const beforeModel = pm.discoverDFG(beforeLog);
    const afterModel = pm.discoverDFG(afterLog);
    
    console.log('\nProcess models before/after change:');
    const beforeDiagram = pm.generateMermaidDiagram(beforeModel);
    const afterDiagram = pm.generateMermaidDiagram(afterModel);
    
    console.log('BEFORE:\n', beforeDiagram);
    console.log('\nAFTER:\n', afterDiagram);
  } else {
    console.log('✓ No significant process change detected');
  }
}
```

---

## Tutorial 3: Trace Clustering

Group similar traces and analyze variant processes.

```javascript
const pm = require('wasm4pm');

async function clusterTraces(logHandle) {
  console.log('=== TRACE CLUSTERING ===');
  
  // Discover trace variants
  const variants = pm.discoverVariants(logHandle, {
    exactMatch: true
  });
  
  console.log(`Found ${variants.variants.length} unique trace variants:`);
  variants.variants
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 10)
    .forEach((v, i) => {
      console.log(`  ${i+1}. ${v.trace.join(' → ')} (${v.frequency} cases)`);
    });
  
  // Cluster by similarity
  const clusters = pm.clusterTraces(logHandle, {
    method: 'euclidean',
    k: 5  // number of clusters
  });
  
  console.log(`\nClusters (k=${clusters.clusters.length}):`);
  clusters.clusters.forEach((cluster, i) => {
    console.log(`  Cluster ${i}: ${cluster.size} traces`);
    console.log(`    Representative: ${cluster.centroid.join(' → ')}`);
  });
}
```

---

## Tutorial 4: Algorithm Comparison

Benchmark algorithms on your data.

```javascript
const pm = require('wasm4pm');

async function compareAlgorithms(logHandle) {
  console.log('=== ALGORITHM COMPARISON ===\n');
  
  const algorithms = {
    'DFG': { fn: () => pm.discoverDFG(logHandle) },
    'Alpha++': { fn: () => pm.discoverAlphaPlusPlus(logHandle) },
    'ILP': { fn: () => pm.discoverILPOptimization(logHandle, { timeout: 5000 }) },
    'Genetic': { fn: () => pm.discoverGeneticAlgorithm(logHandle, { generations: 50 }) },
    'PSO': { fn: () => pm.discoverParticleSwarmOptimization(logHandle) },
    'A*': { fn: () => pm.discoverAStarSearch(logHandle) }
  };
  
  const results = [];
  
  for (const [name, { fn }] of Object.entries(algorithms)) {
    try {
      const start = performance.now();
      const model = fn();
      const time = performance.now() - start;
      
      const conformance = pm.checkConformance(logHandle, model);
      
      results.push({
        algorithm: name,
        time: time,
        fitness: conformance.fitness,
        precision: conformance.precision,
        generalization: conformance.generalization,
        simplicity: conformance.simplicity
      });
      
      console.log(`${name.padEnd(15)} ✓ ${time.toFixed(0)}ms`);
    } catch (e) {
      console.log(`${name.padEnd(15)} ✗ ${e.message}`);
    }
  }
  
  // Sort by fitness
  results.sort((a, b) => b.fitness - a.fitness);
  
  console.log('\nResults (sorted by fitness):');
  console.table(results);
  
  // Recommend algorithm
  const bestFitness = results[0];
  const bestSpeed = results.reduce((a, b) => a.time < b.time ? a : b);
  const bestBalance = results.reduce((a, b) => {
    const scoreA = a.fitness * 0.6 - a.time * 0.0001;
    const scoreB = b.fitness * 0.6 - b.time * 0.0001;
    return scoreA > scoreB ? a : b;
  });
  
  console.log('\nRecommendations:');
  console.log(`  Best fitness: ${bestFitness.algorithm} (${bestFitness.fitness.toFixed(4)})`);
  console.log(`  Fastest: ${bestSpeed.algorithm} (${bestSpeed.time.toFixed(0)}ms)`);
  console.log(`  Best balance: ${bestBalance.algorithm}`);
}
```

---

## Tutorial 5: Process Validation

Validate processes against constraints.

```javascript
const pm = require('wasm4pm');

async function validateProcess(logHandle) {
  console.log('=== PROCESS VALIDATION ===');
  
  // Discover constraints using DECLARE
  const constraints = pm.discoverDeclare(logHandle, {
    minSupport: 0.8,
    minConfidence: 0.9
  });
  
  console.log('Discovered Constraints:');
  constraints.constraints.forEach(c => {
    console.log(`  - ${c.type}: ${c.description}`);
    console.log(`    Support: ${c.support.toFixed(2)}, Confidence: ${c.confidence.toFixed(2)}`);
  });
  
  // Validate against constraints
  const validation = pm.validateConstraints(logHandle, constraints);
  
  console.log(`\nValidation Result:`);
  console.log(`  Conforming cases: ${validation.conformingCount}`);
  console.log(`  Violating cases: ${validation.violatingCount}`);
  console.log(`  Compliance rate: ${(validation.complianceRate * 100).toFixed(1)}%`);
  
  if (validation.violations.length > 0) {
    console.log(`\nViolations found:`);
    validation.violations.slice(0, 5).forEach(v => {
      console.log(`  Case ${v.caseId}: Violated constraint "${v.constraintId}"`);
    });
  }
}
```

---

## Tutorial 6: Export and Integration

Save results in various formats.

```javascript
const fs = require('fs');
const pm = require('wasm4pm');

async function exportResults(logHandle, model) {
  console.log('=== EXPORTING RESULTS ===');
  
  // Export model to PNML (Petri Net Markup Language)
  const pnml = pm.exportModelToPNML(model);
  fs.writeFileSync('process_model.pnml', pnml);
  console.log('✓ Exported to PNML');
  
  // Export to DECLARE constraints
  const declare = pm.exportModelToDeclare(model);
  fs.writeFileSync('process_constraints.declare', declare);
  console.log('✓ Exported to DECLARE');
  
  // Export statistics
  const stats = pm.analyzeEventStatistics(logHandle);
  fs.writeFileSync('statistics.json', JSON.stringify(stats, null, 2));
  console.log('✓ Exported statistics');
  
  // Export conformance data
  const conformance = pm.checkConformance(logHandle, model);
  fs.writeFileSync('conformance.json', JSON.stringify(conformance, null, 2));
  console.log('✓ Exported conformance');
  
  // Generate SVG diagram (requires graphviz)
  const svgDiagram = pm.generateSVGDiagram(model);
  fs.writeFileSync('process_model.svg', svgDiagram);
  console.log('✓ Exported SVG diagram');
}
```

---

## Performance Tips

### 1. Use Appropriate Algorithms
```javascript
// For quick overview
const dfg = pm.discoverDFG(log);  // Fast, ~0.5ms per 100 events

// For accuracy
const genetic = pm.discoverGeneticAlgorithm(log, {
  generations: 500,  // Slower but more accurate
});

// For balance
const alphaPlusPlus = pm.discoverAlphaPlusPlus(log);
```

### 2. Filter Before Processing
```javascript
// Process only relevant time period
const filtered = pm.filterLogByDateRange(logHandle, {
  start: '2024-01-01',
  end: '2024-03-31'
});
```

### 3. Use Caching for Multiple Operations
```javascript
// Bad: Recalculates each time
const stats1 = pm.analyzeEventStatistics(log);
const deps = pm.analyzeActivityDependencies(log);  // Recalculates

// Good: Compute once
const stats = pm.analyzeEventStatistics(log);
const deps = pm.analyzeActivityDependencies(log, { useCache: true });
```

### 4. Batch Processing
```javascript
// Process multiple logs efficiently
const logs = fs.readdirSync('data')
  .filter(f => f.endsWith('.xes'))
  .map(f => pm.loadEventLogFromXES(fs.readFileSync(`data/${f}`)));

logs.forEach((logHandle, i) => {
  const dfg = pm.discoverDFG(logHandle);
  // Process...
});
```

---

## Troubleshooting Common Issues

### Memory Issues with Large Logs
```javascript
// Load in chunks
const chunkSize = 10000;  // events per chunk

// Process first chunk
const chunk1 = pm.filterLogByEventRange(log, 0, chunkSize);
const model1 = pm.discoverDFG(chunk1);

// Free chunk1 memory
pm.freeHandle(chunk1);

// Process next chunk
const chunk2 = pm.filterLogByEventRange(log, chunkSize, chunkSize * 2);
```

### Slow Algorithm Execution
```javascript
// Check what's taking time
const start = performance.now();
const model = pm.discoverGeneticAlgorithm(log, { generations: 500 });
console.log(`Time: ${performance.now() - start}ms`);

// Reduce complexity
const model = pm.discoverGeneticAlgorithm(log, { generations: 50 });  // Faster
```

---

## Next Steps

- Explore [API.md](./process_mining_wasm/API.md) for complete function reference
- Check [ALGORITHMS.md](./process_mining_wasm/ALGORITHMS.md) for algorithm details
- Read [THESIS.md](./process_mining_wasm/THESIS.md) for academic background
- See [FAQ.md](./FAQ.md) for more troubleshooting

