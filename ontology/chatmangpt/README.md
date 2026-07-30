# ChatmanGPT wasm4pm ontology

This directory establishes `chatmangpt.com` as the canonical authority for new wasm4pm-owned semantic identifiers while retaining explicit compatibility with existing `wasm4pm.dev` and `urn:wasm4pm:` identifiers.

## Artifacts

- `wasm4pm-namespace.ttl` — OWL/RDFS canonical vocabulary and legacy mappings.
- `wasm4pm-shapes.ttl` — SHACL contracts for algorithms, cognition breeds, Gall checkpoints, receipts, and evidence.
- `context.jsonld` — JSON-LD context for canonical terms.
- `namespaces.json` — machine-readable namespace registry and policy.
- `migrate-legacy-identifiers.rq` — non-destructive SPARQL CONSTRUCT projection for canonical instance identifiers.

## Policy

Public vocabularies remain public. RDF, RDFS, OWL, SHACL, PROV-O, DCAT, DCTERMS, SKOS, Schema.org, and W3C MLS IRIs are reused directly and are never rewritten into the ChatmanGPT domain.

New repo-owned terms must use one of the declared `https://chatmangpt.com/ns/wasm4pm...` namespaces. New stable individuals must use `https://chatmangpt.com/id/wasm4pm/...`.

Run the policy gate from the repository root:

```bash
python3 scripts/verify-ontology-namespaces.py --json
```
