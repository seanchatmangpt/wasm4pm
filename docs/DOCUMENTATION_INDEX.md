# Documentation Index

Complete guide to pictl process mining platform documentation.

**Latest version:** v26.4.10+ | **Last updated:** 2026-05-05

---

## Getting Started (5 min)

Start here if you're new to pictl.

1. **[README.md](../README.md)** — Project overview
2. **[guides/ml-quickstart.md](./guides/ml-quickstart.md)** — 5-step ML guide
3. **[guides/rl-quickstart.md](./guides/rl-quickstart.md)** — 5-step RL guide
4. **[guides/prediction-quickstart.md](./guides/prediction-quickstart.md)** — 5-step prediction guide

**Time commitment:** ~15 minutes for all three

---

## User Guides (Recommended Reading Order)

### Essential

- **[guides/cli-guide.md](./guides/cli-guide.md)** — All 20 commands with examples
  - Core: `run`, `compare`, `diff`, `watch`, `status`
  - Prediction: `predict`, `drift-watch`
  - Analysis: `ml`, `powl`, `temporal`, `social`
  - Quality: `quality`, `conformance`, `validate`
  - Autonomic: `autoprocess`, `doctor`, `explain`, `init`, `results`

- **[guides/configuration-guide.md](./guides/configuration-guide.md)** — All config options
  - TOML/JSON formats
  - Environment variables (WASM4PM_*)
  - CLI arguments
  - Precedence rules
  - 41 algorithm catalog
  - 4 execution profiles
  - Observability settings
  - Prediction tuning

- **[guides/drift-detection-guide.md](./guides/drift-detection-guide.md)** — Drift detection deep dive
  - How it works (Jaccard + EWMA)
  - Parameter tuning (window size, alpha, threshold)
  - Real-world scenarios

### Deep Dives

- **[ml-complete.md](./ml-complete.md)** — ML algorithms explained
  - 6 algorithms (classify, cluster, forecast, anomaly, regress, pca)
  - When to use each
  - Parameter tuning
  - Feature engineering
  - Accuracy expectations

- **[rl-complete.md](./rl-complete.md)** — RL system deep dive
  - 5 agents (Q-Learning, SARSA, Double-Q, Expected SARSA, REINFORCE)
  - LinUCB agent selection
  - State space (8 dimensions)
  - Reward function
  - Convergence analysis

- **[prediction-complete.md](./prediction-complete.md)** — Prediction tasks explained
  - 6 tasks (next-activity, remaining-time, outcome, drift, features, resource)
  - Accuracy expectations per task
  - Configuration per task
  - Integration patterns

- **[deployment-guide.md](./deployment-guide.md)** — Production deployment
  - Architecture options (edge/fog/cloud)
  - 5 deployment profiles (mobile/iot/edge/fog/browser)
  - Feature flag configuration
  - Performance tuning
  - Monitoring and alerts

### FAQ & Troubleshooting

- **[faq/ml-rl-faq.md](./faq/ml-rl-faq.md)** — 50+ Q&A
  - ML algorithm selection and tuning
  - RL convergence and debugging
  - Prediction accuracy
  - Drift detection setup
  - Common errors and fixes

- **[troubleshooting.md](./troubleshooting.md)** — Issue resolution
  - Installation problems
  - Config validation
  - Log loading
  - Algorithm issues
  - ML accuracy
  - RL convergence
  - Performance optimization
  - Platform-specific issues

---

## API Reference

### Type Definitions & Schemas

- **[@wasm4pm/ml API](./api/@wasm4pm/ml.md)** — ML algorithm interface
  - `FeatureMatrix`, `ClassificationResult`, `RegressionResult`
  - `buildFeatureMatrix()`, `classifyTraces()`, `clusterTraces()`
  - `forecastSeries()`, `detectEnhancedAnomalies()`, `reduceFeaturesPCA()`

- **[@wasm4pm/kernel API](./api/@wasm4pm/kernel.md)** — Core engine & discovery
  - 41 algorithms with parameters
  - `run()`, `stream()`, prediction API
  - Event log loading
  - Registry interface

- **[@wasm4pm/config API](./api/@wasm4pm/config.md)** — Configuration system
  - `resolveConfig()`
  - Zod schema
  - 5-layer precedence
  - Type-safe config

- **[@wasm4pm/observability API](./api/@wasm4pm/observability.md)** — Telemetry
  - OTEL span schema
  - `Instrumentation.createEvent()`
  - Metric types
  - Non-blocking logging

- **[wasm4pm-rl API](./api/wasm4pm-rl.md)** — RL orchestrator
  - `RlOrchestrator` class
  - State and reward definitions
  - Agent types
  - Circuit breaker interface

---

## Runnable Examples

All examples are copy-paste ready. Run with `tsx examples/<name>.ts`.

### ML Examples

| Example | What it shows | Time |
|---------|--------------|------|
| [ml-classify.ts](../examples/ml-classify.ts) | Outcome classification | 2 min |
| [ml-cluster.ts](../examples/ml-cluster.ts) | Customer cohort discovery | 2 min |
| [ml-forecast.ts](../examples/ml-forecast.ts) | Throughput forecasting | 2 min |
| [ml-anomaly.ts](../examples/ml-anomaly.ts) | Outlier detection | 2 min |
| [ml-regress.ts](../examples/ml-regress.ts) | Duration regression | 2 min |
| [ml-pca.ts](../examples/ml-pca.ts) | Dimensionality reduction | 2 min |

### RL & Autonomic

| Example | What it shows | Time |
|---------|--------------|------|
| [rl-monitoring.ts](../examples/rl-monitoring.ts) | RL convergence analysis | 5 min |

### Prediction & Drift

| Example | What it shows | Time |
|---------|--------------|------|
| [prediction-next-activity.ts](../examples/prediction-next-activity.ts) | Activity forecasting | 2 min |
| [drift-detection.ts](../examples/drift-detection.ts) | Drift alerts | 2 min |

### End-to-End

| Example | What it shows | Time |
|---------|--------------|------|
| [full-workflow.ts](../examples/full-workflow.ts) | Complete pipeline | 5 min |

**See:** [`examples/README.md`](../examples/README.md) for setup and execution.

---

## Architecture & Design

### High-level Design

- **[convergence-envelope-analysis.md](./convergence-envelope-analysis.md)** — RL convergence proofs
- **[DEPLOYMENT-ARCHITECTURE.md](./DEPLOYMENT-ARCHITECTURE.md)** — System architecture
- **[wasm-exports-reference.md](./wasm-exports-reference.md)** — WASM module catalog

### Advanced Topics

- **[feature-flags-reference.md](./feature-flags-reference.md)** — 12 feature flags and 5 profiles
- **[GPU_KERNEL_INTEGRATION_GUIDE.md](./GPU_KERNEL_INTEGRATION_GUIDE.md)** — GPU acceleration (research)
- **[GEMBA-ENFORCEMENT.md](./GEMBA-ENFORCEMENT.md)** — Testing philosophy (no mocks)

---

## Domain Knowledge

### Process Mining

- **[prediction.md](./prediction.md)** — Prediction task overview (existing)
- **[drift-detection.md](./drift-detection.md)** — Drift detection theory (existing)

### Foundational References

- **[PhD_THESIS_NANOSECOND_ARCHITECTURE.md](../PhD_THESIS_NANOSECOND_ARCHITECTURE.md)** — Architectural foundations
- **[PhD_THESIS_PERFORMANCE_ANALYSIS.md](../PhD_THESIS_PERFORMANCE_ANALYSIS.md)** — Performance analysis

---

## Project Instructions (For Contributors)

Located in `.claude/rules/`:

- **[CLAUDE.md](../CLAUDE.md)** — Project conventions (CalVer, git workflow)
- **[.claude/rules/ml-rl-testing.md](../.claude/rules/ml-rl-testing.md)** — Test oracles & mutation strategies
- **[.claude/rules/chicago-tdd.md](../.claude/rules/chicago-tdd.md)** — Van der Aalst validation philosophy
- **[.claude/rules/critical-constraints.md](../.claude/rules/critical-constraints.md)** — Non-negotiable constraints (MTTR <1s, fail-fast)
- **[.claude/rules/typescript-monorepo.md](../.claude/rules/typescript-monorepo.md)** — TypeScript package structure
- **[.claude/rules/rust-development.md](../.claude/rules/rust-development.md)** — Rust/WASM patterns

---

## Documentation Map

```
docs/
├── guides/                           # User guides (5 quickstarts + 4 deep dives)
│   ├── ml-quickstart.md
│   ├── rl-quickstart.md
│   ├── prediction-quickstart.md
│   ├── cli-guide.md                 # All 20 commands
│   ├── configuration-guide.md        # Config reference
│   └── drift-detection-guide.md      # Drift tuning
│
├── api/                             # API references
│   ├── @wasm4pm/ml.md
│   ├── @wasm4pm/kernel.md
│   ├── @wasm4pm/config.md
│   ├── @wasm4pm/observability.md
│   └── wasm4pm-rl.md
│
├── tutorials/                       # Decision trees & step-by-step
│   ├── tutorial-ml-selection.md
│   ├── tutorial-rl-tuning.md
│   └── tutorial-prediction-accuracy.md
│
├── faq/
│   └── ml-rl-faq.md                 # 50+ questions
│
├── ml-complete.md                   # Deep dive: ML algorithms
├── rl-complete.md                   # Deep dive: RL system
├── prediction-complete.md           # Deep dive: Prediction
├── deployment-guide.md              # Production deployments
├── troubleshooting.md               # Problem solving
│
├── DOCUMENTATION_INDEX.md           # This file
└── [existing docs...]               # Architecture, theory, etc.
```

---

## Learning Path

### Path 1: Process Discovery
1. Read: `guides/cli-guide.md` (Core commands)
2. Run: `examples/full-workflow.ts`
3. Deep dive: `ml-complete.md` or `deployment-guide.md`

### Path 2: Predictive Mining
1. Read: `guides/prediction-quickstart.md`
2. Run: `examples/prediction-next-activity.ts`, `examples/drift-detection.ts`
3. Tune: `guides/drift-detection-guide.md`
4. Deep dive: `prediction-complete.md`

### Path 3: Autonomous Management (RL)
1. Read: `guides/rl-quickstart.md`
2. Run: `examples/rl-monitoring.ts`
3. Understand: `rl-complete.md`
4. Integrate: `guides/configuration-guide.md` (`[autoprocess]` section)

### Path 4: ML Analysis
1. Read: `guides/ml-quickstart.md`
2. Run: `examples/ml-*.ts` (classify, cluster, forecast, anomaly, regress, pca)
3. Tune: `faq/ml-rl-faq.md`
4. Deep dive: `ml-complete.md`

### Path 5: Production Deployment
1. Read: `guides/configuration-guide.md` (all config options)
2. Choose profile: `guides/cli-guide.md` or `deployment-guide.md`
3. Set up OTEL: `api/@wasm4pm/observability.md`
4. Monitor: `troubleshooting.md` (performance tuning)

---

## Quick Reference

### Most Common Tasks

| Task | Document | Time |
|------|----------|------|
| Discover process model | `guides/cli-guide.md` → `wpm run` | 5 min |
| Predict next activity | `guides/prediction-quickstart.md` | 5 min |
| Check for drift | `guides/drift-detection-guide.md` | 10 min |
| Classify outcomes | `guides/ml-quickstart.md` + `examples/ml-classify.ts` | 10 min |
| Set up RL monitoring | `guides/rl-quickstart.md` + `examples/rl-monitoring.ts` | 15 min |
| Configure for production | `guides/configuration-guide.md` + `deployment-guide.md` | 30 min |
| Debug an issue | `troubleshooting.md` then `faq/ml-rl-faq.md` | 10-20 min |

### Common Lookups

| Question | Doc |
|----------|-----|
| Which algorithm should I use? | `guides/cli-guide.md` → algorithm table |
| How do I tune X? | `guides/configuration-guide.md` → [X] section |
| What does this error mean? | `troubleshooting.md` → search error |
| Why is my model accuracy low? | `faq/ml-rl-faq.md` → "Low classification accuracy" |
| How do I deploy to production? | `deployment-guide.md` |
| What's the API for X? | `api/@wasm4pm/X.md` |

---

## Contributing to Documentation

### Adding a new guide

1. Create file in `docs/guides/` (Markdown, <5000 words)
2. Add entry to this index under appropriate section
3. Link from related guides
4. Test links are valid: `grep -r "docs/" docs/guides/` should not have 404s

### Adding examples

1. Create file in `examples/` (TypeScript, copy-paste ready)
2. Must run with `tsx examples/<name>.ts`
3. Update `examples/README.md` with link and description
4. Add reference from relevant guide

### Updating API docs

1. Auto-generate from TypeScript definitions
2. Run: `npm run docs` (if available)
3. Or edit by hand if not generated
4. Keep in sync with implementation

---

## Version History

| Version | Date | Key changes |
|---------|------|------------|
| v26.4.10+ | 2026-05-05 | Added 5 quickstarts, 6 examples, comprehensive guides |
| v26.4.9 | 2026-04-09 | Initial release |

---

## Support & Feedback

- **Questions:** See [`faq/ml-rl-faq.md`](./faq/ml-rl-faq.md)
- **Bugs:** Use `wpm doctor` for diagnostics, then check [`troubleshooting.md`](./troubleshooting.md)
- **Feature requests:** Open issue with example use case
- **Documentation improvements:** PRs welcome to `docs/`

---

**Happy process mining! Start with a quickstart above.** 🚀
