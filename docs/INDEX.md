# wasm4pm Documentation

We follow the [Diátaxis framework](https://diataxis.fr/). Each section serves a distinct reader need.

---

## Tutorials — learning-oriented

Start here if you are new to wasm4pm. Tutorials take you through concrete steps that build understanding by doing.

- [Getting Started](tutorials/getting_started.md) — install, run your first discovery, verify with `wpm doctor`
- [Truex Receipt Verification](tutorials/truex_receipts.md) — OCEL 2.0 canonicalization and BLAKE3 integrity checking
- [Predictive Monitoring](tutorials/predictive_monitoring.md) — next-activity prediction and concept drift detection
- [Cognition Contracts](tutorials/cognition_contracts.md) — all 13 breeds, exact field names, working examples

---

## How-To Guides — task-oriented

Solving specific, concrete problems. Assumes you know what you want to achieve.

- [Configure Observability](how-to/configure_observability.md) — OTEL spans, OTLP export, Jaeger setup
- [Edge Deployment](how-to/edge_deployment.md) — Cloudflare Workers, Fastly Compute, CDN edge
- [Concept Drift Detection](how-to/concept_drift.md) — streaming drift monitoring with `wpm drift-watch`
- [Supabase Integration](how-to/supabase_integration.md) — persist receipts and results to Supabase
- [Troubleshooting](how-to/troubleshooting.md) — exit codes, WASM build errors, SIGABRT, cognition failures

---

## Reference — information-oriented

Accurate, complete descriptions of the system. Use these to look things up, not to learn.

- [Algorithms](reference/algorithms.md) — all 60 registered algorithms, domains, admission status, input types
- [CLI Commands](reference/cli_commands.md) — every command, flag, and exit code
- [Configuration Schema](reference/configuration_schema.md) — `wasm4pm.toml` / `wasm4pm.json` / ENV vars
- [Deployment Profiles](reference/deployment_profiles.md) — mobile / iot / edge / fog / browser build targets
- [Glossary](reference/glossary.md) — canonical definitions for OCEL, DFG, breed, receipt, admission, and more

---

## Explanation — understanding-oriented

Background, rationale, and concepts. Read these to understand why things work the way they do.

- [Architecture Overview](explanation/architecture_overview.md) — system layers, engine state machine, WASM boundary
- [Process Mining Primer](explanation/process-mining-primer.md) — discovery / conformance / enhancement, OCEL 2.0, quality dimensions
- [Old AI vs. LLMs](explanation/old_ai_vs_llms.md) — why deterministic symbolic AI runs the kernel
- [Why WASM](explanation/why_wasm.md) — determinism, portability, SIMD performance
- [Concept Drift — Math](explanation/concept_drift_math.md) — EWMA, ADWIN, statistical foundations
- [Receipt Truth Verification](explanation/prd_ard_receipt_truth_verification.md) — PRD/ARD receipt chain theory
- [Public Ontology Alignment](explanation/wasm4pm-public-ontology-alignment.md) — alignment with IEEE XES and OCEL standards

---

## Auxiliary

These sections are not part of the four Diátaxis quadrants but complement them.

- [Architecture Navigation](orientation/) — C4 models, code hotspots, data flow diagrams
- [Domain Primitives](primitives/INDEX.md) — formal algorithm and process model specifications
- [Truex OCEL 2.0 Canonical Profile](truex-ocel2-canonical-profile.md) — full schema and refusal taxonomy
- [Enterprise Deployment](ENTERPRISE.md) — system requirements, air-gap install, corporate registry, memory guidelines
- [Jobs-To-Be-Done](JTBD.md) — user jobs framing for Truex and cognition features

---

## Operational records

Internal governance files — not user documentation.

- [Internal records](internal/) — audit history, rewrite manifest, validation evidence, kernel receipts
