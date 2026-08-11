# From Inference as a Service to Compiled Cognition as Infrastructure
## A Benchmark-Grounded Thesis on the Phase Shift Exposed by wasm4pm-cognition

### Abstract

This thesis argues that the significant result of the wasm4pm benchmark program is not a collection of low latency measurements. The deeper result is an architectural phase shift: a class of work conventionally assigned to expensive, serial, probabilistic, human- or model-mediated reasoning can be re-expressed as bounded, deterministic, composable cognition kernels whose behavior is inspectable, benchmarkable, adversarially stressable, and receiptable.

The claim is deliberately narrower than “reasoning is solved.” The benchmark program does not establish general intelligence, universal semantic understanding, superiority to frontier language models, or production business outcomes. It establishes a falsifiable systems hypothesis: when a cognitive pattern is known well enough to possess an admitted contract, it can often be compiled into a lawful operator and removed from the scarce inference path. The architectural consequence is a transition from inference-centric systems to cognition-manufacturing systems.

The empirical constitution is unusually hostile to flattering implementations. The canonical cognition inventory contains 55 admitted breeds. The Divan matrix derives its cases directly from `BreedId::ALL`, measures kernel-only and full-lifecycle execution separately, amplifies independent work at batch sizes 1, 4, 16, and 64, injects 0, 64, 512, and 4096 irrelevant context facts, profiles allocations, black-boxes outputs, and refuses empty inference traces or missing OCEL evidence. The resulting 660 named measurements are designed not merely to report speed but to expose constant stubs, hidden shared overhead, memoization tricks, pathological allocation, accidental whole-context scans, and nonlinear scaling.

The thesis develops the resulting phase shift through process science, information theory, enterprise architecture, Little's Law, bounded rationality, formal admission, and receipt-bearing actuation. Its central proposition is:

> Intelligence should not repeatedly infer what the system already knows how to manufacture lawfully.

When this proposition is operationalized, the scarce resource ceases to be raw cognition. It becomes unresolved novelty: the residual uncertainty remaining after deterministic cognition, process evidence, policy closure, counterfactual elimination, and admission have compressed the decision space.

---

## 1. The old architecture: cognition as a scarce serial service

Contemporary agentic architectures usually treat cognition as a remote service. Observation is serialized into a prompt, a probabilistic model performs inference, a response is parsed, and downstream machinery decides whether the response may cause effects.

A simplified path is:

`O -> PROMPT -> MODEL -> PARSE -> DECIDE -> ACT`

This architecture has three structural properties.

First, known and unknown problems compete for the same expensive inference resource. A recurring routing pattern, a known conformance rule, a deterministic policy implication, and a genuinely novel planning problem can all become model calls.

Second, latency is serial. Even when inference is parallelized, each model invocation is a comparatively large queueing object with network, scheduling, token-generation, parsing, and validation costs.

Third, epistemic and execution authority are easily conflated. A model output may be treated as though the ability to propose an action implied the authority to perform it.

The result is decision inflation: increasing model capability can increase the number of generated choices without eliminating the architecture's dependency on expensive selection.

---

## 2. The proposed phase shift

wasm4pm-cognition suggests a different decomposition:

`O -> O* -> COMPILED COGNITION -> RESIDUAL UNCERTAINTY -> INTELLIGENCE -> ADMISSION -> BRCE -> R`

The critical operation is subtraction. Every known cognitive pattern that can be expressed as a bounded lawful operator is removed from the residual inference problem.

Let the original decision space be `Omega_0`. Let deterministic cognition operators `C_1 ... C_n` successively eliminate observationally impossible, dominated, nonconformant, redundant, or already-known alternatives. Then:

`Omega_(i+1) = C_i(O*, Omega_i)`

and the expensive intelligence boundary receives only:

`Omega_residual = Omega_n`.

A useful quantity is therefore not tokens per answer but cognitive compression:

`CCR = log2(|Omega_0|) / max(1, log2(|Omega_residual|))`.

An even more operational quantity is residual inference fraction:

`RIF = unresolved_decisions / admitted_decisions`.

The architectural objective becomes minimizing RIF without violating correctness, authority, or admission constraints.

---

## 3. Why 55 cognition breeds matter

A single fast kernel proves little. Fifty-five separately admitted cognition breeds create a qualitatively different object: a heterogeneous cognition substrate.

The importance is combinatorial. If cognition operators compose, the useful system is not a catalog of 55 isolated functions. It is a graph of possible lawful compositions. Even restricting a workflow to sequences of length `k`, the unconstrained composition space grows as `55^k`. At depth 8 that is more than 8.3e13 nominal sequences; at depth 12 it exceeds 7.6e20. Real admission rules dramatically reduce that graph, which is precisely the point: the system should compute and preserve lawful possibility while refusing impossible composition.

The phase shift is therefore from choosing a cognitive procedure to manufacturing a bounded cognition graph.

This resembles a compiler more than a chatbot. A compiler does not ask an intelligent agent to rediscover register allocation, parsing, type checking, and instruction selection on every build. Once a transformation is sufficiently understood, it becomes machinery. wasm4pm-cognition applies the same economic logic to cognitive work.

---

## 4. Why the benchmark constitution is part of the scientific contribution

Performance claims about cognition are unusually easy to game. Tiny fixtures favor fixed overhead. Shared lifecycle costs can hide an inefficient kernel. Cached inputs can make repeated execution appear free. Constant outputs can look spectacular. Aggregate means can hide one catastrophically poor cognition family.

The Divan constitution attacks these failure modes directly.

### 4.1 Inventory closure

Benchmark cases are generated from canonical `BreedId::ALL`. Benchmark coverage therefore follows the admitted ontology rather than a hand-selected list of favorable implementations. A new admitted breed enters the benchmark obligation automatically.

### 4.2 Kernel/lifecycle separation

Every breed is measured on two surfaces. `kernel_only` exposes the cognition implementation itself. `full_lifecycle` measures the lawful path including governance/evidence work. This prevents a common benchmarking error in which a large shared framework cost makes all implementations look approximately equal.

Define governance tax for breed `b` as:

`G_b = T_full(b) - T_kernel(b)`.

The ratio

`rho_b = T_kernel(b) / T_full(b)`

then distinguishes algorithm-dominated from governance-dominated cognition.

### 4.3 Geometric work amplification

Batch sizes 1, 4, 16, and 64 create a scaling curve rather than a point estimate. For latency `T(n)`, the empirical slope

`alpha = Delta log T / Delta log n`

provides a practical complexity fingerprint. Constant overhead, linear scaling, superlinear behavior, and pathological cliffs become visible.

### 4.4 Context-pressure adversary

The benchmark holds the useful cognitive problem fixed while injecting up to 4096 semantically irrelevant facts. This is crucial. Enterprise systems rarely operate on pristine minimal contexts. They operate inside noisy observation envelopes.

A cognition that only needs a narrow key should not become quadratic merely because the enterprise knows more facts. Context sensitivity can be expressed as:

`CSI_b(n) = T_b(context=n) / T_b(context=0)`.

Large CSI values expose implementations whose apparent speed depended on toy contexts.

### 4.5 Allocation evidence

Latency alone can hide an implementation that creates unsustainable allocator pressure. Divan allocation profiling makes memory behavior a first-class benchmark output. This matters especially for WebAssembly, edge execution, high concurrency, and repeated cognition loops.

### 4.6 Semantic preflight

A fast wrong answer is not cognition. Preflight requires breed identity, nonempty inference evidence, OCEL evidence, and monotonic inference steps before a case is eligible for timing. Missing fixtures fail closed rather than disappearing from the report.

The benchmark is therefore not merely a stopwatch. It is an adversarial court.

---

## 5. From process mining to process science

Traditional process mining asks questions such as: What process occurred? What model best describes the event log? Where does observed execution deviate from the model?

The broader process-science interpretation asks a more consequential question:

> What cognition can be derived mechanically from process evidence before intelligence is invoked?

This expands the domain from mining models to manufacturing consequences.

Process evidence supplies temporal, causal, organizational, resource, object, and conformance structure. Cognition operators can transform this admitted evidence into hypotheses, eliminations, classifications, counterfactuals, policies, repair intents, or proof obligations.

The resulting pipeline is:

`EVENTS -> PROCESS EVIDENCE -> COGNITION GRAPH -> ADMITTED CONSEQUENCES`.

The process model is no longer merely an analytical artifact. It becomes an executable cognitive substrate.

---

## 6. The information-theoretic interpretation

The fundamental economic event is entropy reduction.

Suppose an enterprise decision initially admits `N` plausible alternatives. Selecting one requires distinguishing among them, with idealized uncertainty `H_0 = log2 N` bits under a uniform prior.

A deterministic cognition operator that eliminates alternatives without model inference performs useful information work. After closure, if `M` alternatives remain, residual uncertainty is `H_r = log2 M`.

Mechanical information gain is:

`I_mech = H_0 - H_r`.

The strategic metric is the fraction of decision entropy removed before expensive inference:

`MER = (H_0 - H_r) / H_0`.

When MER approaches one for recurring problem families, using a general model for the entire decision becomes economically analogous to recomputing a database index with a language model on every query.

This does not make intelligence obsolete. It makes intelligence more valuable because it is reserved for entropy that machinery has not already eliminated.

---

## 7. Combinatorial maximalism and the end of premature selection

Enterprise architecture traditionally treats alternatives as expensive. Architects therefore reduce the option set early: choose a cloud, choose a database, choose an integration pattern, choose a control threshold, choose a target operating model.

When manufacture becomes cheap, early selection becomes suspect.

Design for Combinatorial Maximalism reverses the default:

1. preserve reversible lawful possibilities;
2. compute consequences across the portfolio;
3. eliminate impossible and dominated alternatives mechanically;
4. delay irreversible selection until evidence requires it.

The relevant performance metric is no longer time to first answer. It is lawful optionality manufactured per unit decision latency:

`AOD = lawful_reversible_alternatives / decision_time`.

The enterprise architecture benchmark rail already reframes performance around portfolio-before-decision, policy-space sweeps, receipt tax, and architecture optionality density. The cognition matrix supplies the missing substrate: it asks whether the cognitive transformations required to explore those portfolios remain cheap, bounded, and robust under scale.

---

## 8. Little's Law and cognitive WIP

Little's Law states `L = lambda W`, where work in process equals arrival rate times average time in system.

In an inference-centric architecture, every known-pattern decision placed on the model/human queue contributes to `W`. As agentic systems increase event and decision arrival rates, cognitive WIP can explode even if individual models become faster.

Compiled cognition attacks both terms that matter operationally. It removes known work from the scarce queue and reduces service time for mechanically resolvable decisions.

Let `lambda_d` be incoming decision demand, `p_c` the fraction resolved by compiled cognition, `W_i` inference service time, and `W_c` compiled-cognition service time. Approximate cognitive WIP becomes:

`L = lambda_d[(1-p_c)W_i + p_c W_c]`.

When `W_c << W_i`, even moderate `p_c` produces a structural reduction in WIP. This is a phase change because throughput no longer scales primarily by buying more intelligence. It scales by manufacturing more known cognition into the deterministic substrate.

---

## 9. Enterprise architecture as a cognition compiler

The Challenger interpretation follows directly.

The conventional Architecture Review Board asks: Which architecture should we approve?

A cognition-manufacturing architecture asks:

> Why are humans selecting among a handful of manually constructed alternatives before the machine has computed the lawful portfolio?

The enterprise architecture function can be reframed as a compiler pipeline:

`OBSERVE -> NORMALIZE -> DERIVE -> EXPAND -> ELIMINATE -> ADMIT -> CONSTRUCT -> RECEIPT`.

Humans then govern ontology, objectives, exceptions, authority, and irreversible commitments rather than repeatedly executing known transformations by hand.

The sales implication is not “replace architects.” It is more challenging:

> Stop spending architect cognition on transformations that can be made deterministic, testable, and replayable. Spend architect cognition on the residual novelty that remains.

---

## 10. BRCE: why faster cognition must not mean faster ungoverned action

Cheap cognition creates a new danger: high-speed wrong action.

Therefore SELECT, CONSTRUCT, and DO must remain distinct. A cognition kernel may derive a repair intent. It does not acquire ambient execution authority by deriving it.

The actuation path remains:

`intent -> admission -> broker -> consequence -> receipt`.

This is the Brokered Receipted Consequence Execution principle: zero unreceipted actuation.

The phase shift is therefore not from human control to autonomous action. It is from expensive probabilistic derivation to cheap deterministic derivation while preserving a hard authority boundary around consequence.

This separation is essential for enterprise adoption. Without it, increasing cognition throughput increases risk surface. With it, cognition throughput and actuation authority can scale independently.

---

## 11. What would falsify the thesis

A scientific thesis needs failure conditions.

The compiled-cognition phase-shift hypothesis is weakened or falsified for a cognition family if any of the following persist after fair implementation effort:

- the deterministic kernel cannot reproduce the required semantics;
- correctness depends on open-ended world knowledge unavailable in the admitted observation;
- context-pressure scaling becomes prohibitive;
- memory/allocation growth destroys the latency advantage;
- lifecycle proof and receipt costs dominate useful work beyond the target decision budget;
- the residual uncertainty after mechanical closure remains essentially as large as the original problem;
- composition between cognition breeds introduces unbounded or undecidable behavior at the required boundary;
- a matched competitor performs the same admitted semantics with materially better cost, latency, correctness, or portability;
- benchmark success fails to transfer to real enterprise observations.

The 660-point matrix is designed to expose several of these failures early rather than conceal them behind aggregate performance.

---

## 12. What the present evidence does and does not prove

### Presently supported

The repository contains a canonical 55-breed cognition ontology and a Divan anti-hiding matrix that expands it into 660 named measurement points. The matrix explicitly separates kernel and lifecycle cost, applies geometric batch scaling, injects adversarial irrelevant context, profiles allocations, black-boxes outputs, and fails closed on invalid cognition evidence.

The broader benchmark program also binds cognition to enterprise architecture decision economics and high-scale deterministic diagnostic simulation. Together these artifacts establish a serious experimental constitution for testing whether known cognition can become infrastructure.

### Not yet supported merely by construction

Source code and benchmark definitions are not benchmark results. Until the exact candidate head executes the complete matrix and produces replayable artifacts, no latency distribution, scaling exponent, allocation rate, or cross-breed ranking should be promoted as observed fact.

Likewise, these benchmarks do not yet establish superiority to LLM agents, humans, SREGym solvers, process-mining competitors, or production enterprise workflows. Those require matched subjects, identical semantics, independent verification, and controlled hardware/environment identities.

This distinction is central to the thesis: benchmark architecture can establish what must be measured; only execution can establish the measurement.

---

## 13. The post-inference architecture

If the benchmark hypothesis survives execution, a new architecture becomes rational.

### Layer 1: Observation

Collect events, objects, state, policies, topology, provenance, and process evidence.

### Layer 2: Admission

Construct `O*`: bounded observation with explicit identity, authority, freshness, and scope.

### Layer 3: Compiled cognition

Execute known cognition breeds and lawful compositions. Derive consequences, closures, classifications, candidate portfolios, and refusals.

### Layer 4: Residual intelligence

Invoke probabilistic or human intelligence only where compiled cognition cannot close the uncertainty.

### Layer 5: Construction

Manufacture reversible artifacts and intents without actuation authority.

### Layer 6: BRCE

Admit and execute consequences through the sole authorized DO path.

### Layer 7: Receipt and replay

Bind observation, cognition, authority, consequence, and verification into replayable evidence.

The model is therefore no longer the computer. It becomes one operator inside a larger cognition calculus.

---

## 14. The economic phase shift

The old optimization target is:

`minimize cost per inference`.

The new optimization target is:

`minimize expensive inference required per verified consequence`.

Those are not equivalent.

A 10x cheaper model reduces the price of every model-mediated decision by 10x. A compiled cognition operator that removes 99.9% of recurring decisions from the model path can reduce demand for that inference family by roughly three orders of magnitude before model-price improvements are considered.

The strategically interesting quantity becomes inference displacement:

`IDR = decisions_resolved_without_general_inference / total_decisions`.

Combined with correctness and receipts:

`Verified Cognition Yield = verified_non_model_decisions / unit_cost`.

This is why the benchmark program can represent a phase shift even if no individual nanosecond number is world-record-setting. The system changes the denominator of intelligence economics.

---

## 15. From agents to cognition manufacturing systems

An agent-centric worldview asks which agent should reason about a problem.

A cognition-manufacturing worldview asks a prior question:

> Does this problem still require an agent at all?

The routing order becomes:

`known deterministic pattern -> compiled cognition`

`known bounded search -> mechanical exploration`

`known policy consequence -> closure/admission`

`known actuation pattern -> receipted broker`

`residual novelty -> intelligence`.

This resembles the historical migration from handcraft to manufacturing. Manufacturing did not eliminate design. It moved repeatable transformations out of artisanal cognition and into reproducible processes, allowing scarce expertise to operate at a higher level of abstraction.

The corresponding software transition is from handcrafted inference to cognition manufacturing.

---

## 16. Research program after the 660-point crown

The immediate empirical program should proceed in five courts.

### Court A: per-breed performance

Execute all 660 Divan measurements. Record latency distributions, throughput, allocation counts/bytes, batch slopes, context-pressure slopes, kernel/lifecycle ratios, and exact source/toolchain identities.

### Court B: semantic mutation

Generate adversarial inputs that alter the meaningful evidence while preserving superficial size. Verify that outputs change lawfully. This catches constant or weakly input-sensitive implementations that performance preflight alone cannot detect.

### Court C: compositional cognition

Benchmark admitted multi-breed graphs. Measure fusion opportunities, intermediate allocation, evidence reuse, closure convergence, and whether composition creates pathological scaling.

### Court D: differential intelligence

Run the same bounded tasks through compiled cognition and a model/human baseline. Compare correctness, wall time, dollars, energy proxies, tokens, variance, and receipt completeness. No superiority claim should precede this matched court.

### Court E: enterprise consequence

Measure whether cognition displacement reduces actual decision WIP, architecture cycle time, incident diagnosis time, policy-analysis latency, or human review burden in a controlled workflow.

Only Court E establishes organizational phase change. Courts A-D establish the mechanism.

---

## 17. Conclusion

The wasm4pm-cognition benchmark program points toward a change more fundamental than faster process mining.

The old architecture treats intelligence as the universal execution substrate for cognitive work. The emerging architecture treats intelligence as a scarce extension mechanism invoked after a deterministic cognition substrate has exhausted what is already known.

The 55-breed ontology matters because it converts “reasoning” from an undifferentiated capability into named operators. The 660-point Divan court matters because it makes those operators individually accountable under scale, noise, lifecycle overhead, and allocation pressure. The enterprise architecture rail matters because it connects cheap cognition to optionality before decision. BRCE matters because cognition without bounded authority would merely accelerate risk.

The resulting phase shift can be stated compactly:

`INFERENCE-FIRST -> COMPILE-KNOWN / INFER-RESIDUAL`

or, in manufacturing form:

`A = mu(O*)`, with intelligence reserved for the portion of `mu` that has not yet been lawfully compiled.

If exact-head execution validates the benchmark constitution, the important result will not be that wasm4pm can “think faster than an LLM.” That comparison is too shallow. The stronger result will be that a measurable portion of work previously classified as intelligence can be transformed into deterministic infrastructure—fast enough to compose, cheap enough to run continuously, constrained enough to govern, and explicit enough to falsify.

That is the phase shift: **from paying for cognition every time to manufacturing cognition once and replaying its lawful consequences at machine speed.**
