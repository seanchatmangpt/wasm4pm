# TRUEX ARCHITECTURAL REBRAND: wasm4pm

## 1. TRUEX CLASSIFICATION
**Tier:** Tier 0 — Deterministic Substrate & Tier 1 — Process Geometry
**Truex Role:** Runtime Conformance Engine & Lawful Closure Kernel
**Execution Function:** Replayable Process Intelligence & Receipt Validation

* **Deterministic vs Probabilistic:** Strictly Deterministic. Powered by branchless Rust kernels and WebAssembly memory boundaries.
* **Runtime vs Manufacturing:** Both. It manufactures conformance models (POWL/DFG) and executes runtime admission (receipt validation).
* **Local vs Distributed:** Agnostic Substrate. Executes identically on local edge clients (React Native/Expo) and distributed authority membranes (Supabase Edge Functions).
* **Admission vs Projection vs Replay vs Supervision:** Primarily Admission and Replay. It serves as the adjudicating lock for operational closure.
* **Operational vs Infrastructural:** Deeply Infrastructural. It is the physics engine governing Truex motion.

---

## 2. ORIGINAL PURPOSE
`wasm4pm` originated as a response to the execution bottleneck of traditional process mining (PM4Py). Process mining was historically analytical, retrospective, and batch-oriented—requiring offline Python servers to analyze CSV/XES logs long after the operational reality had decayed. 

The architectural contradiction was severe: one cannot enforce operational lawfulness if the compliance engine operates asynchronously from the execution membrane. The failure surface was the lack of *live* process intelligence. `wasm4pm` was forced into existence to compile 60+ process mining algorithms into a portable, zero-cold-start WebAssembly kernel that could execute synchronously within edge environments, intercepting workflows before they settled into the database.

---

## 3. CHATMAN EQUATION ALIGNMENT
The repository is the literal implementation of the Receipted Chatman Equation:
**`A = μ(O*)`**
**`R ⊢ A = μ(O*)`**

* **`O*` (Lawful Closure Ontology):** The OCEL 2.0 (Object-Centric Event Log) payload—canonicalized and strict. It represents the objects, events, and admissible transitions entering the membrane.
* **`μ` (Manufacturing Function):** The 60+ algorithmic Rust kernels (discovery, conformance, POWL translation, BLAKE3 hashing) compiled into `wasm4pm`.
* **`A` (Operational Consequence):** The resulting process geometry, conformance score, or binary admission decision (e.g., `ReceiptAdmitted` or `RECEIPT_REFUSED`).
* **Receipt Lineage (`R`):** The cryptographic BLAKE3 digest of the JCS-OCEL stringified payload, emitted via the `truex_verify_receipt` method.
* **Admissibility:** Determined by the Rust validation logic traversing the Truex Canonical Profile boundaries. If the transition breaks the ontology (e.g., forged equivalence classes), it fails closure.
* **Replay:** The capacity to feed the receipted `O*` back into the deterministic `μ` (WASM) and guarantee the exact same BLAKE3 receipt `R` and artifact `A` emerge.

---

## 4. TRUEX EXECUTION ROLE
`wasm4pm` occupies the absolute center of the Truex lifecycle:

`Closure → Admission → Consequence → Receipt → Conformance`

It does not handle Intake (handled by the membrane/proxyable) or Projection (handled by ZoeOS/Expo). Instead, it receives raw operational intent, calculates **Closure**, adjudicates **Admission** via WASM evaluation, emits the cryptographic **Receipt**, and continuously supplies **Conformance** metrics for Drift Reduction.

---

## 5. OPERATIONAL GEOMETRY
This repository fundamentally implements **Process Geometry** and **Replay Geometry**.

* **Concurrency Model:** Bounded, linear memory execution in WebAssembly. Evaluates transitions deterministically, averting race conditions.
* **Replayability:** Absolute. WebAssembly isolates execution from host environment entropy. A given OCEL payload will yield identical conformance paths indefinitely.
* **Causality Handling:** Natively resolves object-centric (multi-entity) causal graphs via OCEL 2.0 and POWL v2 architectures.
* **Failure Containment:** Employs a strict structured refusal taxonomy (`UnknownAction`, `RECEIPT_REFUSED`). Operations that lack consequence authority do not panic; they emit verifiable rejection receipts.

---

## 6. RECEIPT & EVIDENCE SURFACES
The repository is the primary engine of evidence.
* **Emits:** Truex OCEL 2.0 Canonical Envelopes and BLAKE3 cryptographic receipts.
* **Proof:** Cryptographic hashes verifying execution integrity and OTLP egress compliance.
* **Replay:** The `wpm truex verify` command acts as the replay engine, accepting an envelope and outputting deterministic validation.
* **Lineage:** Translates flat telemetry into structured, multi-dimensional object graphs (POWL/OCEL) suitable for process intelligence validation.

---

## 7. TRUEX REBRAND MAPPING
**Old Namespace → New Namespace**
* `wasm4pm` (Repo/Package) → `@truex/kernel`
* `crates/wasm4pm-algos` → `crates/truex-kernel-algos`
* `apps/wasm4pm` (CLI) → `apps/truex-cli`
* `wpm truex verify` → `truex verify`
* `wpm run -a` → `truex manufacture`
* `docs/reference/algorithms.md` → `docs/reference/manufacturing_kernels.md`

**Terminology Shifts:**
* PM4WASM / PM4Py → Truex Runtime Conformance
* Event Log (XES) → Operational Evidence Payload (OCEL 2.0)
* Mining → Geometric Discovery
* CLI Runner → Admission Dispatcher

---

## 8. TRUEX TERMINOLOGY CONVERSION
| Old Framework Language | Truex Systems Language |
| :--- | :--- |
| Process Mining | Process Geometry Validation |
| Algorithm | Manufacturing Kernel (`μ`) |
| Event Log | Operational Evidence (`O*`) |
| Validation | Lawful Closure Admission |
| Hash / Output | Cryptographic Consequence Receipt (`R`) |
| Edge Function | Operational Membrane |

---

## 9. RELATION TO OTHER TRUEX PROJECTS
* **Upstream:** Ingests operational tension and telemetry from `@truex/membrane` (formerly `proxyable`).
* **Downstream:** Emits admitted Truex Envelopes to Supabase Edge Functions (`truex-ingest`) for authoritative settlement.
* **Supervision:** Feeds deterministic process models to the Truex Autonomic tier (ZoeOS / Field8 agents) to update their routing geometry and prevent drift.

---

## 10. MISSING INVARIANTS
* **Programmatic Receipt Generation:** While `truex verify` exists, the programmatic API for *generating* the initial cryptographic receipt chain prior to egress is loosely exposed.
* **Continuous Replay Harness:** A formalized Truex Replay daemon that continuously re-evaluates the BLAKE3 receipt chain against incoming code drifts (to guarantee temporal stability) is missing from the CI pipeline.
* **Unbounded Memory Vectors:** Certain complex inductive discovery algorithms may require memory boundedness checks in WASM to prevent OOM errors from halting the execution membrane.

---

## 11. TRUEX FUTURE EVOLUTION
`wasm4pm` will cease to be viewed as a "process mining tool port." It will evolve into the **Tier 0 Truex VM**—the mandatory, universal deterministic execution substrate. Every autonomous agent, LLM, or human operator will be required to pass their operational tension through this WASM kernel to receive an execution receipt. Without passing through this layer, no downstream database will accept the mutation.

---

## 12. FINAL TRUEX CLASSIFICATION
This repository is not fundamentally a process mining library.

It is a deterministic process-geometry engine for replayable operational consequence inside the Truex execution-trust stack.