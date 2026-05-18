# Ph.D. Case Studies & Practical Exercises

This document provides the foundational case studies and hands-on exercises for the *Ph.D. in Process Intelligence and Autonomous Systems Architecture*. These scenarios map directly to the modules in the full syllabus and are designed to test the limits of the `wasm4pm`, `Prolog8`, and `MCPP` ecosystem under combinatorial maximalist conditions.

---

## PART I: Core Case Studies

### Case Study A: The Civic Provision Network (Socio-Technical Deployment)
**Context (Course 303, Layer L7):** By 2028, widespread automation in logistics and basic clerical work has displaced 15% of the local workforce in a mid-sized urban center. State-level safety nets are overwhelmed. A coalition of local congregations steps in to coordinate food distribution, emergency housing, and gig-work assignment.
**The Problem:** The coalition is operating on ad-hoc spreadsheets, resulting in lost inventory, double-booked volunteers, and untracked outcomes. They lack the capital for enterprise ERP systems and the IT staff to manage complex cloud infrastructure.
**The MCPP Intervention:**
*   **Architecture:** The coalition deploys `wasm4pm` kernels running on local edge devices (Raspberry Pis, older donated laptops) utilizing the `wasm32-wasi` target.
*   **Object-Centric Tracking:** An OCEL 2.0 graph tracks `Volunteer`, `Resource (Food/Bed)`, and `Recipient` lifecycles.
*   **Route Law:** POWL constraints dictate that resources cannot be dispensed without a cryptographic receipt of volunteer handover, enforcing accountability without centralized surveillance.
**Discussion Questions:**
1. How does the actor-model reliability (Erlang-style supervision) keep the network running when edge devices lose internet connectivity?
2. Defend the use of BLAKE3 receipt chains to provide tamper-evident proofs to municipal grant auditors.

### Case Study B: The Adversarial Supply Chain (Proof-Carrying Code)
**Context (Course 204, Layer L4 & L5):** A global shipping conglomerate utilizes an automated routing protocol to dispatch autonomous freight vehicles. A malicious actor attempts to inject a schema violation into the event stream, creating a combinatorial explosion in the routing state machine designed to exhaust memory and force a fail-open state.
**The Problem:** Traditional JVM-based workflow engines process the malformed JSON, attempt to instantiate objects, and enter a fatal Garbage Collection spiral, causing the entire node to crash.
**The MCPP Intervention:**
*   **Admissibility:** Before the payload enters the execution planner, it hits the `Prolog8` bounded logic gate.
*   **Verification:** The proof-carrying artifact lacks the correct cryptographic signature for the requested state transition. The byte-capped query engine determines admissibility in constant time.
*   **Action:** The payload is rejected, and a BLAKE3 denial receipt is appended to the transparency log.
**Discussion Questions:**
1. How does the 34-nanosecond closed-loop cycle prevent the adversarial payload from lingering in memory?
2. Trace the exact sequence of the `RecoveryStarted` and `RecoveryCompleted` OpenTelemetry spans when the `wasm4pm` engine purges the rejected state.

### Case Study C: The Nanosecond Port Authority (High-Speed Kernels)
**Context (Course 202, Layer L6):** A heavily automated maritime port generates 500,000 events per second as cranes, autonomous trucks, and container sensors emit state changes.
**The Problem:** Archival process mining is useless; if a bottleneck is detected retroactively, millions of dollars in delay penalties have already been incurred.
**The MCPP Intervention:**
*   **Streaming Profile:** The `wasm4pm` execution planner is locked to the `stream` profile, stripping out computationally heavy ML tasks.
*   **Branchless Execution:** Using `bcinr` bitwise masking, the engine calculates the Directly-Follows Graph (DFG) continuously over a sliding window without a single CPU pipeline flush.
*   **SPC Triggers:** Western Electric Rule 4 triggers an autonomic intervention when crane unloading times drift 2$\sigma$ beyond the baseline for 2 out of 3 consecutive intervals.
**Discussion Questions:**
1. Calculate the maximum theoretical throughput if branch prediction is entirely bypassed.
2. Why is the $O(n)$ `fast` profile strictly enforced here, and what would happen if a fallback to an ACO (Ant Colony Optimization) algorithm was accidentally triggered?

---

## PART II: Lab Practicums & Exercises

### Lab 100: Logic & Integrity Exercises
**Exercise 1.1: Bounded Datalog Parsing**
*   **Task:** Write a Rust parser that accepts a restricted Datalog subset. The parser must reject any rule that contains ungrounded variables or exceeds a depth of 5 logical joins.
*   **Deliverable:** A `wasm32-unknown-unknown` compiled binary that executes the parsing in sub-millisecond time.

**Exercise 1.2: The BLAKE3 Receipt Chain**
*   **Task:** Given a mock OCEL event (e.g., `Order_Created`), generate a BLAKE3 hash. Then, generate a subsequent event (`Order_Shipped`) and compute its hash by concatenating its payload with the previous hash.
*   **Deliverable:** A tamper-evident Merkle proof script that verifies the sequence of 5 state changes.

### Lab 200: Combinatorial Stress Exercises
**Exercise 2.1: Branchless vs. Branching Benchmarks**
*   **Task:** Write two DFG frequency extractors in Rust.
    *   *Implementation A:* Uses standard `if/else` logic to check if activity B follows activity A.
    *   *Implementation B:* Uses bitwise masking (`select_u32`) to increment counters.
*   **Deliverable:** Run both implementations against a synthetic, maximally entropic log of 10 million events. Submit a criterion benchmark report demonstrating the CPU cycle cost of pipeline mispredictions in Implementation A.

**Exercise 2.2: The Phantom Algorithm Loophole**
*   **Task:** Configure the `wasm4pm` execution planner to load the `quality` profile alongside an explicit `config.ml.tasks` array containing conflicting hyper-parameters for the `genetic` algorithm.
*   **Deliverable:** Modify the planner's deduplication mapping (`Map<PlanStepType, params>`) to ensure the algorithm executes exactly once, prioritizing the explicit override over the profile default.

### Lab 300: Orchestration & MCPP Exercises
**Exercise 3.1: Bellman Self-Reference Closure**
*   **Task:** Simulate a fatal error in the 8-dimensional MCPP state machine. Configure Agent 1 to request a soft recovery, while Agent 2 simultaneously requests a hard reset.
*   **Deliverable:** Write the state transition constraints that prevent the agents from entering a self-referential loop (the Bellman gap). Output the exact trace of `autoprocess` state mutations.

**Exercise 3.2: Rank-2 Mathematical Safety**
*   **Task:** Feed the `miniml-core` binary a highly skewed classification dataset (e.g., 99.9% negative class, 0.1% positive class) with a massive cardinality that threatens an integer overflow during MCC calculation.
*   **Deliverable:** Write a test asserting that the WASM module correctly bounds the integer limits and computes the Area Under the Curve (AUC) safely handling tied ranks.

### Lab 400: The Compute Continuum (Final Capstone Exercises)
**Exercise 4.1: The Adversarial 24-Probe Matrix**
*   **Task:** Launch a live instance of the `wasm4pm` engine. Execute an automated script that fires all 24 adversarial probes (P1-P24) in a Cartesian product (e.g., schema violation + lifecycle drop + cardinality explosion) simultaneously.
*   **Deliverable:** Collect the OpenTelemetry (OTel) spans. Prove that the engine caught all violations at the `proof-gate` layer, emitted denial receipts, and maintained its 34-nanosecond internal cycle without entering a panic state.

**Exercise 4.2: Resource Exhaustion & Edge Deployment**
*   **Task:** Deploy the `wasm4pm` instance via Wasmtime (`wasm32-wasi`). Use system tools (e.g., `cgroups`, `ulimit`) to throttle the CPU to 10% capacity and restrict memory to 64MB.
*   **Deliverable:** Stream an OCEL 2.0 log into the throttled engine. Record the point at which Statistical Process Control (SPC) rules trigger an "Andon" alert due to latency degradation. Write a technical brief on how branchless WASM yields under pressure compared to JVM garbage collection pauses.
