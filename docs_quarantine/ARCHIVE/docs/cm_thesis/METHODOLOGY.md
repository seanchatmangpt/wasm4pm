# Methodology: Combinatorial Maximalism in Process Mining

## 1. Defining "Combinatorial Maximalism"
In the context of the `wasm4pm` architecture, combinatorial maximalism is defined as the empirical measurement of system behavior when all orthogonal variables (state space, memory cardinality, algorithm sequences, adversarial constraints, and deployment targets) are driven to their maximum theoretical limits simultaneously. It is not sufficient to test individual components in isolation; the true nature of a complex socio-technical system is revealed only under extreme combinatorial stress.

## 2. Experimental Setup and the Design Science Research (DSR) Paradigm
This research follows the Design Science Research (DSR) methodology as established by Hevner et al. (2004) and Peffers et al. (2007). The `wasm4pm`, `Prolog8`, and `MCP+` modules are treated as primary research artifacts, constructed and evaluated iteratively.

### 2.1 Hardware Bounds and Target Systems
*   **Target Systems:** Bare-metal instances for baselining `bcinr` branchless performance; standard virtualized instances for memory-bandwidth and combinatorial exhaustion tests.
*   **WASM Runtimes:** Wasmtime/Wasmer (for `wasm32-wasi` profiles), V8/SpiderMonkey (for `wasm32-unknown-unknown` browser/edge profiles).

### 2.2 Dataset Synthesis and Adversarial Logic
We utilize adversarial event logs to enforce extreme entropy and validate the proof-carrying admissibility layer (Appel, 2001; Necula, 1997):
*   **Maximal Variant Cardinality:** Generating flat logs where every single trace represents a unique path to stress discovery algorithms.
*   **N-Dimensional Multi-Graphs:** OCEL 2.0 standard logs where multi-object lifecycle intersections (e.g., Order, Item, Delivery) form highly dense bipartite graphs.
*   **Adversarial Probes:** The execution of a 24-probe Cartesian product testing schema, lifecycle, and cardinality violations simultaneously.

### 2.3 Telemetry, Observability, and Receipt Validation
*   **Closed-Loop Latency:** The 34-nanosecond closed-loop latency constraint is measured utilizing the engine's internal OpenTelemetry (OTel) spans, specifically the `RecoveryStarted` and `RecoveryCompleted` bounds.
*   **Cryptographic Verification:** BLAKE3 receipt chain collisions, tampering, and execution latencies are verified via the `proof-gate` emit layers, adapting the concepts of Certificate Transparency (RFC 6962) to real-time process mining.
