# Full Course Syllabi: Ph.D. in Process Intelligence and Autonomous Systems Architecture

This document provides the detailed, module-by-module breakdown of all required courses and lab practicals for the 4-year doctoral program. Each course is designed to span a standard 14-week semester, condensed here into 4 core thematic modules.

---

## YEAR 1: Foundations of Evidence and Logic

### Course 101: Introduction to Process Mining & Conformance Checking
**Objective:** Master the algorithmic extraction of knowledge from event logs and the mathematics of alignment-based conformance.
*   **Module 1: The Event Log & Discovery Heuristics**
    *   *Topics:* XES standards, trace flattening, Alpha Miner, and Heuristic Miner limits.
    *   *Readings:* van der Aalst (2012) Overview; Process Mining Manifesto (2012).
*   **Module 2: Inductive Logic & Soundness**
    *   *Topics:* Inductive Miner, workflow nets, block-structured models, mathematical soundness guarantees.
    *   *Readings:* van der Aalst et al. (2011) Soundness of Workflow Nets.
*   **Module 3: Conformance Checking**
    *   *Topics:* Token-based replay, alignment-based conformance, fitness vs. precision vs. generalization.
    *   *Readings:* Carmona et al. (2018) Conformance Checking (Ch 1-3).
*   **Module 4: Declarative Constraints**
    *   *Topics:* DECLARE templates, LTL semantics for process models, responding to entropy.

### Course 102: Object-Centric Process Mining (OCPM) & POWL
**Objective:** Transition from 2D flat logs to N-dimensional object interactions using the latest industry standards.
*   **Module 1: Divergence and Convergence**
    *   *Topics:* The deficiency of case IDs, object-centric event logs, and N-partite graph representation.
    *   *Readings:* van der Aalst (2019) OCPM.
*   **Module 2: OCEL 2.0 Standard Implementation**
    *   *Topics:* Object-to-object relationships, object property updates, schema validation.
    *   *Readings:* OCEL 2.0 Standard Specification.
*   **Module 3: POWL (Partially Ordered Workflow Language)**
    *   *Topics:* Beyond Petri Nets: strict partial orders, explicit choices, and loops in OCPM.
    *   *Readings:* Kourani & van Zelst (2023) POWL.
*   **Module 4: Full-Dimension Conformance**
    *   *Topics:* Mapping POWL graphs to OCEL 2.0 traces, algorithmic complexity of multi-object replay.

### Course 103: Design Science Research (DSR) & System Governance
**Objective:** Frame software artifacts as academically defensible research output.
*   **Module 1: The Artifact-Centered Paradigm**
    *   *Topics:* DSR methodology, rigor vs. relevance, research problem identification.
    *   *Readings:* Hevner et al. (2004); Peffers et al. (2007).
*   **Module 2: The Three-Cycle View**
    *   *Topics:* Relevance cycle, rigor cycle, design cycle; packaging artifacts for publication.
    *   *Readings:* Hevner (2007).
*   **Module 3: Systems Life Cycle Control**
    *   *Topics:* Requirements, architecture, V&V (Verification and Validation).
    *   *Readings:* ISO/IEC/IEEE 15288:2023.
*   **Module 4: Case Study Validation & TRL**
    *   *Topics:* NASA Technology Readiness Levels, empirical validation without lab control.
    *   *Readings:* Yin (2018) Case Study Research.

### Course 104: Foundations of Bounded Logic
**Objective:** Theoretical underpinnings of deterministic, terminating logic engines.
*   **Module 1: Datalog & Negation**
    *   *Topics:* Stratified negation, deductive databases, monotonic vs. non-monotonic logic.
    *   *Readings:* Abiteboul & Hull (1988).
*   **Module 2: Tabled Evaluation (SLG Resolution)**
    *   *Topics:* Memoization, solving infinite loops in left-recursive rules, the foundation of `Prolog8`.
    *   *Readings:* Chen & Warren (1996).
*   **Module 3: Answer Set Programming (ASP)**
    *   *Topics:* s(CASP), query-driven ASP, execution models without grounding.
    *   *Readings:* Arias et al. (2018).
*   **Module 4: Bounded Model Checking**
    *   *Topics:* Satisfiability solving, searching for counter-examples in process bounds.
    *   *Readings:* Clarke et al. (2001).

### Course 105: Proof-Carrying Code (PCC) & Integrity
**Objective:** Cryptographic binding of execution logic and output admissibility.
*   **Module 1: PCC Fundamentals**
    *   *Topics:* Shifting trust from the producer to the consumer, machine-checkable proofs.
    *   *Readings:* Necula (1997) POPL '97.
*   **Module 2: Foundational PCC & Validation**
    *   *Topics:* Minimizing the Trusted Computing Base (TCB), efficient proof representation.
    *   *Readings:* Appel (2001) FPCC; Necula & Lee (1998).
*   **Module 3: Append-Only Integrity & Merkle Trees**
    *   *Topics:* Certificate transparency, verifiable logs, audit paths.
    *   *Readings:* Laurie et al. (2013) RFC 6962.
*   **Module 4: Cryptographic Hashing for Sub-Millisecond Systems**
    *   *Topics:* High-throughput integrity, parallel hashing architectures.
    *   *Readings:* O’Connor et al. (2020) BLAKE3 Specification.

### Lab 100: Introduction to `Prolog8` & Micro-Kernels
*   **Practicum 1:** Implement a bounded Datalog subset parser.
*   **Practicum 2:** Write SLG tabling algorithms to detect and break infinite recursion.
*   **Practicum 3:** Construct a byte-capped `Prolog8` proof cell.
*   **Practicum 4:** Integrate a BLAKE3 emit layer upon successful rule resolution.

---

## YEAR 2: Architecture, Execution, and Combinatorial Stress

### Course 201: WebAssembly (WASM) as a Systems Substrate
**Objective:** Low-level mechanics of compiling and executing portable, high-speed process kernels.
*   **Module 1: WASM Architecture & JIT/AOT**
    *   *Topics:* Linear memory, the stack machine, WASM 2.0 SIMD operations.
    *   *Readings:* Haas et al. (2017) PLDI; WASM Core Spec.
*   **Module 2: WASI (WebAssembly System Interface)**
    *   *Topics:* Sandboxing, capabilities-based security, filesystem/network access beyond the browser.
*   **Module 3: Branchless Execution Primitives**
    *   *Topics:* CPU pipeline flushes, bypassing predictive branching, bitwise masking (`bcinr`).
*   **Module 4: Rust to WASM Toolchains**
    *   *Topics:* Bindgen, memory allocation limits, eliminating panic/unwind overhead.

### Course 202: Streaming Process Mining & Sub-Millisecond Discovery
**Objective:** Live-evaluation framing for continuous process monitoring.
*   **Module 1: Online Process Discovery**
    *   *Topics:* Lossy counting, sliding windows, abstract representations of event streams.
    *   *Readings:* Burattin (2022); van Zelst et al. (2018).
*   **Module 2: Streaming Conformance Checking**
    *   *Topics:* "Deny with evidence", behavioral pattern matching on the fly.
    *   *Readings:* Burattin et al. (2018).
*   **Module 3: Cloud & Distributed Throughput**
    *   *Topics:* Event stream routing, handling out-of-order events, partitioned state.
*   **Module 4: SIMD & Vectorized Log Processing**
    *   *Topics:* Accelerating trace ingestion using parallel bit-manipulation.

### Lab 200: `wasm4pm` Architecture & Branchless Primitives
*   **Practicum 1:** Build a branch-heavy DFG extractor vs. a branchless bitwise DFG extractor and benchmark CPU cycle counts.
*   **Practicum 2:** Implement the `fast` and `balanced` execution profiles using strict deduplication logic.
*   **Practicum 3:** Synthesize maximally entropic logs and saturate the branchless engine.
*   **Practicum 4:** Profile WASM binary execution in `wasm32-unknown-unknown` (V8) vs. `wasm32-wasi` (Wasmtime).

### Course 203: Actor-Oriented Execution & Supervision
**Objective:** Decentralized, message-driven workflows and self-healing topologies.
*   **Module 1: The Actor Model**
    *   *Topics:* Independent agents, message passing, decoupled execution.
    *   *Readings:* Hewitt et al. (1973); Agha (1986).
*   **Module 2: Erlang-Style Reliability**
    *   *Topics:* "Let it crash", supervision trees, fault isolation.
    *   *Readings:* Armstrong (2003) PhD Thesis.
*   **Module 3: Route Law vs. Workflow Diagrams**
    *   *Topics:* Partially ordered routing, supervised topologies over flat BPMN.
*   **Module 4: Soft vs. Fast Recovery Boundaries**
    *   *Topics:* Mapping recovery paths, measuring Mean Time To Recovery (MTTR) within actor meshes.

### Course 204: Adversarial Boundaries & Counterfactuals
**Objective:** Provable execution under duress and schema violation.
*   **Module 1: The 24-Probe Matrix**
    *   *Topics:* Taxonomy of event log corruption (schema, cardinality, lifecycle anomalies).
*   **Module 2: Bounded Model Checking for Process Law**
    *   *Topics:* Searching for policy refutation in bounded state spaces.
*   **Module 3: Counterfactual Explanations**
    *   *Topics:* Justification-oriented reasoning, generating human-readable evidence trees from failures.
    *   *Readings:* Arias et al. (2020) Justifications for s(CASP).
*   **Module 4: The Combinatorial Maximalist Cartesian Product**
    *   *Topics:* Forcing overlapping contradictions in constraint checkers.

---

## YEAR 3: Orchestration and Ecosystem Synthesis

### Course 301: MCPP & The AutoProcess State Machine
**Objective:** The 8-dimensional orchestrator layer (Vision 2030 paradigm).
*   **Module 1: Reinforcement Learning in Process Control**
    *   *Topics:* Multi-agent convergence, defining the 8 dimensions of autonomous operation.
*   **Module 2: The Bellman Self-Reference**
    *   *Topics:* Solving Markov Decision Processes, preventing agent self-referential failure loops.
*   **Module 3: Cognitive Layer & Persistence**
    *   *Topics:* Serializing the `autoprocess` state, memory bounds of the TypeScript cognitive layer.
*   **Module 4: Autonomic Observability**
    *   *Topics:* OpenTelemetry span generation, internalizing `RecoveryStarted` and `RecoveryCompleted`.

### Course 302: Deterministic Machine Learning in WASM
**Objective:** Integrating bounded AI/ML overlays with rigorous arithmetic safety.
*   **Module 1: `miniml-core` Architecture**
    *   *Topics:* Porting classification and regression algorithms to strictly deterministic WASM.
*   **Module 2: Arithmetic Safety & Rank-2 Contracts**
    *   *Topics:* Handling MCC integer overflow, AUC tie-handling in high-cardinality ties.
*   **Module 3: Metaheuristic Fallbacks**
    *   *Topics:* Integrating ACO, PSO, ILP without violating execution latency guarantees.
*   **Module 4: Interpretability Metrics**
    *   *Topics:* Exposing MAE, MAPE, Macro F1 directly through the WASM ABI.

### Lab 300: Orchestrating the Matrix
*   **Practicum 1:** Wire the 5 MCPP RL agents to manage a simulated trace failure.
*   **Practicum 2:** Inject conflicting ML overlays and test the `Map<PlanStepType, params>` deduplication constraint.
*   **Practicum 3:** Build a complete MCPP workflow that executes POWL over OCEL and emits a BLAKE3 receipt chain.
*   **Practicum 4:** Orchestrate a 24-probe adversarial attack against the running workflow and audit the emitted denial receipts.

### Course 303: Socio-Technical Deployment & Automation Displacement
**Objective:** The macro-economic and civilizational context of autonomous process systems.
*   **Module 1: The Economics of Automation**
    *   *Topics:* Task reconfiguration, robot-exposure modeling, wage inequality vectors.
    *   *Readings:* Autor (2015); Acemoglu & Restrepo (2020, 2022).
*   **Module 2: Social Infrastructure & Resilience**
    *   *Topics:* Civic operating layers, resilience activation under stress.
    *   *Readings:* Klinenberg (2018); Abramson et al. (2015); Sampson (2017).
*   **Module 3: Congregations as Local Service Providers**
    *   *Topics:* The church as distribution infrastructure, local provision network topology.
    *   *Readings:* Chaves & Tsitsos (2001); Cnaan (1999, 2004).
*   **Module 4: The Vision 2030 Civic Protocol**
    *   *Topics:* Merging highly-auditable WASM capabilities with community-level provision networks. Strategic deployment planning.

---

## YEAR 4: Dissertation Research and Defense

### Lab 400: The Compute Continuum
*   **Practicum 1: Cloud Baseline:** Deploy the full MCPP stack on native cloud clusters and establish maximum throughput telemetry.
*   **Practicum 2: Edge/Fog (WASI):** Push the `wasm4pm` kernels to Wasmtime/Wasmer nodes. Audit filesystem I/O and receipt chain writing under constrained CPU.
*   **Practicum 3: Browser (Unknown-Unknown):** Execute full object-centric discovery directly in V8. Map Garbage Collection vs. linear memory impacts.
*   **Practicum 4: Throttling & SPC:** Apply Western Electric Rule 4 (2-of-3 beyond 2$\sigma$) within the SPC module to dynamically throttle compute loads across the continuum prior to failure.

### Semester 7 & 8: Dissertation Synthesis
Students will engage entirely in independent research, empirical data collection, and thesis drafting. The final product must demonstrate a design-science grounded, cryptographically secure, and combinatorially tested enhancement to the `wasm4pm` / `MCPP` ecosystem.