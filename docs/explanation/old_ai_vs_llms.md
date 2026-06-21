# Explanation: Old AI vs. LLM Brochure

A core doctrine of `wasm4pm` is: **Old AI is the factory. LLMs are the brochure.**

## The Problem with LLMs in Process Mining

Large Language Models (LLMs) excel at natural language generation, conversational routing, and unstructured data extraction. However, they are fundamentally ill-suited for the rigorous, deterministic mathematics required by process mining and enterprise coordination:
* **Hallucinations:** LLMs confidently invent process steps or violate temporal constraints.
* **Lack of Auditability:** The reasoning of an LLM is a black-box vector multiplication; it cannot be audited step-by-step.
* **No Mathematical Guarantees:** LLMs cannot provide cryptographic proofs of conformance, execution bounds, or strict deterministic behavior.

## The Old AI Factory: The Cognition Breeds

To solve these systemic flaws, `wasm4pm` implements a growing library of breeds directly in WebAssembly-compiled Rust — classical "Old AI" reasoning systems and Autoinstinct breeds. These systems are deterministic, transparent, and produce append-only inference traces that guarantee rigorous reasoning. They form the `@wasm4pm/cognition` package.

As of v26.6, there are 20 active breeds (16 PARTIAL_ALIVE + 4 ADMITTED). The available breeds and their capabilities are:

### Classical Old AI Breeds (16 PARTIAL_ALIVE)

1. **Abductive IBE (`abductive_ibe`)**: Inference to the Best Explanation (Harman 1965, Thagard 1978). Selects the hypothesis that best explains the observed evidence.
2. **Abductive LP (`abductive_lp`)**: Logic-programming-based abduction. Derives minimal explanations for observations within a background theory.
3. **Allen Temporal (`allen_temporal`)**: Allen's interval algebra (Allen 1983). Reasons over temporal relationships between process intervals without hallucinating ordering.
4. **Analogy SME (`analogy_sme`)**: Structure-Mapping Engine for analogical reasoning (Gentner 1983). Maps relational structure from known cases to novel situations.
5. **ASP (`asp`)**: Answer Set Programming. Solves combinatorial problems through stable-model semantics and non-monotonic reasoning.
6. **Bayesian Network (`bayesian_network`)**: Probabilistic graphical model inference. Computes posterior beliefs under uncertainty using exact conditional probability.
7. **Belief Merging (`belief_merging`)**: Merges conflicting belief bases from multiple agents into a consistent combined belief set.
8. **Circumscription (`circumscription`)**: Non-monotonic reasoning via minimal-model semantics (McCarthy 1980). Formalizes default assumptions without LLM confabulation.
9. **CLP (`clp`)**: Constraint Logic Programming. Solves constraint satisfaction problems over finite or numeric domains.
10. **Partial Order Plan (`partial_order_plan`)**: Partial-order causal-link planning. Generates flexible plans that impose only necessary ordering constraints.
11. **Script SAM (`script_sam`)**: Script Applier Mechanism (Schank & Abelson 1977). Applies stereotyped event-sequence knowledge to interpret and predict process behavior.
12. **Situation Calculus (`situation_calculus`)**: First-order logical framework for reasoning about actions and their effects on world states (McCarthy & Hayes 1969).

### Autoinstinct Breeds (4 PARTIAL_ALIVE)

13. **Autoinstinct Learning (`autoinstinct_learning`)**: Reinforcement learning autoinstinct. Adapts behavior from outcome signals without explicit reprogramming.
14. **Autoinstinct Neurosis (`autoinstinct_neurosis`)**: Behavioral anomaly detection. Identifies deviations from established behavioral baselines in running processes.
15. **Autoinstinct Semantics (`autoinstinct_semantics`)**: Semantic field mapping. Translates between heterogeneous field vocabularies without manual schema alignment.
16. **Autoinstinct Vision (`autoinstinct_vision`)**: Process structure perception. Extracts structural patterns and topology from raw process event data.

### Admitted Breeds (4 ADMITTED)

17. **CTL Check (`ctl_check`)**: Computation Tree Logic model checking. Verifies temporal safety and liveness properties over branching-time process models.
18. **ILP (`ilp`)**: Inductive Logic Programming. Learns logical rules from positive and negative examples grounded in background knowledge.
19. **Meta Reasoning (`meta_reasoning`)**: Reasoning about the reasoning process itself. Selects and monitors which inference strategy to apply given current context.
20. **Naive Physics (`naive_physics`)**: Qualitative physical simulation (Hayes 1978). Reasons about physical states and processes without numeric simulation.

## Why Are They Available?

These breeds are available to provide the **rigorous "execution engine"** that LLMs lack. In our architecture:

1. **The LLM (The Brochure):** Interprets the user's fuzzy goals and translates them into rigid configurations (like a JSON payload of Facts, Rules, or Goals).
2. **The Old AI (The Factory):** Executes the mathematical constraints, applying the specific Old-AI breed (e.g., using `partial_order_plan` to build a plan, or `asp` to verify rules). It generates an exact, step-by-step **inference trace** and signs a **BLAKE3 cryptographic receipt**.
3. **The Guarantee:** The LLM receives the deterministic result back from the WASM kernel and summarizes it for the user. If the process is ever audited, the BLAKE3 receipt and the inference trace prove mathematically exactly *why* a decision was made.

By making these available natively in TypeScript via WASM, `wasm4pm` gives developers the power to build agentic workflows that are both conversational *and* cryptographically secure.