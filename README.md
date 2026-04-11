<div align="center">
<h1><strong>pictl</strong> - Process Mining for WebAssembly</h1>
<p><strong>High-Performance Process Mining Algorithms in JavaScript/TypeScript</strong></p>
<p>
  <a href="https://www.npmjs.com/package/@seanchatmangpt/pictl">
    <img src="https://img.shields.io/npm/v/@seanchatmangpt/pictl" alt="npm version"/></a>
  <a href="https://www.npmjs.com/package/@seanchatmangpt/pictl">
    <img src="https://img.shields.io/npm/dm/@seanchatmangpt/pictl" alt="npm downloads"/></a>
  <a href="https://github.com/seanchatmangpt/pictl">
    <img src="https://img.shields.io/github/stars/seanchatmangpt/pictl" alt="GitHub stars"/></a>
</p>
<img src="Ferris emerges from the black hole.png" width="300" alt="pictl logo: Ferris emerges from the black hole"/>
</div>

---

## What is pictl?

**pictl** is a comprehensive, enterprise-grade process mining platform compiled to WebAssembly. It brings production-grade process discovery, conformance checking, analysis, and automation capabilities to browsers, Node.js, and containers.

Process mining extracts actionable insights from event logs by discovering process models, detecting deviations, and analyzing performance bottlenecks. **pictl** makes this accessible to JavaScript developers with near-native performance, plus professional CLI tools, HTTP APIs, and observability for enterprise deployments.

### Version 26.4.9 (April 2026)
**Deployment Profiles:** Optimized WASM builds for different target environments. Choose from 5 profiles (browser ~500KB, edge ~1.5MB, fog ~2.0MB, iot ~1.0MB, cloud ~2.78MB) to reduce binary size by up to 82% for production use. Zero breaking changes — default build unchanged.

### Version 26.4.5 (April 2026)
**Major Release:** Added 10 new packages (engine, config, service, observability, contracts, types, kernel, planner, templates, testing) while maintaining 100% backward compatibility. Introduces professional CLI tool (pmctl), configuration management, HTTP service layer, and comprehensive observability.

## 🚀 Key Capabilities

### Deployment Profiles (NEW in v26.4.8)

Choose the right build for your target environment:

| Profile | Size | Use Case | Build Command |
|---------|------|----------|--------------|
| **browser** | ~500KB | Web browsers, mobile web | `npm run build:browser` |
| **edge** | ~1.5MB | Edge servers, CDN workers | `npm run build:edge` |
| **fog** | ~2.0MB | Fog computing, IoT gateways | `npm run build:fog` |
| **iot** | ~1.0MB | IoT devices, embedded systems | `npm run build:iot` |
| **cloud** | ~2.78MB | Cloud servers (default) | `npm run build` |

**Key Features:**
- **Zero Breaking Changes:** Default `npm run build` unchanged (cloud profile)
- **Production Optimization:** Profile builds reduce size up to 82%
- **Conditional Compilation:** 30+ modules use `#[cfg(feature)]` gates
- **Smart Defaults:** npm package includes full features for immediate experimentation

```bash
# Development (unchanged)
npm run build  # Full features (2.78MB)

# Production (size-optimized)
npm run build:browser  # ~500KB (82% smaller!)
```

See [DEPLOYMENT_PROFILES.md](./wasm4pm/DEPLOYMENT_PROFILES.md) for complete guide.

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
Use pictl directly with Claude through the Model Context Protocol:
- Discover models with natural language requests
- Analyze processes conversationally
- Generate visualizations on demand
- See [MCP.md](./wasm4pm/MCP.md) for setup

## 📦 Installation

```bash
npm install @seanchatmangpt/pictl
```

### Requirements
- Node.js 16+ or modern browser
- **Binary size varies by deployment profile:**
  - browser: ~500KB (gzipped: ~150KB)
  - iot: ~1.0MB (gzipped: ~300KB)
  - edge: ~1.5MB (gzipped: ~450KB)
  - fog: ~2.0MB (gzipped: ~600KB)
  - cloud: ~2.78MB (gzipped: ~800KB, default)

## 🎯 What's New in v26.4.8

### Deployment Profiles
- **5 deployment profiles** for optimized WASM binary sizes
- **Up to 82% size reduction** for browser/iot deployments
- **Profile-specific build scripts:** `npm run build:{browser,edge,fog,iot,cloud}`
- **Conditional compilation:** 30+ modules use `#[cfg(feature)]` gates
- **Hand-rolled statistics:** Replaces statrs for size-constrained profiles (~200KB savings)
- **Zero breaking changes:** Default build produces full-featured binary

### Key Features
- **browser profile** (~500KB): Web browsers, mobile web
- **edge profile** (~1.5MB): Edge servers, CDN workers
- **fog profile** (~2.0MB): Fog computing, IoT gateways
- **iot profile** (~1.0MB): IoT devices, embedded systems
- **cloud profile** (~2.78MB): Full feature set (default)

### Technical Implementation
- **Cargo.toml:** 30+ feature flags for modular compilation
- **lib.rs:** Conditional module compilation for POWL, advanced discovery, ML, OCEL, streaming, conformance
- **hand_stats.rs:** Hand-rolled statistics replacing statrs for minimal builds
- **TypeScript registry:** Deployment profile filtering with auto-inference

See [DEPLOYMENT_PROFILES.md](./wasm4pm/DEPLOYMENT_PROFILES.md) for complete guide.

## 🎯 What's New in v26.4.5

### 9 Consolidated Packages
1. **@pictl/contracts** - Type-safe contracts, receipts, errors, algorithm registry
2. **@pictl/config** - Configuration management with Zod validation
3. **@pictl/engine** - Execution engine lifecycle state machine
4. **@pictl/observability** - Non-blocking logging and OTEL spans
5. **@pictl/kernel** - WASM kernel operations (21 algorithms)
6. **@pictl/planner** - Algorithm recommendation and execution plans
7. **@pictl/testing** - Parity, determinism, CLI, and OTEL test harnesses
8. **@pictl/ml** - Micro-ML analysis (classify, cluster, forecast, anomaly, regress, PCA)
9. **@pictl/swarm** - Multi-worker coordinator with convergence detection

### Highlights
- **Streaming Conformance:** Real-time trace validation (177× faster)
- **Browser Tests:** Complete Chromium test suite, interactive benchmarks
- **Configuration:** TOML/JSON/env variables with precedence
- **Receipts:** Audit trails with BLAKE3 provenance tracking
- **Service Mode:** Deploy as Express HTTP server
- **100% Compatible:** No breaking changes from v26.4.4

See [RELEASE_NOTES.md](./RELEASE_NOTES.md) for complete details.

## ⚡ Quick Start

### Building with Deployment Profiles (NEW in v26.4.8)

Choose the right build for your target environment:

```bash
# Default: Full features (2.78MB) - Development & cloud servers
npm run build

# Production optimization: Size-constrained builds
npm run build:browser  # ~500KB for web browsers
npm run build:edge     # ~1.5MB for edge servers
npm run build:fog      # ~2.0MB for fog computing
npm run build:iot      # ~1.0MB for IoT devices

# Build all profiles for testing
npm run build:all-profiles

# Check binary size
npm run size:check
```

**Which profile should you use?**
- **browser** — Web apps, mobile web, progressive web apps
- **edge** — CDN workers, Cloudflare Workers, edge servers
- **fog** — Regional aggregation, IoT gateways, on-premise servers
- **iot** — Embedded devices, resource-constrained environments
- **cloud** — Cloud servers, data centers, unlimited resources (default)

### Browser
```html
<script src="node_modules/@seanchatmangpt/pictl/pkg/pictl.js"></script>
<script>
  const pm = pictl;
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
const pm = require('@seanchatmangpt/pictl');

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
pictl-service --port 3000 --workers 4

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
| [**RELEASE_NOTES.md**](./RELEASE_NOTES.md) | v26.4.8 and v26.4.5 release notes |
| [**DEPLOYMENT_PROFILES.md**](./wasm4pm/DEPLOYMENT_PROFILES.md) | Deployment profile guide (v26.4.8) |
| [**CHANGELOG.md**](./CHANGELOG.md) | Complete version history |
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
| [**pictl CLI**](./apps/pmctl/README.md) | CLI tool reference |
| [**@pictl/kernel**](./packages/kernel/README.md) | WASM kernel, 21 algorithms |
| [**@pictl/config**](./packages/config/README.md) | Configuration system |
| [**@pictl/engine**](./packages/engine/README.md) | Engine lifecycle |
| [**@pictl/observability**](./packages/observability/README.md) | Logging and telemetry |
| [**@pictl/contracts**](./packages/contracts/README.md) | Type-safe contracts |
| [**@pictl/planner**](./packages/planner/README.md) | Algorithm planner |
| [**@pictl/testing**](./packages/testing/README.md) | Test harnesses |
| [**@pictl/ml**](./packages/ml/README.md) | Micro-ML analysis |
| [**@pictl/swarm**](./packages/swarm/README.md) | Multi-worker coordinator |

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

# Build all packages (default: cloud profile, full features)
pnpm build

# Build with deployment profile
cd wasm4pm
npm run build:browser  # Size-optimized for web browsers
npm run build:cloud    # Full features (same as default)

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
pictl/                             # Monorepo root
├── apps/
│   └── pmctl/                      # CLI tool (pictl)
│       ├── src/commands/           # run, compare, diff, predict, ml, powl, etc.
│       └── package.json
├── packages/
│   ├── contracts/                  # Type-safe contracts, receipts, errors (@pictl/contracts)
│   ├── config/                     # Configuration with Zod validation (@pictl/config)
│   ├── engine/                     # Engine lifecycle state machine (@pictl/engine)
│   ├── observability/              # Non-blocking logging + OTEL (@pictl/observability)
│   ├── kernel/                     # WASM kernel, 21 algorithms (@pictl/kernel)
│   ├── planner/                    # Algorithm planner + explain (@pictl/planner)
│   ├── testing/                    # Test harnesses (@pictl/testing)
│   ├── ml/                         # Micro-ML analysis (@pictl/ml)
│   └── swarm/                      # Multi-worker coordinator (@pictl/swarm)
├── wasm4pm/                        # Rust/WASM core (21 algorithms)
│   ├── src/
│   │   ├── lib.rs                  # WASM entry point + conditional compilation
│   │   ├── discovery.rs            # Discovery algorithms
│   │   ├── hand_stats.rs           # Hand-rolled statistics (size-constrained profiles)
│   │   └── ...                     # 30+ modules with #[cfg(feature)] gates
│   ├── Cargo.toml                  # 30+ feature flags for deployment profiles
│   ├── DEPLOYMENT_PROFILES.md      # Deployment profile guide
│   └── package.json                # npm package for compiled WASM
├── docs/                           # Documentation (Diataxis)
│   ├── INDEX.md                    # Documentation hub
│   ├── THESIS-V2.md                # Academic thesis (v2)
│   ├── PACKAGE_IMPLEMENTATION_HISTORY.md
│   ├── archive/                    # Historical content
│   ├── tutorials/                  # Hands-on guides
│   ├── how-to/                     # Task-focused guides
│   ├── explanation/                # Conceptual deep-dives
│   └── reference/                  # Technical specs
├── CHANGELOG.md                    # Complete version history
├── RELEASE_NOTES.md                # Release notes
└── README.md                       # This file
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

- **NPM Package**: https://www.npmjs.com/package/@seanchatmangpt/pictl
- **GitHub**: https://github.com/seanchatmangpt/pictl
- **Documentation**: See docs/ directory
- **Research Paper**: See [REAL-BENCHMARK-RESULTS.md](./docs/REAL-BENCHMARK-RESULTS.md) for benchmarks and performance data

## 📚 Citation

If you use pictl in your research, please cite:

```bibtex
@software{pictl2026,
  title={pictl: Process Mining for WebAssembly},
  author={Sean Chat Man GPT},
  year={2026},
  url={https://github.com/seanchatmangpt/pictl}
}
```

## 🙋 Support

- **Documentation**: See [TUTORIAL.md](./docs/TUTORIAL.md) and [FAQ.md](./docs/FAQ.md)
- **Issues**: Report bugs on [GitHub](https://github.com/seanchatmangpt/pictl/issues)
- **Discussions**: Join [GitHub Discussions](https://github.com/seanchatmangpt/pictl/discussions)

---

<div align="center">
Built with Rust + WebAssembly for performance. Designed for JavaScript developers.
</div>
