# Thesis Structure: Bridging the Semantic Gap in Process Mining
## A Deterministic, WebAssembly-Accelerated Architecture for Formal Pipeline Verification

To guarantee narrative depth, academic pacing, and the true density of a 10-year research project, the thesis will be constructed as a modular LaTeX project. Below is the mapping of each `.tex` file and its target word count. 

The total target word count for the core dissertation is **~72,300 words**, which is the standard volume for a rigorous Computer Science PhD.

### Root Configuration
*   **`main.tex` (500 words):** The core compilation file. Handles all LaTeX package imports (`amsmath`, `listings`, `hyperref`), macro definitions, document formatting (twoside, margins), and the `\include{}` directives for all subsequent chapters.

### Frontmatter
*   **`frontmatter/abstract.tex` (500 words):** A hyper-dense summary of the epistemological crisis in process mining, the introduction of the `wasm4pm` substrate, the `tower-lsp-max` semantic bridge, and the cryptographic verification of the Ostar pipeline.
*   **`frontmatter/acknowledgments.tex` (300 words):** Professional recognition of the open-source Rust, WebAssembly, and PM4Py communities, and the adversarial review agents that forced the system into combinatorial maximalism.

### Core Chapters
*   **`chapters/01_introduction.tex` (5,000 words):** 
    *   Defines the "Epistemological Crisis": The danger of running enterprise operational intelligence on volatile, dynamic interpreters (Python/GIL). 
    *   Introduces the core hypothesis of *Combinatorial Maximalism*: replacing runtime stochasticity with formal, compile-time typestate guarantees.
*   **`chapters/02_background.tex` (8,000 words):** 
    *   A deep literature review covering Process Mining topologies (XES, OCEL, Petri Nets).
    *   An analysis of the WebAssembly linear memory model.
    *   The theory behind the Language Server Protocol (LSP) and asynchronous Remote Procedure Calls (JSON-RPC).
*   **`chapters/03_wasm4pm_substrate.tex` (12,000 words):** 
    *   Exhaustive architectural breakdown of the Rust execution kernel. 
    *   Mathematical and code-level deconstruction of columnar zero-copy log parsing.
    *   The mechanics of Object-Centric Process Queries (OCPQ) and high-performance Discovery (DFG, Alpha, Inductive) within WASM bounds.
*   **`chapters/04_tower_lsp_max.tex` (10,000 words):** 
    *   The engineering of the asynchronous homological topology. 
    *   Why standard 1-categorical LSP frameworks fail under heavy log telemetry.
    *   Deep dive into the `tower` middleware ecosystem, concurrent task spawning, and the implementation of the reciprocal `tower-lsp-max-client`.
*   **`chapters/05_pm4py_lsp.tex` (12,000 words):** 
    *   Applying the substrate to the data scientist's IDE. 
    *   Perverse sheaves and AST state evaluation: How the LSP detects raw dataframes vs. formatted process data. 
    *   Implementation details of advanced capabilities: `hover`, `completion`, `semantic_tokens_full`, and interactive `code_lens` triggers.
*   **`chapters/06_ostar_proof_discipline.tex` (10,000 words):** 
    *   The cryptography of process mining. The "One-Line Law: No receipt, no claim." 
    *   How topological states are mapped to BLAKE3 cryptographic hashes. 
    *   The mechanism of generating parity fixtures, resolving the taxonomy gap, and ensuring global state verification across the monorepo.
*   **`chapters/07_evaluation.tex` (7,000 words):** 
    *   Empirical testing and benchmarks. 
    *   The execution of `pm4py-lsp` against the official `pm4py` repository (250+ files, 130+ diagnostics). 
    *   Memory footprint and latency comparisons between native Python execution and WASM-accelerated parity routines.
*   **`chapters/08_conclusion.tex` (3,000 words):** 
    *   Final synthesis of how the dual-layered architecture (LSP + WASM) permanently bridges the semantic gap. 
    *   A roadmap for future work, including distributed OCPQ clustering and automated AST-to-WASM compilation.

### Backmatter
*   **`backmatter/appendix.tex` (4,000 words):** 
    *   Extended mathematical proofs (Malliavin derivative bounds for concurrency).
    *   Exhaustive, un-truncated Rust code listings of the core `Service` and `LanguageClient` implementations for archival reference.

---
**Total Estimated Word Count: 72,300 words**