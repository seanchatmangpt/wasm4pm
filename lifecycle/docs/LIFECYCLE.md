# wasm4pm × unrdf Lifecycle Reference

> GENERATED — DO NOT EDIT — source: `schema/domain.ttl`
> Run `ggen sync` in `lifecycle/` to regenerate.

## Lifecycle Stages

The development lifecycle is a directed cycle:
**Spec → Generate → Test → Deploy → Monitor → Improve → Spec**

A rework edge exists: **Test → Spec**

| # | Stage | OTel Span | XES Activity | Description |
|---|-------|-----------|--------------|-------------|

| 1 | **Spec** | `lifecycle.spec` | `Spec` | Define the system in RDF ontology (source of truth). |

| 2 | **Generate** | `lifecycle.generate` | `Generate` | Run ggen sync (Rust) and unrdf sync (TypeScript) to precipitate code from the ontology. |

| 3 | **Test** | `lifecycle.test` | `Test` | Execute tests, SHACL validation, and conformance checks against generated artifacts. |

| 4 | **Deploy** | `lifecycle.deploy` | `Deploy` | Publish WASM packages, Rust crates, and TypeScript libraries. |

| 5 | **Monitor** | `lifecycle.monitor` | `Monitor` | Collect OTel traces, convert to XES event logs, store in unrdf RDF graph. |

| 6 | **Improve** | `lifecycle.improve` | `Improve` | Run wasm4pm DFG / AlphaMiner / InductiveMiner on event log; discover drift vs. intended process; produce improvement spec. |


## How It Works

1. **Spec** — Edit `schema/domain.ttl` (RDF ontology, single source of truth)
2. **Generate** — `ggen sync` precipitates Rust types + ESM constants + this doc
3. **Test** — `cargo check && cargo test` (Rust) + `node --test` (ESM)
4. **Deploy** — Publish Rust crate; ESM lives inside wasm4pm workspace
5. **Monitor** — Each stage transition emits a SHA-256 receipt; Jaeger spans are ingested via `fromJaegerSpans()`
6. **Improve** — `LifecycleMiner.analyse()` runs DFG discovery + conformance check; deviations become the next Spec revision

## Algorithm Assignments (from RDF)

See `schema/domain.ttl` `lc:AlgorithmAssignment` individuals for the full declared mapping.
Run `ggen sync` after any ontology edit to keep this doc in sync.

## Receipt

Every `ggen sync` run produces a signed Ed25519 receipt at `.ggen/receipts/latest.json`,
proving which ontology produced which files at which content hashes.
