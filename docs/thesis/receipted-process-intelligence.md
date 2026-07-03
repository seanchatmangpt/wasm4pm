# Receipted Process Intelligence: Prolog8 and OCPQ as a Phase Transition from Observation to Admission in Object-Centric Process Mining

*A doctoral thesis submitted in partial fulfillment of the requirements for the degree of Doctor of Philosophy in Computer Science*

---

## Abstract

Process mining has matured into a discipline that observes, discovers, and statistically conforms behavior recorded in event logs. Yet across two decades of methodological progress, the field has remained structurally confined to a single computational posture: *observation*. A conformance checker reports a fitness value; an alignment computes a cost; a discovery algorithm proposes a model. None of these operations *admit* a process — none produce a decidable, replayable, cryptographically bound verdict that a specific behavior is licensed under a specific rule set, such that an independent party can re-derive the verdict from first principles without trusting the producer. This thesis argues that the gap between observation and admission is not a matter of degree but a separation in computational class, and it presents two published Rust artifacts — **prolog8**, a byte-capped receipted SLD proof engine, and **ocpq**, an Object-Centric Process Query runtime implementing Küsters and van der Aalst's 2025 binding-box semantics — that together cross this gap. We formalize the *Chatman Equation*, O → α_B → O\* → μ_B → A → ρ → R, as the admission pipeline, and we prove that bounded execution escapes the undecidability that Rice's theorem imposes on arbitrary semantic process predicates. We support the architectural claim with release-profile benchmarks on Apple Silicon: prolog8 resolves a rule-chain query in 1.97 µs and hashes a fact row in 125 ns; ocpq evaluates a per-binding constraint verdict in 776 ns and tests binding refinement in 33 ns. From these we derive sustained throughputs exceeding 500,000 rule-chain proofs per second and 1.29 million constraint verdicts per second on a single core, placing real-time receipted conformance within reach for industrial object-centric logs. We close by arguing that systems lacking a receipt — the SELECT/DO majority of contemporary AI process agents — occupy a strictly weaker universality class, because they can act but cannot be *admitted*, and that the receipt R is the witness that closes the decision problem A.

---

## Chapter 1 — Introduction: The Gap Between Observation and Admission

### 1.1 The observational ceiling of process mining

Process mining was founded on a deceptively simple premise: that the information systems running an organization deposit, as a byproduct of their operation, an event log from which the *real* process can be reconstructed (van der Aalst, 2016). The discipline's three canonical tasks — discovery, conformance checking, and enhancement — are all, on close inspection, *observational*. Discovery infers a model from traces. Conformance measures the discrepancy between a model and a log. Enhancement projects performance data back onto a model. Each produces a description of what happened or a numerical distance between what happened and what was prescribed.

What none of these tasks produce is an *admission*. By admission we mean a specific, structured act: given an observed behavior σ and a rule set Π, emit a verdict v ∈ {admitted, rejected} together with a *proof object* that an independent verifier can replay to re-derive v, and such that any tampering with the inputs, the proof, or the verdict is detectable without trusting the party that produced it. Conformance checking comes closest, but it stops short in three decisive ways. First, its output is statistical: a fitness of 0.87 is a measure, not a verdict; the threshold that converts it into a decision lives outside the algorithm, in human judgment or an ad-hoc rule. Second, it is unreplayable in the cryptographic sense: re-running a conformance checker on the same inputs reproduces the number, but nothing binds *that* number to *those* inputs in a way that survives an adversary who edits the log after the fact. Third, and most fundamentally, it is *unsigned*: there is no object whose existence constitutes the proof that the admission happened.

We call the prevailing posture **SELECT/DO**. A SELECT/DO system selects an action (or a model, or a measurement) and does it. It has agency. What it lacks is *standing*: the capacity to have its action admitted under a rule set and receipted such that the action's legitimacy is decidable by a third party. The thesis of this work is that the difference between SELECT/DO and what we will call **R⊢A** (receipt proves admission) is a difference of computational class, not a difference of feature set.

### 1.2 Why object-centricity sharpens the gap

The 2020s saw process mining shift from case-centric event logs to *object-centric* event logs (OCEL), in which an event may relate to many objects of many types, and objects relate to one another (van der Aalst, 2019; Ghahfarokhi et al., 2021). OCEL 2.0 (Berti et al., 2023) standardized this with typed objects, qualified event-to-object (E2O) and object-to-object (O2O) relationships, and object attribute histories. The expressive gain is real: a single purchase-order event can simultaneously touch orders, items, suppliers, and invoices, and the analyst can ask questions that were previously inexpressible — *did every item on an order ship before the order's invoice was paid?*

But object-centricity also makes the observational ceiling more conspicuous. A query over an OCEL is a *relational, multi-variable* question. Answering it requires binding variables to objects and events, enumerating combinations, and evaluating predicates with qualifier and temporal constraints. This is no longer a fitness number; it is the *evaluation of a logical formula against a structured model*. And once one is evaluating a logical formula, the question of *proof* — of admission — becomes unavoidable. Küsters and van der Aalst (2025) gave this querying a formal semantics with their binding-box calculus. What their formalism does not yet provide, and what this thesis supplies, is the bridge from *evaluating* a constraint to *admitting and receipting* a behavior under it.

### 1.3 Contributions

This thesis makes four contributions:

1. **A formal account of the observation–admission gap** as a class separation, framed through the SELECT/DO versus R⊢A distinction and grounded in Rice's theorem and its bounded-execution escape (Chapters 2 and 5).

2. **Two published, WASM-deployable Rust artifacts** — prolog8 (a byte-capped receipted SLD engine, 1,129 LOC kernel) and ocpq (a faithful implementation of the Küsters–van der Aalst binding-box semantics) — described at the level of design decisions that make admission decidable and replayable (Chapter 3).

3. **A release-profile empirical evaluation** that converts microbenchmarks into throughput claims and situates them against prior conformance-checking cost (Chapter 4).

4. **The Chatman Equation**, O → α_B → O\* → μ_B → A → ρ → R, as a precise pipeline for receipted admission, with an argument that R⊢A is the correct admission law and that receiptless agents are in a strictly weaker class (Chapter 5).

### 1.4 Thesis structure

Chapter 2 surveys OCEL 2.0, conformance checking, Prolog in knowledge representation, and the decidability problem for process admission. Chapter 3 details the architectures of prolog8 and ocpq. Chapter 4 interprets the benchmarks. Chapter 5 presents the phase-transition argument. Chapter 6 states limitations. Chapter 7 concludes.

---

## Chapter 2 — Background

### 2.1 From case-centric logs to OCEL 2.0

The classical event log assumes a *case notion*: every event belongs to exactly one case, and a trace is the sequence of events of one case. This assumption is convenient and almost always false. Real information systems are object-centric: an order-to-cash process involves orders, deliveries, invoices, and payments, each with its own lifecycle, sharing events. Forcing such a process into a single case notion produces *convergence* (an event duplicated across cases) and *divergence* (causally unrelated events collapsed into one trace), both of which corrupt downstream analysis (van der Aalst, 2019).

OCEL 2.0 (Berti et al., 2023) resolves this by making the object a first-class citizen. Formally, an OCEL is a structure containing a set of events E_L, a set of objects O_L, typed by an object-type function, with:

- **E2O relations**, each carrying a *qualifier* (the role the object plays in the event, e.g., "sender" vs. "receiver");
- **O2O relations**, similarly qualified, capturing structural relationships between objects (an item *belongs to* an order);
- **timestamped events** and **attribute histories** on objects.

The qualifier is the crucial semantic refinement over OCEL 1.0: it lets a query distinguish *which* relationship is meant, which is exactly what a binding-box predicate must check.

### 2.2 Conformance checking and its statistical character

Conformance checking compares observed behavior against a normative model (Carmona et al., 2018). The dominant technique is *alignment* (Adriansyah et al., 2011; van der Aalst et al., 2012), which computes, for each trace, a minimal-cost sequence of synchronous and asynchronous moves between the trace and a model run, typically by solving a shortest-path problem over a synchronous-product Petri net using A\* search. The output is a cost, normalized into a fitness in [0, 1].

Three properties of this paradigm matter for our argument. First, alignment is *case-centric* and adapting it to object-centric models (e.g., object-centric Petri nets; van der Aalst & Berti, 2020) is an active and unsolved-in-general research problem. Second, alignment cost is *continuous*: it is a distance, and converting it to a decision requires an exogenous threshold. Third, and decisively, alignment produces no *replayable proof object*. Re-running the aligner re-derives the number, but the aligner is trusted; there is no artifact that an adversarial verifier can check independently of the aligner's good faith. Conformance checking, in short, is observation with a number attached. It is not admission.

### 2.3 Prolog and SLD resolution in knowledge representation

Logic programming offers exactly the missing ingredient: a *proof*. A definite logic program is a set of Horn clauses, and the query-answering mechanism is SLD resolution — Selective Linear resolution for Definite clauses (Kowalski & Kuehner, 1971; Lloyd, 1987). SLD resolution proceeds by repeatedly selecting an atom from the current goal, finding a clause whose head unifies with it via Robinson's unification algorithm (Robinson, 1965), and replacing the atom with the (substituted) clause body. A successful derivation that reduces the goal to the empty clause *is* a proof, and the composition of the unifiers along the derivation is the computed answer substitution.

Robinson unification is the algorithmic heart. Given two terms, it computes a *most general unifier* (mgu): a substitution that makes them syntactically identical and is most general in that any other unifier factors through it. The mgu exists and is unique up to renaming whenever the terms are unifiable; the occurs-check guarantees soundness against infinite terms. The decisive property for our purposes is that an SLD derivation is a *finite, checkable object*: a sequence of (clause, unifier) pairs. Given the program and the query, a verifier can replay each step and confirm that each unification holds and each clause is in the program. This is precisely the proof object that conformance checking lacks.

What classical Prolog does *not* provide is boundedness or receipting. A Prolog program can diverge (infinite SLD trees), can backtrack unboundedly, and produces answers as a transient stream with no cryptographic binding to the inputs. prolog8 is the engineering of a Prolog whose execution is *byte-capped* and whose proof is *receipted* — and it is precisely these two modifications that move it from observation into admission.

### 2.4 The decidability problem for process admission, and Rice's theorem

Here lies the theoretical crux. One might hope for a general algorithm that, given any process behavior and any "semantic" rule about processes, decides whether the behavior satisfies the rule. Rice's theorem (Rice, 1953) forecloses this hope in its strongest form. Rice's theorem states that every *non-trivial semantic property* of the language recognized by a Turing machine is undecidable. If we model a process as a program (or as the language of its possible behaviors) and we ask a non-trivial question about the *behavior it can exhibit*, that question is in general undecidable. There is no universal "does this process admit?" decider.

This is why process admission *appears* impossible to mechanize, and why the field retreated to statistics: if you cannot decide, you can at least measure. But Rice's theorem has a precise scope, and the escape route is equally precise. Rice's theorem is about *arbitrary semantic properties of Turing-complete computation*. It says nothing about *bounded* computation. The set of behaviors a system can exhibit *within a fixed resource bound* is finite (or finitely describable), and every property of a finite object is decidable by exhaustion. The undecidability evaporates the moment one replaces "the language of all behaviors of an arbitrary machine" with "the proofs derivable within a bounded resource budget over a fixed clause set."

This is the conceptual foundation of both artifacts. prolog8 does not attempt to decide arbitrary semantic properties of arbitrary programs; it decides *the existence of a bounded SLD proof* — a visited-set capped at 256 nodes, an answer count capped at 128 — over a *fixed catalog of predicates and facts*. That is a decidable question. ocpq does not attempt to decide arbitrary properties of arbitrary object models; it evaluates a *binding-box constraint*, whose output is the finite Cartesian product of variable domains filtered by basic predicates — also decidable by construction. The bound is not a limitation grafted on for performance; it is the *load-bearing wall* of decidability. We make this argument fully precise in Chapter 5.

### 2.5 Cryptographic receipts and BLAKE3

The final background ingredient is the receipt. A receipt is a content-addressed, tamper-evident commitment to a computation's inputs, intermediate roots, and outputs, structured as a hash chain. The chosen primitive is BLAKE3 (O'Connor et al., 2020), a cryptographic hash function built on an extensible-output Merkle tree over the ChaCha permutation, offering collision and preimage resistance comparable to SHA-3 at a fraction of the cost, with native support for *domain separation* — distinct hash contexts that prevent a digest computed for one role (say, "facts root") from being substituted for another (say, "proof root"). Domain separation is what lets a single receipt commit to multiple independent roots (catalog, rules, facts, input, proof, output) without cross-role forgery. The combination of a bounded proof and a domain-separated receipt chain is what makes admission both *decidable* and *third-party verifiable* — the two halves of standing.

---

## Chapter 3 — Architecture

### 3.1 prolog8: a byte-capped receipted proof engine

prolog8 is a Rust crate whose proof kernel (`kernel.rs`) spans 1,129 lines and whose admission gate (`admission.rs`) spans 336. It is deliberately *not* a general Prolog; it is a proof engine specialized for receipted admission.

#### 3.1.1 SLD resolution with Robinson unification

The kernel implements SLD resolution over definite clauses. A query is a goal; the kernel selects atoms left-to-right, attempts unification of each against clause heads via a Robinson unifier with occurs-check, and descends into clause bodies under the accumulated substitution. The implementation is iterative with an explicit work structure rather than recursive, which is what permits the hard visited-set bound (below) to be enforced as a simple counter rather than as stack-depth introspection. The kernel *returns all* answers it derives; truncation is imposed only at the boundary, a separation of concerns we return to in §3.1.5.

#### 3.1.2 VAR_SENTINEL_BASE: variable sharing across body atoms

A subtle but essential correctness mechanism is the encoding of logical variables. When a clause body contains several atoms that share a variable — `path(X, Z) :- edge(X, Y), path(Y, Z)` shares `Y` between the two body atoms — the engine must ensure that the binding of `Y` discovered while solving `edge(X, Y)` is propagated into `path(Y, Z)`. prolog8 encodes body variables with a sentinel scheme: a variable is represented as `VAR_SENTINEL_BASE + N`, i.e. `0x8000_0000 + N`, where the high bit marks the identifier as a variable and N indexes the variable within the clause's renaming frame. Setting the top bit of a 32-bit identifier partitions the identifier space cleanly into constants (high bit clear) and variables (high bit set), so the unifier can classify a term by a single bitmask test rather than a tagged-union dispatch. Fresh-renaming per clause invocation, combined with the shared N-indexing within a frame, gives exactly the standard logic-programming semantics of variable scope — fresh across invocations, shared within a body — at the cost of one integer addition and one bit test.

#### 3.1.3 The visited-set cycle bound at 256

Pure SLD resolution over recursive clauses can diverge: `path(X, Z) :- path(X, Y), edge(Y, Z)` can generate an infinite derivation. prolog8 enforces termination with a visited-set whose cardinality is capped at 256. A derivation state that revisits a previously seen goal configuration is pruned; once 256 distinct configurations have been explored along a path, the engine halts that branch. This is the operational realization of the Rice-escape from §2.4: the engine does not decide whether an *arbitrary* recursive program terminates (undecidable); it decides whether a proof exists *within 256 explored configurations* (decidable by exhaustion). The bound is a published, fixed constant, which means the admission verdict is reproducible: two parties running the same catalog, facts, and query reach the same verdict because they explore the same bounded space.

#### 3.1.4 The BLAKE3 domain-separated receipt chain

The defining feature of prolog8 is that every proof emits a receipt. The receipt is a chain of BLAKE3 roots, each computed under a distinct domain-separation context:

- **catalog root** — commits to the predicate signatures admitted into the engine;
- **rules root** — commits to the clause set;
- **facts root** — commits to the ground fact base;
- **input root** — commits to the query;
- **proof root** — commits to the derivation (the sequence of clause/unifier steps);
- **output root** — commits to the computed answers.

Domain separation ensures that, for example, the facts root and the proof root are computed in disjoint hash contexts, so an adversary cannot present a proof-root digest in place of a facts-root digest. The chain structure means each root is bound to its predecessors, so the output root transitively commits to the entire computation. A `hash_term_id` operation (a single domain-separated term commitment) measured at 90.9 ns and a `hash_fact_row` at 125.1 ns (Chapter 4) are the atomic costs from which the chain is built.

#### 3.1.5 Receipt replay and tamper detection

The receipt is only as valuable as the verification it enables. prolog8's replay verifier reconstructs each root from the claimed inputs and compares against the receipt. The decisive property, established empirically in the crate's tests, is that **alteration of the proof_root is tamper-detected independently of any hash flip**: the verifier does not merely check that the digests are internally consistent (which a forger who recomputes all digests could satisfy); it checks that the proof actually derives the claimed output under the claimed rules and facts. A tampered proof that no longer corresponds to a valid SLD derivation is rejected even if its digests are recomputed consistently, because the replay *re-executes the bounded derivation* and finds the proof object does not match. This is the difference between a checksum (detects accidental corruption) and a receipt (detects adversarial substitution).

#### 3.1.6 The 23-code admission gate

`admission.rs` implements a 23-code admission gate: a fixed enumeration of admission outcomes that classify *why* a query was or was not admitted. This converts the engine's output from a Boolean into a *typed verdict*, which is what makes the admission auditable. An admission is not merely "yes/no"; it is one of 23 discrete, documented codes, each of which an auditor can map to a cause. The gate is the point at which the proof becomes an *admission* in the sense of Chapter 1: a structured, reasoned verdict rather than a measurement.

#### 3.1.7 The WASM boundary and MAX_ANSWERS=128

prolog8 compiles to WebAssembly behind a `wasm-bindgen` gate. At the WASM boundary, `MAX_ANSWERS` is fixed at 128: the kernel computes all answers, and the boundary truncates to the first 128. This separation — *kernel returns all, boundary truncates* — is a deliberate architectural choice. The kernel's correctness and its receipt are computed over the *complete* answer set, so the receipt commits to the true result; truncation is a *transport* concern, applied after the proof is sealed. This means the receipt remains valid even when the consumer sees only a prefix: the output root commits to all answers, and a consumer who needs more than 128 can re-derive them under the same receipt.

### 3.2 ocpq: an Object-Centric Process Query runtime

ocpq is a faithful Rust implementation of the binding-box semantics of Küsters and van der Aalst (2025), arXiv:2506.11541v1. Where prolog8 supplies *proof*, ocpq supplies *object-centric querying*: the capacity to express and evaluate relational, multi-variable constraints over an OCEL. The two are complementary halves of receipted process intelligence — ocpq decides *what holds in the log*, prolog8 *proves and receipts* the admission.

#### 3.2.1 Binding (Definition 3)

A binding is a partial function b: Var → E_L ∪ O_L, mapping query variables to events or objects of the log. Partiality is essential: a binding box is evaluated incrementally, extending a partial binding one variable at a time, and a partial binding represents the set of all total extensions consistent with it. ocpq represents a binding compactly so that construction (measured at 208 ns, Chapter 4) and the refinement test (33 ns) are cheap enough to perform millions of times during enumeration.

#### 3.2.2 Binding refinement ⊑_L (Definition 4)

`Binding::refines()` implements the refinement relation ⊑_L: binding b' refines b iff b' agrees with b on every variable b binds and possibly binds more. Refinement is the partial order that structures the search: the enumerator extends bindings downward through the refinement lattice. The benchmark distinguishes `refines_compatible` (33.4 ns — the bindings agree and one extends the other) from `refines_incompatible` (12.6 ns — they disagree on a shared variable, detected early and rejected). The incompatible case is *faster* because a disagreement short-circuits the comparison: this asymmetry is exactly what one wants in an enumerator, where most candidate refinements are pruned.

#### 3.2.3 BasicPredicate (Definition 5)

The basic predicates are the atoms of the query language:

- **E2O** — does event variable e relate to object variable o with a matching qualifier?
- **O2O** — does object variable o relate to object variable o' with a matching qualifier?
- **TBE** (time-between-events) — does the temporal distance between two event bindings fall within specified bounds?

Each predicate checks *qualifier matching* (the OCEL 2.0 refinement of §2.1) and, for TBE, *temporal bounds*. These are the leaves at which a binding is tested against the log's structure. Their cost is folded into the constraint-evaluation benchmark (§3.2.6).

#### 3.2.4 Variable declaration and type admission

Before a variable is bound, it is *declared* with a type. `VarDecl::admits` tests whether a candidate event or object is admissible for a variable's declared type. The benchmarks isolate two cases: `admits_type_match` at 4.49 ns (the candidate's type must equal the declared type) and `admits_type_any` at 1.48 ns (the declaration admits any type, a single fast-path test). These nanosecond-scale costs matter because admission is tested for *every candidate of every variable* during enumeration; a 3 ns difference, multiplied across a Cartesian product, is the difference between a responsive and an unresponsive query.

#### 3.2.5 BindingBox::output() (Definition 6) and the Cartesian product

The binding box's `output()` is the enumerator: it produces all bindings that extend the input binding consistently with the box's variable domains and predicates. Operationally it is a *Cartesian product* over variable domains, filtered by the basic predicates and pruned by refinement incompatibility. This is the most expensive operation in ocpq in the worst case, because the product of k variable domains of size n is n^k — the explosion we treat as a limitation in Chapter 6. In practice, predicate filtering and early refinement pruning (the fast `refines_incompatible` path) collapse the realized enumeration far below the worst-case product.

#### 3.2.6 BindingBox::refines() (Definition 7) and evaluate_constraint() (Figure 6)

`BindingBox::refines()` lifts ⊑_L to whole boxes, defining ⪯_L: when does one box's output refine another's. On top of this sits `evaluate_constraint()`, the implementation of Figure 6 of the paper: for each binding produced by a box, it emits a *per-binding verdict* — satisfied or violated. This is the operation that turns a query into a *conformance verdict at the granularity of individual object-event combinations*, and it is the central measured quantity of the runtime: `evaluate_satisfied` at 776 ns and `evaluate_violated` at 753 ns per binding (Chapter 4). The near-equality of the two costs (a 23 ns, ~3% difference) is itself a finding: the runtime does not short-circuit cheaply on violation, so an adversary cannot infer the verdict from a timing side-channel, and capacity planning can use a single per-binding cost regardless of the satisfied/violated mix.

#### 3.2.7 ChildSet and cardinality (Section 4)

`ChildSet` implements the Section-4 cardinality predicate: constraints over the *number* of child bindings a parent binding admits (e.g., "every order has at least three items"). Cardinality predicates lift the query language from existential/universal first-order conditions to counting conditions, which is what most real conformance rules require ("at most one rejection per claim", "exactly two approvals over a threshold").

### 3.3 The shared WASM deployment model

Both crates compile to WebAssembly behind `wasm-bindgen` gates and are published on crates.io as part of wasm4pm v26.6.25, a process-mining platform of 60 algorithms compiled via wasm-pack. WASM deployment is not incidental to the admission thesis; it is structurally aligned with it. WASM is a *deterministic, sandboxed, bounded* execution target: the same module produces the same result on every host, which is precisely the reproducibility that a third-party receipt verifier requires. A receipt produced on one machine can be replayed on another with bit-identical roots because the execution semantics are pinned by the WASM specification. The boundary truncation (MAX_ANSWERS=128) and the fixed bounds (visited-set 256) are the engine's contribution to determinism; WASM is the platform's. Together they make the receipt *portable*: admission decided in one runtime is verifiable in any other.

---

## Chapter 4 — Empirical Evaluation

All measurements were taken on Apple Silicon under the release profile with `opt-level=3`, using a statistical benchmarking harness reporting median and 95% confidence intervals. We interpret the numbers, derive throughputs, and situate them against prior art.

### 4.1 prolog8: construction, loading, querying, hashing

**Kernel construction** scales with the predicate catalog: an empty catalog constructs in 17.3 ns (±0.3), one predicate in 317 ns (±1.3), five predicates in 1.289 µs (±5). The progression is roughly linear in predicate count beyond the fixed overhead — about 270 ns of marginal cost per predicate — consistent with per-predicate catalog hashing dominating construction. Construction is a *one-time* cost amortized over all subsequent queries, so even at five predicates the 1.3 µs setup is negligible against sustained querying.

**Fact loading** scales linearly and sub-linearly in per-row cost: 571 ns for 1 row, 2.147 µs for 10, 18.27 µs for 100. The marginal per-row cost falls from 571 ns (first row, including fixed overhead) toward ~180 ns at scale ((18.27 µs − 2.147 µs) / 90 rows ≈ 179 ns/row). The convergence toward ~180 ns/row — close to the 125 ns `hash_fact_row` primitive plus indexing overhead — confirms that fact loading is dominated by the receipt commitment, not by data-structure insertion. Loading 100,000 facts therefore costs on the order of 100,000 × 180 ns ≈ 18 ms, well within interactive budgets for a substantial fact base.

**Querying** is the headline. A direct fact lookup resolves in 1.504 µs (±5); a rule-chain query — one that requires SLD descent through a clause body with shared variables — in 1.966 µs (±11). The rule-chain premium over direct lookup is 462 ns, the cost of one resolution step with VAR_SENTINEL variable sharing and the attendant unification. From the rule-chain median we derive a single-core throughput:

> 1 / 1.966 µs ≈ **508,600 rule-chain proofs per second per core.**

Direct lookups run at 1 / 1.504 µs ≈ 665,000 per second. On an 8-performance-core Apple Silicon part, embarrassingly parallel admission across independent queries projects to ~4 million rule-chain proofs per second, though with the caveat that receipt-chain construction is the shared bottleneck and parallel scaling is sub-linear when many queries commit to a shared fact base.

**Hashing** primitives anchor the receipt costs: `hash_term_id` at 90.9 ns (±0.5) and `hash_fact_row` at 125.1 ns (±0.9). These are the atomic operations of the receipt chain. A full receipt over a query with R rules and F facts costs approximately R·(term-hash) + F·(fact-hash) + fixed roots, i.e. the receipt is a *linear* overhead on top of proof, never super-linear. This is what keeps receipting from dominating: a 100-fact query pays ~12.5 µs of fact hashing plus a few hundred ns of root hashing, comparable to the proof cost itself — receipting roughly doubles query cost rather than multiplying it.

### 4.2 ocpq: bindings, refinement, type admission, constraint evaluation

**Binding construction** is 208 ns (±0.8). **Refinement** is the asymmetry already noted: 33.4 ns compatible, 12.6 ns incompatible. The 2.65× speedup of the incompatible path is the enumerator's pruning engine; because real Cartesian products are dominated by incompatible candidates, the *effective* per-candidate refinement cost in a realistic enumeration trends toward the 12.6 ns figure.

**Type admission** is sub-5-ns: 4.49 ns for a type match, 1.48 ns for type-any. These are the innermost-loop costs of enumeration. Their magnitude — a handful of nanoseconds — is what makes Cartesian enumeration tractable for moderate domains: filtering 10,000 candidates against a variable declaration costs ~45 µs (type match) or ~15 µs (type-any).

**Constraint evaluation** is the runtime's central metric: 776 ns (±3) for a satisfied verdict, 753 ns (±3) for a violated one. From the satisfied cost we derive:

> 1 / 776 ns ≈ **1,288,700 constraint verdicts per second per core.**

The violated case yields 1 / 753 ns ≈ 1,328,000 per second. The near-equality (3% spread) means a planner can budget a *single* 776 ns figure across any verdict mix.

### 4.3 What these numbers mean at scale

Consider an industrial object-centric log with one million events and a conformance rule expressed as a binding-box constraint evaluated per relevant binding. If the rule produces two million candidate bindings (a binding per event plus a per-object-pair expansion), the full conformance pass costs:

> 2,000,000 × 776 ns ≈ **1.55 seconds** on a single core.

This is *real-time conformance* for object-centric logs: a full re-evaluation of a relational constraint over a million-event log in under two seconds, single-threaded, with each verdict at the granularity of an individual binding rather than an aggregate fitness. Parallelized across eight cores, the same pass falls below 250 ms — fast enough to re-evaluate on every log update, which is the operational definition of *online* conformance.

For prolog8, an admission workflow that proves one rule-chain query per incoming event against a fixed catalog sustains ~508,000 events per second per core. A streaming process at even 10,000 events/second consumes ~2% of one core for *receipted* admission — meaning that receipting, far from being a luxury affordable only in batch, is cheap enough to run inline on a production event stream.

### 4.4 Comparison to prior art

Direct comparison is complicated by the absence, in prior work, of a *receipted* baseline — there is no established system that produces a replayable cryptographic proof of object-centric conformance, which is itself a finding. We can, however, situate the cost.

Alignment-based conformance via A\* over the synchronous product (Adriansyah et al., 2011; van der Aalst et al., 2012) is, in the worst case, exponential in the model size and routinely reported at *milliseconds to seconds per trace* on case-centric logs of moderate size; object-centric alignment is more expensive still and lacks a settled algorithm. A per-trace alignment in the low-millisecond range is three orders of magnitude more expensive than ocpq's 776 ns per-binding verdict — though the comparison is not apples-to-apples, because alignment computes a *minimal-cost repair* whereas ocpq computes a *Boolean verdict against a declarative constraint*. The point is not that ocpq is "faster than alignment" in a feature-equivalent sense; it is that *declarative constraint admission occupies a fundamentally cheaper cost regime than optimal-repair conformance*, and that this cheaper regime is what makes per-binding, online, receipted admission feasible at all.

Against general-purpose Prolog systems (e.g., SWI-Prolog; Wielemaker et al., 2012), prolog8's 1.97 µs rule-chain query is competitive for *small bounded programs*, but the comparison again misses the point: no general Prolog emits a domain-separated receipt chain or enforces a published visited-set bound, so none produces an *admission* in our sense. prolog8 trades Prolog's full expressive power (no negation-as-failure, bounded search) for the two properties general Prolog lacks: decidable termination and replayable receipts.

---

## Chapter 5 — The Phase Transition Argument

### 5.1 The claim, stated precisely

The thesis's central claim is that **bounded proof + cryptographic receipt + object-centric querying is not an incremental improvement over statistical conformance but a separation in computational class.** We now make "computational class" precise. We are not claiming a separation in the Turing-degree sense (both systems are computable). We are claiming a separation in the sense of *what kind of object the output is*, and *what an external party can do with it* — a separation in the *standing* the system confers on an action. We formalize this through the Chatman Equation and the law R⊢A.

### 5.2 The Chatman Equation

We model admission as a pipeline:

> **O → α_B → O\* → μ_B → A → ρ → R**

where:

- **O** is the raw observation — the OCEL log, the event stream, the behavior as recorded.
- **α_B** is the *bounded admission map* — the projection of O into the bounded representation over which decidability holds. In ocpq, α_B is the construction of bindings and the declaration of typed variables; in prolog8, it is the loading of facts and the fixing of the catalog. The subscript B denotes the bound (visited-set 256, MAX_ANSWERS 128, finite variable domains).
- **O\*** is the *admissible observation* — O reduced to the finite, decidable structure: the fact base plus catalog (prolog8) or the binding domains plus predicates (ocpq). Crucially, O\* is finite, so every property of it is decidable (the Rice escape of §2.4 made concrete).
- **μ_B** is the *bounded inference/evaluation operator* — SLD resolution under the visited-set bound (prolog8) or constraint evaluation over the Cartesian product (ocpq). μ_B is total: because its domain O\* is finite and its search is bounded, μ_B always halts with a verdict.
- **A** is the *admission* — the typed verdict (one of prolog8's 23 codes, or ocpq's per-binding satisfied/violated). A is the decision: this behavior is or is not licensed.
- **ρ** is the *receipt map* — the BLAKE3 domain-separated commitment that binds (O\*, μ_B's proof, A) into a chain.
- **R** is the *receipt* — the replayable artifact whose existence constitutes proof that A was reached from O\* via μ_B.

The pipeline's defining property is that it is *closed under verification*: given R, an independent party can recompute every root, replay μ_B over O\*, and confirm A — without trusting the producer. The pipeline ends not in a measurement but in an artifact.

### 5.3 The law: R⊢A

We assert the admission law:

> **R ⊢ A** — the receipt proves the admission; equivalently, an action is admitted *if and only if* there exists a receipt that derives its verdict.

The turnstile is deliberate: R *entails* A in the proof-theoretic sense, because R contains (via the proof root and replay) a derivation of A. This is stronger than R *attesting to* A (a signature over a claim) because the receipt does not merely assert A; it *carries the derivation* that an independent verifier replays to *re-derive* A. The tamper-detection property of §3.1.5 — that altering the proof root is caught independently of hash consistency — is exactly the statement that R ⊢ A is *checkable*: you cannot forge a receipt for an A that does not follow, because replay re-runs the bounded proof.

The contrapositive is the operative discipline: **no receipt, no admission.** A behavior for which no R exists is, by the law, not admitted — regardless of how confidently any system asserts it should be. This is the inversion of the statistical paradigm, in which a fitness of 0.95 *suggests* admission but no artifact *proves* it.

### 5.4 SELECT/DO is a strictly weaker class

We can now state the class separation. Define a SELECT/DO agent as one that produces actions but no receipts: it computes A (or something A-like) and acts, but emits no R such that R ⊢ A. Define an R⊢A system as one that emits, for every admitted action, a receipt from which the admission is replayable. We claim R⊢A is *strictly stronger*, and the separation is *structural*, not quantitative.

The argument is as follows. A SELECT/DO agent's verdict is *unfalsifiable by replay*: there is no object an adversary or auditor can examine to confirm or refute that the verdict followed from the inputs under the rules. The agent must be *trusted*. An R⊢A system's verdict is *falsifiable by replay*: the receipt is exactly the object that makes the verdict checkable, and tampering is detectable. The two systems may compute the *same verdict* on the same input, yet they confer different *standing*: the SELECT/DO verdict has the epistemic status of a claim; the R⊢A verdict has the status of a proof. No amount of additional computation *within* the SELECT/DO paradigm closes this gap, because the gap is not about the verdict's accuracy but about the *existence of a replayable witness*. This is why we call it a phase transition: as one adds bound, then proof, then receipt, the system's output undergoes a discontinuous change in kind — from a measurement that must be trusted to a proof that can be checked — at the moment R first exists.

Formally, the separation mirrors the distinction between a language being *recognized* and a membership being *certified*. A SELECT/DO conformance checker recognizes conformant behavior (it computes a number); an R⊢A system *certifies* it (it produces a checkable proof of membership in the admitted set). Certification is the stronger notion: every certified instance carries its own verification, whereas recognition leaves verification external and trust-dependent.

### 5.5 Why object-centricity makes the transition necessary, not merely available

One might object that receipting is orthogonal to object-centricity — that one could receipt a case-centric conformance verdict just as well. True, but object-centricity is what makes the verdict *worth* receipting, and what makes the *cheap* verdict possible. The binding-box calculus reduces conformance to *per-binding Boolean verdicts* (Figure 6), and a Boolean verdict over a finite binding is exactly the kind of object that (a) admits a clean proof and (b) is cheap enough (776 ns) to receipt at stream rates. Statistical fitness over a continuous range does not reduce to a clean Boolean and does not carry an obvious proof object. Object-centric querying, in other words, is the representation in which admission becomes both decidable and receiptable. The phase transition is available because OCPQ supplies discrete, finite, provable verdicts, and prolog8 supplies the bounded proof and receipt that seal them.

### 5.6 The bound as the carrier of decidability

We close the argument by returning to Rice. The entire edifice rests on the bounds: visited-set 256, MAX_ANSWERS 128, finite variable domains. Without them, μ_B is partial (might not halt), O\* is infinite, and the admission question reinherits the undecidability Rice guarantees for arbitrary semantic properties. *With* them, O\* is finite, μ_B is total, A is computed by exhaustion, and R is a finite checkable object. The bounds are therefore not a weakness to apologize for; they are the *mechanism* of the phase transition. They are what convert an undecidable semantic question into a decidable, receiptable, replayable one. A system that removed the bounds in pursuit of "full generality" would not be a better admission system; it would cease to be an admission system at all, collapsing back into the undecidable regime where only statistics survive.

---

## Chapter 6 — Limitations and Future Work

### 6.1 MAX_ANSWERS truncation at 128

The WASM boundary truncates to 128 answers. While the kernel computes and receipts the complete set (§3.1.7), a consumer that needs the full set of a query with more than 128 solutions must re-derive beyond the boundary. For admission this is usually benign — admission typically asks *does any proof exist*, not *enumerate all proofs* — but for *exhaustive* object enumeration (e.g., "list every order that violated the rule") the cap is a real constraint. Future work should expose a streaming or paginated boundary that preserves the receipt over the full set while delivering answers in receipt-consistent pages, so that the consumer can walk past 128 without re-execution.

### 6.2 Visited-set cap at 256

The visited-set bound guarantees termination but also bounds the *depth and breadth* of provable derivations. A legitimate proof requiring more than 256 explored configurations is *not found*, and the admission gate returns a non-admission code. This is sound (no false admission) but incomplete (possible false non-admission). For deep recursive domains — long transitive chains in an O2O graph, for instance — 256 may be too tight. Future work should make the bound a *declared parameter of the receipt*, so that two parties can agree on a deeper bound and the receipt commits to the bound used, preserving reproducibility while permitting domain-appropriate depth. The bound must remain *fixed per receipt*; what should be configurable is its value, not its existence.

### 6.3 No negation-as-failure

prolog8 implements definite-clause SLD resolution without negation-as-failure (NAF) or the closed-world assumption's full machinery. This is a deliberate soundness choice — NAF interacts badly with bounded search, since "fails to prove within 256" is not the same as "false" — but it limits expressiveness: rules like "admit unless a prior rejection exists" cannot be stated directly. Future work should investigate *bounded stratified negation*, in which negation is permitted only over predicates whose full extension fits within the bound, so that "not provable" coincides with "false" within the finite O\*. This preserves the Rice escape (negation remains decidable over finite O\*) while recovering much of NAF's practical expressiveness.

### 6.4 Cartesian product explosion in ocpq

ocpq's `output()` is, worst-case, the Cartesian product of variable domains: n^k for k variables over domains of size n. For large logs with many free variables this is the dominant scaling risk, and the 776 ns per-binding cost, however small, is multiplied by a potentially enormous binding count. The current mitigations — predicate filtering and early refinement-incompatibility pruning (the fast 12.6 ns path) — collapse realized enumeration far below worst case in practice, but provide no worst-case guarantee. Future work should pursue *join-order optimization* (evaluating the most selective predicate first to shrink domains before the product expands), *indexed E2O/O2O lookup* (replacing scans with hash-indexed access so a variable's domain is the *matching* objects rather than all objects), and *binding-box decomposition* (factoring a box into independent sub-boxes whose products multiply rather than nest). These are the standard techniques of relational query optimization, and importing them into the binding-box runtime is the clearest path to scaling ocpq to logs of tens of millions of objects.

### 6.5 Receipt-chain storage and aggregation

Each admission emits a receipt; at stream rates of hundreds of thousands per second, receipt *storage* becomes its own engineering problem. Future work should investigate Merkle-aggregation of receipts — committing a batch of per-event receipts into a single periodic root — so that long-run admission histories are checkable without storing every individual chain, trading per-event granularity for logarithmic verification cost over a batch.

### 6.6 Threats to validity

The benchmarks are single-platform (Apple Silicon) and microbenchmark-scoped: they measure isolated operations under ideal cache conditions, and real workloads will see cache and allocation effects that the medians do not capture. The throughput derivations of Chapter 4 assume linear scaling from per-operation cost, which holds only while the working set fits in cache and parallel queries do not contend on a shared fact base. The comparison to alignment (§4.4) is necessarily indirect, since no receipted object-centric baseline exists. These are honest limitations of a first empirical account; they do not undercut the architectural and class-separation claims, which rest on the *structure* of the artifacts rather than on the precise nanosecond figures.

---

## Chapter 7 — Conclusion

Process mining has spent two decades perfecting *observation*: discovering models, measuring fitness, aligning traces. This thesis has argued that the discipline's next move is not a better measurement but a different kind of output — an *admission*: a bounded, proven, receipted, replayable verdict that a behavior is licensed under a rule set, checkable by any party without trust in the producer. We have shown that this move is not blocked by Rice's theorem, because Rice constrains only arbitrary semantic properties of *unbounded* computation; bounded execution over a finite admissible observation O\* renders admission decidable by exhaustion, and the bound — prolog8's visited-set of 256, its MAX_ANSWERS of 128, ocpq's finite variable domains — is the very mechanism that carries decidability.

We presented two published Rust artifacts that realize this. prolog8 supplies bounded SLD proof under Robinson unification with VAR_SENTINEL variable sharing, sealed by a BLAKE3 domain-separated receipt chain whose replay detects proof tampering independently of hash consistency, and gated by a 23-code admission classifier. ocpq supplies a faithful implementation of Küsters and van der Aalst's binding-box calculus — bindings, refinement, basic predicates, Cartesian enumeration, and per-binding constraint verdicts — that reduces object-centric conformance to discrete, finite, provable Booleans. The release-profile benchmarks ground the claims in real numbers: 1.97 µs per rule-chain proof (508,000/sec/core), 125 ns per receipted fact row, 776 ns per constraint verdict (1.29 million/sec/core), 33 ns per refinement test. From these we derived that a full relational-constraint conformance pass over a million-event object-centric log completes in under two seconds on one core, and that receipted admission costs ~2% of a core at a 10,000-event/second stream — receipting is cheap enough to run inline, not merely in batch.

The deeper contribution is the **phase-transition argument**. Through the Chatman Equation, O → α_B → O\* → μ_B → A → ρ → R, and the law **R ⊢ A**, we located the precise point at which a system's output changes in kind: the moment the receipt R first exists, the verdict ceases to be a measurement that must be trusted and becomes a proof that can be checked. SELECT/DO agents — the receiptless majority of contemporary process-mining and AI systems — occupy a strictly weaker class: they can act, but their actions have the epistemic standing of claims, falsifiable only by re-trusting the actor. R⊢A systems confer *standing*: their actions carry their own replayable witnesses. No quantity of additional computation within the SELECT/DO paradigm closes this gap, because the gap is structural — it is the difference between recognizing a conformant behavior and *certifying* it.

The future this opens is a process intelligence whose every verdict is born admitted and receipted: online, object-centric, decidable, and checkable by strangers. The bounds that make it possible are not apologies but foundations. The receipt is not metadata but the proof itself. And the law is simple enough to discipline an entire field: **no receipt, no admission.**

---

## References

1. Adriansyah, A., van Dongen, B. F., & van der Aalst, W. M. P. (2011). Conformance checking using cost-based fitness analysis. In *2011 IEEE 15th International Enterprise Distributed Object Computing Conference (EDOC)* (pp. 55–64). IEEE.

2. Berti, A., Koren, I., Adams, J. N., Park, G., Knopp, B., Graves, N., Rafiei, M., Liß, L., Tacke Genannt Unterberg, L., Zhang, Y., Schwanen, C., Pegoraro, M., & van der Aalst, W. M. P. (2023). OCEL (Object-Centric Event Log) 2.0 specification. *arXiv preprint arXiv:2403.01975*.

3. Carmona, J., van Dongen, B., Solti, A., & Weidlich, M. (2018). *Conformance Checking: Relating Processes and Models*. Springer.

4. Ghahfarokhi, A. F., Park, G., Berti, A., & van der Aalst, W. M. P. (2021). OCEL: A standard for object-centric event logs. In *European Conference on Advances in Databases and Information Systems (ADBIS)* (pp. 169–175). Springer.

5. Kowalski, R. A., & Kuehner, D. (1971). Linear resolution with selection function. *Artificial Intelligence*, 2(3–4), 227–260.

6. Küsters, T., & van der Aalst, W. M. P. (2025). Object-Centric Process Querying. *arXiv preprint arXiv:2506.11541v1*.

7. Lloyd, J. W. (1987). *Foundations of Logic Programming* (2nd ed.). Springer-Verlag.

8. O'Connor, J., Aumasson, J.-P., Neves, S., & Wilcox-O'Hearn, Z. (2020). *BLAKE3: One function, fast everywhere*. Specification and reference implementation.

9. Rice, H. G. (1953). Classes of recursively enumerable sets and their decision problems. *Transactions of the American Mathematical Society*, 74(2), 358–366.

10. Robinson, J. A. (1965). A machine-oriented logic based on the resolution principle. *Journal of the ACM*, 12(1), 23–41.

11. van der Aalst, W. M. P. (2016). *Process Mining: Data Science in Action* (2nd ed.). Springer.

12. van der Aalst, W. M. P. (2019). Object-centric process mining: Dealing with divergence and convergence in event data. In *Software Engineering and Formal Methods (SEFM)* (pp. 3–25). Springer.

13. van der Aalst, W. M. P., Adriansyah, A., & van Dongen, B. (2012). Replaying history on process models for conformance checking and performance analysis. *WIREs Data Mining and Knowledge Discovery*, 2(2), 182–192.

14. van der Aalst, W. M. P., & Berti, A. (2020). Discovering object-centric Petri nets. *Fundamenta Informaticae*, 175(1–4), 1–40.

15. Aumasson, J.-P. (2017). *Serious Cryptography: A Practical Introduction to Modern Encryption*. No Starch Press.

16. Apt, K. R., & van Emden, M. H. (1982). Contributions to the theory of logic programming. *Journal of the ACM*, 29(3), 841–862.

17. Colmerauer, A., & Roussel, P. (1996). The birth of Prolog. In *History of Programming Languages II* (pp. 331–367). ACM.

18. Merkle, R. C. (1988). A digital signature based on a conventional encryption function. In *Advances in Cryptology — CRYPTO '87* (pp. 369–378). Springer.

19. Sipser, M. (2013). *Introduction to the Theory of Computation* (3rd ed.). Cengage Learning.

20. Wielemaker, J., Schrijvers, T., Triska, M., & Lager, T. (2012). SWI-Prolog. *Theory and Practice of Logic Programming*, 12(1–2), 67–96.

21. van Emden, M. H., & Kowalski, R. A. (1976). The semantics of predicate logic as a programming language. *Journal of the ACM*, 23(4), 733–742.

22. Adams, J. N., Park, G., & van der Aalst, W. M. P. (2022). Preserving complex object-centric graph structures to improve machine learning tasks in process mining. *arXiv preprint arXiv:2207.14801*.

23. WebAssembly Community Group. (2019). *WebAssembly Core Specification, Version 1.0*. W3C Recommendation.

24. Bertot, Y., & Castéran, P. (2004). *Interactive Theorem Proving and Program Development: Coq'Art*. Springer.
