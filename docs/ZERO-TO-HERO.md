# Zero to Hero — wasm4pm Learning Path

A progressive guide from first install to production deployment. Every step links to the relevant Diataxis document so you always know where to go next.

---

## Level 0 — Install and Verify (5 minutes)

You have Node.js 18+ and want to see something work.

1. **Install the WASM engine**
   ```bash
   npm install @wasm4pm/wasm4pm
   ```

2. **Run the health check**
   ```bash
   npx pmctl doctor
   ```
   17 checks verify Node.js, WASM binary, SIMD, config, memory, disk, and git hooks.
   See [health-check.md](how-to/health-check.md) for troubleshooting any failures.

3. **Run your first discovery**
   ```bash
   npx pmctl init          # scaffold wasm4pm.toml
   npx pmctl run log.xes   # discover a process model
   ```
   Full walkthrough: [first-model.md](tutorials/first-model.md)

**Concept check:** What is a DFG and why is it the foundational output? → [EXPLANATION.md](EXPLANATION.md#why-the-dfg)

---

## Level 1 — Core Workflow (30 minutes)

You can run `pmctl run`. Now learn the full pipeline.

### The execution model

Every run follows the same lifecycle:

```
uninitialized → bootstrapping → ready → planning → running → watching
                     ↓                  ↓          ↓
                   failed            degraded ←─────┘
```

Understand what happens at each state and why `FAILED` is terminal: [engine-states.md](explanation/engine-states.md)

### Choosing algorithms

Start with the profile system — no need to pick individual algorithms:

| Profile | Algorithms | Speed | Use case |
|---------|-----------|-------|----------|
| `fast` | DFG, Process Skeleton | ~1ms | Dashboards, quick checks |
| `balanced` | Heuristic, Alpha++ | ~5ms | Standard analysis |
| `quality` | Genetic, ILP, ACO | ~50ms | Publication-quality models |
| `stream` | Streaming DFG | incremental | IoT, real-time ingestion |

Decision tree with copy-paste configs: [choose-algorithm.md](how-to/choose-algorithm.md)

Full algorithm reference with benchmarks: [algorithms.md](reference/algorithms.md)

### Configuration

The config system has 5-layer precedence: CLI > TOML > JSON > ENV > defaults.

```toml
# wasm4pm.toml — minimal
[source]
kind = "file"
path = "data/purchase.xes"

[algorithm]
name = "heuristic_miner"

[execution]
profile = "balanced"
```

Complete schema reference: [config-schema.md](reference/config-schema.md)
Debug config resolution: [debug-config.md](how-to/debug-config.md)

### Reading results

Every run produces a cryptographic receipt (BLAKE3 hashes of input, config, plan, and output). The receipt is your proof of execution.

Understand the receipt system: [receipts.md](explanation/receipts.md)

Browse saved results: [browse-results.md](how-to/browse-results.md)

---

## Level 2 — Multi-Algorithm Analysis (1 hour)

You understand single runs. Now compare and contrast.

### Side-by-side comparison

```bash
pmctl compare dfg,heuristic_miner,inductive_miner -i log.xes
```

ASCII sparklines show fitness, precision, generalization, and simplicity for each algorithm. Pick the best trade-off for your use case.

Tutorial: [TUTORIAL.md](TUTORIAL.md) (7 progressive exercises from DFG to DECLARE)

### Conformance checking

How well does your event log match the discovered model?

```bash
pmctl run log.xes --algorithm alpha_plus_plus --conformance
```

Understand fitness, precision, simplicity, and generalization — the four quality dimensions: [EXPLANATION.md](EXPLANATION.md#why-different-algorithms-have-different-trade-offs)

### Comparing logs

```bash
pmctl diff baseline.xes current.xes
```

Jaccard similarity on DFG edges reveals what changed between two time periods, cohorts, or system versions.

How it works and limitations: [process-model-comparison.md](explanation/process-model-comparison.md)

### Why algorithms differ

Rust/WASM gives you 14 discovery algorithms. Each makes different trade-offs:

- **DFG** — fastest, lowest quality, no concurrency
- **Heuristic Miner** — frequency-based, handles noise
- **Alpha++** — Petri net with formal soundness guarantees
- **Inductive Miner** — always produces a sound process tree
- **Genetic / ACO / ILP** — highest quality, slowest, fitness-optimized

Deep dive into the architecture: [EXPLANATION.md](EXPLANATION.md)

---

## Level 3 — Predictive Mining (2 hours)

You can discover and compare models. Now predict what happens next.

### The six prediction perspectives

Traditional process mining is descriptive. Predictive mining adds six forward-looking capabilities:

| Perspective | Question | Command |
|-------------|----------|---------|
| Next activity | What happens next? | `pmctl predict next-activity` |
| Remaining time | When will this case finish? | `pmctl predict remaining-time` |
| Outcome | Will this case succeed? | `pmctl predict outcome` |
| Concept drift | Is the process changing? | `pmctl predict drift` |
| Features | What describes this case? | `pmctl predict features` |
| Resource | Who should handle this? | `pmctl predict resource` |

Conceptual foundation: [predictive-process-mining.md](explanation/predictive-process-mining.md)

### Hands-on exercises

Work through three practical scenarios:
1. Next-activity prediction with n-gram tuning
2. Remaining-time estimation with prefix analysis
3. Concept drift detection with EWMA smoothing

Full tutorial: [predictive-analytics.md](tutorials/predictive-analytics.md)

### Configuration

```toml
[prediction]
enabled = true
activityKey = "concept:name"
ngramOrder = 3
driftWindowSize = 1000

[[prediction.tasks]]
id = "next-activity"
enabled = true
```

Config reference: [prediction-config.md](reference/prediction-config.md)
CLI reference: [prediction-cli.md](reference/prediction-cli.md)

### Real-time drift monitoring

```bash
pmctl drift-watch -i streaming-log.xes
```

EWMA-smoothed Jaccard similarity with configurable alpha and threshold. Alerts when control flow shifts beyond your tolerance.

How drift detection works: [concept-drift-detection.md](explanation/concept-drift-detection.md)
Setup guide: [monitor-drift.md](how-to/monitor-drift.md)

---

## Level 4 — Production Operations (3 hours)

You can mine and predict. Now make it reliable, observable, and automated.

### CLI mastery

11 commands, 5 exit codes, human + JSON output formats:

```bash
pmctl run log.xes              # 0=success, 2=bad input, 3=WASM fail
pmctl compare dfg,ilp -i log.xes
pmctl diff v1.xes v2.xes
pmctl predict next-activity -i log.xes
pmctl drift-watch -i log.xes
pmctl watch                    # re-run on config change
pmctl status                   # engine health + system info
pmctl doctor                   # 17 health checks
pmctl explain                  # academic algorithm descriptions
pmctl init                     # scaffold project
pmctl results                  # browse saved results
```

Full reference: [cli-commands.md](reference/cli-commands.md)
Exit codes: [exit-codes.md](reference/exit-codes.md)
Environment variables: [environment-variables.md](reference/environment-variables.md)

### Observability

Three-layer output:
1. **CLI** — colored human output (consola)
2. **JSONL** — machine-readable structured logs
3. **OTEL** — OpenTelemetry spans for distributed tracing

Setup guide: [observability-setup.md](tutorials/observability-setup.md)
Design rationale: [observability-design.md](explanation/observability-design.md)

### Error handling

Exit codes follow a contract: 0=success, 1=config, 2=source, 3=execution, 4=partial, 5=system.

Error codes and recovery: [error-codes.md](reference/error-codes.md)
Error handling philosophy: [error-handling.md](explanation/error-handling.md)

### Watch mode

```bash
pmctl watch   # re-run discovery when wasm4pm.toml or source changes
```

Reconnection after failure: [watch-reconnection.md](explanation/watch-reconnection.md)
Tutorial: [watch-mode.md](tutorials/watch-mode.md)

### CI/CD integration

GitHub Actions workflow, Docker deployment, Kubernetes orchestration:

CI setup: [cicd-setup.md](how-to/cicd-setup.md) | [github-actions.md](reference/github-actions.md)
Docker: [docker-deploy.md](how-to/docker-deploy.md) | [docker.md](reference/docker.md)
Kubernetes: [kubernetes-deploy.md](how-to/kubernetes-deploy.md) | [kubernetes.md](reference/kubernetes.md)

---

## Level 5 — Integration and Extension (4 hours)

You operate production pipelines. Now embed wasm4pm in your own systems.

### Node.js integration

```typescript
import init, { load_eventlog_from_xes, discover_dfg } from '@wasm4pm/wasm4pm';
init();
const handle = load_eventlog_from_xes(xesString);
const model = discover_dfg(handle, 'concept:name');
```

Guide: [nodejs-integration.md](how-to/nodejs-integration.md)

### Browser integration

WASM runs in any modern browser with SIMD support. No server required.

Guide: [browser-integration.md](how-to/browser-integration.md)

### Streaming API

For IoT, clickstreams, and high-throughput logs:

```typescript
const handle = streaming_dfg_builder_new();
streaming_dfg_add_event(handle, 'case-1', 'Activity A');
streaming_dfg_add_event(handle, 'case-1', 'Activity B');
const dfg = streaming_dfg_get(handle);
```

Streaming design and memory model: [streaming.md](explanation/streaming.md)

### Custom sinks

Write your own output adapters (file, HTTP, Kafka, database):

Guide: [custom-sink.md](how-to/custom-sink.md)

### MCP tools

18 Model Context Protocol tools for AI-assisted process mining:

Reference: [mcp-predictive-tools.md](reference/mcp-predictive-tools.md)
Full tool catalog: [TOOLS.md](TOOLS.md)

### POWL models

Partially Ordered Workflow Language — a more expressive process model than Petri nets:

Concepts: [powl-concepts.md](explanation/powl-concepts.md)
Discovery: [discover-powl.md](how-to/discover-powl.md)
API reference: [powl-api.md](reference/powl-api.md)

---

## Level 6 — Advanced Topics (ongoing)

### Performance tuning

Algorithm selection, SIMD requirements, memory management, benchmarking:

[performance-tuning.md](how-to/performance-tuning.md) | [benchmark-algorithms.md](how-to/benchmark-algorithms.md) | [benchmarks.md](reference/benchmarks.md)

### Testing workflows

Parity harness, determinism harness, CLI harness, OTEL capture:

[testing-workflows.md](how-to/testing-workflows.md)

### Multi-environment configuration

Different configs for dev/staging/prod with provenance tracking:

[multi-env-config.md](how-to/multi-env-config.md)

### Compliance and audit

Receipt-based execution proofs, cryptographic verification:

[compliance-audit.md](tutorials/compliance-audit.md) | [receipts.md](explanation/receipts.md)

### Determinism guarantees

Why two runs with identical inputs produce byte-identical outputs:

[determinism.md](explanation/determinism.md)

---

## Quick Reference Card

| I want to... | Read this |
|---|---|
| Install and run first model | [first-model.md](tutorials/first-model.md) |
| Understand all algorithms | [algorithms.md](reference/algorithms.md) |
| Pick the right algorithm | [choose-algorithm.md](how-to/choose-algorithm.md) |
| Write a config file | [config-schema.md](reference/config-schema.md) |
| Compare two models | [TUTORIAL.md](TUTORIAL.md) |
| Predict next activity | [predictive-analytics.md](tutorials/predictive-analytics.md) |
| Monitor for drift | [monitor-drift.md](how-to/monitor-drift.md) |
| Deploy to production | [docker-deploy.md](how-to/docker-deploy.md) |
| Use in Node.js | [nodejs-integration.md](how-to/nodejs-integration.md) |
| Use in browser | [browser-integration.md](how-to/browser-integration.md) |
| Debug a problem | [FAQ.md](FAQ.md) |
| Understand error codes | [error-codes.md](reference/error-codes.md) |
| Set up CI/CD | [cicd-setup.md](how-to/cicd-setup.md) |
| Stream events in real-time | [streaming.md](explanation/streaming.md) |
| Write custom sinks | [custom-sink.md](how-to/custom-sink.md) |
| Use MCP tools with AI | [TOOLS.md](TOOLS.md) |
| Understand engine internals | [engine-states.md](explanation/engine-states.md) |
| Prove execution integrity | [receipts.md](explanation/receipts.md) |
| Discover POWL models | [powl-concepts.md](explanation/powl-concepts.md) |

---

## The Diataxis Framework

This guide follows the [Diataxis](DIATAXIS.md) documentation framework:

| Quadrant | Purpose | Start here |
|---|---|---|
| **Tutorials** | Learning-oriented, guided lessons | [first-model.md](tutorials/first-model.md) |
| **How-To** | Goal-oriented, practical recipes | [HOW-TO.md](HOW-TO.md) |
| **Explanation** | Understanding-oriented, conceptual depth | [EXPLANATION.md](EXPLANATION.md) |
| **Reference** | Information-oriented, authoritative detail | [INDEX.md](INDEX.md) |

Full document map with 55+ files: [INDEX.md](INDEX.md)
