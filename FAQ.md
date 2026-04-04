# Frequently Asked Questions - wasm4pm

Quick answers to common questions about wasm4pm.

## Installation & Setup

### Q: Which version of Node.js do I need?
**A:** Node.js 16 or later. We recommend 18+ for best performance and security.

```bash
node --version  # Check your version
nvm install 18  # Update if needed
```

### Q: Can I use wasm4pm in the browser?
**A:** Yes! Fully supported in all modern browsers (Chrome, Firefox, Safari, Edge).

```html
<script src="node_modules/wasm4pm/pkg/wasm4pm.js"></script>
<script>
  const pm = wasm4pm;
  await pm.init();
</script>
```

### Q: What's the minimum browser version?
**A:** 
- Chrome 57+
- Firefox 52+
- Safari 11+
- Edge 79+

### Q: How large is the WASM binary?
**A:**
- Uncompressed: ~2MB
- Gzipped: ~600KB (typical production)
- Most of the size is algorithm implementations

### Q: Can I use wasm4pm with TypeScript?
**A:** Yes! TypeScript definitions are generated automatically and included in the npm package.

```typescript
import * as wasm4pm from 'wasm4pm';

async function analyze(xesContent: string): Promise<void> {
  await wasm4pm.init();
  const log = wasm4pm.loadEventLogFromXES(xesContent);
  const dfg = wasm4pm.discoverDFG(log);
}
```

---

## Features & Capabilities

### Q: How many discovery algorithms are available?
**A:** 14 main algorithms:
1. DFG (Directly-Follows Graph)
2. Alpha++
3. ILP Optimization
4. Genetic Algorithm
5. Particle Swarm Optimization
6. A* Search
7. DECLARE (Constraint Discovery)
8. Heuristic Miner
9. Inductive Miner
10. Hill Climbing
11. Ant Colony Optimization
12. Simulated Annealing
13. Process Skeleton
14. Optimized DFG

### Q: What algorithms are fastest?
**A:** Ranked by speed (for 1000 events):
1. Process Skeleton: ~3ms
2. DFG: ~5ms
3. Hill Climbing: ~20ms
4. Alpha++: ~50ms

### Q: What algorithms are most accurate?
**A:** Ranked by fitness (accuracy):
1. ILP Optimization: 99%
2. Genetic Algorithm: 97%
3. Alpha++: 98%
4. A* Search: 97%

### Q: Can I analyze object-centric processes?
**A:** Currently optimized for case-centric (XES) logs. Object-centric support is planned for v1.0.

### Q: What file formats are supported?
**A:**
- **Input**: XES (standard), JSON
- **Output**: PNML (Petri Net), DECLARE, JSON, Mermaid, D3, SVG, HTML

### Q: Can I export to ProM format?
**A:** PNML is ProM-compatible. Import the .pnml file into ProM.

---

## Performance & Optimization

### Q: How fast can wasm4pm process large logs?
**A:**
- 100K events: ~10-30 seconds (depending on algorithm)
- 1M events: ~100-300 seconds
- Linear scalability for most algorithms

For real-time analysis, use DFG or Process Skeleton (fast, ~0.3ms per 100 events).

### Q: How much memory does wasm4pm use?
**A:** Typical usage (1000 events):
- Memory: 1-10MB depending on algorithm
- WASM heap: Automatically managed

Large logs (100K+ events) may use 50-500MB.

### Q: Can I use wasm4pm for real-time streaming?
**A:** Yes, design your streaming pipeline:

```javascript
const log = wasm4pm.createEventLog();

for await (const event of eventStream) {
  log.addEvent(event);
  
  // Periodic analysis every 100 events
  if (log.getEventCount() % 100 === 0) {
    const model = wasm4pm.discoverDFG(log);
    console.log('Updated model:', model);
  }
}
```

### Q: How do I optimize for large datasets?
**A:**
1. Use fast algorithms (DFG, Process Skeleton)
2. Filter logs before processing
3. Process in chunks
4. Use Web Workers (browser) or Worker Threads (Node.js)

---

## Data Handling

### Q: What XES format do you support?
**A:** Standard XES 1.0 and 2.0. Features:
- Traces, events, attributes
- Timestamps, strings, integers, floats
- Meta information

### Q: How do I convert my logs to XES?
**A:** Use industry-standard tools:
- ProM framework (free, Java)
- pm4py (Python)
- Custom scripts (our QuickStart has examples)

### Q: What happens if my XES is malformed?
**A:** Clear error message indicating the problem:
```javascript
try {
  const log = wasm4pm.loadEventLogFromXES(badXES);
} catch (error) {
  console.error(error.message);  // E.g., "Missing attribute key"
}
```

### Q: Can I add events programmatically?
**A:** Yes, create logs in code:

```javascript
const log = wasm4pm.createEventLog();

log.addTrace('CaseID1', [
  { activity: 'A', timestamp: 1000 },
  { activity: 'B', timestamp: 2000 }
]);

log.addTrace('CaseID2', [
  { activity: 'A', timestamp: 1100 },
  { activity: 'C', timestamp: 2100 }
]);
```

### Q: How do I filter logs?
**A:**
```javascript
// By date range
const filtered = wasm4pm.filterLogByDateRange(log, {
  start: '2024-01-01',
  end: '2024-03-31'
});

// By activity
const filtered = wasm4pm.filterByActivity(log, ['A', 'B']);

// By case ID
const filtered = wasm4pm.filterByCaseId(log, ['Case1', 'Case2']);
```

---

## Algorithm Selection

### Q: Which algorithm should I use?
**A:** Depends on your needs:

| Need | Algorithm |
|------|-----------|
| Fast overview | DFG |
| Balanced | Alpha++ |
| Exact model | ILP Optimization |
| Evolutionary | Genetic Algorithm |
| Constraint discovery | DECLARE |
| Dependency analysis | Heuristic Miner |

### Q: How do I choose algorithm parameters?
**A:** Start with defaults, then tune:

```javascript
// Genetic Algorithm parameters
const model = wasm4pm.discoverGeneticAlgorithm(log, {
  populationSize: 50,     // More = better but slower
  generations: 100,       // More = more accurate
  mutationRate: 0.1,      // 0.05-0.2 typical
  crossoverRate: 0.8      // 0.7-0.9 typical
});
```

### Q: What's the difference between fitness and precision?
**A:**
- **Fitness** (0-1): How much of the log is covered by the model
- **Precision** (0-1): How specific the model is (less overfitting)
- High fitness + high precision = good model

### Q: Why does my model have low fitness?
**A:** Common causes:
1. **Noisy data** - Try filtering or using noise-tolerant algorithms
2. **Complex process** - Try Genetic Algorithm or ILP
3. **Outliers** - Filter anomalous traces
4. **Wrong algorithm** - Try different algorithms

---

## Conformance Checking

### Q: What is conformance checking?
**A:** Verifies if event log matches a discovered model:
- Traces that follow the model = conforming
- Traces that deviate = non-conforming

### Q: What do conformance metrics mean?
**A:**
- **Fitness** (0-1): % of log replayed successfully
- **Precision** (0-1): Model doesn't allow unobserved behavior
- **Generalization** (0-1): Model flexibility
- **Simplicity** (0-1): Model is concise

### Q: How do I analyze deviations?
**A:**
```javascript
const result = wasm4pm.checkConformance(log, model, {
  includeDeviations: true
});

result.deviations.forEach(dev => {
  console.log(`Case ${dev.caseId}: ${dev.description}`);
});
```

### Q: Can I find specific non-conforming traces?
**A:** Yes:
```javascript
const deviating = wasm4pm.findNonConformingTraces(log, model);
deviating.traces.forEach(trace => {
  console.log(`${trace.caseId}: ${trace.deviationPoint}`);
});
```

---

## Troubleshooting

### Q: Getting "WASM module not initialized"
**A:** Call `init()` first:
```javascript
await wasm4pm.init();
// Now safe to use
```

### Q: "out of memory" error
**A:** Solutions:
1. Process smaller logs
2. Use streaming/chunking
3. Free unused handles: `wasm4pm.freeHandle(handle)`
4. Increase Node.js memory: `node --max-old-space-size=4096 app.js`

### Q: Algorithm produces unexpected results
**A:** Debug step-by-step:
```javascript
const log = wasm4pm.loadEventLogFromXES(xes);
const stats = wasm4pm.analyzeEventStatistics(log);
console.log('Log stats:', stats);  // Verify data

const model = wasm4pm.discoverDFG(log);
console.log('Model:', model);

const conformance = wasm4pm.checkConformance(log, model);
console.log('Quality:', conformance);  // Check fitness
```

### Q: Browser shows blank page
**A:**
1. Check browser console for errors
2. Verify WASM is supported: `typeof WebAssembly !== 'undefined'`
3. Check network tab - .wasm file should load
4. Try different browser

### Q: npm install hangs or fails
**A:**
```bash
# Clear cache
npm cache clean --force

# Reinstall
npm install wasm4pm

# Or specify version
npm install wasm4pm@0.5.4
```

### Q: TypeScript "module not found" error
**A:**
```json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "types": ["node"],
    "allowJs": true
  }
}
```

---

## Development

### Q: How do I modify wasm4pm source?
**A:**
```bash
cd process_mining_wasm
npm install
# Edit src/lib.rs, src/discovery.rs, etc.
npm run build:dev
npm test
```

### Q: Can I extend wasm4pm?
**A:** Yes, contribute to GitHub:
1. Fork repository
2. Create feature branch
3. Submit pull request

### Q: Is there a Rust API?
**A:** Yes, wasm4pm is built with Rust. Full source code available.

### Q: How do I run tests?
**A:**
```bash
npm test                    # All tests
npm run test:integration   # Integration only
npm run test:watch        # Watch mode
```

---

## Licensing & Legal

### Q: What license is wasm4pm?
**A:** Dual-licensed:
- MIT License (permissive)
- Apache 2.0 (permissive with patent clause)

Choose whichever works for you.

### Q: Can I use wasm4pm commercially?
**A:** Yes, both licenses permit commercial use.

### Q: Do I need to disclose that I use wasm4pm?
**A:** Not required, but appreciated. See LICENSE files for details.

### Q: Is there a warranty?
**A:** No, provided "as-is". See LICENSE files.

---

## Community & Support

### Q: How do I report bugs?
**A:** GitHub Issues: https://github.com/seanchatmangpt/rust4pm/issues

Include:
- wasm4pm version
- Node.js/browser version
- Minimal reproducible example
- Error message

### Q: How do I request features?
**A:** GitHub Discussions: https://github.com/seanchatmangpt/rust4pm/discussions

### Q: Is there a community Slack/Discord?
**A:** Not yet, but may be created for v1.0. Follow GitHub for updates.

### Q: Who maintains wasm4pm?
**A:** Created by Sean Chat Man GPT. Contributions welcome!

---

## More Help

- **Documentation**: Check README.md, QUICKSTART.md, TUTORIAL.md
- **Examples**: See examples/ directory
- **Benchmarks**: See THESIS.md for performance data
- **GitHub**: https://github.com/seanchatmangpt/rust4pm
- **npm**: https://www.npmjs.com/package/wasm4pm

