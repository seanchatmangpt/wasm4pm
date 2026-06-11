# plan.md — 60 Algorithms Correctness & Optimization Reviews Plan

## Mission
Generate a detailed correctness and optimization review file for each of the 60 discovery and analysis algorithms in the codebase under `docs/reference/reviews/` and update `INDEX.md`.

## Milestones

### Milestone 1: Inspect Codebase & Map Algorithms to Source Files
- Spawn an Explorer to locate the exact Rust kernel implementations, TS dispatch wrappers, and test files for each of the 60 algorithms listed in `ALGORITHM_REACHABILITY_EVIDENCE.v26.6.10.json`.
- Output: A mapping JSON/MD file in the agent folder (e.g. `algorithm_source_mapping.json`).

### Milestone 2: Generate Review Files for Algorithms 1-20
- Spawn a Worker to generate review markdown files for the first 20 algorithms under `docs/reference/reviews/`.
- Ensure each file details:
  - Algorithm ID & Domain
  - Correctness Audit
  - Improvement Areas
  - Code References

### Milestone 3: Generate Review Files for Algorithms 21-40
- Spawn a Worker to generate review markdown files for the next 20 algorithms.

### Milestone 4: Generate Review Files for Algorithms 41-60
- Spawn a Worker to generate review markdown files for the last 20 algorithms.

### Milestone 5: Generate Index and Verify Deliverables
- Spawn a Worker to create `docs/reference/reviews/INDEX.md` listing all 60 algorithms and linking to them.
- Verify that exactly 60 files exist, that they are not stubs, and that all markdown links work correctly.
