# PhD Thesis: Cryptographic Observability, Adversarial Robustness, and Micro-Architectural Performance in WebAssembly Process Mining

**Author:** wasm4pm Research Team  
**Date:** May 12, 2026  
**Institution:** Computational Process Mining Laboratory  
**Focus Period:** May 5, 2026 - May 12, 2026

---

## Executive Abstract

The process mining landscape requires systems that can perform complex computational algorithms at the micro-architectural limit without compromising on observability, state integrity, or determinism. Over a focused 7-day development period, the `wasm4pm` engine has undergone a paradigm-shifting transformation. This thesis documents the design, implementation, and empirical validation of a rigorous OpenTelemetry (OTEL) observability suite, the deployment of a 65-test oracle-ranked adversarial validation framework, and the implementation of micro-architectural optimizations that enforce nanosecond-scale operational constraints. The culmination of this work establishes a universal process mining engine that not only achieves extreme throughput via WebAssembly (WASM) but provides cryptographically verifiable receipts of its execution lifecycle.

---

## Chapter 1: Introduction

### 1.1 The Challenge of Black-Box Process Mining
As process mining algorithms transition from centralized JVM-based monoliths to distributed, edge-capable WebAssembly environments, the execution context becomes highly decentralized. Traditional systems fail to provide robust, cross-platform observability, turning edge deployments into diagnostic black boxes. Furthermore, algorithms executing at the nanosecond scale are susceptible to silent data corruption and state drift if not continuously validated.

### 1.2 Contributions of the Recent Epic (May 5 - May 12)
This thesis analyzes the rapid evolution of the `wasm4pm` architecture over a 7-day sprint, contributing the following:
1. **Full-Spectrum OTEL Instrumentation (Phases B+ & C):** Wiring distributed tracing across all command surfaces.
2. **Adversarial Test Suite v2:** A massive expansion of oracle-ranked tests guaranteeing algorithmic invariants.
3. **Quality-Threshold Gate Hardening:** Cryptographically secure validation of algorithm fitness, precision, and simplicity.
4. **Micro-Architectural Optimizations:** Binary-search label indexing and invisible transition fixpoints that reduce latency on the hot path.

---

## Chapter 2: Cryptographic Observability and OpenTelemetry

### 2.1 The Phase B+ and Phase C OTEL Rollout
Observability in a nanosecond-scale engine must not disrupt the performance profile. During the focus period, 29 commands were instrumented with OTEL span emissions. The instrumentation was designed with distinct models for varying lifecycles:
- **Read-Only / Diagnostic:** Emits spans but correctly refrains from generating forged receipts.
- **Cycle-Based (Autoprocess):** Implements a single-cycle invocation with a state-hash chain (`initial_state_hash` → `final_state_hash`) to ensure cryptographic continuity across executions.
- **Streaming / Stateful:** Manual parent span emissions for long-running watchers, linked to child spans triggered by file-system events.

### 2.2 Late-Attributes and Child-Span Binding
To accommodate stateful observability without blocking the primary execution thread, a `getLateAttrs` callback architecture was introduced alongside `withSpanRaw`. This allowed metrics such as state hashes and rolling window counters to be accurately attached to parent session spans upon graceful termination.

---

## Chapter 3: Adversarial Robustness and Quality Gates

### 3.1 The Adversarial Test Suite v2
A robust mining engine must gracefully handle pathological inputs. The introduction of 65 oracle-ranked tests provided rigid defenses:
- **Streaming vs. Batch Parity:** Proven parity between batch DFG (columnar) and streaming DFG implementations (scalar and SIMD).
- **Oracle-Rank Validation:** Infrastructure measurements including edge-map construction, Jaccard distance, and token replay fitness, setting CI execution boundaries.
- **Enterprise Dirty Data Impact:** Ensuring algorithms do not crash on missing timestamps, and that out-of-order execution, duplication, and noise are cleanly handled.

### 3.2 Gate Hardening and the Quality-Threshold Registry
The "Truth Gate" was mathematically formalized and refactored into the "Quality-Threshold Gate." A static registry now dictates the acceptable minimums for fitness, precision, generalization, and simplicity across different algorithms. `GateResult` outputs were enhanced with empirical execution metrics (`median_ms`, `p95_ms`, `peak_memory_mb`), ensuring any algorithmic drift is instantly flagged.

---

## Chapter 4: Micro-Architectural Performance Refinements

### 4.1 Indexing and Transitions
The performance baseline of the conformance engine was improved by discarding expensive hash map lookups on the hot path in favor of a **binary-search label index**. This provided O(log N) worst-case lookup times without memory allocation overhead. Additionally, an **invisible transition fixpoint** algorithm was instituted, guaranteeing that silent transitions correctly mutate the marking state without incrementing token consumption tallies.

### 4.2 OCEL Flattening Optimization
Object-Centric Event Logs (OCEL) mapping previously necessitated rebuilding unique activity sets per object type. This was optimized into a single, global pre-computation of the activity frequency map, significantly accelerating the flattening loss measurement phase for complex many-to-many relationship mappings.

---

## Chapter 5: System Health and Diagnostic Tooling

### 5.1 The `wpm doctor` CLI
To ensure operational readiness of the platform, the `doctor` command was expanded to encompass 8 distinct subcommands (`check`, `fix`, `publish`, `env`, `tps`, `perf`, `watch`, `report`). These subcommands implement automated invariant checking, from ensuring correct node environment and WASM compilation parameters to validating performance against an established JSON baseline. 

---

## Chapter 6: Conclusion

The 7-day development window evaluated in this thesis represents a watershed moment for the `wasm4pm` architecture. By seamlessly blending nanosecond-optimized Rust WebAssembly implementations with exhaustive OTEL observability and mathematically rigorous adversarial testing, the system has proven that extreme performance does not preclude absolute diagnostic transparency. The engine stands ready as an enterprise-grade, edge-first process intelligence platform.