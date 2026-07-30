# wasm4pm ontology namespaces

## Decision

`chatmangpt.com` is the canonical authority for new wasm4pm-owned ontology terms and instance identifiers.

Public vocabularies remain public. Their IRIs are not copied or rewritten. wasm4pm continues to reuse RDF, RDFS, OWL, SHACL, PROV-O, DCAT, DCTERMS, SKOS, Schema.org, and the W3C Machine Learning Schema directly.

## Canonical namespaces

| Surface | Prefix | Namespace |
|---|---|---|
| Core capability, evidence, receipt, and Gall terms | `wpm` | `https://chatmangpt.com/ns/wasm4pm#` |
| Process-intelligence algorithms | `pi` | `https://chatmangpt.com/ns/wasm4pm/pi#` |
| Cognition breeds | `cognition` | `https://chatmangpt.com/ns/wasm4pm/cognition#` |
| TraceGraph terms | `trace` | `https://chatmangpt.com/ns/wasm4pm/trace#` |
| Interview ontology terms | `interview` | `https://chatmangpt.com/ns/wasm4pm/interview#` |
| Instances | — | `https://chatmangpt.com/id/wasm4pm/` |
| Ontology document | — | `https://chatmangpt.com/ontology/wasm4pm` |

The machine-readable source of truth is [`ontology/chatmangpt/namespaces.json`](../../ontology/chatmangpt/namespaces.json).

## Audit findings

The repository contains several legitimate semantic systems, but their owned identifiers evolved independently:

- process-intelligence vocabulary and 60 historical algorithm instances use `https://wasm4pm.dev/pi#`;
- cognition-breed vocabulary and 55 breed instances use `https://wasm4pm.dev/ns#`;
- lifecycle algorithm instances and queries use `urn:wasm4pm:`;
- TraceGraph JSON-LD uses a distinct `trace:` surface;
- the bounded coding-interview ontology is represented as structured JSON rather than RDF;
- imported W3C and public vocabularies are already used extensively and must remain unchanged.

The problem is therefore not a lack of ontology. It is the absence of one declared authority for repo-owned terms.

## Migration strategy

The migration is additive and non-breaking.

1. **Declare the canonical namespace.**
   `ontology/chatmangpt/wasm4pm-namespace.ttl` defines the core ChatmanGPT ontology.
2. **Bridge existing vocabularies.**
   Legacy algorithm and cognition classes/properties are connected with `owl:equivalentClass`, `owl:equivalentProperty`, and `dcterms:isReplacedBy`.
3. **Project canonical instances.**
   `migrate-legacy-identifiers.rq` constructs stable `chatmangpt.com/id/wasm4pm/...` identifiers while retaining `owl:sameAs` links to existing individuals.
4. **Keep generators operational.**
   Existing ggen queries may continue to consume legacy IRIs until their generated artifacts and receipts are migrated together.
5. **Refuse new namespace drift.**
   `scripts/verify-ontology-namespaces.py` rejects example domains and undeclared wasm4pm/chatmangpt namespace variants.
6. **Validate semantic contracts.**
   `wasm4pm-shapes.ttl` establishes SHACL contracts for algorithms, cognition breeds, evidence artifacts, and Gall checkpoints.

## Identity rules

Use stable identifiers, not file locations:

```text
https://chatmangpt.com/id/wasm4pm/algorithm/{algorithm_id}
https://chatmangpt.com/id/wasm4pm/cognition-breed/{breed_id}
https://chatmangpt.com/id/wasm4pm/receipt/{receipt_id}
https://chatmangpt.com/id/wasm4pm/checkpoint/{checkpoint_id}
https://chatmangpt.com/id/wasm4pm/trace-run/{run_id}
```

Identifiers must not encode a Git branch, local path, temporary directory, or generated output location. Exact source revisions belong in `wpm:sourceRevision`.

## Legacy standing

| Legacy base | Replacement | Standing |
|---|---|---|
| `https://wasm4pm.dev/pi#` | `https://chatmangpt.com/ns/wasm4pm/pi#` | supported compatibility |
| `https://wasm4pm.dev/ns#` | `https://chatmangpt.com/ns/wasm4pm/cognition#` | supported compatibility |
| `urn:wasm4pm:` | `https://chatmangpt.com/id/wasm4pm/` | migration required |

Legacy terms are not deleted merely to produce a clean grep result. They remain admitted only when their replacement is declared in the namespace registry.

## Verification

Run:

```bash
python3 scripts/verify-ontology-namespaces.py
python3 scripts/verify-ontology-namespaces.py --json
```

The verifier returns non-zero when it finds an example-domain identifier or an undeclared repo-owned namespace. Declared legacy occurrences are reported as migration debt but do not fail the staged migration.

## Next migration tranche

After this bridge is accepted, migrate one generated surface at a time:

1. algorithm vocabulary, instances, SPARQL queries, templates, and registry receipts;
2. cognition vocabulary, breed packs, queries, and generated registrations;
3. TraceGraph JSON-LD contexts and contract tests;
4. lifecycle `urn:wasm4pm:` identifiers;
5. interview ontology JSON-LD projection.

Each tranche must regenerate downstream artifacts and replay its receipts before the legacy namespace is removed from that surface.
