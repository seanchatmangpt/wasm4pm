# Diataxis Documentation Framework — wasm4pm v26.4.5

This document maps wasm4pm documentation into the **Diataxis** framework, organizing content by two axes:
- **Practical → Theoretical** (vertical)
- **Task-Oriented → Knowledge-Oriented** (horizontal)

---

## The Four Quadrants

```
                  LEARNING
                     ↑
                     |
    TUTORIALS    |    EXPLANATION
    (How to      |    (Understand
     learn)      |     why)
    ─────────────┼─────────────
    HOW-TO       |    REFERENCE
    GUIDES       |    (Technical
    (How to      |     specs)
     do)         |
                 |
          PRACTICAL → THEORETICAL
                     →
```

---

## 1. TUTORIALS (Practical + Learning)

**Goal**: Teach users how to accomplish common tasks by doing them.

### 1.1 Getting Started Tutorials

#### Tutorial: Your First Process Model
**File**: `docs/tutorials/first-model.md` (NEW)

Learn to:
- Install wasm4pm locally
- Create your first configuration file
- Run discovery on sample event log
- Inspect the generated model
- Export results

**Time**: 5 minutes | **Level**: Beginner

```toml
# Example: config.toml
[discovery]
algorithm = "dfg"
profile = "fast"

[source]
type = "file"
path = "sample.xes"

[sink]
type = "file"
format = "json"
```

**Key outcome**: Generated Petri net / DFG model with receipt

---

#### Tutorial: Stream Processing with Watch Mode
**File**: `docs/tutorials/watch-mode.md` (NEW)

Learn to:
- Start pmctl in watch mode
- Monitor file changes (live event log)
- Observe incremental processing
- Understand checkpointing and reconnection
- Read status updates in real-time

**Time**: 10 minutes | **Level**: Beginner

```bash
pmctl watch --config config.toml --verbose
# Watches config.toml and input files
# Restarts analysis on changes
# Shows live progress (0-100%)
```

---

#### Tutorial: Running wasm4pm as a Service
**File**: `docs/tutorials/service-mode.md` (NEW)

Learn to:
- Start the HTTP service (`wasm4pm-service`)
- Make API calls to /run endpoint
- Monitor execution with /status
- Stream results via WebSocket `/watch`
- Integrate into your application

**Time**: 15 minutes | **Level**: Intermediate

```bash
# Start service
wasm4pm-service --port 3001

# In another terminal
curl -X POST http://localhost:3001/run \
  -H "Content-Type: application/json" \
  -d '{"config": {...}, "profile": "balanced"}'
```

---

#### Tutorial: Setting Up Observability
**File**: `docs/tutorials/observability-setup.md` (NEW)

Learn to:
- Configure OpenTelemetry (OTEL)
- Connect to Jaeger or DataDog
- Read trace trees in your observability platform
- Understand log redaction
- Debug with JSON logs

**Time**: 20 minutes | **Level**: Intermediate

```toml
[observability]
level = "info"

[observability.otel]
enabled = true
exporter = "otlp_http"
endpoint = "http://localhost:4318"
```

---

#### Tutorial: Custom Configuration Workflows
**File**: `docs/tutorials/custom-configs.md` (NEW)

Learn to:
- Build multi-environment configs (dev/staging/prod)
- Use environment variables for secrets
- Profile-aware algorithm selection
- Parameterize for different event log sizes
- Version control config safely

**Time**: 25 minutes | **Level**: Intermediate

---

### 1.2 Use-Case Tutorials

#### Tutorial: Compliance Audit Trail
**File**: `docs/tutorials/compliance-audit.md` (NEW)

Learn to:
- Use receipts for compliance evidence
- Verify determinism across runs
- Generate reports for auditors
- Track config changes with Git
- Export audit snapshots

**Time**: 20 minutes | **Level**: Advanced

---

#### Tutorial: Real-Time Process Monitoring
**File**: `docs/tutorials/realtime-monitoring.md` (NEW)

Learn to:
- Ingest live event streams
- Detect process changes (drifts)
- Alert on anomalies
- Build dashboards from status snapshots
- Integrate with your SIEM

**Time**: 30 minutes | **Level**: Advanced

---

---

## 2. HOW-TO GUIDES (Practical + Doing)

**Goal**: Enable specific tasks. Problem-focused, not learning-focused.

### 2.1 CLI How-To Guides

#### How to: Analyze an Event Log
**File**: `docs/how-to/analyze-log.md`

Quick reference for running analysis:
```bash
pmctl run --config config.toml --profile quality
```

---

#### How to: Choose the Right Algorithm
**File**: `docs/how-to/choose-algorithm.md`

Decision tree:
- Want speed? → `fast` profile (DFG, Alpha++)
- Want accuracy? → `quality` profile (Genetic, ILP)
- Want streaming? → `stream` profile (fast discovery variants)

---

#### How to: Export Models in Different Formats
**File**: `docs/how-to/export-formats.md`

Supported outputs:
- Petri net (PN) → `model.pn.json`
- DFG → `model.dfg.json`
- PNML → `model.pnml` (via converter)
- BPMN → `model.bpmn` (via converter)

---

#### How to: Debug Configuration Errors
**File**: `docs/how-to/debug-config.md`

Steps:
1. Validate TOML: `pmctl init --validate config.toml`
2. Check schema: `pmctl explain --config config.toml --mode brief`
3. Inspect provenance: `WASM4PM_DEBUG=1 pmctl run ...`

---

#### How to: Monitor Long-Running Jobs
**File**: `docs/how-to/monitor-jobs.md`

Techniques:
- Use watch mode for live feedback
- Poll `/status` endpoint
- Subscribe to observability logs
- Set up alerts on progress stall

---

### 2.2 API How-To Guides

#### How to: Integrate wasm4pm into Node.js
**File**: `docs/how-to/nodejs-integration.md`

```javascript
const Wasm4pm = require('@wasm4pm/wasm4pm');
const pm = new Wasm4pm();

await pm.run({
  config: { algorithm: 'dfg' },
  input: xesData
});
```

---

#### How to: Use wasm4pm in a Browser
**File**: `docs/how-to/browser-integration.md`

```html
<script src="wasm4pm.umd.js"></script>
<script>
  const pm = new Wasm4pm.ProcessMiner();
  pm.run(config);
</script>
```

---

#### How to: Build a Custom Algorithm Sink
**File**: `docs/how-to/custom-sink.md`

Implement SinkAdapter interface:
```typescript
interface CustomSink extends SinkAdapter {
  write(artifactType, content): Promise<void>;
  validate(): Promise<void>;
}
```

---

### 2.3 DevOps How-To Guides

#### How to: Deploy wasm4pm Service with Docker
**File**: `docs/how-to/docker-deploy.md`

```dockerfile
FROM node:20
RUN npm install -g @wasm4pm/pmctl
COPY config.toml /app/
EXPOSE 3001
CMD ["wasm4pm-service"]
```

---

#### How to: Set Up CI/CD Pipeline
**File**: `docs/how-to/cicd-setup.md`

GitHub Actions template:
```yaml
- run: pmctl run --config config.toml --profile fast
- run: pmctl explain --config config.toml > plan.md
```

---

#### How to: Configure OTEL for Datadog
**File**: `docs/how-to/otel-datadog.md`

```toml
[observability.otel]
enabled = true
exporter = "otlp_http"
endpoint = "https://api.datadoghq.com"
headers = { "DD-API-KEY" = "$DD_API_KEY" }
```

---

---

## 3. EXPLANATION (Theoretical + Learning)

**Goal**: Deepen understanding of concepts, design decisions, and trade-offs.

### 3.1 Architecture Explanations

#### Explanation: The Execution Substrate
**File**: `docs/explanation/execution-substrate.md`

Topics:
- Why binding early matters (config-as-API)
- The 8-state engine lifecycle
- How planner generates deterministic plans
- Event log ingestion pipeline
- Model output semantics

---

#### Explanation: Determinism in Process Mining
**File**: `docs/explanation/determinism.md`

Topics:
- What "same input → same output" means
- How BLAKE3 hashing proves determinism
- The explain/run parity law
- Idempotency guarantees
- Audit trail construction

---

#### Explanation: Configuration Resolution
**File**: `docs/explanation/config-resolution.md`

Topics:
- Multi-source precedence (TOML > JSON > ENV > defaults)
- Provenance tracking (value origin tracking)
- Schema validation with Zod
- Environment variable substitution
- Why immutability matters

---

#### Explanation: The Observability Architecture
**File**: `docs/explanation/observability-design.md`

Topics:
- 3-layer model (CLI/JSON/OTEL)
- Why telemetry must never break execution
- Secret redaction patterns
- Trace context propagation (W3C)
- Observability non-blocking guarantees

---

#### Explanation: Algorithm Selection and Profiles
**File**: `docs/explanation/profiles.md`

Topics:
- Speed vs accuracy trade-offs
- Why 5 profiles (not 1)
- Algorithm complexity analysis
- When to use each profile
- Performance characteristics

---

### 3.2 Conceptual Explanations

#### Explanation: Object-Centric Process Mining (OCPM)
**File**: `docs/explanation/ocpm.md`

Topics:
- Single objects vs object interactions
- Multi-object event logs (OCEL)
- Relationship graphs
- Why OCPM matters for modern processes

---

#### Explanation: Streaming vs Batch Processing
**File**: `docs/explanation/streaming.md`

Topics:
- Incremental discovery
- Checkpoint semantics
- When to use each mode
- Trade-offs (latency vs memory)

---

#### Explanation: Error Handling Philosophy
**File**: `docs/explanation/error-handling.md`

Topics:
- 12 error codes and categories
- Why mandatory remediation matters
- Exit code semantics
- Fault tolerance vs correctness

---

#### Explanation: Receipts and Cryptographic Proofs
**File**: `docs/explanation/receipts.md`

Topics:
- What a receipt contains
- BLAKE3 hashing
- Tampering detection
- Reproducibility verification
- Compliance usage

---

### 3.3 Design Decision Explanations

#### Explanation: Why No Runtime Arguments
**File**: `docs/explanation/design-no-runtime-args.md`

Topics:
- The "If execution requires arguments, the system is incorrectly designed" law
- Why configuration files are better
- Binding early vs late
- Reproducibility guarantees

---

#### Explanation: Why Receipts Matter
**File**: `docs/explanation/design-receipts.md`

Topics:
- Auditability
- Regulatory compliance
- Debugging failed runs
- Version tracking

---

#### Explanation: The Execution Engine State Machine
**File**: `docs/explanation/engine-states.md`

Topics:
- 8 states and why each is needed
- State transitions and guards
- Why failed state is terminal
- Recovery strategies

---

---

## 4. REFERENCE (Theoretical + Doing)

**Goal**: Enable precise information lookup. Complete, structured, technical.

### 4.1 API Reference

#### Reference: pmctl CLI Commands
**File**: `docs/reference/cli-commands.md`

Structured reference:
```
pmctl run
  Usage: pmctl run [OPTIONS]
  Options:
    --config <PATH>     Configuration file (TOML/JSON)
    --profile <PROFILE> fast|balanced|quality|stream
    --verbose           Verbose output
    --format <FORMAT>   human|json|streaming
  Exit codes: 0|1|2|3|4|5
  Examples: ...
```

---

#### Reference: HTTP API Endpoints
**File**: `docs/reference/http-api.md`

Structured reference:
```
POST /run
  Request: { config: object, profile?: string }
  Response: { run_id: string, status: "queued"|"running" }
  Errors: 400|503|500
  Examples: ...

GET /run/:run_id
  Response: { receipt: Receipt, status: Status }
  Examples: ...

GET /watch/:run_id
  Protocol: WebSocket
  Events: [heartbeat, progress, checkpoint, error]
  Examples: ...
```

---

#### Reference: Configuration Schema
**File**: `docs/reference/config-schema.md`

Complete schema:
```toml
[discovery]
algorithm = "dfg" | "alpha" | "heuristic" | ...
profile = "fast" | "balanced" | "quality" | "stream"
timeout_ms = 30000
params = { ... }

[source]
type = "file" | "http" | "stream"
path = "..."
format = "xes" | "json" | "ocel"

[sink]
type = "file"
directory = "."
overwrite = "skip" | "overwrite" | "error"

[observability]
level = "debug" | "info" | "warn" | "error"

[observability.otel]
enabled = true|false
endpoint = "http://localhost:4318"
```

---

#### Reference: Error Codes and Remediation
**File**: `docs/reference/error-codes.md`

Complete reference:
```
Exit Code 0 (SUCCESS)
  - Execution completed successfully
  - Receipt generated and saved

Exit Code 1 (CONFIG_ERROR)
  Codes:
    CONFIG_INVALID - Schema validation failed
    CONFIG_MISSING - Required field missing
  Remediation: Check config.toml, use pmctl init for template

Exit Code 2 (SOURCE_ERROR)
  Codes:
    SOURCE_NOT_FOUND - File doesn't exist
    SOURCE_INVALID - Format unrecognized
    SOURCE_PERMISSION - Access denied
  Remediation: Check file path and permissions

Exit Code 3 (EXECUTION_ERROR)
  Codes:
    ALGORITHM_FAILED - Algorithm crashed
    ALGORITHM_TIMEOUT - Exceeded timeout
    WASM_MEMORY_EXCEEDED - Out of memory
  Remediation: Reduce input size, increase timeout, choose faster profile

Exit Code 4 (PARTIAL_SUCCESS)
  - Some sinks succeeded, others failed
  - Check receipt for details

Exit Code 5 (SYSTEM_ERROR)
  Codes:
    WASM_INIT_FAILED - Module initialization
    OTEL_FAILED - Observability system error (non-fatal)
  Remediation: Check WASM environment, OTEL configuration
```

---

#### Reference: Data Types and Schemas
**File**: `docs/reference/data-types.md`

Type definitions:
```typescript
interface Receipt {
  run_id: string;
  config_hash: string;      // BLAKE3(config)
  input_hash: string;       // BLAKE3(input)
  plan_hash: string;        // BLAKE3(plan)
  output_hash: string;      // BLAKE3(output)
  timestamp: ISO8601;
  status: "success" | "partial" | "failed";
  algorithm: string;
  model_type: "dfg" | "pn";
}

interface Plan {
  id: string;
  steps: ExecutionStep[];
  edges: Edge[];             // DAG edges
  profile: Profile;
  hash: string;             // BLAKE3
}

interface ExecutionStep {
  id: string;
  type: "Algorithm" | "Source" | "Sink" | "Validate";
  config: object;
  dependencies: string[];   // step IDs
  output?: any;
}
```

---

#### Reference: Algorithm Matrix
**File**: `docs/reference/algorithms.md`

Structured reference:
```
DFG (Directly-Follows Graph)
  Profile: fast
  Complexity: O(n) time, O(a²) space
  Output: DFG
  Quality: Low (baseline)
  Best for: Quick overviews, real-time

Alpha Miner (α)
  Profiles: fast, balanced
  Complexity: O(n log n)
  Output: Petri Net
  Quality: Medium
  Best for: Structured processes

Heuristic Miner
  Profiles: fast, balanced
  Complexity: O(n + a²)
  Output: Petri Net
  Quality: Medium-High
  Best for: Noisy logs

Inductive Miner
  Profiles: balanced, quality
  Complexity: O(n log n)
  Output: Process Tree
  Quality: High
  Best for: Complex structures

Genetic Algorithm
  Profiles: quality, research
  Complexity: O(g × n × p) [generations × events × population]
  Output: Petri Net
  Quality: Very High
  Best for: Best-effort accuracy

ILP Optimization
  Profiles: quality
  Complexity: Exponential (bounded by timeout)
  Output: Petri Net
  Quality: Optimal (within timeout)
  Best for: Correctness-critical

...and 9+ more algorithms
```

---

### 4.2 Type Reference

#### Reference: JavaScript/TypeScript Types
**File**: `docs/reference/types.ts`

Complete type definitions (exported from @wasm4pm/types):
```typescript
export interface WasmModule {
  load_eventlog_from_xes(data: string): string;
  load_eventlog_from_json(data: string): string;
  discover_dfg(handle: string, ...): string;
  discover_alpha(handle: string, ...): string;
  // ... 15+ algorithm functions
  get_version(): string;
}

export interface Wasm4pm {
  run(options: RunOptions): Promise<Receipt>;
  watch(options: WatchOptions): AsyncIterable<WatchEvent>;
  status(): Status;
  explain(options: ExplainOptions): Promise<Explanation>;
  init(options?: InitOptions): void;
}

export type RunOptions = {
  config: Config;
  profile?: Profile;
  timeout?: number;
};

export type WatchEvent = 
  | { type: 'heartbeat'; timestamp: number; }
  | { type: 'progress'; percent: number; elapsed: number; }
  | { type: 'checkpoint'; id: string; offset: number; }
  | { type: 'error'; code: string; message: string; }
  | { type: 'complete'; receipt: Receipt; };

// ... and 50+ more types
```

---

#### Reference: Rust FFI Bindings
**File**: `docs/reference/rust-bindings.md`

WASM-bindgen signatures:
```rust
#[wasm_bindgen]
pub fn load_eventlog_from_xes(data: &str) -> Result<String, JsValue>

#[wasm_bindgen]
pub fn discover_dfg(
    eventlog_handle: &str,
    activity_key: &str
) -> Result<JsValue, JsValue>

// ... with type schemas and examples
```

---

### 4.3 Configuration Reference

#### Reference: Environment Variables
**File**: `docs/reference/environment-variables.md`

Complete list:
```
WASM4PM_CONFIG_FILE       Path to config file (TOML/JSON)
WASM4PM_PROFILE           Execution profile (fast|balanced|quality|stream)
WASM4PM_LOG_LEVEL         Log level (debug|info|warn|error)
WASM4PM_DEBUG             Enable debug output (true|false)
WASM4PM_OTEL_ENABLED      Enable OpenTelemetry (true|false)
WASM4PM_OTEL_ENDPOINT     OTEL exporter endpoint (URL)
WASM4PM_TIMEOUT_MS        Global timeout in milliseconds
WASM4PM_CACHE_DIR         Cache directory for checkpoints
WASM4PM_MAX_MEMORY_MB     WASM memory limit in MB
```

---

#### Reference: Exit Code Lookup
**File**: `docs/reference/exit-codes.md` (consolidated reference)

Table:
| Code | Category | Meaning | Check |
|------|----------|---------|-------|
| 0 | Success | Completed successfully | — |
| 1 | Config | Configuration error | config.toml |
| 2 | Source | Input/source error | file path, permissions |
| 3 | Execution | Algorithm/runtime error | logs, timeout, memory |
| 4 | Partial | Some outputs succeeded | receipt details |
| 5 | System | WASM/infrastructure error | OTEL, environment |

---

### 4.4 Deployment Reference

#### Reference: Docker Deployment
**File**: `docs/reference/docker.md`

Complete Dockerfile, compose, and config

---

#### Reference: Kubernetes Deployment
**File**: `docs/reference/kubernetes.md`

Complete manifests (deployment, service, configmap)

---

#### Reference: GitHub Actions Workflow
**File**: `docs/reference/github-actions.md`

Complete workflow YAML for CI/CD

---

### 4.5 Performance Reference

#### Reference: Performance Benchmarks
**File**: `docs/reference/benchmarks.md`

Data table:
```
Algorithm        | 100 events | 1K events | 10K events | Profile
─────────────────┼────────────┼───────────┼────────────┼─────────
DFG              | 0.05ms     | 0.2ms     | 2.1ms      | fast
Alpha Miner      | 0.12ms     | 1.3ms     | 14ms       | fast
Heuristic Miner  | 0.18ms     | 3.2ms     | 32ms       | balanced
Inductive Miner  | 0.25ms     | 5.1ms     | 51ms       | balanced
Genetic Alg      | 2.3ms      | 45ms      | 450ms      | quality
ILP Optimizer    | 1.8ms      | 28ms      | 280ms      | quality
```

---

---

## 5. Cross-Cutting Concerns

### Navigation Map

Each document should link to related content:

```
Tutorial: First Model
  → How-to: Choose Algorithm
  → Explanation: Algorithm Selection
  → Reference: Algorithm Matrix
  → How-to: Export Formats
```

### Document Taxonomy

```
docs/
├── tutorials/              # Practical + Learning
│   ├── first-model.md
│   ├── watch-mode.md
│   ├── service-mode.md
│   ├── observability-setup.md
│   └── custom-configs.md
├── how-to/                # Practical + Doing
│   ├── analyze-log.md
│   ├── choose-algorithm.md
│   ├── export-formats.md
│   ├── debug-config.md
│   ├── nodejs-integration.md
│   ├── docker-deploy.md
│   └── cicd-setup.md
├── explanation/           # Theoretical + Learning
│   ├── execution-substrate.md
│   ├── determinism.md
│   ├── config-resolution.md
│   ├── observability-design.md
│   ├── profiles.md
│   ├── design-no-runtime-args.md
│   └── engine-states.md
└── reference/             # Theoretical + Doing
    ├── cli-commands.md
    ├── http-api.md
    ├── config-schema.md
    ├── error-codes.md
    ├── algorithms.md
    ├── types.ts
    ├── environment-variables.md
    ├── docker.md
    ├── kubernetes.md
    └── benchmarks.md
```

### Audience Mapping

```
Beginner User
  → Start: Tutorial: First Model
  → Then: How-to: Analyze Log
  → Then: Reference: CLI Commands

Intermediate User (DevOps)
  → Start: How-to: Docker Deploy
  → Then: How-to: OTEL Setup
  → Then: Explanation: Observability Design
  → Then: Reference: Environment Variables

Advanced User (Integration)
  → Start: How-to: Custom Sink
  → Then: Explanation: Architecture
  → Then: Reference: API Types
  → Then: Reference: Performance Benchmarks

Compliance/Audit User
  → Start: Tutorial: Compliance Audit
  → Then: Explanation: Receipts
  → Then: Reference: Error Codes
  → Then: How-to: Version Control Config
```

---

## 6. Implementation Status

| Quadrant | Status | Count |
|----------|--------|-------|
| **Tutorials** | 🔄 In Progress | 5 core + 2 advanced |
| **How-To Guides** | 🔄 In Progress | 15+ coverage |
| **Explanations** | 🔄 In Progress | 10+ conceptual |
| **Reference** | ✅ Complete | 15+ technical |

**Total**: 40+ coordinated documents across all quadrants

---

## 7. Success Metrics

- **Findability**: Any user question answered by <2 hops from homepage
- **Completeness**: All CLI flags, API endpoints, algorithms documented
- **Clarity**: No jargon without definition; examples for every concept
- **Consistency**: Same terminology, formatting, style across all 40+ docs
- **Connectivity**: Cross-links enable exploration without getting lost

---

**This Diataxis framework enables users to navigate from "I don't know what to do" to "I have exact answers" in the most efficient path for their use case.**
