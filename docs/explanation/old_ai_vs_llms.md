# Explanation: Old AI vs. LLM Brochure

A core doctrine of `wasm4pm` is: **Old AI is the factory. LLMs are the brochure.**

## The Problem with LLMs in Process Mining
Large Language Models (LLMs) excel at natural language generation and UX routing, but they are fundamentally ill-suited for the rigorous, deterministic mathematics required by process mining. They hallucinate process steps, fail at complex graph traversal, and cannot provide mathematical proofs of conformance.

## The Old AI Factory
To solve this, `wasm4pm` implements 9 classical "Old AI" breeds directly in Rust:
*   **MYCIN:** Forward chaining for rule engines.
*   **STRIPS:** Goal regression planning.
*   **Prolog:** Unification and resolution.

These algorithms are **deterministic, transparent, and mathematically provable**.

## The Architecture
We use LLMs (the brochure) purely to translate user intent into rigid configurations. Those configurations are then fed into the Rust/WASM Old AI kernel (the factory). The factory executes the math, signs a cryptographic receipt, and hands the deterministic result back to the LLM to summarize for the user.
