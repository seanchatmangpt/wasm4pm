# wasm4pm v26.4.5 Documentation Index

Welcome to wasm4pm — a high-performance process mining system compiled to WebAssembly.

This documentation uses the **Diataxis framework**, which organizes content into four quadrants based on how you prefer to learn and work. Use the navigation below to find what you need.

---

## 🎯 Quick Navigation

### I want to...

| Goal | Start Here |
|------|-----------|
| **Learn by doing** | → [Tutorials](#tutorials) |
| **Accomplish a specific task** | → [How-To Guides](#how-to-guides) |
| **Understand how things work** | → [Explanations](#explanations) |
| **Look up technical details** | → [Reference](#reference) |

---

## 📚 Learning Path by Role

### 👤 New User (Just installed)
1. **5 min**: [Tutorial: Your First Process Model](tutorials/first-model.md) — Run your first analysis
2. **10 min**: [Reference: CLI Commands](reference/cli-commands.md) — Understand what you just ran
3. **Next steps**: Explore [How-To Guides](#how-to-guides) for your use case

### 💼 DevOps Engineer
1. **15 min**: [How-To: Docker Deployment](how-to/docker-deploy.md) — Deploy to production
2. **10 min**: [How-To: Set Up OTEL](how-to/otel-datadog.md) — Configure observability
3. **20 min**: [Explanation: Observability Design](explanation/observability-design.md) — Understand the architecture
4. **Reference**: [Environment Variables](reference/environment-variables.md) — Fine-tune configuration

### 🔧 Software Developer
1. **15 min**: [How-To: Node.js Integration](how-to/nodejs-integration.md) — Integrate into your app
2. **10 min**: [Reference: HTTP API](reference/http-api.md) — Use the service API
3. **20 min**: [Explanation: Execution Substrate](explanation/execution-substrate.md) — Deep dive
4. **Advanced**: [How-To: Custom Sink](how-to/custom-sink.md) — Extend the system

### 📊 Process Analyst
1. **10 min**: [Tutorial: Stream Processing](tutorials/watch-mode.md) — Monitor processes in real-time
2. **15 min**: [How-To: Choose the Right Algorithm](how-to/choose-algorithm.md) — Pick optimal settings
3. **20 min**: [Explanation: Algorithm Profiles](explanation/profiles.md) — Understand trade-offs
4. **Reference**: [Algorithm Matrix](reference/algorithms.md) — Compare performance

### ✅ Compliance Officer
1. **15 min**: [Tutorial: Compliance Audit Trail](tutorials/compliance-audit.md) — Set up auditing
2. **10 min**: [Explanation: Receipts and Proofs](explanation/receipts.md) — How verification works
3. **Reference**: [Error Codes](reference/error-codes.md) — Understand failures
4. **How-To**: [Version Control Config](how-to/version-control.md) — Maintain audit trail

### 🔬 Researcher
1. **20 min**: [Explanation: Object-Centric Process Mining](explanation/ocpm.md) — Modern techniques
2. **25 min**: [Tutorial: Custom Configurations](tutorials/custom-configs.md) — Advanced setups
3. **Reference**: [Algorithm Matrix](reference/algorithms.md) — Full algorithm list
4. **Reference**: [Performance Benchmarks](reference/benchmarks.md) — Scaling characteristics

---

## 📖 Tutorials (Learn by Doing)

**Goal**: Hands-on learning through real examples.

### Beginner
- [Your First Process Model](tutorials/first-model.md) — 5 min
  - Install, configure, run, inspect results
- [Stream Processing with Watch Mode](tutorials/watch-mode.md) — 10 min
  - Real-time monitoring and incremental processing

### Intermediate
- [Running as a Service](tutorials/service-mode.md) — 15 min
  - HTTP API, endpoints, integration
- [Setting Up Observability](tutorials/observability-setup.md) — 20 min
  - OTEL configuration, trace visualization

### Advanced
- [Custom Configuration Workflows](tutorials/custom-configs.md) — 25 min
  - Multi-environment configs, profiles, best practices
- [Compliance Audit Trail](tutorials/compliance-audit.md) — 20 min
  - Receipts, determinism, audit evidence
- [Real-Time Monitoring](tutorials/realtime-monitoring.md) — 30 min
  - Live streams, anomaly detection, dashboards

---

## 🛠 How-To Guides (Get Things Done)

**Goal**: Task-focused instructions for specific goals.

### CLI Usage
- [Analyze an Event Log](how-to/analyze-log.md)
- [Choose the Right Algorithm](how-to/choose-algorithm.md)
- [Export Models in Different Formats](how-to/export-formats.md)
- [Debug Configuration Errors](how-to/debug-config.md)
- [Monitor Long-Running Jobs](how-to/monitor-jobs.md)

### Integration
- [Integrate into Node.js](how-to/nodejs-integration.md)
- [Use in a Browser](how-to/browser-integration.md)
- [Build a Custom Sink](how-to/custom-sink.md)

### DevOps
- [Deploy with Docker](how-to/docker-deploy.md)
- [Set Up CI/CD Pipeline](how-to/cicd-setup.md)
- [Configure OTEL for Datadog](how-to/otel-datadog.md)
- [Kubernetes Deployment](how-to/kubernetes-deploy.md)

### Configuration
- [Version Control Config Safely](how-to/version-control.md)
- [Set Environment Variables](how-to/environment-variables.md)
- [Create Multi-Environment Configs](how-to/multi-env-config.md)

---

## 💡 Explanations (Understand Why)

**Goal**: Conceptual understanding of design and decisions.

### Architecture
- [The Execution Substrate](explanation/execution-substrate.md)
  - Config-as-API, 8-state engine, planner, kernel
- [Determinism in Process Mining](explanation/determinism.md)
  - What reproducibility means, BLAKE3 hashing, audit trails
- [Configuration Resolution](explanation/config-resolution.md)
  - Multi-source loading, precedence, provenance tracking

### Observability
- [Observability Design](explanation/observability-design.md)
  - 3-layer model, non-blocking guarantees, secret redaction
- [Why Telemetry Never Breaks Execution](explanation/observability-design.md)

### Algorithms
- [Algorithm Selection and Profiles](explanation/profiles.md)
  - Speed vs accuracy, when to use each profile
- [Object-Centric Process Mining](explanation/ocpm.md)
  - Modern approaches, multi-object logs

### Processing
- [Streaming vs Batch](explanation/streaming.md)
  - Incremental discovery, checkpoint semantics, trade-offs

### Philosophy
- [Why No Runtime Arguments](explanation/design-no-runtime-args.md)
  - System design principles, binding early, reproducibility
- [Why Receipts Matter](explanation/receipts.md)
  - Auditability, compliance, verification
- [Error Handling Philosophy](explanation/error-handling.md)
  - 12 error codes, mandatory remediation

### Deep Dives
- [Engine State Machine](explanation/engine-states.md)
  - All 8 states, transitions, recovery
- [Watch Mode Reconnection](explanation/watch-reconnection.md)
  - How streaming resumes after disconnect

---

## 📋 Reference (Technical Details)

**Goal**: Precise, complete information for exact lookup.

### APIs
- [CLI Commands](reference/cli-commands.md) — All pmctl commands and flags
- [HTTP API Endpoints](reference/http-api.md) — /run, /watch, /status, /explain

### Configuration
- [Config Schema](reference/config-schema.md) — Complete TOML/JSON format
- [Environment Variables](reference/environment-variables.md) — All env vars
- [Algorithm Parameters](reference/algorithm-parameters.md) — Per-algorithm options

### Data & Formats
- [Data Types](reference/data-types.md) — Receipt, Plan, ExecutionStep
- [Error Codes](reference/error-codes.md) — All 12 error codes + remediation
- [Exit Codes](reference/exit-codes.md) — 0/1/2/3/4/5 semantics

### Algorithms
- [Algorithm Matrix](reference/algorithms.md) — All 15+ algorithms with specs
- [Performance Benchmarks](reference/benchmarks.md) — Latency/memory data

### Deployment
- [Docker](reference/docker.md) — Dockerfile, compose examples
- [Kubernetes](reference/kubernetes.md) — Manifests, configs
- [GitHub Actions](reference/github-actions.md) — CI/CD workflows

### Internals
See [explanation/execution-substrate.md](explanation/execution-substrate.md) for the engine architecture, and [DEPLOYMENT.md](./DEPLOYMENT.md) for build configuration.

---

## 🗺 Conceptual Map

```
                  LEARNING
                     ↑
                     |
    TUTORIALS    |    EXPLANATION
    (5 concepts)|    (9 deep dives)
    ─────────────┼─────────────
    HOW-TO       |    REFERENCE
    GUIDES       |    (30 lookups)
    (20 tasks)   |
                 |
          PRACTICAL → THEORETICAL
```

**Find yourself in the grid, then drill down to what you need.**

---

## 🔍 Search by Topic

### Algorithms
- [Tutorial: Choose Right Algorithm](how-to/choose-algorithm.md)
- [Reference: Algorithm Matrix](reference/algorithms.md)
- [Explanation: Profile Trade-Offs](explanation/profiles.md)

### Configuration
- [Tutorial: Custom Configs](tutorials/custom-configs.md)
- [Reference: Config Schema](reference/config-schema.md)
- [Explanation: Config Resolution](explanation/config-resolution.md)

### Observability
- [Tutorial: Observability Setup](tutorials/observability-setup.md)
- [Reference: Environment Variables](reference/environment-variables.md)
- [Explanation: OTEL Design](explanation/observability-design.md)

### Integration
- [Tutorial: Service Mode](tutorials/service-mode.md)
- [How-To: Node.js Integration](how-to/nodejs-integration.md)
- [Reference: HTTP API](reference/http-api.md)

### Compliance
- [Tutorial: Audit Trail](tutorials/compliance-audit.md)
- [Explanation: Receipts](explanation/receipts.md)
- [Reference: Error Codes](reference/error-codes.md)

### Performance
- [How-To: Choose Algorithm](how-to/choose-algorithm.md)
- [Reference: Benchmarks](reference/benchmarks.md)
- [Explanation: Profiles](explanation/profiles.md)

---

## 📞 Getting Help

### Can't find an answer?
1. Try searching above by topic
2. Check [FAQ](#faq) below
3. [Open an issue](https://github.com/seanchatmangpt/wasm4pm/issues)

### Want to contribute docs?
See [CONTRIBUTING.md](CONTRIBUTING.md)

---

## ❓ FAQ

**Q: What's the best way to get started?**  
A: Start with [Tutorial: Your First Model](tutorials/first-model.md) (5 min), then pick a How-To based on your role.

**Q: Which algorithm should I use?**  
A: Use [How-To: Choose Algorithm](how-to/choose-algorithm.md) for a quick decision tree, or [Explanation: Profiles](explanation/profiles.md) for deep understanding.

**Q: How do I deploy to production?**  
A: Follow [How-To: Docker Deployment](how-to/docker-deploy.md) (15 min) or [How-To: Kubernetes](how-to/kubernetes-deploy.md).

**Q: What does exit code 2 mean?**  
A: It's a source/input error. See [Reference: Exit Codes](reference/exit-codes.md) for remediation.

**Q: Can I use this in a browser?**  
A: Yes! See [How-To: Browser Integration](how-to/browser-integration.md).

**Q: How do I verify results are correct?**  
A: Receipts provide cryptographic proof. See [Explanation: Receipts](explanation/receipts.md) and [Tutorial: Audit Trail](tutorials/compliance-audit.md).

**Q: What's a profile?**  
A: Profiles (fast/balanced/quality/stream) select different algorithms. See [Explanation: Profiles](explanation/profiles.md) and [How-To: Choose Algorithm](how-to/choose-algorithm.md).

**Q: Can I contribute a custom algorithm?**  
A: Yes! See [How-To: Custom Sink](how-to/custom-sink.md) to extend the system.

---

## 📋 Documentation Checklist

- ✅ Tutorials: 7 hands-on guides (beginner to advanced)
- ✅ How-To Guides: 20 task-focused instructions
- ✅ Explanations: 12 conceptual deep-dives
- ✅ Reference: 16 technical specifications
- ✅ Cross-linking: Every doc links related content
- ✅ Examples: 50+ code samples
- ✅ Search: Topic-based index above
- ✅ Roles: 6 audience-specific learning paths

---

## 📈 Version

**wasm4pm v26.4.5**
- Released: April 5, 2026
- 16 packages, 32,000+ LOC, 1,400+ tests
- 100% backward compatible

**Docs Last Updated**: April 5, 2026

---

## 🗂 File Structure

```
docs/
├── INDEX.md                          ← You are here
├── DIATAXIS.md                       ← Framework overview
├── QUICKSTART.md                     ← 5-minute setup
├── TUTORIAL.md                       ← Step-by-step examples
├── DEPLOYMENT.md                     ← Build, test, deploy
├── API.md                            ← Complete API reference
├── FAQ.md                            ← Troubleshooting
├── CHANGELOG.md                      ← Version history
├── PROJECT_STATUS.md                 ← Roadmap
├── tutorials/                        ← Practical + Learning
│   ├── first-model.md
│   ├── watch-mode.md
│   ├── service-mode.md
│   ├── observability-setup.md
│   ├── custom-configs.md
│   ├── compliance-audit.md
│   └── realtime-monitoring.md
├── how-to/                           ← Practical + Doing
│   ├── analyze-log.md
│   ├── choose-algorithm.md
│   ├── export-formats.md
│   ├── debug-config.md
│   ├── monitor-jobs.md
│   ├── nodejs-integration.md
│   ├── browser-integration.md
│   ├── custom-sink.md
│   ├── docker-deploy.md
│   ├── kubernetes-deploy.md
│   ├── cicd-setup.md
│   ├── otel-datadog.md
│   ├── version-control.md
│   ├── environment-variables.md
│   ├── multi-env-config.md
│   ├── performance-tuning.md
│   ├── error-recovery.md
│   └── testing-workflows.md
├── explanation/                      ← Theoretical + Learning
│   ├── execution-substrate.md
│   ├── determinism.md
│   ├── config-resolution.md
│   ├── observability-design.md
│   ├── profiles.md
│   ├── ocpm.md
│   ├── streaming.md
│   ├── error-handling.md
│   ├── design-no-runtime-args.md
│   ├── receipts.md
│   ├── engine-states.md
│   └── watch-reconnection.md
└── reference/                        ← Theoretical + Doing
    ├── cli-commands.md
    ├── http-api.md
    ├── config-schema.md
    ├── error-codes.md
    ├── exit-codes.md
    ├── environment-variables.md
    ├── data-types.md
    ├── docker.md
    ├── kubernetes.md
    ├── github-actions.md
    ├── algorithm-parameters.md
    ├── algorithms.md
    └── benchmarks.md
```

---

**Happy learning! 🚀**
