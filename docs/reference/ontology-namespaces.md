# wasm4pm ontology namespace architecture

## Decision

`chatmangpt.com` is the canonical authority for new wasm4pm-owned ontology terms, stable identities, evidence artifacts, and semantic fixture identifiers.

This does **not** mean public vocabularies are copied into the ChatmanGPT namespace. RDF, RDFS, OWL, SHACL, PROV-O, DCAT, DCTERMS, SKOS, Schema.org, W3C MLS, SPDX, and other independently governed vocabularies remain under their public authorities and are reused directly.

The architectural rule is:

```text
public concept owned by a public standard  -> reuse its public IRI
wasm4pm-specific class or property         -> https://chatmangpt.com/ns/wasm4pm...
stable wasm4pm individual                  -> https://chatmangpt.com/id/wasm4pm/...
person identity                            -> https://chatmangpt.com/id/person/...
legacy repo-owned identifier               -> retain temporarily with declared replacement
```

## Canonical authorities

| Surface | Prefix | Namespace | Purpose |
|---|---|---|---|
| Core | `wpm` | `https://chatmangpt.com/ns/wasm4pm#` | capabilities, evidence, receipts, Gall checkpoints, typed refusals, standing |
| Process intelligence | `pi` | `https://chatmangpt.com/ns/wasm4pm/pi#` | mining algorithms, algorithm metadata, paper pointers, conformance standing |
| Cognition | `cognition` | `https://chatmangpt.com/ns/wasm4pm/cognition#` | cognition breeds, breed metadata, evidence-derived admission |
| Compatibility schemas | `compat` | `https://chatmangpt.com/ns/wasm4pm/compat#` | cross-language domain contracts and compatibility ontology terms |
| Zod projection | `zod` | `https://chatmangpt.com/ns/wasm4pm/zod#` | runtime-validation schema projections generated from compatibility contracts |
| TraceGraph | `trace` | `https://chatmangpt.com/ns/wasm4pm/trace#` | trace runs, frames, source locations, execution relationships |
| Interview ontology | `interview` | `https://chatmangpt.com/ns/wasm4pm/interview#` | tracks, concepts, patterns, rules, and bounded interview evidence |
| Stable project individuals | — | `https://chatmangpt.com/id/wasm4pm/` | algorithms, breeds, receipts, checkpoints, traces, fixtures, runs |
| Semantic-conformance fixtures | `semconv` | `https://chatmangpt.com/id/wasm4pm/semconv/` | deterministic SPARQL proof fixtures and expected-result identities |
| Person identities | `person` | `https://chatmangpt.com/id/person/` | stable creator and contributor identities |
| Ontology document | — | `https://chatmangpt.com/ontology/wasm4pm` | versioned ontology metadata and canonical vocabulary document |

The machine-readable source of truth is [`ontology/chatmangpt/namespaces.json`](../../ontology/chatmangpt/namespaces.json). Documentation, JSON-LD contexts, SHACL shapes, migration queries, and CI policy must remain consistent with that registry.

## Repository audit

The repository already contained substantial ontology infrastructure. The problem was fragmented ownership, not an absence of semantics.

### Process-intelligence ontology

The historical process-intelligence graph uses `https://wasm4pm.dev/pi#`. It defines algorithm classes and properties, algorithm instances, paper pointers, quality dimensions, dispatch metadata, and evidence-derived standing.

The graph historically contains 60 algorithm individuals. The later source-level Gall census identified 46 canonical process-mining implementations after separating wrappers, aliases, unrelated cognition breeds, and typed exclusions. The difference is a semantic reconciliation obligation, not a number to silently edit.

### Cognition-breed ontology

Cognition uses `https://wasm4pm.dev/ns#` for 55 breed instances and their generated Rust/TypeScript registration surfaces. The current ggen alive gate also uses these IRIs. Migration therefore has to move the vocabulary, queries, packs, generated outputs, and receipts as one deterministic tranche.

### Compatibility and runtime-schema ontologies

The compatibility pack contains an additional authority, `https://wasm4pm-compat.rs/ontology#`, while its Zod projection uses `https://wasm4pm-compat.rs/zod#`. These are not cognition terms and must not be collapsed into the cognition namespace merely because they live near breed-related generation code.

Their canonical replacements are distinct:

```text
https://wasm4pm-compat.rs/ontology#
  -> https://chatmangpt.com/ns/wasm4pm/compat#

https://wasm4pm-compat.rs/zod#
  -> https://chatmangpt.com/ns/wasm4pm/zod#
```

### Semantic-conformance fixtures

The `semconv/sparql-proofs` fixtures use `http://wasm4pm.org/` for logs, models, activities, metrics, predictions, classifications, and expected-result resources. These are primarily deterministic fixture identities rather than a coherent published vocabulary.

They migrate to the stable fixture identity space:

```text
http://wasm4pm.org/...
  -> https://chatmangpt.com/id/wasm4pm/semconv/...
```

The fixture queries and expected outputs must be migrated together so exact-result comparisons do not become false failures.

### Lifecycle and runtime identifiers

Lifecycle files and historical queries use `urn:wasm4pm:`. These URNs are retained as declared migration debt. Canonical replacements use stable HTTPS identities under `https://chatmangpt.com/id/wasm4pm/`.

### TraceGraph JSON-LD

TraceGraph already behaves as a semantic wire format: it has a JSON-LD context, stable `@id` values, typed runs and frames, and contract tests. It requires a dedicated namespace migration because external adapters and CLI fixtures consume its compact keys.

### Interview ontology

The bounded interview ontology is currently structured JSON containing concepts, tracks, evidence patterns, inference rules, aliases, and phases. It is semantically ontology-like but not yet projected into RDF/JSON-LD. Its canonical term namespace is reserved now so the later projection does not invent another authority.

## Legacy registry

| Legacy base | Canonical replacement | Role | Current standing |
|---|---|---|---|
| `https://wasm4pm.dev/pi#` | `https://chatmangpt.com/ns/wasm4pm/pi#` | process-intelligence vocabulary | supported compatibility |
| `https://wasm4pm.dev/ns#` | `https://chatmangpt.com/ns/wasm4pm/cognition#` | cognition vocabulary | supported compatibility |
| `https://wasm4pm-compat.rs/ontology#` | `https://chatmangpt.com/ns/wasm4pm/compat#` | compatibility-domain vocabulary | migration required |
| `https://wasm4pm-compat.rs/zod#` | `https://chatmangpt.com/ns/wasm4pm/zod#` | Zod projection vocabulary | migration required |
| `http://wasm4pm.org/` | `https://chatmangpt.com/id/wasm4pm/semconv/` | semantic-conformance fixtures | fixture migration required |
| `urn:wasm4pm:` | `https://chatmangpt.com/id/wasm4pm/` | lifecycle and runtime individuals | migration required |

Legacy terms are not removed merely to produce a clean grep result. A legacy IRI remains admitted only when:

1. its namespace exists in the registry;
2. the replacement belongs to a canonical ChatmanGPT authority;
3. its semantic role is declared;
4. the verifier reports it as migration debt;
5. the migration tranche retains compatibility or replays all dependent evidence.

## Identity rules

Stable identifiers describe things, not storage locations:

```text
https://chatmangpt.com/id/wasm4pm/algorithm/{algorithm_id}
https://chatmangpt.com/id/wasm4pm/cognition-breed/{breed_id}
https://chatmangpt.com/id/wasm4pm/receipt/{receipt_id}
https://chatmangpt.com/id/wasm4pm/checkpoint/{checkpoint_id}
https://chatmangpt.com/id/wasm4pm/trace-run/{run_id}
https://chatmangpt.com/id/wasm4pm/semconv/{fixture_family}/{fixture_id}
https://chatmangpt.com/id/person/{person_id}
```

An identity must not encode:

- a Git branch;
- a local checkout path;
- a temporary directory;
- a generated-output path;
- a CI run URL;
- a mutable display label;
- a toolchain version unless that version is the identity of the thing itself.

Exact repository revisions belong in `wpm:sourceRevision`. Content identity belongs in `wpm:contentDigest`. Runtime execution identity belongs in a run or receipt IRI.

## Migration strategy

Migration is additive and evidence-preserving.

### 1. Declare canonical authority

`ontology/chatmangpt/wasm4pm-namespace.ttl` defines canonical classes and properties and declares namespace-level replacement relationships.

### 2. Bridge vocabulary semantics

Where the old and new terms are semantically identical, use `owl:equivalentClass` or `owl:equivalentProperty`. Use `dcterms:isReplacedBy` to express migration direction. Do not use `owl:equivalent*` when the canonical term intentionally tightens, narrows, or otherwise changes the old meaning.

### 3. Project stable individuals

`migrate-legacy-identifiers.rq` manufactures canonical algorithm and cognition-breed identities while retaining `owl:sameAs` and `dcterms:isReplacedBy` links. Additional fixture and lifecycle migration queries must be scoped to their own tranches because their path structures and semantics differ.

### 4. Keep generators operational

Existing ggen queries continue to consume legacy IRIs until the entire generated surface can be migrated together. A vocabulary-only change that leaves queries and templates on the old namespace is incomplete. A query-only change that produces different artifacts without regenerating receipts is also incomplete.

### 5. Refuse new drift

`scripts/verify-ontology-namespaces.py` classifies IRIs using explicit canonical, legacy, external, host-ownership, and URN registries. It does not use a naive substring rule. A GitHub repository link containing the word `wasm4pm` is external metadata, while an undeclared path on `chatmangpt.com`, `wasm4pm.dev`, `wasm4pm-compat.rs`, or `wasm4pm.org` is refused.

### 6. Validate semantic contracts

`wasm4pm-shapes.ttl` establishes SHACL constraints for algorithms, cognition breeds, evidence artifacts, and Gall checkpoints. CI parses the canonical Turtle and SHACL graphs with RDFLib and validates the shape graph with pySHACL.

## Verification

Run from the repository root:

```bash
python3 -m unittest scripts/tests/test_verify_ontology_namespaces.py -v
python3 scripts/verify-ontology-namespaces.py
python3 scripts/verify-ontology-namespaces.py --json
python3 -m json.tool ontology/chatmangpt/context.jsonld >/dev/null
python3 -m json.tool ontology/chatmangpt/namespaces.json >/dev/null
```

The CI workflow additionally parses the Turtle graphs and performs SHACL validation.

The verifier returns:

- `canonical`: declared ChatmanGPT terms and identities;
- `legacy`: declared migration debt with an explicit replacement;
- `external`: approved public vocabulary or metadata authority;
- `other`: external identifiers outside project namespace governance;
- `error`: example domains, undeclared paths on owned hosts, or undeclared owned URNs.

## Gall-style migration tranches

Each surface migrates as a smallest complete system.

1. **Algorithm ontology:** vocabulary, 60 historical instances, 46 canonical census reconciliation, queries, templates, registries, dispatch metadata, generated docs, receipts, and negative fixtures.
2. **Cognition ontology:** vocabulary, 55 breeds, paper pointers, evidence projection, Rust and TypeScript packs, registrations, tests, and receipts.
3. **Compatibility and Zod:** domain ontology, Zod vocabulary, extraction queries, generated schemas, consumer pack, and runtime validation tests.
4. **Semantic-conformance fixtures:** SPARQL queries, fixture IRIs, expected results, deterministic comparisons, and replay receipts.
5. **TraceGraph:** JSON-LD context, adapters, CLI emitters, contract tests, and round-trip evidence.
6. **Lifecycle identities:** `urn:wasm4pm:` instances, queries, receipts, and downstream references.
7. **Interview ontology:** JSON-to-JSON-LD/RDF projection, bounded inference semantics, fixtures, and generated consumers.
8. **Publication:** dereferenceable domain routes, content negotiation, cache policy, immutable version snapshots, and availability evidence.

Each tranche must include a positive witness, negative falsifier, deterministic receipt, exact source revision, clean-checkout replay, and a compatibility decision. Legacy identifiers are removed from a surface only after its replacement artifacts and evidence replay successfully.
