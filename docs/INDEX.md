# wasm4pm v26.4.7 Documentation Index

Welcome to wasm4pm — a high-performance process mining system compiled to WebAssembly.

This documentation uses the **Diataxis framework**, which organizes content into four quadrants based on how you prefer to learn and work. Use the navigation below to find what you need.

---

## Quick Navigation

### I want to...

| Goal | Start Here |
|------|-----------|
| **Learn by doing** | [Tutorials](#tutorials) |
| **Accomplish a specific task** | [How-To Guides](#how-to-guides) |
| **Understand how things work** | [Explanations](#explanations) |
| **Look up technical details** | [Reference](#reference) |

---

## Learning Path by Role

### New User (Just installed)
1. **5 min**: [Tutorial: Your First Process Model](tutorials/first-model.md)
2. **10 min**: [Reference: CLI Commands](reference/cli-commands.md)
3. **Next**: [How-To Guides](#how-to-guides) for your use case

### DevOps Engineer
1. **15 min**: [How-To: Docker Deployment](how-to/docker-deploy.md)
2. **10 min**: [How-To: Set Up OTEL](how-to/otel-datadog.md)
3. **20 min**: [Explanation: Observability Design](explanation/observability-design.md)
4. **Reference**: [Environment Variables](reference/environment-variables.md)

### Software Developer
1. **15 min**: [How-To: Node.js Integration](how-to/nodejs-integration.md)
2. **10 min**: [Reference: HTTP API](reference/http-api.md)
3. **20 min**: [Explanation: Execution Substrate](explanation/execution-substrate.md)
4. **Advanced**: [How-To: Custom Sink](how-to/custom-sink.md)

### Process Analyst
1. **10 min**: [Tutorial: Stream Processing](tutorials/watch-mode.md)
2. **15 min**: [How-To: Choose the Right Algorithm](how-to/choose-algorithm.md)
3. **20 min**: [Explanation: Algorithm Profiles](explanation/profiles.md)
4. **Reference**: [Algorithm Matrix](reference/algorithms.md)

### Data Scientist / ML Engineer
1. **10 min**: [How-To: Predictive Mining](how-to/predictive-mining.md)
2. **15 min**: [Tutorial: Predictive Analytics](tutorials/predictive-analytics.md)
3. **10 min**: [How-To: Monitor Drift](how-to/monitor-drift.md)
4. **Reference**: [Prediction Config](reference/prediction-config.md)

### Compliance Officer
1. **15 min**: [Tutorial: Compliance Audit Trail](tutorials/compliance-audit.md)
2. **10 min**: [Explanation: Receipts and Proofs](explanation/receipts.md)
3. **Reference**: [Error Codes](reference/error-codes.md)

---

## Tutorials (Learn by Doing)

### Beginner
- [Your First Process Model](tutorials/first-model.md) — 5 min
- [Stream Processing with Watch Mode](tutorials/watch-mode.md) — 10 min

### Intermediate
- [Running as a Service](tutorials/service-mode.md) — 15 min
- [Setting Up Observability](tutorials/observability-setup.md) — 20 min
- [Predictive Analytics](tutorials/predictive-analytics.md) — 20 min

### Advanced
- [Custom Configuration Workflows](tutorials/custom-configs.md) — 25 min
- [Compliance Audit Trail](tutorials/compliance-audit.md) — 20 min
- [Real-Time Monitoring](tutorials/realtime-monitoring.md) — 30 min

---

## How-To Guides (Get Things Done)

### CLI Usage
- [Analyze an Event Log](how-to/analyze-log.md)
- [Choose the Right Algorithm](how-to/choose-algorithm.md)
- [Export Models in Different Formats](how-to/export-formats.md)
- [Debug Configuration Errors](how-to/debug-config.md)
- [Monitor Long-Running Jobs](how-to/monitor-jobs.md)
- [Browse Saved Results](how-to/browse-results.md)
- [Compare Process Models](how-to/compare-process-models.md)
- [Health Check](how-to/health-check.md)

### ML & Predictive
- [Predictive Mining](how-to/predictive-mining.md)
- [Configure Predictions](how-to/configure-predictions.md)
- [Monitor Drift](how-to/monitor-drift.md)
- [Benchmark Algorithms](how-to/benchmark-algorithms.md)

### POWL
- [POWL Discovery](how-to/discover-powl.md)
- [POWL Conversion](how-to/powl-conversion.md)

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
- [Performance Tuning](how-to/performance-tuning.md)
- [Error Recovery](how-to/error-recovery.md)
- [Testing Workflows](how-to/testing-workflows.md)

---

## Explanations (Understand Why)

### Architecture
- [The Execution Substrate](explanation/execution-substrate.md)
- [Determinism in Process Mining](explanation/determinism.md)
- [Configuration Resolution](explanation/config-resolution.md)
- [Engine State Machine](explanation/engine-states.md)

### Observability
- [Observability Design](explanation/observability-design.md)
- [Why Telemetry Never Breaks Execution](explanation/observability-design.md)

### Algorithms
- [Algorithm Selection and Profiles](explanation/profiles.md)
- [Object-Centric Process Mining](explanation/ocpm.md)
- [Process Model Comparison](explanation/process-model-comparison.md)

### ML & Predictive
- [Predictive Process Mining](explanation/predictive-process-mining.md)
- [Concept Drift Detection](explanation/concept-drift-detection.md)
- [POWL Concepts](explanation/powl-concepts.md)

### Processing
- [Streaming vs Batch](explanation/streaming.md)
- [Watch Mode Reconnection](explanation/watch-reconnection.md)

### Philosophy
- [Why No Runtime Arguments](explanation/design-no-runtime-args.md)
- [Why Receipts Matter](explanation/receipts.md)
- [Error Handling Philosophy](explanation/error-handling.md)
- [Blue Ocean Strategy](explanation/blue-ocean-strategy.md)

---

## Reference (Technical Details)

### APIs
- [CLI Commands](reference/cli-commands.md) — All 13 pmctl commands
- [HTTP API Endpoints](reference/http-api.md)

### Configuration
- [Config Schema](reference/config-schema.md) — TOML/JSON format with `[ml]` section
- [Environment Variables](reference/environment-variables.md)
- [Algorithm Parameters](reference/algorithm-parameters.md)
- [Prediction Config](reference/prediction-config.md)
- [Prediction CLI](reference/prediction-cli.md)

### Data & Formats
- [Data Types](reference/data-types.md)
- [Error Codes](reference/error-codes.md)
- [Exit Codes](reference/exit-codes.md)

### Algorithms
- [Algorithm Matrix](reference/algorithms.md) — 18 tools + 6 ML tasks
- [Performance Benchmarks](reference/benchmarks.md)

### MCP
- [MCP Predictive Tools](reference/mcp-predictive-tools.md)
- [POWL API](reference/powl-api.md)

### Deployment
- [Docker](reference/docker.md)
- [Kubernetes](reference/kubernetes.md)
- [GitHub Actions](reference/github-actions.md)

---

## Search by Topic

### ML & Predictive
- [How-To: Predictive Mining](how-to/predictive-mining.md)
- [Tutorial: Predictive Analytics](tutorials/predictive-analytics.md)
- [Reference: Prediction Config](reference/prediction-config.md)
- [Explanation: Predictive Process Mining](explanation/predictive-process-mining.md)
- [Explanation: Concept Drift Detection](explanation/concept-drift-detection.md)

### Algorithms
- [How-To: Choose Right Algorithm](how-to/choose-algorithm.md)
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

## FAQ

**Q: What's the best way to get started?**
A: Start with [Tutorial: Your First Model](tutorials/first-model.md) (5 min), then pick a How-To based on your role.

**Q: Which algorithm should I use?**
A: Use [How-To: Choose Algorithm](how-to/choose-algorithm.md) for a quick decision tree.

**Q: How do I run ML analysis?**
A: Enable the `[ml]` config section or use `pmctl ml <task>`. See [How-To: Predictive Mining](how-to/predictive-mining.md).

**Q: How do I deploy to production?**
A: Follow [How-To: Docker Deployment](how-to/docker-deploy.md) (15 min) or [How-To: Kubernetes](how-to/kubernetes-deploy.md).

**Q: What does exit code 2 mean?**
A: It's a source/input error. See [Reference: Exit Codes](reference/exit-codes.md).

**Q: Can I use this in a browser?**
A: Yes! See [How-To: Browser Integration](how-to/browser-integration.md).

**Q: How do I verify results are correct?**
A: Receipts provide cryptographic proof. See [Explanation: Receipts](explanation/receipts.md).

**Q: What's a profile?**
A: Profiles (fast/balanced/quality/stream/ml/research) select different algorithms.

---

## Version

**wasm4pm v26.4.7**
- Released: April 7, 2026
- 9 packages, 14 discovery algorithms, 6 ML tasks, 13 CLI commands
- 100% backward compatible

**Docs Last Updated**: April 7, 2026
