# wasm4pm Public Ontology Alignment

This document describes how the `wasm4pm` combinatorial process-intelligence substrate maps to public vocabularies. Our architecture is **public-only**, meaning we use standard namespaces to represent all internal concepts.

## Core Vocabulary Mappings

| wasm4pm concept        | Public representation                                        |
| ------------------------ | ------------------------------------------------------------ |
| Algorithm                | `mls:Algorithm`                                              |
| Algorithm category       | `skos:Concept`                                               |
| Deployment profile       | `skos:Concept`                                               |
| Positive behavior case   | `prov:Activity` / `mls:Run` classified by `skos:Concept`     |
| Negative behavior case   | `prov:Activity` / `mls:Run` with failure-code `skos:Concept` |
| Invariant case           | `prov:Activity` / `mls:Run`                                  |
| Failure code             | `skos:Concept`                                               |
| Event log fixture        | `dcat:Dataset` / `dcat:Distribution`                         |
| OCEL log                 | `dcat:Dataset` plus OCEL object/event structure              |
| Algorithm result         | `prov:Entity`                                                |
| Receipt                  | `prov:Entity`                                                |
| Evidence file            | `prov:Entity` + `dcat:Dataset`                               |
| Release gauntlet         | `prov:Activity`                                              |
| Release certificate      | `prov:Entity`                                                |
| CLI command              | `schema:Action`                                              |
| WASM export              | `schema:SoftwareSourceCode` / `prov:Entity`                  |
| NPM package              | `schema:SoftwareApplication` / `doap:Project`                |
| Tarball                  | `dcat:Distribution`                                          |
| Hash/checksum            | `spdx:Checksum`                                              |
| Refusal/admission policy | `odrl:Policy`                                                |
| Timestamps/durations     | `time:Instant`, `time:Interval`                              |
| Validation closure       | `sh:NodeShape`                                               |

## Ontology Standards Library

The raw Turtle (`.ttl`) definitions for these standards are maintained in `ontology/standards/`:

- **PROV-O**: Provenance tracking for receipts and activities.
- **OCEL 2.0**: Object-Centric Event Log metamodel.
- **DCAT**: Data cataloging for evidence files and distributions.
- **ML-Schema**: Machine learning algorithm and experiment modeling.
- **SKOS**: Controlled vocabularies for categories and failure codes.
- **ODRL**: Policy expression for admission and refusal.
- **SHACL**: Structural validation shapes for evidence closure.

## Alignment Graph

The formal RDF alignment is defined in `ontology/public-alignment.ttl`, and validation shapes are in `ontology/public-shapes.ttl`.
