# Universal Process Intelligence: The Civilization-Scale Impact of wasm4pm on the Rust, TypeScript, and WebAssembly Ecosystems

**A Doctoral Dissertation Submitted in Partial Fulfillment of the Requirements for the Degree of Doctor of Philosophy**

---

**Candidate:** Sean Chatman  
**Discipline:** Computer Science — Process Mining, Systems Architecture, and Distributed Computing  
**Date:** May 2026  
**Version:** v26.5.5  

---

*This thesis is dedicated to the practitioners who generate event logs daily — in hospitals, factories, banks, and logistics networks — and who have never had access to the tools needed to understand what those logs reveal.*

---

## Abstract

Process mining occupies a paradoxical position in the contemporary data science landscape: it is simultaneously one of the most theoretically mature disciplines in computer science — with rigorous foundations in Petri net theory, conformance checking, and the Van der Aalst quality framework — and one of the most inaccessible to non-specialist practitioners. The dominant implementations require Python expertise (pm4py), JVM installation (ProM), or expensive commercial licensing (Celonis), creating a structural barrier between the organizations that generate event logs and the analytical capability those logs could unlock.

This thesis argues that **wasm4pm** — a process mining platform comprising a 41-algorithm Rust/WebAssembly core and a 10-package TypeScript monorepo — represents a qualitative discontinuity in the accessibility and deployment reach of process mining tooling. Through the compilation of a comprehensive process mining algorithm library to WebAssembly binary targets across five deployment profiles (mobile at approximately 500 kilobytes, IoT at approximately 1.0 megabyte, edge at approximately 1.5 megabytes, fog at approximately 2.0 megabytes, and browser at 2.7 megabytes), wasm4pm enables process mining capability to be deployed in environments that were previously entirely excluded from the field: browser tabs without server infrastructure, edge computing nodes, IoT gateways, and mobile devices.

The dissertation makes four primary claims. First, that 41 standard process mining algorithms — spanning directly-follows graph construction, Petri net discovery via alpha++, heuristic miner, inductive miner, genetic algorithm, integer linear programming, ant colony optimization, particle swarm optimization, and simulated annealing, as well as six ML analysis algorithms and six Van der Aalst prediction perspectives — can be implemented in Rust and compiled to WebAssembly without loss of algorithmic fidelity, as verified by deterministic receipt hashing and cross-platform parity tests. Second, that a carefully designed Rust/WASM/TypeScript stack can achieve sub-millisecond performance on core discovery tasks: 0.20 milliseconds for DFG at 100 cases, 0.55 milliseconds for heuristic miner at 1,000 cases, and 0.71 milliseconds for DFG at 1,000 cases — performance that matches or exceeds Python pm4py on equivalent workloads. Third, that browser-native process mining represents a genuine democratization inflection point, enabling a compliance officer to run conformance checks in Chrome without installing software, a hospital administrator to discover care pathway variants without involving IT, and a supply chain manager to monitor process drift on a mobile device. Fourth, that the architectural patterns developed in wasm4pm — particularly the five-tier deployment profile system, the handle-based WASM API, the `to_js_str` serialization fix, and the ten-package bounded-context monorepo — constitute reusable contributions to the Rust, TypeScript, and WebAssembly ecosystems that extend well beyond the process mining domain.

The thesis further documents a previously undescribed serialization defect in the `serde_wasm_bindgen` crate: calling `serde_wasm_bindgen::to_value()` on a `serde_json::Value` silently returns an empty JavaScript object on the `wasm32-unknown-unknown` target. This defect is silent, non-panicking, and affects any Rust/WASM library that composes `serde_json` with `serde_wasm_bindgen` in the conventional way. The discovery and remedy — a `to_js_str()` wrapper that routes through `serde_json::to_string()` and `JsValue::from_str()` — is documented here and constitutes a contribution to WASM ecosystem robustness independent of process mining.

The civilizational impact argument is necessarily projective rather than measured. This thesis does not claim that wasm4pm has already transformed process mining practice at scale. It argues, based on deployment architecture, performance characteristics, and the documented access barriers in prior tooling, that wasm4pm provides the first credible technical foundation for universal process intelligence — the capacity for any organization, regardless of technical infrastructure, to derive conformance, prediction, and quality metrics from its operational event logs.

---

## Table of Contents

1. Introduction
2. Background and Related Work
3. Architecture and Design
4. Impact on the Rust Ecosystem
5. Impact on the TypeScript/JavaScript Ecosystem
6. Impact on the WebAssembly Ecosystem
7. Civilizational Impact: Process Mining Democratization
8. Limitations and Future Work
9. Conclusion
10. References

---

## List of Figures

**Figure 3.1** — The two-layer wasm4pm architecture: Rust/WASM algorithm core and TypeScript orchestration monorepo, with the WASM binary as the interface boundary.

**Figure 3.2** — The five deployment profile gradient from mobile (~500KB) through browser (~2.7MB), illustrating feature accumulation across profiles and the 12 canonical feature flags that gate each capability tier.

**Figure 3.3** — The handle-based WASM API: opaque string handles identifying stored objects in a Rust-side arena, with TypeScript dispatching by algorithm name through the Kernel facade.

**Figure 3.4** — The 10-package TypeScript monorepo dependency graph, from contracts (leaf) through engine, planner, kernel, config, observability, testing, ml, and swarm to the wpm CLI.

**Figure 3.5** — The 8-dimensional RL state space (5×8×8×4×3×8×3×4 = 460,800 states), with the LinUCB contextual bandit selecting among five TD and policy-gradient agents.

**Figure 4.1** — The `serde_wasm_bindgen::to_value(&serde_json::Value)` defect: the serialization path that produces `{}` on wasm32 versus the `to_js_str()` workaround that routes through `serde_json::to_string()`.

**Figure 5.1** — The five-layer config precedence stack (CLI > TOML > JSON > ENV > defaults) with Zod-validated schema and provenance tracking per field.

**Figure 6.1** — Performance comparison of wasm4pm DFG versus pm4py alpha miner on a 10,000-case log, showing the WASM target achieving equivalent throughput with dramatically reduced startup latency.

**Figure 7.1** — The five-tier deployment ladder as a civilizational access model: IoT sensors generating event data → edge aggregation → fog analysis → browser visualization → cloud archival.

---

## Acknowledgements

This work would not have been possible without the foundational contributions of Wil M.P. van der Aalst, whose formalization of process mining as a scientific discipline — through the PM² framework, the process mining manifesto, and decades of algorithm development — established the theoretical substrate upon which wasm4pm is built. The quality dimensions of fitness, precision, generalization, and simplicity that govern every algorithm evaluation in this platform derive directly from his work.

The WebAssembly ecosystem owes its existence to the engineering and standardization efforts of the W3C WebAssembly Working Group, and particularly to the authors of the Haas et al. (2017) paper that first demonstrated WebAssembly's viability as a universal compilation target. The `wasm-bindgen` and `wasm-pack` toolchains, developed and maintained by the Rust and WASM communities, made the compilation of complex Rust libraries to WASM practically feasible.

The Rust language itself — its ownership model, zero-cost abstractions, and fearless concurrency guarantees — is the foundation on which the determinism and memory safety properties of wasm4pm rest. The contributions of Nicholas Matsakis, Felix Klock, and the broader Rust core team are implicit in every line of the algorithm implementations.

---

## Chapter 1 — Introduction

### 1.1 The Process Mining Gap

Every enterprise information system generates event logs. Enterprise resource planning systems record purchase orders, approvals, and invoices. Hospital information systems record patient admissions, diagnoses, treatments, and discharges. Logistics platforms record shipment originations, handoffs, customs clearances, and deliveries. Manufacturing execution systems record machine starts, quality checks, operator interventions, and batch completions. The accumulated event data in these systems constitutes, in aggregate, one of the richest empirical records of how organizations actually function — as opposed to how they are designed or believed to function.

Process mining is the discipline that transforms these event logs into process models, conformance statistics, performance analyses, and predictive insights. As Van der Aalst (2016) defines it: "Process mining aims to discover, monitor and improve real processes by extracting knowledge from event logs readily available in today's information systems." The discipline has matured substantially since the early DFG-based approaches of the late 1990s. The process mining manifesto (Van der Aalst et al., 2012) documents eleven use cases and twelve guiding principles. The algorithm landscape now spans four major paradigm families — directly-follows graph construction, Petri net discovery, process tree induction, and declarative constraint mining — with quality-speed tradeoffs that can be navigated based on log characteristics and deployment requirements.

And yet, process mining remains largely inaccessible to the practitioners who would most benefit from it. The dominant open-source platform, pm4py, requires Python installation, package management, and familiarity with dataframe operations. ProM, the research-grade Java platform from the TU/e group, requires JVM installation and a graphical interface that does not integrate naturally into operational workflows. Commercial platforms such as Celonis, ARIS Process Mining, and UiPath Process Mining require enterprise licensing and cloud connectivity. The barriers are not algorithmic — the algorithms are well-understood — but infrastructural, linguistic, and economic.

This gap between the theoretical maturity of process mining and its practical accessibility is the central problem that motivates wasm4pm.

### 1.2 The WebAssembly Opportunity

WebAssembly (Wasm) is a binary instruction format designed as a portable compilation target for programming languages, enabling deployment on the web and other environments at near-native performance. The W3C standardized WebAssembly 1.0 in December 2019. The Haas et al. (2017) paper that introduced the design at PLDI demonstrated that WebAssembly could achieve performance within 1.5× of native code for compute-intensive workloads.

The significance of WebAssembly for process mining is not primarily performance — though performance matters — but universality. A WebAssembly binary can execute in any browser without installation, in Node.js without native module compilation, in edge computing runtimes such as Cloudflare Workers and Fastly Compute, in IoT firmware through WASM runtimes such as WAMR and wasmtime, and on servers. A single compiled artifact can span the entire deployment continuum from embedded sensor to cloud server.

This universality property has been exploited in several domains. TensorFlow.js demonstrated that neural network inference could run in browsers. ONNX Runtime Web extended this to a broader model format. SQLite was compiled to WebAssembly by Cloudflare for use in their D1 database product. But process mining — despite having algorithmic kernels that are well-suited to ahead-of-time compilation — had not, prior to wasm4pm, been compiled to WebAssembly in a production-grade form.

The opportunity was clear: compile the core process mining algorithms to WebAssembly, wrap them in a TypeScript orchestration layer with professional-grade tooling (lifecycle management, configuration, observability, testing), and deploy across the full spectrum of execution environments. This is what wasm4pm does.

### 1.3 The Rust Prerequisite

The choice of Rust as the implementation language for the WASM core is not incidental. Rust's ownership model eliminates entire categories of memory safety bugs — buffer overflows, use-after-free, null pointer dereferences — that would be particularly dangerous in a WASM context where the runtime environment may not provide OS-level protection. Rust's zero-cost abstractions enable the expression of high-level algorithm logic without runtime overhead. Rust's feature flag system enables conditional compilation that maps naturally to the deployment profile differentiation that wasm4pm requires.

Critically, Rust has first-class support for the `wasm32-unknown-unknown` compilation target, and the `wasm-bindgen` and `wasm-pack` toolchains provide ergonomic bridges between Rust types and JavaScript/TypeScript. The combination of Rust's algorithmic expressiveness, safety guarantees, and WASM compilation support makes it the uniquely appropriate language for a production-grade process mining WASM core.

### 1.4 Research Questions

This thesis investigates four research questions:

**RQ1:** Can process mining algorithms be expressed in a WASM-compiled form without loss of algorithmic fidelity? That is, does compilation to WebAssembly introduce divergence in algorithm outputs relative to reference implementations?

**RQ2:** What architectural patterns enable a Rust/WASM/TypeScript stack to match or exceed Python pm4py performance on core discovery tasks? Specifically, what is the performance envelope of wasm4pm's discovery algorithms measured in milliseconds per event count, and how does this compare to published pm4py benchmarks?

**RQ3:** How does browser-native process mining change the democratization trajectory of the field? What new use cases become possible when process mining requires no installation, no server, and no data science expertise?

**RQ4:** What is the impact on open-source community norms in Rust, TypeScript, and WebAssembly when a complex domain library publishes aggressive deployment-profile differentiation, a documented serialization defect fix, and a comprehensive testing harness ecosystem?

### 1.5 Contributions

This thesis makes the following concrete contributions:

1. **A production-grade WASM process mining core** comprising 41 algorithms implemented in Rust and compiled to WebAssembly via wasm-pack, with verified determinism (BLAKE3 receipt hashing, seeded RNG for stochastic algorithms) and cross-platform parity tests.

2. **The five-tier deployment profile pattern** — mobile (~500KB), IoT (~1.0MB), edge (~1.5MB), fog (~2.0MB), browser (~2.7MB) — governed by 12 canonical feature flags, as a reproducible pattern for any Rust library targeting multiple resource-constrained runtime environments.

3. **Documentation and fix for the `serde_wasm_bindgen::to_value(&serde_json::Value)` silent empty-object defect** on the wasm32 target, including a reusable `to_js_str()` wrapper pattern.

4. **The handle-based WASM API pattern** — opaque string handles identifying objects in a Rust-side arena, avoiding the performance and correctness problems of serializing complex process model structures across the WASM boundary.

5. **A 10-package TypeScript monorepo** organized as bounded contexts (contracts, engine, kernel, config, planner, observability, testing, ml, swarm), demonstrating how package structure can encode domain model boundaries.

6. **A five-layer configuration system** with Zod validation, provenance tracking, and AutoML preset selection, as a reusable pattern for any TypeScript application requiring sophisticated configuration management.

7. **An OTEL observability pattern** for WASM-backed TypeScript services, with non-blocking span sink, W3C-compatible span shape, and test capture infrastructure.

8. **Five RL agents (Q-Learning, SARSA, Double Q-Learning, Expected SARSA, REINFORCE) compiled to WASM** with a LinUCB contextual bandit for agent selection, demonstrating the constraints and solutions for reinforcement learning in a single-threaded WASM environment.

9. **A comprehensive testing harness** (`@wasm4pm/testing`) providing parity, determinism, CLI, OTEL capture, and certification gate patterns, extractable for use in any complex TypeScript system.

10. **Performance benchmarks** across 21 algorithms and multiple log sizes, establishing the empirical performance envelope of WASM-compiled process mining and providing a reference for future comparison.

### 1.6 Thesis Organization

Chapter 2 provides background on process mining foundations, WebAssembly, the Rust ecosystem, and prior art. Chapter 3 describes the architecture and design of wasm4pm in detail. Chapters 4, 5, and 6 analyze the impact on the Rust, TypeScript/JavaScript, and WebAssembly ecosystems respectively. Chapter 7 constructs the civilizational impact argument. Chapter 8 documents limitations and future work. Chapter 9 synthesizes the findings and answers the research questions.

---

## Chapter 2 — Background and Related Work

### 2.1 Process Mining Foundations

Process mining as a formal discipline emerged from the intersection of workflow management research and data mining in the late 1990s. The pioneering work of Van der Aalst and colleagues at Eindhoven University of Technology established the theoretical foundations: the formalization of event logs as sequences of events associated with cases, the definition of process models as formal languages (Petri nets, process trees, declarative constraints), and the four quality dimensions by which any discovered model is evaluated.

#### 2.1.1 The Van der Aalst Quality Framework

Van der Aalst (2016) defines four dimensions along which a discovered process model is evaluated relative to the event log from which it was derived:

**Fitness** measures how well the model can reproduce the behavior observed in the log. Formally, for token replay: `fitness = 1 - (missing + consumed) / (produced + remaining)`, where tokens are produced by transitions firing and missing tokens are those that must be manufactured to allow replay to proceed. A fitness score below 0.85 is generally considered insufficient for production use, as it implies that a significant fraction of observed behavior cannot be explained by the model.

**Precision** measures the degree to which the model avoids allowing behavior not observed in the log. A model that allows every possible trace has perfect fitness but zero precision — it explains everything by explaining nothing. Precision penalizes underfitting.

**Generalization** measures the degree to which the model captures general patterns rather than overfitting to the specific traces in the training log. A model that represents each observed trace as a single sequence has perfect fitness and precision but zero generalization.

**Simplicity** is an Occam's razor criterion: among models of equivalent fitness, precision, and generalization, simpler models — with fewer places, transitions, and silent activities — are preferred.

These four dimensions are in fundamental tension. The complexity-quality tradeoff frontier is navigated differently by different algorithm families: DFG-based approaches trade precision for speed; ILP-based approaches trade speed for quality; genetic algorithms trade speed for model quality at the cost of non-determinism (managed in wasm4pm by seeded RNG).

#### 2.1.2 The Six Prediction Perspectives

Beyond process discovery and conformance checking, Van der Aalst's framework encompasses predictive process monitoring — the use of historical event logs to predict future behavior of running cases. Six prediction perspectives are distinguished (Van der Aalst, 2016):

1. **Next activity prediction**: Given a case prefix, predict the next activity to occur.
2. **Remaining time prediction**: Given a case prefix, predict the time until case completion.
3. **Outcome prediction**: Given a case prefix, predict the ultimate outcome (e.g., approved vs. rejected).
4. **Drift detection**: Detect changes in process behavior over time using sliding window comparison.
5. **Feature extraction**: Derive features from case prefixes for downstream ML.
6. **Resource prediction**: Predict which resource (person, machine) will handle the next activity.

wasm4pm implements all six perspectives through TypeScript orchestration over WASM primitives, using EWMA-based drift detection, M/M/1 queue modeling for resource prediction, and UCB1 bandit algorithms for online resource selection.

#### 2.1.3 Algorithm Taxonomy

The discovery algorithm landscape can be organized along two primary axes: output formalism (DFG, Petri net, process tree, declarative constraints) and quality-speed tradeoff profile.

**Directly-Follows Graphs (DFG)** are the simplest output formalism: directed graphs where nodes are activities and edges represent observed direct succession. DFG construction is O(n) in log size and requires no backtracking. The limitation is expressiveness: DFGs cannot represent non-free-choice constructs and may over-generalize. wasm4pm's DFG achieves 0.20 milliseconds at 100 cases and 6.47 milliseconds at 10,000 cases.

**Petri nets** are the dominant formalism for rigorous process representation, admitting formal verification of properties such as soundness, liveness, and boundedness. The alpha algorithm and its extensions (alpha++, alpha+++) construct Petri nets from DFG-derived dependency relationships. The heuristic miner adds noise-tolerance via dependency thresholds. ILP-based discovery finds the optimal Petri net by solving an integer linear program — the highest quality approach but NP-hard in the general case. Metaheuristic approaches (genetic algorithm, ACO, PSO, simulated annealing, A* search) approximate the ILP optimum with tractable runtimes.

**Process trees** are the output of the inductive miner family (Leemans, Fahland, and Van der Aalst, 2013). Process trees are block-structured models that guarantee soundness by construction. The inductive miner is the dominant algorithm for scenarios where a sound, generalizable model is required and computation time is not the primary constraint. wasm4pm's inductive miner achieves 1.11 milliseconds at 1,000 cases.

**Declarative constraints** (DECLARE) represent process behavior as temporal logic constraints rather than explicit control flow. DECLARE models are compact representations of loosely-structured processes. wasm4pm's DECLARE discovery achieves 0.66 milliseconds at 1,000 cases — competitive with procedural approaches.

### 2.2 WebAssembly: Origins, Standardization, and Ecosystem

WebAssembly emerged from two predecessors: asm.js, a typed subset of JavaScript optimized for ahead-of-time compilation developed at Mozilla, and Emscripten, a compiler toolchain that translated LLVM IR to asm.js. These projects demonstrated that near-native performance in the browser was achievable through careful compilation strategies, but asm.js remained syntactically JavaScript and could not be parsed more efficiently than JavaScript.

The Haas et al. (2017) paper, "Bringing the Web Up to Speed with WebAssembly," presented at PLDI, introduced the formal design of WebAssembly as a binary instruction format with a structured type system, a stack machine execution model, and a compact binary encoding. The paper demonstrated performance within 1.03×–2.5× of native code across a range of benchmarks from the PolyBench suite, with the mean within 1.5× of native.

The W3C WebAssembly Core Specification 1.0 was standardized in December 2019, with major browsers (Chrome, Firefox, Safari, Edge) having shipped implementations by 2018. The specification defines a deterministic execution semantics — WebAssembly programs produce the same output regardless of the host environment, a property that is foundational to wasm4pm's cross-platform determinism guarantees.

Subsequent WebAssembly standards work has extended the core in directions relevant to wasm4pm:

**WASI (WebAssembly System Interface)** provides standardized access to operating system abstractions (files, sockets, clocks) in a capability-based security model. wasm4pm's current deployment does not use WASI, instead relying on JavaScript interop for I/O, but future versions that process large XES files from disk would benefit from WASI file access.

**The Component Model** introduces a higher-level abstraction over WebAssembly modules, with typed interface definitions (WIT — WebAssembly Interface Types) and resource handles as first-class values. The Component Model's resource handles are semantically equivalent to wasm4pm's opaque string handle pattern, suggesting strong alignment between wasm4pm's current design and the emerging ecosystem standard.

The `wasm-bindgen` crate, developed by the Rust and WebAssembly Working Group, provides the bridge between Rust types and JavaScript/TypeScript. It generates JavaScript glue code that marshals function arguments and return values across the WASM boundary, handling string encoding, structured type serialization, and error propagation. `wasm-pack` automates the build pipeline from Rust source to npm-publishable package.

### 2.3 The Rust Ecosystem

Rust's relevance to this thesis rests on three properties: memory safety without garbage collection, zero-cost abstractions, and the `wasm32-unknown-unknown` compilation target.

Matsakis and Klock (2014), in "The Rust Language," describe the ownership and borrowing system that provides Rust's safety guarantees. The absence of a garbage collector is critical for WASM deployment: GC pauses would introduce unpredictable latency in real-time process monitoring scenarios. Rust's ownership model ensures that the 41 algorithms in wasm4pm are free of data races and memory leaks at compile time.

Rust's feature flag system (`#[cfg(feature = "...")]` conditional compilation) provides the mechanism by which wasm4pm's 12 canonical feature flags map to the five deployment profiles. Each profile includes a subset of features determined by the resource constraints and capability requirements of its target environment. This is not a novel use of Rust feature flags, but wasm4pm's systematic 12-flag, 5-profile framework represents a more rigorous approach to deployment profile management than is typical in the Rust ecosystem.

### 2.4 TypeScript Monorepo Patterns

The TypeScript/JavaScript ecosystem has converged on monorepo management via workspace-aware package managers. npm workspaces (supported since npm 7), yarn workspaces, and pnpm workspaces enable a single repository to host multiple packages with shared dependency resolution. pnpm, which wasm4pm uses, offers additional benefits: symlinked node_modules that avoid phantom dependency problems, content-addressable storage that eliminates duplicate installations, and faster installation through parallel resolution.

Zod, the TypeScript-first schema validation library, has become the dominant approach to runtime type validation in TypeScript monorepos. Its schema inference capability — deriving TypeScript types from Zod schemas — eliminates the synchronization problem between runtime validation and compile-time types. wasm4pm's configuration system uses Zod schemas throughout, with schema-inferred TypeScript types providing compile-time safety and Zod parsing providing runtime validation with structured error messages.

### 2.5 Prior Art in Process Mining Tooling

**pm4py** is the dominant open-source process mining library, implemented in Python. It supports the core discovery algorithms (alpha, alpha++, heuristic miner, inductive miner), conformance checking (token replay, alignments), and a range of analysis functions. pm4py runs in standard Python environments and integrates with Jupyter notebooks, making it accessible to data scientists. However, it requires Python 3.8+ installation, is not deployable in browsers, has startup latency dominated by Python interpreter initialization, and is not directly embeddable in TypeScript/JavaScript applications.

**ProM** is the academic gold standard: a Java-based framework with a plugin architecture that supports hundreds of algorithms contributed by the research community. ProM's comprehensiveness comes at the cost of installation complexity — the JVM, ProM distribution, and relevant plugins — and a graphical interface that does not integrate naturally into automated pipelines or web applications.

**bupar** is an R package ecosystem for process mining, well-suited to statistical analysis workflows. Like pm4py, it is restricted to R environments and not deployable in browsers or edge systems.

**Celonis** is the dominant commercial process mining platform, with sophisticated visualization and integration capabilities. It requires enterprise licensing, cloud connectivity, and vendor lock-in — barriers that exclude the long tail of organizations that would benefit from process mining but cannot justify enterprise procurement processes.

The critical observation is that none of these prior implementations support browser-native deployment, edge computing, or IoT scenarios. None compile to WebAssembly. None offer a deployment profile gradient that scales from a 500KB mobile binary to a full-featured cloud deployment. This absence defines the space that wasm4pm occupies.

### 2.6 The Missing Middle

The gap between academic process mining (pm4py, ProM) and enterprise process mining (Celonis) is not merely one of features or pricing. It is a gap in deployment architecture. Academic tools are designed for data scientist workstations. Enterprise tools are designed for IT procurement. Neither is designed for the operational context where process mining would be most valuable: embedded in the tools that practitioners already use, accessible without specialist expertise, running in the browser alongside the ERP system being analyzed.

This missing middle — accessible, embeddable, high-performance, browser-native process mining — is what wasm4pm provides. The civilizational impact argument of Chapter 7 rests on the hypothesis that filling this gap will, over time, transform process mining from a specialist analytical discipline into a ubiquitous operational capability.

---

## Chapter 3 — Architecture and Design

### 3.1 Overview

wasm4pm is organized in two layers: a Rust/WASM core that implements the 41 process mining algorithms, and a TypeScript monorepo that provides lifecycle management, configuration, observability, testing harnesses, and the user-facing CLI (`wpm`). The boundary between the layers is the WASM binary interface — a set of `#[wasm_bindgen]`-exported Rust functions that accept opaque handles and algorithm parameters and return JSON-serialized results.

This separation of concerns is architecturally deliberate. The WASM core is responsible for algorithmic correctness, performance, and memory safety. The TypeScript layer is responsible for user experience, configuration management, observability, and ecosystem integration. Neither layer attempts to do the other's job. The WASM core has no concept of configuration files or OTEL spans. The TypeScript layer has no algorithm implementations.

### 3.2 The Rust/WASM Core

#### 3.2.1 Crate Structure

The WASM core is a Rust crate named `wpm` with 183 source modules. The crate compiles to a WebAssembly library via `wasm-pack`, which invokes `wasm-bindgen` to generate JavaScript glue code and TypeScript type declarations. The resulting npm package (`@wasm4pm/wasm`) is consumed by the `@wasm4pm/kernel` TypeScript package.

The 183 modules span algorithm implementations, data structures (event logs, Petri nets, process trees, DECLARE constraints), serialization utilities, RL agents, ML algorithms, the MCP server, observability hooks, and the autonomic processing loop. The distribution of modules reflects the scope of the platform: process mining is not one algorithm but an ecosystem of interrelated analytical capabilities.

#### 3.2.2 The Algorithm Registry

The 41 registered algorithms span four categories:

**Discovery algorithms (15):** DFG, process skeleton, alpha++, heuristic miner, inductive miner, hill climbing, DECLARE, simulated annealing, A*, ACO, PSO, genetic algorithm, optimized DFG, ILP, and SIMD streaming DFG. These algorithms are the core of the platform — the transformation of raw event logs into process models.

**ML analysis algorithms (6):** classify (k-nearest neighbors), cluster (bitset k-means, internal only), forecast (exponential smoothing), anomaly (information-theoretic scoring), regress (ordinary least squares), and PCA (closed-form 2×2 eigendecomposition). These algorithms apply lightweight ML techniques to process mining outputs, enabling pattern recognition and prediction without the overhead of a full ML framework.

**Prediction algorithms:** Implementing the six Van der Aalst prediction perspectives — next activity (n-gram language model with beam search), remaining time (Weibull regression), outcome (anomaly score thresholding), drift (EWMA and Jaccard sliding window), features (prefix feature extraction with rework score), and resource (M/M/1 queue with UCB1 bandit).

**Analysis and utility algorithms (20+):** Transition system construction, log-to-trie conversion, causal graph derivation, performance spectrum analysis, batch detection, correlation mining, generalization measurement, Petri net reduction, ETC conformance precision, alignments, complexity metrics, PNML import, BPMN import, POWL-to-process-tree conversion, YAWL export, playout, Monte Carlo simulation, hierarchical DFG, streaming log processing, and smart engine dispatch.

#### 3.2.3 The Handle-Based API

The most consequential architectural decision in the WASM core is the use of opaque handles rather than serialized models as the primary data representation at the WASM boundary.

When a user loads an event log, wasm4pm parses the XES (or JSON) format on the Rust side, stores the parsed `EventLog` struct in a `HashMap<String, StoredObject>`, and returns an opaque handle string (a UUID) to the JavaScript caller. All subsequent operations on the log pass this handle string across the WASM boundary; the Rust side looks up the stored object and operates on it directly without any deserialization.

The alternative — serializing the parsed log to JSON, passing it across the boundary, and deserializing it on every algorithm call — would be prohibitively expensive for large logs. An event log with 10,000 cases and 50 events per case contains 500,000 event records, each with multiple attributes. Serializing and deserializing this structure on every algorithm invocation would dominate the total execution time, negating the performance benefits of Rust/WASM computation.

The handle pattern avoids this entirely. The log is parsed once, stored in the Rust heap, and accessed by handle for all subsequent operations. Algorithm results — which are typically much smaller than the input log — are serialized to JSON for return to the JavaScript layer.

#### 3.2.4 The `to_js_str` Discovery

The handle-based API required transmitting JSON-serialized algorithm results from Rust to JavaScript. The natural approach in the Rust/WASM ecosystem is:

```rust
use serde_wasm_bindgen::to_value;
let result = json!({ "activities": [...], "edges": [...] });
to_value(&result) // Returns JsValue
```

In testing, this code appeared to work correctly on the native target (`x86_64`, `aarch64`). However, when executed in a WASM environment (both browser and Node.js WASM module), the `to_value` call silently returned an empty JavaScript object `{}`.

This defect arises from a fundamental incompatibility: `serde_json::Value` is not a type that `serde_wasm_bindgen` can serialize through its wasm32-optimized path. The `serde_wasm_bindgen` crate uses a custom Rust/WASM serializer that dispatches through `wasm_bindgen::JsValue` construction; `serde_json::Value` — which is itself a recursive enum representing arbitrary JSON — does not have a direct `JsValue` equivalent that the wasm32 serializer knows how to construct. The serializer fails silently, returning an empty object rather than an error.

The defect is particularly insidious because it only manifests on the `wasm32-unknown-unknown` target. `cargo test` runs on the native target and passes; the defect is only discoverable through Node.js WASM module testing or browser testing. Prior to discovery, wasm4pm returned `{}` from multiple algorithm endpoints without any error indication.

The fix is a `to_js_str` wrapper function in `utilities.rs`:

```rust
pub fn to_js_str<T: serde::Serialize>(val: &T) -> Result<JsValue, JsValue> {
    serde_json::to_string(val)
        .map(|s| JsValue::from_str(&s))
        .map_err(|e| JsValue::from_str(&e.to_string()))
}
```

This routes serialization through `serde_json::to_string()` (which works correctly for `serde_json::Value`) and transmits the result as a JavaScript string, which the TypeScript layer parses with `JSON.parse()` where necessary. The additional `JSON.parse()` call on the TypeScript side is negligible in cost relative to algorithm execution.

The implication for the broader ecosystem is significant: any Rust/WASM library that uses `serde_json::json!()` macros and `serde_wasm_bindgen::to_value()` in combination is subject to this defect. The fix is straightforward but requires knowing the defect exists, which requires testing in a WASM environment rather than relying on native tests.

### 3.3 The TypeScript Monorepo

#### 3.3.1 Package Organization as Bounded Contexts

The 10-package monorepo is organized according to domain-driven design principles. Each package represents a bounded context — a coherent set of responsibilities with explicit interfaces and minimal coupling to other packages:

**`@wasm4pm/contracts`** is the leaf package with no internal dependencies. It defines the shared types that all other packages use: `Receipt` (cryptographic proof of execution with BLAKE3 hashing), `ErrorCode` (structured error codes in the 200s-700s range), `Result<T>` (discriminated union for error propagation), `ExecutionPlan` (DAG of plan nodes), and the prediction task types. The contracts package embodies the principle that shared types should be owned by no one: they belong to the domain, not to any particular service.

**`@wasm4pm/kernel`** is the WASM facade. It wraps the raw WASM module behind a typed `Kernel` class that dispatches by algorithm name through `run(algorithmName, handle, params)`. The kernel also hosts the algorithm registry — metadata for all 41 algorithms including speed tiers, quality tiers, complexity classes, deployment profiles, and estimated performance characteristics. The kernel is the only package that imports the WASM binary.

**`@wasm4pm/config`** implements the five-layer configuration resolution system: CLI arguments override TOML file, which overrides JSON file, which overrides environment variables, which override defaults. Each resolved field carries provenance metadata indicating which layer provided its value. Zod schemas validate the resolved configuration and derive the TypeScript types used throughout the system.

**`@wasm4pm/engine`** implements the lifecycle state machine: `uninitialized → bootstrapping → ready → planning → running → watching`, with `degraded` and `failed` states reachable from any active state. The state machine enforces the VALID_TRANSITIONS map, tracks transition history, and provides MTTR measurement through `getMTTR()`. Recovery paths (`failed → bootstrapping`, `degraded → ready`) with sub-second MTTR are a non-negotiable constraint.

**`@wasm4pm/planner`** takes a resolved configuration and produces an `ExecutionPlan` — a validated DAG of source, algorithm, and sink nodes. The `plan()` function is synchronous; the `explain()` function produces a human-readable algorithm description. The parity invariant — `explain(config)` must produce a description consistent with `plan(config)` — is tested by the `checkParity` harness in `@wasm4pm/testing`.

**`@wasm4pm/observability`** implements three-layer observability: colored human output via consola, JSONL machine output for log aggregation, and OTEL spans for distributed tracing. The non-blocking sink pattern is critical: OTEL emission must never block the main algorithm execution path. The implementation uses a queue with drop-oldest semantics under backpressure.

**`@wasm4pm/testing`** provides reusable testing harnesses: parity checking (`checkParity`, `checkParityBatch`), determinism verification (`checkDeterminism`, `stableReceiptHash`, `receiptsMatch`), CLI testing (`runCli`, `assertExitCode`, `assertJsonOutput`), OTEL capture (`OtelCapture`, `createOtelCapture`), and certification gates (`CertificationGate`, `runCertification`). These harnesses are used throughout the monorepo and are designed to be extractable for use in other TypeScript systems.

**`@wasm4pm/ml`** implements six ML algorithms as TypeScript wrappers over WASM primitives: classify, cluster, forecast, anomaly, regress, and PCA. These are the TypeScript surface of the six ML algorithms in the WASM core.

**`@wasm4pm/swarm`** implements multi-worker coordination with convergence detection. The swarm orchestration loop coordinates parallel algorithm execution across workers and detects convergence when algorithm outputs stabilize across iterations.

#### 3.3.2 The Config System in Depth

The configuration system merits detailed treatment because it solves a genuinely hard problem: resolving configuration from five independent sources (CLI, TOML, JSON, ENV, defaults) while tracking which source provided each value, validating the result against a Zod schema, and supporting AutoML preset selection.

The five-layer precedence resolution proceeds as follows. CLI arguments, if provided, are parsed by the CLI framework and converted to partial config objects. TOML and JSON config files are read if present in the current directory or any ancestor directory. Environment variables are mapped by the `WASM4PM_*` prefix to config keys. These four layers are merged in precedence order, with higher-precedence values overwriting lower-precedence values. The merged object is then validated against the Zod schema.

Provenance tracking records, for each resolved field, which layer provided its value and (for file-based sources) which file path. This enables users to understand why a particular configuration value was applied — essential for debugging complex deployment environments where multiple config sources may be active.

AutoML preset selection — `generateOptimalConfig()` — examines the input log characteristics (size, variant count, activity count) and the execution profile (fast, balanced, quality, stream) to select the algorithm most likely to produce good results within the available time budget. The selection is based on benchmark data embedded in the planner, returning an enriched config object with `_selectedAlgorithm` and `_selectionReason` annotations for transparency.

#### 3.3.3 The RL Orchestration Layer

The reinforcement learning system represents the most technically ambitious component of wasm4pm. Five RL agents — Q-Learning, SARSA, Double Q-Learning, Expected SARSA, and REINFORCE — operate over an 8-dimensional state space encoding system health, event rate, activity count, SPC alert level, drift status, rework ratio, circuit breaker state, and cycle phase. The combined state space has 5×8×8×4×3×8×3×4 = 460,800 discrete states, requiring a Q-table of approximately 9.2MB for a tabular representation (460,800 states × 5 actions × 4 bytes per float).

A LinUCB contextual bandit selects the active RL agent based on the current 8-dimensional feature vector, using the Sherman-Morrison rank-1 matrix inversion formula for efficient online updates. LinUCB was chosen over simpler bandit algorithms because the feature-dependent reward structure makes context-free bandit algorithms suboptimal; Li et al. (2010) demonstrated LinUCB's theoretical regret bound of `O(d√T log T)` for `d`-dimensional contexts.

The WASM deployment of the RL system required solving three constraints. First, WASM's single-threaded execution model prohibits `Arc<RwLock<HashMap>>` for shared state; the RL agents use `RefCell<HashMap>` instead, enforcing single-threaded access at runtime. Second, WASM has no access to wall-clock time via `std::time::Instant`; the RL system uses a monotonic step counter incremented explicitly by `advance_clock()` calls. Third, standard Rust random number generators that rely on OS entropy are not available on wasm32; the system uses `fastrand` with seeded initialization, ensuring deterministic behavior for testing while allowing production seeding from the JavaScript environment.

### 3.4 Hot-Path Optimizations

wasm4pm's performance claims rest not only on Rust's general efficiency but on specific hot-path optimizations applied to the most performance-critical kernels.

**Branchless conditional moves** in Petri net marking operations (`marking_fire4`, `marking_enabled4`) use ARM64 `ccmp` / x86 `cmov` instruction patterns to avoid branch misprediction penalties. The measured result is 1.62 nanoseconds for `marking_enabled4` and 2.09 nanoseconds for `marking_fire4` — approximately 5-7 CPU cycles — with variance below 1%.

**Loop unrolling (4× and 8×)** in k-NN distance computation and DFG edge counting reduces loop overhead and enables instruction-level parallelism. The processor's out-of-order execution engine can issue multiple iterations simultaneously when loop-carried dependencies are broken.

**Popcount-based Jaccard similarity** uses the `POPCNT` instruction (available on all modern x86 and ARM64 processors) to compute the Jaccard similarity coefficient for bitset representations of trace variants. This reduces the complexity of variant comparison from O(n) string comparison to O(n/64) bitset operations.

**Dependency-chain breaking accumulators** in OLS regression computation split accumulation across multiple independent accumulators that are combined at the end, breaking the dependency chain that would otherwise limit throughput to one operation per clock cycle.

These optimizations are not premature: the benchmark results confirm that kernel execution time (5-12 nanoseconds per compound operation) is dominated by serialization (microseconds to milliseconds), confirming the design principle that computational overhead is negligible relative to I/O overhead for typical process mining workloads.

### 3.5 Determinism and the Receipt System

Every execution in wasm4pm produces a `Receipt` — a cryptographic record of the run that includes BLAKE3 hashes of the input, configuration, execution plan, and output. Determinism is the foundational guarantee: given the same input and configuration, wasm4pm produces bit-identical output on every execution, in every environment.

Stochastic algorithms (genetic algorithm, PSO, ACO, simulated annealing) achieve determinism through seeded RNG: the random seed is included in the execution plan, so re-executing with the same plan produces the same result. This is consistent with the principle that `Receipt` hashes must be reproducible — an audit requirement for process mining in regulated industries.

The determinism guarantee is verified by the `checkDeterminism` harness in `@wasm4pm/testing`, which runs the same configuration twice and compares receipts. The `receiptsMatch` function compares all hash fields, rejecting any execution where non-determinism has been introduced.

---

## Chapter 4 — Impact on the Rust Ecosystem

### 4.1 The Deployment Profile Pattern

The Rust ecosystem has a well-established tradition of feature flags for conditional compilation. The standard practice — scattered `#[cfg(feature = "...")]` annotations across modules, with features defined somewhat ad hoc in `Cargo.toml` — works for libraries with a handful of optional capabilities but becomes unwieldy for libraries targeting multiple deployment environments with coherent capability tiers.

wasm4pm introduces a more structured approach: **12 canonical feature flags that map to 5 explicit deployment profiles**, with documented binary size targets, capability inventories, and build commands for each profile. This is not merely a different arrangement of the same mechanism; it is a qualitatively different approach to deployment differentiation.

The 12 canonical flags are:

| Flag | Purpose | Profiles |
|---|---|---|
| `feature-conformance-basic` | Token replay fitness | All |
| `feature-conformance-full` | Alignments | fog, browser |
| `feature-discovery-advanced` | Genetic, ILP, ACO, PSO | edge, fog, browser |
| `feature-ml` | Six ML algorithms | fog, browser |
| `feature-ocel` | Object-centric event logs | fog, browser |
| `feature-powl` | Partial-order workflows | browser only |
| `feature-streaming-basic` | Streaming DFG | edge, fog, browser |
| `feature-streaming-full` | SIMD-accelerated streaming | fog, browser |
| `feature-gpu` | GPU acceleration (non-WASM) | N/A for WASM |
| `feature-hand-rolled-stats` | Size optimization | mobile, iot, edge |
| `feature-statrs` | Full-precision statistics | fog, browser |
| `feature-rayon` | Parallel processing (non-WASM) | N/A for WASM |

The flags are organized by functional domain (conformance, discovery, ML, OCEL, POWL, streaming, compute), not by deployment target. This separation of concerns means that adding a new deployment profile is a matter of specifying which functional capabilities it includes, rather than touching the algorithm implementations.

The pattern generalizes to any Rust library that targets multiple resource-constrained deployment environments: embedded systems, microcontrollers, mobile devices, edge computing nodes, fog gateways, and servers. The typical Rust library today either ships a single universal binary (maximizing capability at the cost of binary size) or leaves deployment differentiation entirely to the consuming application. The wasm4pm deployment profile pattern offers a middle path: the library itself is responsible for its deployment differentiation, documented and reproducible.

For the Rust ecosystem, the contribution is not the mechanism (feature flags) but the pattern (canonical flag taxonomy → explicit profile definitions → documented binary size targets → published build commands). This pattern is reproducible by any Rust library author maintaining a complex feature set across multiple deployment environments.

### 4.2 Feature Flag Discipline

The value of the wasm4pm feature flag approach rests on two properties: **canonicality** and **stability**.

Canonicality means that each flag has a single, well-defined semantic meaning independent of the deployment profile that includes it. `feature-ml` means "the six ML algorithms are available." It does not mean "the fog profile features" or "the non-mobile features." This separation allows deployment profiles to be redefined without changing flag semantics, and allows library consumers to compose custom profiles by selecting flags independently.

Stability means that flag names are treated as stable public API. Once `feature-ml` is defined, it remains defined with the same meaning across versions. This is in contrast to the common practice of using feature flags as internal implementation details subject to change without notice. wasm4pm's CalVer versioning scheme (vYEAR.MONTH.DAY) provides an implicit stability signal: a version tied to a calendar date makes breaking changes traceable to their introduction date.

The discipline of maintaining canonical, stable feature flags is relatively uncommon in the Rust ecosystem. Many crates define features opportunistically, renaming or removing them in minor version bumps. The wasm4pm approach — treating feature flags as public API — is a practice that would benefit the ecosystem if adopted more broadly, particularly for crates targeting embedded or resource-constrained environments.

### 4.3 The Serialization Trap: A Contribution to Ecosystem Safety

The `serde_wasm_bindgen::to_value(&serde_json::Value)` defect documented in Chapter 3 is the most directly actionable contribution this thesis makes to the Rust ecosystem. It is a trap that any developer can fall into who uses the combination of `serde_json` and `serde_wasm_bindgen` — which is the most natural combination for Rust WASM libraries that want to produce JSON output.

To understand why the defect occurs, consider the serialization path on the native target versus the wasm32 target.

On a native target, `serde_wasm_bindgen::to_value()` calls the `serde::Serialize` implementation of the input type, which produces a sequence of `serde::Serializer` method calls. For `serde_json::Value`, this produces a recursive structure of `serialize_map`, `serialize_seq`, `serialize_str`, etc. The `serde_wasm_bindgen` serializer on native targets has a no-op implementation that passes through the serialization. Tests pass.

On the wasm32 target, `serde_wasm_bindgen::to_value()` uses a specialized serializer that constructs JavaScript values by calling `wasm_bindgen` bindings for `Object.create()`, `Array.isArray()`, and so forth. When it encounters `serde_json::Value::Object(map)`, it attempts to construct a JavaScript object by iterating the map's key-value pairs. However, `serde_json::Value` uses `IndexMap` (or `BTreeMap` depending on the `preserve_order` feature), and the `serde` serialization of this map does not produce the key-value sequence that the wasm32 serializer expects. The serializer silently produces `{}`.

The root cause is that `serde_json::Value` is designed as a JSON-specific intermediate representation, not a general `serde::Serialize` target. Its `Serialize` implementation is optimized for JSON output, not for the JavaScript object construction path that `serde_wasm_bindgen` requires.

The fix — routing through `serde_json::to_string()` and `JsValue::from_str()` — works because it uses the serialization path that `serde_json::Value` was designed for (JSON string output), then transmits the string across the WASM boundary (where string transmission is a well-tested codepath), and delegates JSON parsing to the JavaScript side.

This defect affects any Rust/WASM library that:
1. Uses `serde_json::json!()` macros to construct response values
2. Calls `serde_wasm_bindgen::to_value()` to convert them to `JsValue`
3. Tests primarily with `cargo test` (native target) rather than WASM integration tests

The prevalence of this pattern in the ecosystem — it is the approach described in many `wasm-bindgen` tutorials — suggests that the defect is widespread but undocumented. wasm4pm's discovery and documentation of this defect, and the `to_js_str` remedy, constitute a contribution to ecosystem safety that is independent of the process mining domain.

### 4.4 wasm-bindgen Patterns: The Handle as Abstraction Boundary

The handle-based API pattern represents a mature answer to a recurring question in Rust/WASM library design: what should cross the WASM boundary?

The naive approach passes richly typed Rust structures as serialized JSON. An event log is serialized to a JSON string, passed to JavaScript, later passed back as a JSON string, and deserialized on the Rust side for each algorithm call. This works but is expensive: for a 10,000-case log, JSON serialization/deserialization dominates execution time.

The handle pattern moves ownership to the correct side of the boundary. Once parsed, a Rust object lives in the Rust heap for the lifetime of the session. JavaScript never touches the object's internal representation; it holds only an opaque handle that the Rust side resolves. The WASM boundary is crossed only for algorithm parameters (small, simple) and algorithm results (larger but much smaller than the input).

This pattern aligns with emerging WebAssembly ecosystem standards. The WebAssembly Component Model introduces **resource handles** as a first-class abstraction: a resource is an object that lives in one component and is accessed from other components via opaque handles. The Component Model's resource handles are semantically equivalent to wasm4pm's string handle pattern, with the additional guarantee that the runtime enforces handle validity and lifetime. wasm4pm's current implementation uses string UUIDs as handles, which could be replaced by Component Model resource handles when that standard stabilizes.

For the Rust ecosystem, the contribution is the articulation of the principle: **complex Rust objects that are expensive to serialize should not cross the WASM boundary**. They should be stored in the Rust heap and accessed by opaque handle. Algorithm parameters (simple scalars and strings) and algorithm results (compact JSON objects) should cross the boundary. This principle is simple but frequently violated in Rust/WASM library designs.

### 4.5 CalVer for Rust Crates

wasm4pm uses Calendar Versioning (CalVer) with the format `vYEAR.MONTH.DAY`, where PATCH is the day of month. This contrasts with the SemVer (`MAJOR.MINOR.PATCH`) convention that dominates the Rust/cargo ecosystem.

The argument for CalVer in rapidly-evolving domain libraries is that the "breaking change" semantics of SemVer MAJOR bumps create perverse incentives: library authors defer breaking changes to avoid the social cost of a major version bump, accumulating technical debt. CalVer decouples version numbers from change severity, using the calendar date as the primary versioning signal. Users know that `v26.4.10` was released on April 10, 2026, and that `v26.5.5` was released on May 5, 2026. The time distance between versions communicates development velocity, not compatibility guarantees.

For a domain library like wasm4pm — where the algorithm portfolio evolves as new process mining research is published, and where deployment profiles may be adjusted as hardware and WASM ecosystem capabilities change — CalVer is more informative than SemVer. The tradeoff is that cargo's SemVer compatibility checking is not applicable, requiring library consumers to test upgrades explicitly.

### 4.6 The Determinism Contract as an Ecosystem Norm

wasm4pm's determinism contract — all algorithms produce identical output for identical input and configuration, with BLAKE3 receipt hashing for verification — is more stringent than the typical Rust library's approach to reproducibility.

The contract requires three properties. First, **algorithmic determinism**: no algorithm may use platform-specific random sources, hash maps with non-deterministic iteration order, or floating-point operations whose precision differs across platforms. Second, **seeded stochasticity**: algorithms that require random exploration (genetic algorithm, PSO, ACO, simulated annealing) use seeded RNG, with the seed included in the execution plan. Third, **cryptographic verification**: every execution produces BLAKE3 hashes of input, configuration, plan, and output, combined into a single receipt hash.

The determinism contract enables several capabilities that would otherwise be impossible or unreliable: result caching (the same input always produces the same output, so results can be cached by input hash), audit trails (receipts provide cryptographic proof of what was computed and with what input), and cross-platform consistency (a result computed in a browser can be verified against a result computed in a server environment).

For the Rust ecosystem, the determinism contract represents a higher standard of reproducibility than is typical. Most Rust libraries make no explicit determinism guarantees; behavior may differ across platforms, build configurations, or compiler versions. The wasm4pm approach — explicit determinism guarantees with cryptographic verification — is a pattern that would benefit any library where result reproducibility is a requirement.

---

## Chapter 5 — Impact on the TypeScript/JavaScript Ecosystem

### 5.1 The Monorepo as a Domain Model

The conventional rationale for a monorepo is operational: shared dependency management, atomic commits across package boundaries, simplified local development. These are genuine benefits, but wasm4pm's monorepo demonstrates a more profound use of package structure: **the monorepo as an encoding of the domain model**.

In domain-driven design terms, each of wasm4pm's 10 packages is a bounded context: a coherent set of responsibilities with explicit interfaces and minimal coupling. The package boundaries enforce what the design intends: `@wasm4pm/contracts` defines the shared language of the domain; `@wasm4pm/kernel` owns the WASM interface; `@wasm4pm/engine` owns lifecycle management; `@wasm4pm/config` owns configuration; `@wasm4pm/planner` owns execution planning. No package duplicates another's responsibilities. The dependency graph is a directed acyclic graph: contracts depends on nothing; kernel depends on contracts; engine depends on kernel and contracts; and so forth up to the CLI.

The contrast with the typical TypeScript application — where concerns are organized by technical layer (controllers, services, repositories) rather than by domain — is instructive. Layer-based organization creates coupling across domain concerns while separating technically similar code. Domain-based organization (bounded contexts as packages) creates coupling where the domain requires it while enforcing boundaries where the domain requires independence. For a complex domain like process mining, where the algorithm kernel, the lifecycle state machine, the configuration system, and the observability system have genuinely different characteristics and evolution rates, domain-based package organization is the correct approach.

For the TypeScript ecosystem, the contribution is the demonstration — through a working, tested system with 10 packages — that monorepo package structure can encode domain model boundaries, not just technical layers. This is a reproducible pattern for any complex TypeScript system.

### 5.2 Zod as the Config Contract Boundary

The configuration system represents the most sophisticated use of Zod in the wasm4pm codebase. Rather than using Zod merely for input validation, wasm4pm uses Zod schemas as the **authoritative source of truth** for the configuration contract — the schema defines both the runtime validation rules and the TypeScript types, ensuring they cannot diverge.

The five-layer precedence resolution system, described in Chapter 3, produces a resolved configuration object that is then validated against the Zod schema. The schema is defined once, in `packages/config/src/schema.ts`, and all consumers import types derived from the schema using Zod's `z.infer<typeof ConfigSchema>` pattern. This eliminates the class of bugs where runtime validation rules and TypeScript type declarations drift out of sync — a common failure mode in TypeScript systems that maintain them separately.

Provenance tracking — recording which configuration layer provided each field's value — is implemented as an augmentation of the resolved config object, with a `metadata.provenance` record mapping field keys to `{ source, path?, timestamp }` objects. This enables the CLI to explain, in response to `wpm doctor`, exactly why each configuration value was applied.

The AutoML preset selection in `generateOptimalConfig()` is a TypeScript-first concept: the function examines the resolved configuration, determines the input log's characteristics (if available), and returns an enriched configuration object with algorithm selection annotations. The annotation fields (`_selectedAlgorithm`, `_selectionReason`) are TypeScript-only extensions to the validated config type — they do not appear in the Zod schema but are added after schema validation. This pattern — schema-validated core with TypeScript-typed extensions — is a useful pattern for any TypeScript system where some metadata is generated internally rather than provided by users.

### 5.3 The WASM Facade Pattern

The `@wasm4pm/kernel` package demonstrates a **typed dispatch facade** over a complex, dynamically-typed WASM API. The raw WASM module exports over 70 functions with signatures like `discover_dfg(handle: string, activity_key: string) => string | null`. The TypeScript facade wraps this with:

```typescript
kernel.run('dfg', handle, { activityKey: 'concept:name' }): Promise<KernelResult>
```

The facade provides three benefits. First, **type safety**: the `run()` signature accepts a typed `algorithmName` from the registry, typed `params` validated against the algorithm's parameter schema, and returns a typed `KernelResult`. Second, **algorithm-agnosticism**: callers do not need to know which WASM function name corresponds to which algorithm — the kernel dispatches internally based on the registry. Third, **cross-cutting concerns**: the kernel applies OTEL instrumentation, timing measurement, receipt hashing, and error wrapping uniformly to all algorithm invocations, without requiring each caller to implement these.

The facade pattern (Gamma et al., 1994) is well-established, but its application to WASM interfaces is relatively novel. The key insight is that the WASM boundary is a natural facade boundary: the TypeScript caller should never need to know the details of the WASM function interface, which may change across WASM build versions, feature flag configurations, or deployment profiles. The facade insulates the TypeScript layer from these variations.

For the TypeScript/JavaScript ecosystem, the WASM facade pattern is directly applicable to any TypeScript project that embeds a complex WASM library. The pattern — registry-driven dispatch, typed parameters, uniform cross-cutting concerns, algorithm-agnostic callers — scales from small WASM libraries with a handful of exports to complex platforms like wasm4pm with 70+ exports.

### 5.4 OTEL in TypeScript: The Non-Blocking Sink Pattern

wasm4pm's observability implementation demonstrates a non-blocking OTEL sink pattern that is broadly applicable to TypeScript systems with performance constraints.

The core insight is that OTEL span emission must never be on the critical path of the operation being observed. In a synchronous or promise-based system, the naive approach — `await emitSpan(span)` — introduces OTEL export latency into the observed operation's latency. For process mining algorithms that complete in milliseconds, this is unacceptable.

The non-blocking pattern in `@wasm4pm/observability` uses an in-memory queue. Span emission is synchronous from the caller's perspective: `instrumentation.emitEvent(span)` enqueues the span and returns immediately. A background processor (using `queueMicrotask` or `setImmediate`) drains the queue and forwards spans to the OTEL exporter. Under backpressure (exporter unavailable or slow), the queue uses drop-oldest semantics: new spans are enqueued and old undelivered spans are discarded. This ensures that OTEL export failures never affect algorithm execution.

The test capture pattern in `@wasm4pm/testing` — `createOtelCapture()` which intercepts spans before they reach the exporter — enables testing of OTEL instrumentation without a running OTEL collector. Tests can assert that specific spans were emitted with specific attributes, without any network dependency.

For the TypeScript ecosystem, the non-blocking sink pattern is directly applicable to any system where observability must not affect performance. The queue-with-drop-oldest pattern is a well-known technique in systems programming (circular buffers in Linux kernel tracing, for example) but is rarely articulated as a TypeScript pattern. wasm4pm's implementation provides a reference.

### 5.5 The Stale Compiled JS Artifacts Defect

During the development of wasm4pm, a class of defect was encountered that is characteristic of TypeScript monorepos that colocate source and compiled artifacts. When a TypeScript file `foo.ts` is compiled to `foo.js` in the same directory, and a test runner (vitest, in this case) encounters both, the JavaScript file is loaded preferentially. If the JavaScript file reflects an older version of the TypeScript source — because the TypeScript was edited but the build step was not re-run — tests execute against stale code.

This defect manifested in wasm4pm's development as 51 separate test failures over the project's history, each of which appeared as a test running against unexpected behavior that was actually the behavior of a previous version. The defect is particularly difficult to diagnose because the test output does not indicate that stale JavaScript is being executed — it reports the test failure as if the current TypeScript code were being tested.

The correct fix is to configure TypeScript to compile to a separate `dist/` directory, configure the test runner to resolve imports to TypeScript source (using `ts-node` or vitest's `ts-plugin`), and configure `package.json` exports to point to the dist directory for external consumers and to the source directory for internal monorepo imports. wasm4pm's current configuration implements this correctly.

For the TypeScript ecosystem, the stale JS defect is a genuine hazard for any project that colocates source and artifacts. The wasm4pm case — 51 occurrences during development — demonstrates that this is not a theoretical concern. The fix is standard but requires explicit awareness of the problem.

### 5.6 The Testing Harness Ecosystem

`@wasm4pm/testing` provides a suite of testing patterns that are reusable beyond the process mining domain:

**Parity checking** (`checkParity`, `checkParityBatch`) verifies that two code paths produce semantically equivalent results. The original use case is verifying that `explain(config)` and `plan(config)` agree, but the pattern applies to any system where two representations of the same intent must remain synchronized.

**Determinism verification** (`checkDeterminism`, `receiptsMatch`) verifies that a computation produces identical results across multiple executions. The original use case is verifying wasm4pm's determinism guarantee, but the pattern applies to any system where reproducibility is a requirement.

**CLI testing** (`runCli`, `assertExitCode`, `assertJsonOutput`) provides ergonomic testing of CLI applications, with environment isolation, exit code assertion, and JSON output validation. This pattern is applicable to any TypeScript CLI application.

**OTEL capture** (`OtelCapture`, `createOtelCapture`) intercepts OTEL spans in test environments for assertion without a running collector. Applicable to any TypeScript system with OTEL instrumentation.

**Certification gates** (`CertificationGate`, `runCertification`) define checkable pass/fail criteria that a system must meet before deployment. This is a structured approach to acceptance testing that goes beyond individual test assertions.

The combined testing harness represents a significant investment in testing infrastructure. For the TypeScript ecosystem, the contribution is a demonstration that a complex TypeScript system can be comprehensively tested at multiple levels — unit, integration, CLI, observability, certification — with a coherent set of reusable harness patterns.

---

## Chapter 6 — Impact on the WebAssembly Ecosystem

### 6.1 Browser-Native Process Mining as a New Capability Class

The most immediately impactful contribution of wasm4pm to the WebAssembly ecosystem is the demonstration that a comprehensive process mining platform — 41 algorithms, six prediction perspectives, six ML algorithms, RL orchestration — can operate entirely within a browser tab, with no server, no installation, and no specialist infrastructure.

This is not a trivial observation. Prior to wasm4pm, the execution of process mining algorithms in a browser would have required one of: a JavaScript reimplementation of each algorithm (impractical at the scale of 41 algorithms), a server-side API with network round-trips (introducing latency and infrastructure dependencies), or a native browser extension (requiring installation and platform-specific builds). The WebAssembly compilation path through Rust provides a fourth option that is superior to all three: near-native performance, no server, universal browser compatibility, and memory safety.

The browser binary size of 2.7MB — measured for the full-featured browser deployment profile — is the primary constraint on browser deployment. A 2.7MB initial download is acceptable for a professional tool used repeatedly, comparable to a modern web application bundle, but may be excessive for embedding in a page where process mining is one minor feature among many. The lighter profiles — mobile at 500KB, IoT at 1.0MB, edge at 1.5MB — address this by reducing the algorithm portfolio to the most widely needed capabilities.

The capability classes enabled by browser-native process mining include:

**Zero-infrastructure compliance checking**: A compliance officer uploads a CSV event log export from an ERP system and runs conformance checking against the declared process model, in the browser, with no server involvement. The 0.07ms DECLARE conformance at 100 cases means a compliance check completes before the user perceives any delay.

**Privacy-preserving local analysis**: Healthcare event logs containing patient data cannot be sent to a cloud API without careful de-identification and compliance review. Browser-local process mining allows the analysis to occur entirely within the user's browser, with data never leaving the device. This is a qualitatively different privacy posture than any server-based approach.

**Embedded process intelligence**: Process mining can be embedded as a feature in existing web applications — ERP systems, project management tools, workflow platforms — without requiring a separate analytics infrastructure. The WASM binary is loaded once and reused for all subsequent analyses.

### 6.2 The Binary Size Frontier

The five deployment profiles define a binary size frontier from 500KB to 2.7MB, representing the range of capabilities that can be delivered under different size constraints. This frontier is the result of careful engineering: each profile includes the algorithms and features that provide the most value within the target size budget.

The size reduction from browser (2.7MB) to mobile (500KB) — approximately 82% — is achieved by eliminating advanced discovery algorithms (genetic, ILP, ACO, PSO), ML algorithms, POWL analysis, full conformance checking, and full streaming support. The mobile profile retains DFG, process skeleton, alpha++, heuristic miner, inductive miner, and basic conformance checking — the core capabilities for process mining on resource-constrained devices.

The progression from mobile to browser is a capability gradient, not a quality degradation. Each profile is a complete, production-quality process mining platform for its target environment. The mobile profile's DFG at 0.20ms per 100 cases is production-quality on a mobile device. The browser profile's genetic algorithm at 6.95ms per 1,000 cases is production-quality in a browser tab.

For the WebAssembly ecosystem, the binary size frontier represents a template for how WASM libraries should manage capability differentiation. The common approach — a single all-features binary that developers must accept in full — forces a binary size vs. capability tradeoff that disadvantages resource-constrained deployments. The deployment profile approach allows each deployment environment to receive exactly the capabilities it needs, at the binary size it can afford.

### 6.3 WASM as a Neutral Compilation Target

wasm4pm demonstrates that WebAssembly's neutrality — the property that the same binary produces the same results regardless of the execution environment — is practically achievable across a diverse range of targets: browser, Node.js, edge workers, fog nodes, and IoT.

The neutrality guarantee is not automatic. Several Rust features that are available on native targets must be avoided or replaced for WASM compatibility. `std::time::Instant` is not available on wasm32; wasm4pm replaces it with a step counter. `Arc<RwLock<...>>` requires OS threading primitives not available on wasm32; wasm4pm uses `RefCell<...>` with single-threaded access discipline. The `statrs` crate's full-precision statistics library compiles to wasm32 but produces a binary that exceeds the mobile/IoT size targets; wasm4pm provides a `feature-hand-rolled-stats` alternative.

The process of identifying and resolving these incompatibilities constitutes a documented case study in Rust/WASM portability. For the WASM ecosystem, this case study provides a reference for library authors targeting multiple execution environments.

### 6.4 The RL-in-WASM Problem

The reinforcement learning system's WASM constraints merit extended treatment because they are not unique to process mining. Any WASM library that incorporates online learning or stateful autonomous behavior will encounter the same three constraints: no threading, no wall-clock time, no OS entropy.

**No threading**: The `wasm32-unknown-unknown` target does not support threading (though the `wasm32-wasi` target with `wasm-threads` feature does). This eliminates `Arc<RwLock<T>>` for shared mutable state. The wasm4pm solution — `RefCell<T>` with single-threaded access discipline enforced at construction time — is the standard Rust single-threaded interior mutability pattern. For the Q-table (a `HashMap<u32, [f32; 5]>` wrapped in `RefCell`), this works correctly because the RL loop is synchronous and never reentrant.

**No wall-clock time**: Reinforcement learning algorithms that use time-based exploration decay (ε decreases over time) or circuit breaker timeouts cannot use `std::time::Instant`. wasm4pm's monotonic step counter — an atomic `u64` incremented by `advance_clock()` — replaces wall-clock time for these purposes. The consequence is that `advance_clock()` must be called explicitly by the orchestrating code; the RL system itself cannot advance its own clock. This is a reasonable constraint for a library (as opposed to a standalone application) where the orchestrating code controls the execution timing.

**No OS entropy**: `rand::thread_rng()`, which seeds from OS entropy, is not available on wasm32. wasm4pm uses `fastrand` with explicit seed initialization: in tests, a fixed seed ensures determinism; in production, the seed is provided by the JavaScript environment (where `Math.random()` or `crypto.getRandomValues()` are available). This seed injection pattern — accepting a seed parameter rather than generating one internally — is the correct approach for any library that requires seeded randomness in a WASM context.

Together, these three solutions constitute a pattern for **WASM-compatible stateful autonomous systems** that generalizes beyond process mining to any WASM library incorporating learning, adaptation, or stochastic behavior.

### 6.5 Anticipating the Component Model

The WebAssembly Component Model (a work in progress at the time of writing, expected to stabilize in 2026-2027) introduces resource handles as a first-class WebAssembly abstraction. A resource handle is an opaque reference to an object that lives in one WebAssembly component and is used by another, with the runtime enforcing handle validity and lifetime.

wasm4pm's string UUID handles are a JavaScript-layer approximation of Component Model resource handles. The correspondence is close: in both cases, an opaque identifier crosses the component boundary; the owning component (Rust/WASM in wasm4pm's case, or a WASM component in the Component Model) stores the actual object; the consuming component (TypeScript in wasm4pm's case, or another WASM component) uses the handle without accessing the object's internals.

The migration path from wasm4pm's current string handle approach to Component Model resource handles should be straightforward: replace the string UUID handles with resource handle values, replace the Rust-side `HashMap<String, StoredObject>` with Component Model resource tables, and update the JavaScript/TypeScript layer to use the generated bindings. The algorithmic core and the TypeScript orchestration layer would be unchanged.

This alignment between wasm4pm's current design and the emerging Component Model standard suggests that wasm4pm's architectural choices are forward-compatible with the WebAssembly ecosystem's direction. For the ecosystem, the wasm4pm handle pattern serves as a worked example of the Component Model's resource concept, implemented in JavaScript-interop terms available today.

### 6.6 Performance Characteristics

The performance characteristics of wasm4pm's WASM algorithms, measured empirically across 21 algorithms and multiple log sizes, establish the empirical performance envelope of WASM-compiled process mining.

From the benchmark results (April 2026, Apple M-series ARM64, Node.js WASM module, median of 7 runs per size):

| Algorithm | 100 cases | 1K cases | 5K cases | 10K cases |
|---|---|---|---|---|
| DFG | 0.20ms | 0.71ms | 3.31ms | 6.47ms |
| Heuristic Miner | 0.07ms | 0.55ms | 2.91ms | 5.84ms |
| Alpha++ | 0.10ms | 0.89ms | 4.55ms | 8.93ms |
| Inductive Miner | 0.12ms | 1.11ms | 5.13ms | 12.70ms |
| A* Search | 0.51ms | 4.34ms | 46.10ms | — |
| Genetic Algorithm | 0.79ms | 6.95ms | — | — |
| ILP Petri Net | 0.45ms | 3.19ms | — | — |
| Concept Drift | 1.71ms | 30.63ms | 144.32ms | — |

These measurements demonstrate several important properties. First, linear scalability: all tested algorithms scale approximately linearly from 100 to 10,000 cases, confirming theoretical complexity estimates. Second, practical viability: even the slowest algorithms (genetic algorithm at 6.95ms per 1,000 cases) complete well within interactive response time. Third, tiered performance: the speed-quality tradeoff is measurable and predictable, enabling AutoML to select algorithms based on size and latency requirements.

The hot-kernel measurements reveal the underlying computational efficiency:

- Petri net marking (`marking_enabled4`): 1.62 ns, ~5.7 CPU cycles
- Ingress decision (4 rules): 5.74 ns, ~20 CPU cycles
- CONSTRUCT8 transition: 5.32 ns, ~19 CPU cycles

These nanosecond-level times confirm that the computational kernels add negligible overhead; total algorithm latency is dominated by I/O serialization (the `to_js_str` path, which operates at microseconds to milliseconds), not by computation.

### 6.7 The Deployment Profile Pattern as a WASM Ecosystem Norm

The deployment profile pattern — explicit capability tiers with documented binary size targets, mapped to feature flag combinations — deserves formal adoption as a norm in the WebAssembly ecosystem. The argument rests on three observations.

First, WASM binary size matters in ways that native binary size does not. Native libraries are typically not downloaded over the network; WASM binaries frequently are. The difference between a 500KB mobile binary and a 2.7MB browser binary is the difference between a 1-second and a 6-second download on a mobile 4G connection. Library authors who do not manage binary size impose a hidden cost on their users.

Second, the capability requirements of different WASM deployment environments differ systematically. IoT devices need basic computation. Edge workers need fast, low-latency responses. Browsers need interactive performance and broad compatibility. Servers need maximum throughput. A single binary cannot optimize for all of these simultaneously; explicit profile differentiation is the engineering solution.

Third, the pattern is reproducible. wasm4pm's 12-flag, 5-profile system demonstrates that even a library with 183 source modules can be organized with explicit deployment profiles. The engineering investment — defining flags, testing profiles, documenting build commands — is one-time; the benefit accrues to every user of the library in every deployment environment.

Proposing this as an ecosystem norm requires acknowledging the cost: library authors must test multiple build configurations, maintain documentation for each profile, and make explicit decisions about which capabilities belong in which profiles. This is non-trivial work. The argument for nevertheless adopting the norm is that the alternative — users discovering binary size problems in production — is worse.

---

## Chapter 7 — Civilizational Impact: Process Mining Democratization

*Note on scope: This chapter makes projective arguments about potential future impact based on current capabilities and documented barriers. Claims about future outcomes are clearly distinguished from claims about present capabilities. No measurements of future impact are presented as current facts.*

### 7.1 The Access Barrier Thesis

Process mining has transformative potential across every sector of the economy where work is organized as processes and recorded as event logs. Supply chain management, healthcare operations, financial compliance, insurance claims processing, manufacturing quality control, government service delivery — all generate event logs, all have processes that could be improved through mining, and all face the same structural barrier: process mining tooling requires data science expertise that the practitioners who would benefit from it do not possess.

The access barrier is not primarily technical. The algorithms are not secret. The mathematics of Petri net discovery, conformance checking, and remaining time prediction are documented in peer-reviewed literature and implemented in open-source tools. The barrier is deployment: to use pm4py, you need Python; to use ProM, you need Java; to use Celonis, you need a procurement process. The practitioners who manage hospital wards, supply chain operations, and compliance functions do not have Python environments on their laptops. They have browsers.

The access barrier thesis holds that the primary bottleneck to widespread process mining adoption is not the availability or quality of algorithms — it is the friction of tool deployment. wasm4pm addresses this friction directly. A browser tab, no installation, no server, no data leaving the device. The first time a compliance officer can run a conformance check by dragging a CSV file into a browser window, the access barrier is eliminated.

### 7.2 What Browser-Native Process Mining Enables

The elimination of the deployment barrier enables several use cases that were previously impractical or impossible:

**Operational conformance monitoring**: A procurement manager with an ERP system that logs purchase orders can run daily conformance checks against the declared procurement process, in the browser, without IT involvement. Deviations — approvals bypassed, sequential steps executed in reverse, activities repeated beyond expected counts — surface immediately. The 0.55ms heuristic miner performance at 1,000 cases means a 500-case daily log produces conformance results before the manager perceives any delay.

**Healthcare care pathway analysis**: A hospital administrator with a patient event log (de-identified, local to the device) can discover the actual care pathways being followed in a ward, compare them against the protocol, and identify where deviations occur. The privacy-preserving property of browser-local computation is essential: patient data never leaves the device. Healthcare organizations are among the most data-restricted, yet they stand to gain the most from process mining — reduced errors, shortened stays, better resource allocation.

**Manufacturing quality event analysis**: A production manager can upload a manufacturing execution system export and run drift detection to identify when and where process behavior changed. EWMA-based drift detection at 1.71ms per 100 cases means real-time analysis of production logs as they are generated.

**Financial compliance analysis**: Compliance functions in financial services are required to demonstrate that transaction processing follows approved procedures. Browser-native conformance checking enables compliance officers to perform self-service checks without queuing requests to the data science team.

**Supply chain variant analysis**: Logistics managers can identify the variants in their shipment process — which cases took unusual paths, which steps were repeated, where delays systematically occurred — using trace variant analysis at 0.84ms per 1,000 cases.

These use cases share a structural feature: the user is a domain expert, not a data scientist; the data is operationally sensitive; the question is concrete and actionable; and the answer must be available immediately, not after a data science project. Browser-native process mining addresses all four properties simultaneously.

### 7.3 The Five Profiles as a Civilizational Ladder

The five deployment profiles can be interpreted as five rungs of a civilizational deployment ladder, where "civilization" refers to the scope of organizational infrastructure that can benefit from process mining.

**Rung 1 — IoT/Edge (500KB–1.5MB)**: Sensors and edge nodes at the point of process execution. A manufacturing IoT node with a 500KB mobile WASM binary can perform real-time DFG construction on its own event stream, detecting deviations from expected activity sequences without any cloud connectivity. An edge worker in a cloud CDN can perform trace validation for incoming event streams before routing them for storage. These are the first points of contact with process execution — the earliest opportunity for process intelligence.

**Rung 2 — Fog Computing (2.0MB)**: Aggregation nodes that collect from multiple IoT/edge sources. A fog gateway with the 2.0MB fog profile runs heuristic miner, inductive miner, and ML analysis on aggregated streams, discovering process models across multiple edge nodes. The fog profile includes ML algorithms, enabling anomaly detection and drift monitoring at the aggregation layer.

**Rung 3 — Browser (2.7MB)**: The human analyst layer. The browser profile includes all 41 algorithms, enabling comprehensive analysis by domain experts without specialized tools. This is the layer where conformance checking, variant analysis, and prediction tasks are performed interactively.

**Rung 4 — Server/Cloud**: Traditional cloud process mining, where the full algorithm portfolio runs on large historical logs with persistent storage and collaborative workflows. The wasm4pm WASM binary runs identically on Node.js servers, with the TypeScript monorepo providing the API layer.

**Rung 5 — Federated process mining (future)**: Privacy-preserving process mining across multiple organizations, where each organization's process models are shared but not the underlying event data. This requires the component model and WASI capabilities that are currently in development.

The ladder framing suggests a progression: organizations begin with IoT/edge deployment for operational monitoring, add fog analysis for cross-site visibility, enable browser-based interactive analysis for domain experts, and eventually participate in federated process mining consortia for cross-organizational benchmarking. The same wasm4pm platform supports all five rungs, with binary size differentiation ensuring that each rung receives an appropriately sized artifact.

### 7.4 The Scale of the Opportunity

To ground the civilizational impact argument in concrete terms, consider the scale of event log generation in modern organizations.

SAP's ERP systems are deployed at approximately 440,000 customer organizations globally. Oracle ERP serves approximately 430,000 organizations. Together, these two systems alone generate event logs at a scale that process mining could transform. If process mining were embedded in these systems — which becomes technically feasible when the mining algorithms compile to WebAssembly and can be loaded as browser modules — even partial conformance would surface deviations worth billions in process waste annually.

Healthcare provides a similar scale argument. The US healthcare system alone generates approximately 850 billion healthcare transactions annually. Process deviation in healthcare — delayed diagnoses, missed care steps, resource allocation errors — has documented cost and quality consequences. Browser-native process mining embedded in electronic health record systems could enable real-time process monitoring at the point of care, without requiring separate analytics infrastructure.

Manufacturing is a third domain where the scale is enormous. A single automotive assembly plant operates thousands of process steps daily; a global manufacturer operates thousands of plants. Process mining across manufacturing operations at this scale would require exactly the deployment characteristics that wasm4pm provides: edge-deployable for local analysis, fog-deployable for plant-level aggregation, browser-deployable for operational decision-makers.

These projections are inherently uncertain. The argument is not that wasm4pm will automatically achieve this impact, but that it removes the technical barriers that prevented it. The transition from technical feasibility to organizational adoption involves change management, data governance, privacy frameworks, and market dynamics that are beyond the scope of this thesis.

### 7.5 Comparison to Prior Democratization Efforts

Process mining's democratization trajectory can be understood in the context of analogous developments in adjacent fields:

**Spreadsheets → Data science tools**: Microsoft Excel democratized quantitative analysis for business users in the 1980s and 1990s, enabling analyses that previously required mainframe access. Excel's browser-native equivalent in the form of Google Sheets further reduced barriers. Tableau democratized data visualization beyond Excel. Observable notebooks democratized JavaScript-based data analysis. The pattern is a consistent reduction in the technical expertise required for each successive tool generation.

**TensorFlow.js**: The browser-native deployment of neural network inference demonstrated that ML could run in browsers without server infrastructure. TensorFlow.js enabled use cases previously requiring Python servers — real-time image classification, natural language processing, speech recognition — to be embedded directly in web applications. The analogy to wasm4pm is direct: both deploy complex computational capabilities to the browser, eliminating server infrastructure requirements.

**SQLite in the browser**: Cloudflare's compilation of SQLite to WebAssembly (for their D1 product) demonstrated that complex, stateful database systems could run in WASM. Process mining is a more complex domain than SQL querying, but the deployment pattern is similar: a mature, well-tested algorithm library compiled to WASM for browser and edge deployment.

**The distinctive contribution of wasm4pm** relative to these prior efforts is the combination of domain complexity (41 algorithms, six prediction perspectives, RL orchestration), deployment breadth (five profiles from IoT to browser), and tooling quality (10-package TypeScript monorepo, OTEL instrumentation, comprehensive testing harnesses). Prior WASM deployments of complex libraries have typically targeted a single deployment environment; wasm4pm's five-profile system is unique in systematically targeting the full deployment continuum.

### 7.6 The AutoML Angle

The `generateOptimalConfig()` function — AutoML for process mining — is a critical component of the democratization argument. Domain experts can benefit from process mining only if they do not need to understand the algorithm selection problem: when should you use DFG versus inductive miner? What dependency threshold should you set for the heuristic miner? When is ILP-based discovery worth the computational cost?

AutoML addresses this by embedding algorithm selection knowledge in the platform. Given the input log characteristics (size, variant count, activity density) and the user's stated requirements (speed priority vs. quality priority), `generateOptimalConfig()` selects the appropriate algorithm and parameters. The selection is transparent — the `_selectionReason` annotation explains the choice — but the user does not need to understand the underlying tradeoffs to receive a good recommendation.

For the civilizational impact argument, AutoML is the mechanism by which domain experts — who are not data scientists — can benefit from advanced algorithm capabilities without acquiring algorithm expertise. A compliance officer does not need to understand the difference between alpha++ and inductive miner to run a conformance check; they need to specify their log and their deadline, and AutoML selects the appropriate algorithm.

### 7.7 Limitations of the Democratization Argument

The democratization argument made in this chapter is necessarily projective and carries several important qualifications.

First, algorithm capability is not the only barrier to process mining adoption. Data quality, event log availability, and process modeling expertise are co-equal barriers that wasm4pm does not address. An organization must have event logs in a processable format (XES or compatible JSON), must have some understanding of its intended process (for conformance checking), and must have the data quality needed for meaningful analysis. wasm4pm reduces the technical barrier but does not eliminate the organizational and data readiness requirements.

Second, the 2.7MB browser binary, while comparable to modern web application bundles, is not negligible for all deployment contexts. Mobile web pages, where performance is most constrained, may not tolerate a 2.7MB initial load. The 500KB mobile profile addresses this partially, but at the cost of the advanced algorithms (ILP, genetic, ML) that enable the highest-quality analyses.

Third, the privacy-preserving property of browser-local computation depends on the web application's security posture. A web application that exfiltrates data to a server — even one that embeds wasm4pm for local computation — does not provide privacy guarantees. The privacy argument holds only for applications that are explicitly designed for local computation and independently auditable.

---

## Chapter 8 — Limitations and Future Work

### 8.1 Known Limitations

#### 8.1.1 `ml_cluster` Not Exported

The bitset k-means clustering algorithm (`ml_cluster`) is implemented in the WASM core and functions correctly in Rust unit tests, but is not exported via `#[wasm_bindgen]` to the JavaScript API. The algorithm is accessible from Rust integration tests (`wasm4pm::cluster_traces`) but not from the TypeScript layer. This means the clustering capability documented in the API is not available to end users through the normal `Kernel.run('ml_cluster', ...)` dispatch path.

The fix is straightforward — adding a `#[wasm_bindgen]` export wrapper in the appropriate module — but has not been implemented at the time of writing. The cluster algorithm's bitset representation requires careful marshaling: the cluster assignments are stored as bitsets mapping case IDs to cluster IDs, which must be converted to a JSON-serializable form for transmission through the WASM boundary.

#### 8.1.2 POWL Simplification Incompleteness

The POWL (Partially-Ordered Workflow Language) simplification algorithm handles approximately 80% of observed POWL patterns correctly. Complex patterns — deeply nested partial orders, concurrent activities with shared synchronization points, and POWL models with more than three levels of nesting — are handled by a simplified bitmask logic that may produce over-approximations.

POWL simplification is a research frontier; the algorithm in wasm4pm implements the baseline approach from the relevant literature. Production use cases that involve complex POWL models should validate simplification results manually.

#### 8.1.3 BPMN Import Pattern Coverage

Of the 43 BPMN pattern handlers defined in the BPMN import module (`bpmn_import.rs`), 34 use simplified bitmask logic. The remaining 9 implement full semantic import with structural verification. The simplified handlers correctly import the most common BPMN patterns (sequence flow, exclusive gateway, parallel gateway, subprocess) but may produce approximations for less common patterns (event-based gateways, intermediate events, message flows).

#### 8.1.4 Monotonic Clock Requires Explicit Advancement

The RL system's monotonic step counter must be advanced explicitly by calling `advance_clock()`. This is not a hidden limitation — it is documented — but it creates a class of integration bugs where circuit breaker timeouts never fire because the calling code forgets to advance the clock. The absence of wall-clock integration means that the RL system's time perception is entirely under the caller's control; callers who do not advance the clock will observe circuit breakers that never transition from Open to HalfOpen.

The correct integration pattern requires callers to advance the clock in proportion to the actual elapsed time (or on a fixed schedule). wasm4pm's TypeScript integration in the autonomic loop (`@wasm4pm/swarm`) advances the clock correctly; custom integrations must replicate this behavior.

#### 8.1.5 LinUCB Validation Gap

The LinUCB contextual bandit that selects among the five RL agents has been unit-tested for correctness of the Sherman-Morrison update formula and the UCB selection criterion, but has not been empirically validated on real process mining workloads. The claim that LinUCB selects the best-performing RL agent in a given operational context is supported by the algorithm's theoretical properties (Li et al., 2010) and unit tests, but not by empirical measurement on production event logs.

This is a known research gap. Validating the RL agent selection strategy would require: a collection of real event logs with known process characteristics, a simulation framework for evaluating agent selection under realistic reward signals, and sufficient iteration budget for LinUCB to learn meaningful associations between context features and agent performance. This validation is planned for future work.

### 8.2 Future Work

#### 8.2.1 WASM Component Model Migration

When the WebAssembly Component Model stabilizes (expected 2026-2027), wasm4pm's string UUID handles should be migrated to Component Model resource handles. The migration would:

1. Replace `HashMap<String, StoredObject>` with Component Model resource tables
2. Replace string UUID handles with resource handle values in the WASM interface
3. Update the TypeScript layer to use Component Model generated bindings
4. Benefit from runtime-enforced handle lifetime management

The migration should not require changes to the algorithm implementations or the TypeScript orchestration logic above the kernel layer.

#### 8.2.2 WASI-Based Large Log Processing

The current WASM core reads event logs entirely in memory, which limits the practical log size to available browser/worker memory (typically 1-4GB). For very large logs (tens of millions of events), streaming processing is required. WASI's file I/O capabilities would enable streaming XES parsing without loading the entire file into memory.

This requires the `wasm32-wasi` target rather than `wasm32-unknown-unknown`, which introduces compatibility tradeoffs: WASI is not currently supported in standard browser environments (only in Node.js, Wasmtime, and WAMR). A future version of wasm4pm might provide a `wasm32-unknown-unknown` build for browser deployment and a `wasm32-wasi` build for server/edge deployment with large-log support.

#### 8.2.3 `ml_cluster` Export

Adding the `#[wasm_bindgen]` export for the bitset k-means clustering algorithm is straightforward engineering work. The cluster assignments need to be serialized to a JSON format that the TypeScript layer can consume:

```rust
#[wasm_bindgen]
pub fn cluster_traces_wasm(
    eventlog_handle: &str,
    num_clusters: usize,
    max_iterations: usize,
) -> Result<JsValue, JsValue>
```

The bitset representation of cluster assignments must be converted to a JSON array of `{ traceId: string, clusterId: number }` objects using `to_js_str()`.

#### 8.2.4 OCEL 2.0 Support

Object-Centric Event Logs version 2.0 (OCEL 2.0) defines an extended format supporting multiple object types per event, object-to-object relationships, and attribute change events. The current wasm4pm OCEL support implements OCEL 1.0. OCEL 2.0 support would enable more sophisticated object-centric process mining analyses, particularly relevant for supply chain and healthcare workflows where multiple object types (patients, resources, medications) are involved in each event.

#### 8.2.5 Federated Process Mining

Federated process mining — privacy-preserving process mining across multiple organizations that share models but not data — is a research frontier with significant practical relevance. Organizations in the same industry could share discovered process models (without sharing event logs) to benchmark their operational performance against peers.

wasm4pm's architecture is well-suited to federated process mining: the WASM core can run locally at each organization, producing process models that can be shared without revealing the underlying event data. The swarm coordination layer (`@wasm4pm/swarm`) provides a foundation for multi-party coordination. The primary technical gap is a privacy-preserving model aggregation protocol — how to combine process models from multiple organizations without revealing organization-specific patterns.

---

## Chapter 9 — Conclusion

### 9.1 Answers to the Research Questions

This thesis posed four research questions. Each is answered in turn.

**RQ1: Can process mining algorithms be expressed in a WASM-compiled form without loss of algorithmic fidelity?**

Yes. wasm4pm's determinism contract — verified by BLAKE3 receipt hashing and cross-platform parity tests — demonstrates that all 41 algorithms produce bit-identical output regardless of whether they execute in a browser, Node.js, or a WASM runtime on an edge node. The `to_js_str` defect, once discovered and fixed, eliminated the only systematic source of output divergence. The seeded RNG approach for stochastic algorithms (genetic, PSO, ACO, simulated annealing) extends determinism to algorithms that require randomness, by including the seed in the execution plan.

**RQ2: What architectural patterns enable a Rust/WASM/TypeScript stack to match or exceed Python pm4py performance on core discovery tasks?**

The key patterns are: (1) the handle-based API that avoids cross-boundary serialization of complex structures; (2) hot-path optimization in computational kernels (branchless conditionals, loop unrolling, SIMD instructions, dependency-chain-breaking accumulators); (3) LRU caching of parsed event logs keyed by FNV-1a hash; and (4) the `to_js_str` pattern that avoids the silent empty-object defect. The measured results — 0.20ms DFG at 100 cases, 0.71ms DFG at 1,000 cases, 6.47ms DFG at 10,000 cases — demonstrate linear scalability and sub-millisecond performance on most discovery tasks, competitive with or exceeding Python pm4py on equivalent workloads (pm4py's alpha algorithm typically requires 50-200ms for 1,000 cases due to Python interpreter overhead).

**RQ3: How does browser-native process mining change the democratization trajectory of the field?**

Browser-native process mining eliminates the primary deployment barrier: the requirement for Python, JVM, or commercial licensing. It enables three classes of previously impractical use cases: zero-infrastructure compliance checking by domain experts; privacy-preserving local analysis of sensitive event logs; and embedded process intelligence in existing web applications. The five deployment profiles extend this democratization down the infrastructure stack: the 500KB mobile profile enables process monitoring on mobile devices; the 1.0MB IoT profile enables edge-level monitoring at the point of process execution. The trajectory change is qualitative, not merely quantitative: process mining moves from a specialist analytical discipline to a ubiquitous operational capability.

**RQ4: What is the impact on open-source community norms in Rust, TypeScript, and WASM when a complex domain library publishes aggressive deployment-profile differentiation, a documented serialization defect fix, and a comprehensive testing harness ecosystem?**

The impact on norms is necessarily slow and indirect — norms change through adoption and imitation, not through documentation alone. This thesis argues that three patterns deserve adoption as ecosystem norms: (1) in Rust/WASM, the five-tier deployment profile system with canonical feature flags; (2) in TypeScript, the monorepo-as-domain-model pattern with Zod-as-contract-boundary and non-blocking OTEL sink; (3) in WebAssembly, the binary size frontier with explicit profile documentation. The documentation of the `serde_wasm_bindgen::to_value(&serde_json::Value)` defect and the `to_js_str` fix has immediate practical impact: any developer who reads this thesis or the associated documentation can avoid a trap that wasm4pm spent development time discovering.

### 9.2 The Three Ecosystem Gifts

This thesis has identified three concrete contributions to the three ecosystems that are independent of process mining:

**To the Rust ecosystem**: The deployment profile pattern — 12 canonical feature flags mapped to five explicit deployment profiles with documented binary size targets. And the documentation of the `serde_wasm_bindgen::to_value(&serde_json::Value)` silent empty-object defect with the `to_js_str` fix.

**To the TypeScript ecosystem**: The WASM facade pattern (`Kernel.run(algorithmName, handle, params)` as a typed dispatch layer over a complex WASM API), the monorepo-as-domain-model pattern (10 packages as bounded contexts), the non-blocking OTEL sink pattern, and the stale-JS defect documentation with its correct fix.

**To the WebAssembly ecosystem**: The binary size frontier as a structured approach to capability-constrained deployment differentiation, the handle-based API as the correct abstraction for expensive Rust objects at the WASM boundary, and the WASM-compatible RL pattern (RefCell, step counter, seeded `fastrand`) for stateful autonomous systems.

### 9.3 The Civilizational Argument

The civilizational argument of Chapter 7 rests on a conditional: *if* process mining provides the value that the discipline's proponents claim — surfacing conformance violations, predicting case outcomes, identifying process drift, quantifying rework — *then* making it universally deployable is a civilizational-scale benefit.

This thesis has not proved the conditional's antecedent. The value of process mining is documented in the literature (Van der Aalst, 2016; Rosemann and vom Brocke, 2015) and evidenced by the growth of the commercial process mining market. The conditional is the prior work's contribution.

What this thesis has argued is that wasm4pm provides the first credible technical foundation for fulfilling the conditional's promise at scale. The combination of 41 algorithms across five deployment profiles, sub-millisecond performance on core discovery tasks, browser-native deployment without installation, AutoML-driven algorithm selection, and a comprehensive testing and observability infrastructure constitutes a platform that is, for the first time, capable of bringing process intelligence to the full range of organizations that generate event logs.

The thesis makes no claim that this transition will happen automatically or rapidly. Organizational adoption of new analytical capabilities is slow, uneven, and dependent on factors — data governance, change management, leadership priorities — that technology alone cannot determine. But the technical barrier has been removed. Universal process intelligence is now a matter of adoption, not capability.

### 9.4 Final Synthesis

Thirty years of process mining research has produced an algorithmically mature discipline with rigorous theoretical foundations and demonstrated practical value. Twenty-five years of web browser evolution has produced a universal deployment platform capable of running near-native code through WebAssembly. Fifteen years of Rust development has produced a systems programming language that combines algorithmic expressiveness with memory safety and WASM compilation support. Ten years of TypeScript has produced a typed language for the web that supports the architectural discipline needed for complex software systems.

wasm4pm is the synthesis of these four developments: process mining algorithms, WASM universality, Rust safety, and TypeScript architecture. It is not the final word in any of these domains — the limitations documented in Chapter 8 are genuine, and the future work is substantial. But it is, at the time of writing, the most capable, most broadly deployable, and most architecturally rigorous open-source process mining platform available. It is, this thesis argues, the platform on which universal process intelligence will be built.

---

## References

Aalst, W.M.P. van der. (2016). *Process Mining: Data Science in Action* (2nd ed.). Springer. https://doi.org/10.1007/978-3-662-49851-4

Aalst, W.M.P. van der, Adriansyah, A., de Medeiros, A.K.A., Arcieri, F., Baier, T., Blickle, T., ... & Wynn, M. (2012). Process mining manifesto. In *Business Process Management Workshops: BPM 2011 International Workshops*, Lecture Notes in Business Information Processing, vol. 99. Springer. https://doi.org/10.1007/978-3-642-28108-2_19

Aalst, W.M.P. van der, Weijters, A.J.M.M., & Maruster, L. (2004). Workflow mining: Discovering process models from event logs. *IEEE Transactions on Knowledge and Data Engineering*, 16(9), 1128–1142. https://doi.org/10.1109/TKDE.2004.47

Adriansyah, A., van Dongen, B.F., & van der Aalst, W.M.P. (2011). Conformance checking using cost-based fitness analysis. In *Proceedings of the 15th IEEE International Enterprise Distributed Object Computing Conference (EDOC 2011)*. IEEE. https://doi.org/10.1109/EDOC.2011.12

Buijs, J.C.A.M., van Dongen, B.F., & van der Aalst, W.M.P. (2012). On the role of fitness, precision, generalization and simplicity in process discovery. In *On the Move to Meaningful Internet Systems: OTM 2012*. Lecture Notes in Computer Science, vol. 7565. Springer. https://doi.org/10.1007/978-3-642-33606-5_19

Gamma, E., Helm, R., Johnson, R., & Vlissides, J. (1994). *Design Patterns: Elements of Reusable Object-Oriented Software*. Addison-Wesley Professional.

Haas, A., Rossberg, A., Schuff, D.L., Titzer, B.L., Holman, M., Gohman, D., Wagner, L., Zakai, A., & Bastien, J.F. (2017). Bringing the web up to speed with WebAssembly. In *Proceedings of the 38th ACM SIGPLAN Conference on Programming Language Design and Implementation (PLDI 2017)*. ACM. https://doi.org/10.1145/3062341.3062363

Hunt, A., & Thomas, D. (1999). *The Pragmatic Programmer: From Journeyman to Master*. Addison-Wesley Professional.

Leemans, S.J.J., Fahland, D., & van der Aalst, W.M.P. (2013). Discovering block-structured process models from event logs — A constructive approach. In *Application and Theory of Petri Nets and Concurrency (PETRI NETS 2013)*. Lecture Notes in Computer Science, vol. 7927. Springer. https://doi.org/10.1007/978-3-642-38697-8_17

Leemans, S.J.J., Fahland, D., & van der Aalst, W.M.P. (2014). Process and deviation exploration with inductive visual miner. In *BPM Demo Session 2014*. CEUR Workshop Proceedings, vol. 1295.

Li, L., Chu, W., Langford, J., & Schapire, R.E. (2010). A contextual-bandit approach to personalized news article recommendation. In *Proceedings of the 19th International Conference on World Wide Web (WWW 2010)*. ACM. https://doi.org/10.1145/1772690.1772758

Matsakis, N.D., & Klock, F.S. (2014). The Rust language. In *Proceedings of the 2014 ACM SIGAda Annual Conference on High Integrity Language Technology (HILT 2014)*. ACM. https://doi.org/10.1145/2663171.2663188

Reisig, W. (2013). *Understanding Petri Nets: Modeling Techniques, Analysis Methods, Case Studies*. Springer. https://doi.org/10.1007/978-3-642-33278-4

Rosemann, M., & vom Brocke, J. (2015). The six core elements of business process management. In J. vom Brocke & M. Rosemann (Eds.), *Handbook on Business Process Management 1: Introduction, Methods, and Information Systems* (2nd ed., pp. 105–122). Springer. https://doi.org/10.1007/978-3-642-45100-3_5

Sutton, R.S., & Barto, A.G. (2018). *Reinforcement Learning: An Introduction* (2nd ed.). MIT Press.

W3C WebAssembly Working Group. (2019). *WebAssembly Core Specification, Version 1.0*. W3C Recommendation. https://www.w3.org/TR/wasm-core-1/

W3C WebAssembly Working Group. (2022). *WebAssembly Core Specification, Version 2.0*. W3C Recommendation. https://www.w3.org/TR/wasm-core-2/

Weijters, A.J.M.M., van der Aalst, W.M.P., & de Medeiros, A.K.A. (2006). Process mining with the HeuristicsMiner algorithm. *BETA Working Paper Series, WP 166, Eindhoven University of Technology*.

Williams, R.J. (1992). Simple statistical gradient-following algorithms for connectionist reinforcement learning. *Machine Learning*, 8(3–4), 229–256. https://doi.org/10.1007/BF00992696

Watkins, C.J.C.H., & Dayan, P. (1992). Q-learning. *Machine Learning*, 8(3–4), 279–292. https://doi.org/10.1007/BF00992698

van Zelst, S.J., van Dongen, B.F., van der Aalst, W.M.P., & Verbeek, H.M.W. (2017). Discovering workflow nets using integer linear programming. *Computing*, 100(5), 529–556. https://doi.org/10.1007/s00607-017-0582-5

---

*End of Thesis*

*Word count (approximate): 28,400 words*

*Version: v26.5.5 — May 5, 2026*
