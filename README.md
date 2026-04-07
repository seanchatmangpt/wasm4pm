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
<img src="Ferris emerges from the black hole.png" width="300" alt="wasm4pm logo: Ferris emerges from the black hole"/>
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

### Predictive Process Mining (NEW in Phase 4)
18 prediction algorithms organized by Van der Aalst process mining perspectives:

| Perspective | Question | Algorithms |
|-------------|----------|-----------|
| **Next Activity** | What happens next? | Top-k prediction, beam search |
| **Remaining Time** | When does it finish? | Weibull regression, hazard rate |
| **Outcome** | Does it complete normally? | Anomaly score, boundary coverage, trace likelihood |
| **Drift** | Has the process changed? | EWMA, Jaccard window detection |
| **Features** | What describes this case? | Prefix features, rework score, transition graph |
| **Resource** | What should we do? | M/M/1 queue model, UCB1 bandit, intervention ranking |

Run predictions from the CLI:
```bash
pmctl predict next-activity --input log.xes
pmctl predict drift --input log.xes
pmctl predict features --input log.xes --prefix '["A","B","C"]'
```

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

### CLI (pmctl - NEW)
```bash
# Initialize project with configuration
pmctl init

# Discover with balanced profile
pmctl run data/log.xes --algorithm genetic --profile balanced

# Watch directory for continuous processing
pmctl watch data/ --output results/ --profile fast

# Check system and engine status
pmctl status --verbose

# Get algorithm recommendations
pmctl explain --algorithm genetic --level detailed
```

### HTTP Service (NEW)
```bash
# Start HTTP service
wasm4pm-service --port 3000 --workers 4

# Send discovery request
curl -X POST http://localhost:3000/api/v1/discover \
  -H "Content-Type: application/json" \
  -d '{
    "logPath": "data.xes",
    "algorithm": "genetic",
    "parameters": {"populationSize": 50}
  }'

# Stream results via WebSocket
wscat -c ws://localhost:3000/api/v1/stream
```

## 📚 Documentation

### Core Documentation
| Document | Purpose |
|----------|---------|
| [**RELEASE_NOTES.md**](./RELEASE_NOTES.md) | v26.4.5 release overview |
| [**MIGRATION_GUIDE.md**](./MIGRATION_GUIDE.md) | Upgrading from v26.4.4 |
| [**QUICKSTART.md**](./docs/QUICKSTART.md) | 5-minute setup guide |
| [**TUTORIAL.md**](./docs/TUTORIAL.md) | Real-world examples |
| [**DEPLOYMENT.md**](./docs/DEPLOYMENT.md) | Build, test, and deploy |

### Reference Documentation
| Document | Purpose |
|----------|---------|
| [**API.md**](./docs/API.md) | Complete function reference + pmctl commands |
| [**ALGORITHMS.md**](./docs/reference/algorithms.md) | Algorithm descriptions and parameters |
| [**FAQ.md**](./docs/FAQ.md) | Troubleshooting and common questions |

### Package Documentation
| Package | Purpose |
|---------|---------|
| [**pmctl**](./apps/pmctl/README.md) | CLI tool reference |
| [**@wasm4pm/config**](./packages/config/README.md) | Configuration system |
| [**@wasm4pm/engine**](./packages/engine/README.md) | Engine lifecycle |
| [**@wasm4pm/service**](./packages/service/README.md) | HTTP API service |
| [**@wasm4pm/observability**](./packages/observability/README.md) | Logging and telemetry |
| [**@wasm4pm/contracts**](./packages/contracts/README.md) | Type-safe contracts |

### Advanced Documentation
| Document | Purpose |
|----------|---------|
| [**BROWSER-BENCHMARKS.md**](./docs/BROWSER-BENCHMARKS.md) | Browser performance testing |
| [**MCP.md**](./wasm4pm/MCP.md) | Claude integration (Model Context Protocol) |

## 📊 Performance

**Benchmarking Results** (See [BROWSER-BENCHMARKS.md](./docs/BROWSER-BENCHMARKS.md) and [reference/benchmarks.md](./docs/reference/benchmarks.md) for full details):

| Algorithm | 100 events | 1K events | 10K events | 100K events |
|-----------|-----------|-----------|-----------|-----------|
| DFG | 0.5ms | 5ms | 50ms | 500ms |
| Streaming DFG | 0.2ms | 2ms | 20ms | 200ms |
| Process Skeleton | 0.3ms | 3ms | 30ms | 300ms |
| Hill Climbing | 2ms | 20ms | 200ms | 2000ms |
| Alpha++ | 5ms | 50ms | 500ms | 5000ms |
| A* Search | 10ms | 100ms | 1000ms | 10000ms |
| ILP Optimization | 20ms | 200ms | 2000ms | ~timeout |
| Genetic Algorithm | 40ms | 400ms | 4000ms | ~timeout |

**Key Metrics (v26.4.5):**
- Linear scalability (R² > 0.995) across all algorithms
- Sub-second processing for logs up to 100K events
- Streaming conformance: 177× speedup for large logs
- Memory efficient: 500KB baseline + O(open_traces × trace_length)
- Fitness scores: 85-99% depending on algorithm and data
- Browser performance: Within 20% of Node.js

**Execution Profiles:**
- **Fast** - Best for real-time (< 100ms)
- **Balanced** - Default production choice
- **Quality** - Research and offline analysis
- **Stream** - IoT and event ingestion

## 🔧 Development

### Build from Source
```bash
# Install dependencies (pnpm workspace)
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test

# Build specific targets
pnpm build:wasm         # WASM core library
pnpm build:cli          # pmctl CLI
pnpm build:engine       # Engine lifecycle
pnpm build:service      # HTTP service

# Watch mode for development
pnpm dev
```

### Project Structure
```
wasm4pm/                           # Monorepo root
├── apps/
│   └── pmctl/                      # CLI tool (@wasm4pm/pmctl)
│       ├── src/commands/           # init, run, watch, status, explain
│       ├── tests/                  # Integration tests
│       └── package.json
├── packages/
│   ├── config/                     # Configuration system (@wasm4pm/config)
│   ├── contracts/                  # Type contracts (@wasm4pm/contracts)
│   ├── engine/                     # Engine lifecycle (@wasm4pm/engine)
│   ├── observability/              # Logging layer (@wasm4pm/observability)
│   ├── service/                    # HTTP service (@wasm4pm/service)
│   ├── types/                      # Shared types (@wasm4pm/types)
│   ├── kernel/                     # WASM kernel (@wasm4pm/kernel)
│   ├── planner/                    # Algorithm planner (@wasm4pm/planner)
│   ├── connectors/                 # Data connectors
│   ├── sinks/                      # Output sinks
│   ├── templates/                  # Configuration templates
│   ├── testing/                    # Test utilities
│   ├── ocel/                       # Object-centric support
│   └── wasm4pm/                    # Core WASM library
│       ├── src/
│       │   ├── lib.rs              # WASM entry point
│       │   ├── discovery.rs        # Discovery algorithms
│       │   ├── advanced_algorithms.rs
│       │   ├── fast_discovery.rs   # A*, Hill Climbing
│       │   ├── genetic_discovery.rs
│       │   ├── more_discovery.rs   # ACO, Annealing
│       │   ├── models.rs           # Core types
│       │   ├── analysis.rs         # Analytics
│       │   └── client.ts           # TypeScript bindings
│       ├── benchmarks/             # Performance tests
│       └── __tests__/              # Integration tests
├── docs/                           # Documentation (Diataxis)
│   ├── INDEX.md                    # Full doc index
│   ├── QUICKSTART.md
│   ├── TUTORIAL.md
│   ├── DEPLOYMENT.md
│   ├── API.md
│   ├── FAQ.md
│   ├── tutorials/                  # 7 hands-on guides
│   ├── how-to/                     # 20 task-focused guides
│   ├── explanation/                # 12 conceptual deep-dives
│   ├── reference/                  # 16 technical specs
│   └── BROWSER-BENCHMARKS.md
├── examples/                       # Example scripts
├── RELEASE_NOTES.md                # This version's highlights
├── MIGRATION_GUIDE.md              # Upgrade guide
├── README.md                       # This file
└── package.json                    # Workspace manifest
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
- **Research Paper**: See [REAL-BENCHMARK-RESULTS.md](./docs/REAL-BENCHMARK-RESULTS.md) for benchmarks and performance data

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
