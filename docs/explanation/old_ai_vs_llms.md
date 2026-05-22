# Explanation: Old AI vs. LLM Brochure

A core doctrine of `wasm4pm` is: **Old AI is the factory. LLMs are the brochure.**

## The Problem with LLMs in Process Mining

Large Language Models (LLMs) excel at natural language generation, conversational routing, and unstructured data extraction. However, they are fundamentally ill-suited for the rigorous, deterministic mathematics required by process mining and enterprise coordination:
* **Hallucinations:** LLMs confidently invent process steps or violate temporal constraints.
* **Lack of Auditability:** The reasoning of an LLM is a black-box vector multiplication; it cannot be audited step-by-step.
* **No Mathematical Guarantees:** LLMs cannot provide cryptographic proofs of conformance, execution bounds, or strict deterministic behavior.

## The Old AI Factory: The 9 Cognition Breeds

To solve these systemic flaws, `wasm4pm` implements 9 classical "Old AI" breeds directly in WebAssembly-compiled Rust. These systems are deterministic, transparent, and produce append-only inference traces that guarantee rigorous reasoning. They form the `@wasm4pm/cognition` package.

The available breeds and their capabilities are:

1. **ELIZA (`eliza`)**: Frame-based pattern matching with slot filling (Weizenbaum 1966). Ideal for basic intent extraction and robust natural language classification without LLM hallucination risk.
2. **Case-Based Reasoning (`cbr`)**: Similarity-based matching via Jaccard metrics (Schank 1983). Best for leveraging historical outcomes (like previous system architectures) to solve new problems.
3. **DENDRAL (`dendral`)**: Constraint-based enumeration and search (Feigenbaum 1971). Used for exhaustively discovering valid state configurations that meet rigid constraints.
4. **STRIPS (`strips`)**: Precondition-based planner (Fikes & Nilsson 1971). Capable of determining the exact sequence of actions required to move from a current state to a goal state.
5. **Prolog (`prolog`)**: Horn-clause backward chaining (Robinson 1965). Essential for theorem proving, deep logic deduction, and policy invariant checking.
6. **MYCIN (`mycin`)**: Forward-chaining rule engine with certainty factors (Shortliffe 1976). Perfect for root-cause diagnostics and decision-making under uncertainty.
7. **General Problem Solver (`gps`)**: Means-ends analysis and gap reduction (Newell & Shaw 1963). Excellent for hierarchical planning and breaking down large tasks into resolvable sub-goals.
8. **SOAR (`soar`)**: Preference-based operator selection (Laird 1987). Designed for continuous agent execution loops, impasse resolution, and multi-criteria decision making.
9. **Hearsay-II (`hearsay`)**: Blackboard consensus fusion (Erman & Lesser 1980). Provides robust multi-agent coordination, allowing disparate systems to vote on and synthesize a single ground truth.

## Why Are They Available?

These breeds are available to provide the **rigorous "execution engine"** that LLMs lack. In our architecture:

1. **The LLM (The Brochure):** Interprets the user's fuzzy goals and translates them into rigid configurations (like a JSON payload of Facts, Rules, or Goals).
2. **The Old AI (The Factory):** Executes the mathematical constraints, applying the specific Old-AI breed (e.g., using `strips` to build a plan, or `prolog` to verify rules). It generates an exact, step-by-step **inference trace** and signs a **BLAKE3 cryptographic receipt**.
3. **The Guarantee:** The LLM receives the deterministic result back from the WASM kernel and summarizes it for the user. If the process is ever audited, the BLAKE3 receipt and the inference trace prove mathematically exactly *why* a decision was made.

By making these available natively in TypeScript via WASM, `wasm4pm` gives developers the power to build agentic workflows that are both conversational *and* cryptographically secure.