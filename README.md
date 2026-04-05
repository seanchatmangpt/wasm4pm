<div align="center">
<h1><strong>wasm4pm</strong> - Process Mining for WebAssembly</h1>
<p><strong>High-Performance Process Mining Algorithms in JavaScript/TypeScript</strong></p>
<p>
  <a href="https://www.npmjs.com/package/wasm4pm">
    <img src="https://img.shields.io/npm/v/wasm4pm" alt="npm version"/></a>
  <a href="https://www.npmjs.com/package/wasm4pm">
    <img src="https://img.shields.io/npm/dm/wasm4pm" alt="npm downloads"/></a>
  <a href="https://github.com/seanchatmangpt/wasm4pm">
    <img src="https://img.shields.io/github/stars/seanchatmangpt/wasm4pm" alt="GitHub stars"/></a>
</p>
<img src="logo.png" width="300" alt="Rust4PM Logo"/>
<br/>
<img src="Ferris emerges from the black hole.png" width="300" alt="Ferris emerges from the black hole"/>
</div>

---

## What is wasm4pm?

**wasm4pm** is a comprehensive, enterprise-grade process mining platform compiled to WebAssembly. It brings production-grade process discovery, conformance checking, analysis, and automation capabilities to browsers, Node.js, and containers.

Process mining extracts actionable insights from event logs by discovering process models, detecting deviations, and analyzing performance bottlenecks. **wasm4pm** makes this accessible to JavaScript developers with near-native performance, plus professional CLI tools, HTTP APIs, and observability for enterprise deployments.

### Version 26.4.5 (April 2026)
**Major Release:** Added 10 new packages (engine, config, service, observability, contracts, types, kernel, planner, templates, testing) while maintaining 100% backward compatibility. Introduces professional CLI tool (pmctl), configuration management, HTTP service layer, and comprehensive observability.

## 🚀 Key Capabilities

### Discovery Layer
**14 Discovery Algorithms** with 4 execution profiles (Fast, Balanced, Quality, Stream):
- **DFG** - Directly-Follows Graph (0.5ms/100 events)
- **Alpha++** - Petri net discovery (5ms/100 events)
- **ILP Optimization** - Constraint-based optimal models
- **Genetic Algorithm** - Evolutionary discovery with fitness tuning
- **Particle Swarm Optimization** - Intelligence-based model evolution
- **A* Search** - Heuristic model discovery
- **DECLARE** - Constraint pattern discovery
- **Streaming Conformance** - Real-time trace validation (NEW)
- **Heuristic Miner**, **Inductive Miner**, **Hill Climbing**, **Ant Colony**, **Simulated Annealing**, **Process Skeleton**, **Optimized DFG**

### Professional Tools (NEW in v26.4.5)
- **pmctl CLI** - Command-line interface with init, run, watch, status, explain commands
- **Configuration System** - TOML/JSON/environment-based configuration with Zod validation
- **HTTP Service** - Express-based REST API + WebSocket streaming (OpenAPI documented)
- **Engine Lifecycle** - State machine for controlled algorithm execution
- **Observability** - Non-blocking logging with console, file, HTTP sinks

### 20+ Analytics Functions
Analyze process characteristics:
- Trace variants and sequential patterns
- Concept drift detection
- Clustering and trace similarity
- Activity dependencies and bottleneck analysis
- Resource utilization and temporal analysis

### Import/Export
- Load logs from **XES** (standard) and **JSON**
- Export discovered models to **PNML**, **DECLARE**, **JSON**
- Generate **Mermaid diagrams**, **D3 visualizations**, **HTML reports**

### Conformance Checking
Verify event logs against discovered models:
- Token-based replay with detailed deviation reports
- Fitness and precision metrics
- Trace classification (conforming/deviating)

### Claude Integration via MCP
Use wasm4pm directly with Claude through the Model Context Protocol:
- Discover models with natural language requests
- Analyze processes conversationally
- Generate visualizations on demand
- See [MCP.md](./wasm4pm/MCP.md) for setup

## 📦 Installation

```bash
npm install wasm4pm
```

### Requirements
- Node.js 16+ or modern browser
- ~2MB WASM binary (gzipped: ~600KB)

## 🎯 What's New in v26.4.5

### 10 New Packages
1. **@wasm4pm/pmctl** - Professional CLI tool
2. **@wasm4pm/config** - Configuration management
3. **@wasm4pm/engine** - Execution engine lifecycle
4. **@wasm4pm/service** - HTTP service layer
5. **@wasm4pm/observability** - Non-blocking logging
6. **@wasm4pm/contracts** - Type-safe contracts (Zod)
7. **@wasm4pm/types** - Shared TypeScript definitions
8. **@wasm4pm/kernel** - WASM kernel operations
9. **@wasm4pm/planner** - Algorithm recommendation
10. Plus: connectors, sinks, templates, testing, ocel

### Highlights
- **Streaming Conformance:** Real-time trace validation (177× faster)
- **Browser Tests:** Complete Chromium test suite, interactive benchmarks
- **Configuration:** TOML/JSON/env variables with precedence
- **Receipts:** Audit trails with BLAKE3 provenance tracking
- **Service Mode:** Deploy as Express HTTP server
- **100% Compatible:** No breaking changes from v26.4.4

See [RELEASE_NOTES.md](./RELEASE_NOTES.md) for complete details.

## ⚡ Quick Start

### Browser
```html
<script src="node_modules/wasm4pm/pkg/wasm4pm.js"></script>
<script>
  const pm = wasm4pm;
  await pm.init();
  
  // Load and discover
  const logHandle = pm.loadEventLogFromXES(xesContent);
  const dfg = pm.discoverDFG(logHandle);
  
  // Analyze
  const stats = pm.analyzeEventStatistics(logHandle);
  const variants = pm.discoverVariants(logHandle);
  
  // Export
  const mermaidDiagram = pm.generateMermaidDiagram(dfg);
  console.log(mermaidDiagram);
</script>
```

### Node.js
```javascript
const pm = require('wasm4pm');

await pm.init();

// Load from file
const fs = require('fs');
const xesContent = fs.readFileSync('eventlog.xes', 'utf8');
const logHandle = pm.loadEventLogFromXES(xesContent);

// Discover with multiple algorithms
const dfg = pm.discoverDFG(logHandle);
const alphaPlusPlus = pm.discoverAlphaPlusPlus(logHandle);
const genetic = pm.discoverGeneticAlgorithm(logHandle, { 
  populationSize: 50, 
  generations: 100 
});

// Analyze
const stats = pm.analyzeEventStatistics(logHandle);
const conformance = pm.checkConformance(logHandle, alphaPlusPlus);

console.log(JSON.stringify(conformance, null, 2));
```

### CLI
```bash
# Discover process models
wasm4pm discover data/log.xes dfg -o dfg.json
wasm4pm discover data/log.xes alpha++ -o petri.pnml
wasm4pm discover data/log.xes genetic -o evolved.json

# Analyze logs
wasm4pm analyze data/log.xes --metrics all
wasm4pm stats data/log.xes

# Generate visualizations
wasm4pm visualize data/log.xes dfg --output diagram.png
```

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| [**QUICKSTART.md**](./docs/QUICKSTART.md) | 5-minute setup and first algorithm |
| [**TUTORIAL.md**](./docs/TUTORIAL.md) | Step-by-step examples and workflows |
| [**API.md**](./wasm4pm/API.md) | Complete function reference |
| [**ALGORITHMS.md**](./wasm4pm/ALGORITHMS.md) | Algorithm descriptions and parameters |
| [**DEPLOYMENT.md**](./docs/DEPLOYMENT.md) | Build, test, and publish |
| [**FAQ.md**](./FAQ.md) | Common questions and troubleshooting |
| [**MCP.md**](./wasm4pm/MCP.md) | Model Context Protocol integration with Claude |
| [**THESIS.md**](./wasm4pm/THESIS.md) | Academic benchmarking and research |

## 📊 Performance

**Benchmarking Results** (see [THESIS.md](./process_mining_wasm/THESIS.md) for full details):

| Algorithm | 100 events | 1000 events | 10k events |
|-----------|-----------|-----------|-----------|
| DFG | 0.5ms | 5.0ms | 50ms |
| Process Skeleton | 0.3ms | 3.0ms | 30ms |
| Hill Climbing | 2.0ms | 20ms | 200ms |
| Alpha++ | 5.0ms | 50ms | 500ms |
| A* Search | 10ms | 100ms | 1000ms |
| ILP Optimization | 20ms | 200ms | 2000ms |
| Genetic Algorithm | 40ms | 400ms | 4000ms |

**Key Metrics:**
- Linear scalability across all algorithms (R² > 0.995)
- Sub-second processing for logs up to 10,000 events
- Memory efficient: 500KB-50MB for typical workloads
- Fitness scores: 85-99% depending on algorithm and data

## 🔧 Development

### Build from Source
```bash
cd process_mining_wasm

# Install dependencies
npm install

# Build for all targets
npm run build:all

# Run tests
npm test

# Build for specific target
npm run build:bundler   # Webpack, Vite, etc.
npm run build:nodejs    # Server-side
npm run build:web       # Browser script tags
```

### Project Structure
```
process_mining_wasm/
├── src/
│   ├── lib.rs              # WASM module entry
│   ├── models.rs           # Core data structures
│   ├── discovery.rs        # Basic algorithms
│   ├── advanced_algorithms.rs
│   ├── ilp_discovery.rs
│   ├── genetic_discovery.rs
│   ├── fast_discovery.rs
│   ├── more_discovery.rs
│   ├── final_analytics.rs
│   └── client.ts           # TypeScript bindings
├── benchmarks/
│   ├── benchmark.rs        # Performance tests
│   └── results.csv         # Benchmark results
├── Cargo.toml
├── package.json
└── wasm-pack.toml
```

### Running Tests
```bash
npm test                    # Run unit and integration tests
npm run test:integration   # Integration tests only
npm run bench              # Performance benchmarks
```

### CI/CD
Automated builds and tests via GitHub Actions:
- **Build**: Linux, macOS, Windows with Node.js 18+
- **Test**: Unit tests, integration tests, benchmarks
- **Publish**: Automatic npm publishing on release

## 🎯 Use Cases

### Real-Time Process Monitoring
Monitor live event streams and detect process deviations:
```javascript
const log = pm.createEventLog();
for (const event of liveStream) {
  log.addEvent(event);
  const currentModel = pm.discoverDFG(log);
  const conformance = pm.checkConformance(log, currentModel);
  console.log(`Current fitness: ${conformance.fitness}`);
}
```

### Comparative Analysis
Compare multiple discovery algorithms:
```javascript
const algorithms = [
  { name: 'DFG', fn: (log) => pm.discoverDFG(log) },
  { name: 'Alpha++', fn: (log) => pm.discoverAlphaPlusPlus(log) },
  { name: 'Genetic', fn: (log) => pm.discoverGeneticAlgorithm(log) }
];

const results = algorithms.map(({ name, fn }) => ({
  name,
  model: fn(log),
  fitness: pm.checkConformance(log, fn(log)).fitness
}));

console.table(results);
```

### Process Bottleneck Detection
Identify and visualize performance bottlenecks:
```javascript
const bottlenecks = pm.detectBottlenecks(log);
const dependencies = pm.analyzeActivityDependencies(log);
const diagram = pm.generateD3Graph({
  nodes: dependencies.activities,
  edges: dependencies.relationships,
  highlight: bottlenecks.activities
});
```

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make changes and test locally: `npm test`
4. Submit a pull request with clear description

### Code Style
- Run `cargo fmt` before committing
- Follow Rust conventions
- Add tests for new features
- Update documentation

## 📝 License

This project is dual-licensed under:
- **Apache License 2.0** - [LICENSE-APACHE](./LICENSE-APACHE)
- **MIT License** - [LICENSE-MIT](./LICENSE-MIT)

Choose whichever license works best for your use case.

## 🔗 Links

- **NPM Package**: https://www.npmjs.com/package/wasm4pm
- **GitHub**: https://github.com/seanchatmangpt/wasm4pm
- **Documentation**: See docs/ directory
- **Research Paper**: [THESIS.md](./process_mining_wasm/THESIS.md)

## 📚 Citation

If you use wasm4pm in your research, please cite:

```bibtex
@software{wasm4pm2026,
  title={wasm4pm: Process Mining for WebAssembly},
  author={Sean Chat Man GPT},
  year={2026},
  url={https://github.com/seanchatmangpt/wasm4pm}
}
```

## 🙋 Support

- **Documentation**: See [TUTORIAL.md](./docs/TUTORIAL.md) and [FAQ.md](./docs/FAQ.md)
- **Issues**: Report bugs on [GitHub](https://github.com/seanchatmangpt/wasm4pm/issues)
- **Discussions**: Join [GitHub Discussions](https://github.com/seanchatmangpt/wasm4pm/discussions)

---

<div align="center">
Built with Rust + WebAssembly for performance. Designed for JavaScript developers.
</div>
