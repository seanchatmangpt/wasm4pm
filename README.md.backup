<div align="center">
<h1><strong>wasm4pm</strong> - Process Mining for WebAssembly</h1>
<p><strong>High-Performance Process Mining Algorithms in JavaScript/TypeScript</strong></p>
<p>
  <a href="https://www.npmjs.com/package/@wasm4pm/cli">
    <img src="https://img.shields.io/npm/v/@wasm4pm/cli" alt="npm version"/></a>
  <a href="https://www.npmjs.com/package/@wasm4pm/cli">
    <img src="https://img.shields.io/npm/dm/@wasm4pm/cli" alt="npm downloads"/></a>
  <a href="https://github.com/seanchatmangpt/wasm4pm">
    <img src="https://img.shields.io/github/stars/seanchatmangpt/wasm4pm" alt="GitHub stars"/></a>
</p>
<img src="https://raw.githubusercontent.com/seanchatmangpt/wasm4pm/main/Ferris%20emerges%20from%20the%20black%20hole.png" width="300" alt="wasm4pm logo: Ferris emerges from the black hole"/>
</div>

---

## What is wasm4pm?

**wasm4pm** is a comprehensive, enterprise-grade process mining platform compiled to WebAssembly. It brings production-grade process discovery, conformance checking, analysis, and automation capabilities to browsers, Node.js, and containers.

Process mining extracts actionable insights from event logs by discovering process models, detecting deviations, and analyzing performance bottlenecks. **wasm4pm** makes this accessible to JavaScript developers with near-native performance, plus professional CLI tools, HTTP APIs, and observability for enterprise deployments.

### Version 26.4.28 (April 2026)
**High-Performance Rust CLI:** New `wpm` (wasm4pm) Rust CLI for system diagnostics, process discovery, and conformance checking. Replaces the legacy TypeScript CLI with nanosecond-latency architecture. Includes `doctor`, `wizard`, `telco`, and `mining` commands.

### Version 26.4.15 (April 2026)
**Van der Aalst Agents:** 8 autonomous adversarial agents for manufacturing integrity validation using process mining principles (soundness, conformance, multi-surface corroboration). New `wpm agent` commands: execute, list, audit, status, register.

**MTTR Optimization:** Mean Time To Recovery reduced from 3 minutes to <1 second through fast recovery paths. All 12 dashboard metrics now GREEN ✅.

**Toyota Production System Compliance:** Comprehensive TPS violation audit completed — 54 violations fixed across Rust, TypeScript, and Shell/Make. System now follows **fail-fast** principles instead of silent degradation.

**Key Improvements:**
- **MTTR (Mean Time To Recovery)**: <1min average (measured) — reduced from 3min hardcoded placeholder
- **Recovery Paths**: Fast recovery (degraded→ready ~10-100ms, failed→ready <1s when WASM intact)
- **Test Pass Rate**: 100% (89/89 tests passing) — improved from 25% after WvdA test cleanup
- **Error Handling**: Removed all silent fallback patterns; errors now propagate visibly
- **WASM Loading**: Soft reset preserves compiled module (no re-import/re-compile)
- **Timeout Protection**: Recovery operations timeout-protected (30s default)

**Architectural Changes:**
- `StateMachine.getMTTR()` — actual runtime measurement, not hardcoded placeholder
- `WasmLoader.softReset()` — preserves compiled WASM for fast recovery
- `Engine.fastRecoverFromFailed()` — direct failed→ready transition when WASM intact
- Recovery instrumentation with OTEL spans — full observability of recovery operations
- No more `isWasmAvailable` defensive guards — system fails loudly if unavailable

### Version 26.4.16 (April 2026)
**Deployment Profiles Reorganized:** Renamed "cloud" profile to "browser" (default, all 41 algorithms, 2.78MB) and "browser" profile to "mobile" (minimal, 500KB, 82% smaller). Choose from 5 optimized WASM builds: mobile ~500KB, edge ~1.5MB, fog ~2.0MB, iot ~1.0MB, browser ~2.78MB (default). Zero breaking changes — `npm run build` now builds the full browser profile.

### Version 26.4.5 (April 2026)
**Major Release:** Added 10 new packages (engine, config, service, observability, contracts, types, kernel, planner, templates, testing) while maintaining 100% backward compatibility. Introduces professional CLI tool (wasm4pm), configuration management, HTTP service layer, and comprehensive observability.

## 🚀 Key Capabilities

### Deployment Profiles (NEW in v26.4.8)

Choose the right build for your target environment:

| Profile | Size | Use Case | Build Command |
|---------|------|----------|--------------|
| **mobile** | ~1.8MB* | Mobile apps, minimal web | `npm run build:mobile` |
| **edge** | ~2.1MB* | Edge servers, CDN workers | `npm run build:edge` |
| **fog** | ~2.4MB* | Fog computing, IoT gateways | `npm run build:fog` |
| **iot** | ~1.9MB* | IoT devices, embedded systems | `npm run build:iot` |
| **browser** | **2.7MB** | Cloud servers, web apps (default) | `npm run build` |

*Sizes are feature-gate targets; actual sizes depend on feature flag implementation status. Browser profile (measured): **2697 KB**

**Key Features:**
- **Browser Profile Default:** `npm run build` now builds the full-featured browser profile (all 41 algorithms, 2.78MB)
- **Production Optimization:** Smaller profiles (mobile, edge, fog) reduce size up to 82%
- **Conditional Compilation:** 30+ modules use `#[cfg(feature)]` gates
- **Smart Defaults:** npm package includes full features for immediate experimentation

```bash
# Development (default: full features)
npm run build  # Browser profile: all 41 algorithms (2.78MB)

# Production (size-optimized)
npm run build:mobile  # ~500KB (82% smaller!)
npm run build:edge    # ~1.5MB
npm run build:fog     # ~2.0MB
```

See [DEPLOYMENT_PROFILES.md](https://github.com/seanchatmangpt/wasm4pm/blob/main/wasm4pm/DEPLOYMENT_PROFILES.md) for complete guide.

### Discovery Layer
**41 Algorithms** across discovery, ML analysis, and utility functions with 4 execution profiles (Fast, Balanced, Quality, Stream):

**Discovery (15 algorithms):**
- **DFG** - Directly-Follows Graph (0.5ms/100 events)
- **Alpha++** - Petri net discovery (5ms/100 events)
- **ILP Optimization** - Constraint-based optimal models
- **Genetic Algorithm** - Evolutionary discovery with fitness tuning
- **Particle Swarm Optimization** - Intelligence-based model evolution
- **A* Search** - Heuristic model discovery
- **Ant Colony Optimization** - Nature-inspired discovery
- **DECLARE** - Constraint pattern discovery
- **Heuristic Miner** - Frequency-based discovery
- **Inductive Miner** - Process tree discovery
- **Hill Climbing** - Local search optimization
- **Simulated Annealing** - Probabilistic optimization
- **Process Skeleton** - Fast skeleton discovery
- **Optimized DFG** - High-quality DFG
- **SIMD Streaming DFG** - Parallel streaming discovery

**ML Analysis (6 algorithms):**
- **ml_classify** - Decision tree, naive Bayes classification
- **ml_cluster** - K-means clustering
- **ml_forecast** - Linear/polynomial/exponential regression
- **ml_anomaly** - EMA smoothing, information-theoretic scoring
- **ml_regress** - Linear regression
- **ml_pca** - Principal component analysis

**Analysis & Utilities (20+ algorithms):**
- Transition systems, causal graphs, performance spectrum
- Conformance checking (alignments, token replay)
- Import/export (PNML, BPMN, POWL, YAWL)
- Simulation (playout, Monte Carlo)
- Complexity metrics, generalization
- Streaming logs, hierarchical DFG

### Professional Tools (NEW in v26.4.5)
- **wpm CLI** - Command-line interface with init, run, watch, status, explain commands
- **Configuration System** - TOML/JSON/environment-based configuration with Zod validation
- **HTTP Service** - Express-based REST API + WebSocket streaming (OpenAPI documented)
- **Engine Lifecycle** - State machine for controlled algorithm execution
- **Observability** - Non-blocking logging with console, file, HTTP sinks

### Van der Aalst Agents (NEW in v26.4.15)
**8 autonomous adversarial agents** for manufacturing integrity validation using process mining principles:

1. **MockInterceptor** — Detects mock/stub patterns in production code
2. **ConfigDriftGuardian** — Detects weakened enforcement and configuration drift
3. **ReceiptChainAttacker** — Validates BLAKE3 receipt chains for provenance
4. **GateIndependenceVerifier** — Prevents circular dependencies in validation gates
5. **EvidenceFabricationDetector** — Detects fabricated telemetry and fake spans
6. **ProcessMiningSkeptic** — Validates process models with pm4py conformance
7. **TheaterDetector** — Identifies testing theater vs. production behavior
8. **AuthorityEscalationWatcher** — Detects privilege escalation patterns

**CLI Commands:**
```bash
wasm4pm agent execute mock-interceptor --target ./src
wasm4pm agent list
wasm4pm agent audit --severity critical
wasm4pm agent status
wasm4pm agent register custom-agent ./path/to/agent.ts
```

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
wpm predict next-activity --input log.xes
wpm predict drift --input log.xes
wpm predict features --input log.xes --prefix '["A","B","C"]'
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
- See [MCP.md](https://github.com/seanchatmangpt/wasm4pm/blob/main/wasm4pm/MCP.md) for setup

## 📦 Installation

```bash
npm install @wasm4pm/cli
```

### Requirements
- Node.js 16+ or modern browser
- **Binary size by deployment profile (feature gates in progress):**
  - mobile: ~1.8MB target (gzipped: ~540KB estimate)
  - iot: ~1.9MB target (gzipped: ~570KB estimate)
  - edge: ~2.1MB target (gzipped: ~630KB estimate)
  - fog: ~2.4MB target (gzipped: ~720KB estimate)
  - browser: **2.7MB measured** (gzipped: ~810KB, default)

## 🎯 What's New in v26.4.8

### Deployment Profiles
- **5 deployment profiles** for optimized WASM binary sizes
- **Up to 82% size reduction** for mobile/iot deployments
- **Profile-specific build scripts:** `npm run build:{mobile,edge,fog,iot,browser}`
- **Conditional compilation:** 30+ modules use `#[cfg(feature)]` gates
- **Hand-rolled statistics:** Replaces statrs for size-constrained profiles (~200KB savings)
- **Default build:** `npm run build` produces full-featured browser profile (2.78MB, all 41 algorithms)

### Key Features
- **mobile profile** (~500KB): Mobile apps, minimal web builds
- **edge profile** (~1.5MB): Edge servers, CDN workers
- **fog profile** (~2.0MB): Fog computing, IoT gateways
- **iot profile** (~1.0MB): IoT devices, embedded systems
- **browser profile** (~2.78MB): All algorithms, cloud servers, full-featured web apps (default)

### Technical Implementation
- **Cargo.toml:** 30+ feature flags for modular compilation
- **lib.rs:** Conditional module compilation for POWL, advanced discovery, ML, OCEL, streaming, conformance
- **hand_stats.rs:** Hand-rolled statistics replacing statrs for minimal builds
- **TypeScript registry:** Deployment profile filtering with auto-inference

See [DEPLOYMENT_PROFILES.md](https://github.com/seanchatmangpt/wasm4pm/blob/main/wasm4pm/DEPLOYMENT_PROFILES.md) for complete guide.

## 🎯 What's New in v26.4.15

### Van der Aalst Agents
- **8 autonomous adversarial agents** for manufacturing integrity validation
- **Agent orchestration** with MAPEK cycle (Monitor-Analyze-Plan-Execute-Knowledge)
- **Audit trail** with severity-based filtering and corroboration
- **MCP integration** for agent-based validation via Model Context Protocol
- **CLI commands:** execute, list, audit, status, register

### Agent Capabilities
- **Mock detection** — Identifies mock/stub patterns in production code
- **Config drift** — Detects weakened enforcement and configuration changes
- **Receipt validation** — Verifies BLAKE3 provenance chains
- **Gate independence** — Prevents circular dependencies
- **Evidence verification** — Detects fabricated telemetry
- **Process validation** — Uses pm4py for conformance checking
- **Theater detection** — Distinguishes test from production behavior
- **Privilege monitoring** — Detects escalation patterns

## 🎯 What's New in v26.4.5

### 10 Consolidated Packages
1. **@wasm4pm/contracts** - Type-safe contracts, receipts, errors, algorithm registry
2. **@wasm4pm/config** - Configuration management with Zod validation
3. **@wasm4pm/engine** - Execution engine lifecycle state machine
4. **@wasm4pm/observability** - Non-blocking logging and OTEL spans
5. **@wasm4pm/kernel** - WASM kernel operations (41 algorithms)
6. **@wasm4pm/planner** - Algorithm recommendation and execution plans
7. **@wasm4pm/testing** - Parity, determinism, CLI, and OTEL test harnesses
8. **@wasm4pm/ml** - Micro-ML analysis (classify, cluster, forecast, anomaly, regress, PCA)
9. **@wasm4pm/swarm** - Multi-worker coordinator with convergence detection
10. **@wasm4pm/agents** - Van der Aalst adversarial agents for manufacturing integrity validation

### Highlights
- **Streaming Conformance:** Real-time trace validation (177× faster)
- **Browser Tests:** Complete Chromium test suite, interactive benchmarks
- **Configuration:** TOML/JSON/env variables with precedence
- **Receipts:** Audit trails with BLAKE3 provenance tracking
- **Service Mode:** Deploy as Express HTTP server
- **100% Compatible:** No breaking changes from v26.4.4

See [RELEASE_NOTES.md](https://github.com/seanchatmangpt/wasm4pm/blob/main/RELEASE_NOTES.md) for complete details.

## ⚡ Quick Start

### Building with Deployment Profiles (Updated in v26.4.16)

Choose the right build for your target environment:

```bash
# Default: Full features (2.78MB) - Development & cloud servers
npm run build  # Browser profile (all 41 algorithms)

# Production optimization: Size-constrained builds
npm run build:mobile  # ~500KB for mobile apps & minimal web
npm run build:edge    # ~1.5MB for edge servers
npm run build:fog     # ~2.0MB for fog computing
npm run build:iot     # ~1.0MB for IoT devices

# Build all profiles for testing
npm run build:all-profiles

# Check binary size
npm run size:check
```

**Which profile should you use?**
- **mobile** — Mobile apps, minimal web builds, size-critical deployments (82% smaller)
- **edge** — CDN workers, Cloudflare Workers, edge servers
- **fog** — Regional aggregation, IoT gateways, on-premise servers
- **iot** — Embedded devices, resource-constrained environments
- **browser** — Cloud servers, data centers, full-featured web apps, unlimited resources (default, all 41 algorithms)

### Browser
```html
<script src="node_modules/@wasm4pm/cli/pkg/wasm4pm.js"></script>
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
const pm = require('@wasm4pm/cli');

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

### CLI (wasm4pm - NEW)
```bash
# Initialize project with configuration
wpm init

# Discover with balanced profile
wpm run data/log.xes --algorithm genetic --profile balanced

# Watch directory for continuous processing
wpm watch data/ --output results/ --profile fast

# Check system and engine status
wpm status --verbose

# Get algorithm recommendations
wpm explain --algorithm genetic --level detailed

# Van der Aalst agents (NEW)
wasm4pm agent execute mock-interceptor --target ./src
wasm4pm agent list
wasm4pm agent audit --severity critical
wasm4pm agent status
wasm4pm agent register custom-agent ./path/to/agent.ts
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
| [**RELEASE_NOTES.md**](https://github.com/seanchatmangpt/wasm4pm/blob/main/RELEASE_NOTES.md) | v26.4.8 and v26.4.5 release notes |
| [**DEPLOYMENT_PROFILES.md**](https://github.com/seanchatmangpt/wasm4pm/blob/main/wasm4pm/DEPLOYMENT_PROFILES.md) | Deployment profile guide (v26.4.8) |
| [**CHANGELOG.md**](https://github.com/seanchatmangpt/wasm4pm/blob/main/CHANGELOG.md) | Complete version history |
| [**MIGRATION_GUIDE.md**](https://github.com/seanchatmangpt/wasm4pm/blob/main/MIGRATION_GUIDE.md) | Upgrading from v26.4.4 |
| [**QUICKSTART.md**](https://github.com/seanchatmangpt/wasm4pm/blob/main/docs/QUICKSTART.md) | 5-minute setup guide |
| [**TUTORIAL.md**](https://github.com/seanchatmangpt/wasm4pm/blob/main/docs/TUTORIAL.md) | Real-world examples |
| [**DEPLOYMENT.md**](https://github.com/seanchatmangpt/wasm4pm/blob/main/docs/DEPLOYMENT.md) | Build, test, and deploy |

### Reference Documentation
| Document | Purpose |
|----------|---------|
| [**API.md**](https://github.com/seanchatmangpt/wasm4pm/blob/main/docs/API.md) | Complete function reference + wpm commands |
| [**ALGORITHMS.md**](https://github.com/seanchatmangpt/wasm4pm/blob/main/docs/reference/algorithms.md) | Algorithm descriptions and parameters |
| [**FAQ.md**](https://github.com/seanchatmangpt/wasm4pm/blob/main/docs/FAQ.md) | Troubleshooting and common questions |

### Package Documentation
| Package | Purpose |
|---------|---------|
| [**wpm CLI**](https://github.com/seanchatmangpt/wasm4pm/blob/main/apps/wasm4pm/README.md) | CLI tool reference |
| [**@wasm4pm/kernel**](https://github.com/seanchatmangpt/wasm4pm/blob/main/packages/kernel/README.md) | WASM kernel, 41 algorithms |
| [**@wasm4pm/config**](https://github.com/seanchatmangpt/wasm4pm/blob/main/packages/config/README.md) | Configuration system |
| [**@wasm4pm/engine**](https://github.com/seanchatmangpt/wasm4pm/blob/main/packages/engine/README.md) | Engine lifecycle |
| [**@wasm4pm/observability**](https://github.com/seanchatmangpt/wasm4pm/blob/main/packages/observability/README.md) | Logging and telemetry |
| [**@wasm4pm/contracts**](https://github.com/seanchatmangpt/wasm4pm/blob/main/packages/contracts/README.md) | Type-safe contracts |
| [**@wasm4pm/planner**](https://github.com/seanchatmangpt/wasm4pm/blob/main/packages/planner/README.md) | Algorithm planner |
| [**@wasm4pm/testing**](https://github.com/seanchatmangpt/wasm4pm/blob/main/packages/testing/README.md) | Test harnesses |
| [**@wasm4pm/ml**](https://github.com/seanchatmangpt/wasm4pm/blob/main/packages/ml/README.md) | Micro-ML analysis |
| [**@wasm4pm/swarm**](https://github.com/seanchatmangpt/wasm4pm/blob/main/packages/swarm/README.md) | Multi-worker coordinator |
| [**@wasm4pm/agents**](https://github.com/seanchatmangpt/wasm4pm/blob/main/packages/agents/README.md) | Van der Aalst adversarial agents |

### Advanced Documentation
| Document | Purpose |
|----------|---------|
| [**BROWSER-BENCHMARKS.md**](https://github.com/seanchatmangpt/wasm4pm/blob/main/docs/BROWSER-BENCHMARKS.md) | Browser performance testing |
| [**MCP.md**](https://github.com/seanchatmangpt/wasm4pm/blob/main/wasm4pm/MCP.md) | Claude integration (Model Context Protocol) |

## 📊 Performance

**Benchmarking Results** (See [BROWSER-BENCHMARKS.md](https://github.com/seanchatmangpt/wasm4pm/blob/main/docs/BROWSER-BENCHMARKS.md) and [reference/benchmarks.md](https://github.com/seanchatmangpt/wasm4pm/blob/main/docs/reference/benchmarks.md) for full details):

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

# Build all packages (default: browser profile, full features)
pnpm build

# Build with deployment profile
cd wasm4pm
npm run build:browser  # Size-optimized for web browsers
npm run build:cloud    # Full features (same as default)

# Run all tests
pnpm test

# Build specific targets
pnpm build:wasm         # WASM core library
pnpm build:cli          # wpm CLI
pnpm build:engine       # Engine lifecycle
pnpm build:service      # HTTP service

# Watch mode for development
pnpm dev
```

### Project Structure
```
wasm4pm/                             # Monorepo root
├── apps/
│   └── wasm4pm/                      # CLI tool (wasm4pm)
│       ├── src/commands/           # run, compare, diff, predict, ml, powl, agent, etc.
│       └── package.json
├── packages/
│   ├── contracts/                  # Type-safe contracts, receipts, errors (@wasm4pm/contracts)
│   ├── config/                     # Configuration with Zod validation (@wasm4pm/config)
│   ├── engine/                     # Engine lifecycle state machine (@wasm4pm/engine)
│   ├── observability/              # Non-blocking logging + OTEL (@wasm4pm/observability)
│   ├── kernel/                     # WASM kernel, 41 algorithms (@wasm4pm/kernel)
│   ├── planner/                    # Algorithm planner + explain (@wasm4pm/planner)
│   ├── testing/                    # Test harnesses (@wasm4pm/testing)
│   ├── ml/                         # Micro-ML analysis (@wasm4pm/ml)
│   ├── swarm/                      # Multi-worker coordinator (@wasm4pm/swarm)
│   └── agents/                     # Van der Aalst adversarial agents (@wasm4pm/agents)
├── wasm4pm/                        # Rust/WASM core (41 algorithms)
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
- **Apache License 2.0** - [LICENSE-APACHE](https://github.com/seanchatmangpt/wasm4pm/blob/main/LICENSE-APACHE)
- **MIT License** - [LICENSE-MIT](https://github.com/seanchatmangpt/wasm4pm/blob/main/LICENSE-MIT)

Choose whichever license works best for your use case.

## 🔗 Links

- **NPM Package**: https://www.npmjs.com/package/@wasm4pm/cli
- **GitHub**: https://github.com/seanchatmangpt/wasm4pm
- **Documentation**: See docs/ directory
- **Research Paper**: See [REAL-BENCHMARK-RESULTS.md](https://github.com/seanchatmangpt/wasm4pm/blob/main/docs/REAL-BENCHMARK-RESULTS.md) for benchmarks and performance data

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

- **Documentation**: See [TUTORIAL.md](https://github.com/seanchatmangpt/wasm4pm/blob/main/docs/TUTORIAL.md) and [FAQ.md](https://github.com/seanchatmangpt/wasm4pm/blob/main/docs/FAQ.md)
- **Issues**: Report bugs on [GitHub](https://github.com/seanchatmangpt/wasm4pm/issues)
- **Discussions**: Join [GitHub Discussions](https://github.com/seanchatmangpt/wasm4pm/discussions)

---

<div align="center">
Built with Rust + WebAssembly for performance. Designed for JavaScript developers.
</div>
