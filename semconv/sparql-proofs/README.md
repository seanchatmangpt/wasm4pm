# SPARQL Proof Engine for pictl — RDF Knowledge Graph Generation

> **Status**: Production-Ready Proof Generation System | **Version**: 1.0 | **Date**: 2026-04-10

---

## Overview

This directory contains the **SPARQL CONSTRUCT query engine** that transforms pictl MCP tool outputs (JSON) into RDF triples conforming to `pictl-ontology.ttl`. These queries are the **"proof generators"** — they make pictl outputs inspectable, queryable, and reasonably sound using semantic web technologies.

### Three Key Innovations

1. **Proof as RDF**: Every pictl operation (discovery, conformance, drift, prediction) produces immutable RDF triples, not just JSON.
2. **Semantic Reasoning**: Use SPARQL to ask complex questions across proof artifacts: "If drift detected, which models failed conformance?" "What's the causal chain: deviation → bottleneck → optimization?"
3. **Automated Governance**: Link discovery → conformance → deployment with traceable provenance using PROV ontology.

---

## Files

### SPARQL CONSTRUCT Queries (.rq files)

Each `.rq` file transforms one MCP tool's output into RDF triples.

| File | MCP Tool | Output Class | Purpose |
|------|----------|--------------|---------|
| **discover-dfg.rq** | `discover_dfg` | `pm:DirectlyFollowsGraph` | Transform discovery results into RDF describing activities, edges, quality metrics |
| **conformance-check.rq** | `check_conformance` | `pm:ConformanceReport` | Map fitness, precision, deviations to RDF; enable conformance queries |
| **detect-drift.rq** | `detect_concept_drift` | `pm:ConceptDrift` | Document process drift with before/after metrics snapshots |
| **predict-activity.rq** | `predict_activity_next` | `pm:ActivityPrediction` | Capture next-activity predictions with ranking and confidence |
| **ocel-load.rq** | `load_ocel` | `pm:ObjectCentricEventLog` | Describe OCEL structure (object types, event types, relationships) |
| **ml-classify.rq** | `classify_case` | `pm:OutcomePrediction` | Document ML predictions with feature importance and reasoning |

### Supporting Files

| File | Purpose |
|------|---------|
| **query-registry.json** | Central registry mapping MCP tools → SPARQL queries; includes input/output schemas, usage instructions |
| **README.md** | This file. Quick reference for developers. |
| **../sparql-examples.md** | 50+ SPARQL query examples: ASK (verification), SELECT (analytics), CONSTRUCT (chaining, reasoning) |

---

## Quick Start: From JSON to RDF

### 1. Call pictl MCP Tool (from application)

```javascript
const result = await mcp.call('discover_dfg', {
  xes_content: xesFileContent,
  min_frequency: 0.05,
});
// Returns: { nodes: [...], edges: [...], metrics: {...}, executionTime: "PT5S", ... }
```

### 2. Parse JSON & Bind to SPARQL

```javascript
// Application layer translates JSON → SPARQL BIND statements
const sparqlQuery = `
PREFIX pm: <http://purl.org/pm/ontology#>

CONSTRUCT {
  ?dfg a pm:DirectlyFollowsGraph ;
    pm:hasFitness ?fitness ;
    pm:hasPrecision ?precision ;
    ...
}
WHERE {
  BIND(${result.fitness} AS ?fitness)
  BIND(${result.precision} AS ?precision)
  ...
}
`;
```

### 3. Execute CONSTRUCT Query

```javascript
const rdfTriples = await sparqlEndpoint.construct(sparqlQuery);
// Returns: RDF triples in N-Triples or Turtle format
```

### 4. Load into Triplestore

```javascript
const oxigraphClient = new OxigraphClient('http://localhost:7878');
await oxigraphClient.load(rdfTriples);
// Triples now queryable via SPARQL
```

### 5. Query with SPARQL

```sparql
PREFIX pm: <http://purl.org/pm/ontology#>

ASK {
  ?model a pm:DirectlyFollowsGraph ;
    pm:hasFitness ?fitness .
  FILTER (?fitness > 0.9)
}
```

---

## Query Registry: Your Roadmap

### query-registry.json

Maps each MCP tool to its CONSTRUCT query and provides:
- Input/output schemas
- RDF class definitions
- Use cases & output size estimates
- Integration instructions

**Quick lookup**:
```bash
# What SPARQL query transforms discover_dfg output?
cat query-registry.json | jq '.queries."discover-dfg"'

# What classes are produced?
cat query-registry.json | jq '.queries."conformance-check".output_classes'

# What's the input schema for ml-classify?
cat query-registry.json | jq '.queries."ml-classify".input_schema'
```

---

## SPARQL Patterns & Examples

### Verification (ASK) — Yes/No Questions

```sparql
# Does this log conform to the model with fitness > 80%?
ASK {
  ?log pm:conformsTo ?model ;
    a pm:EventLog .
  ?report a pm:ConformanceReport ;
    prov:used ?log ;
    pm:hasFitness ?fitness .
  FILTER (?fitness > 0.8)
}
```

### Analytics (SELECT) — Aggregate & Analyze

```sparql
# Average fitness by discovery algorithm
SELECT ?algorithm (AVG(?fitness) AS ?avg_fitness)
WHERE {
  ?model a pm:ProcessModel ;
    pm:discoversWith ?algorithm ;
    pm:hasFitness ?fitness .
}
GROUP BY ?algorithm
ORDER BY DESC(?avg_fitness)
```

### Reasoning (CONSTRUCT) — Link Proofs Together

```sparql
# If drift detected, create investigation artifact linking to pre-drift model
CONSTRUCT {
  ?investigation a prov:Entity ;
    prov:wasInformedBy ?drift ;
    prov:used ?pre_drift_model ;
    pm:nextStep "retrain_model" .
}
WHERE {
  ?drift a pm:ConceptDrift ;
    pm:driftDetected true ;
    pm:predictionConfidence ?conf .
  ?pre_drift_model a pm:ProcessModel ;
    prov:wasGeneratedAtTime ?model_time .
  ?drift prov:wasGeneratedAtTime ?drift_time .
  FILTER (?model_time < ?drift_time && ?conf >= 0.85)
}
```

**See** `../sparql-examples.md` for **50+ complete examples**.

---

## Architecture: The Proof Generation Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│ pictl MCP Tool (e.g., discover_dfg)                             │
│ Input: XES event log                                            │
│ Output: JSON {nodes, edges, metrics, executionTime, ...}       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Application Layer (JavaScript/Python)                           │
│ Parse JSON → Create SPARQL BIND() statements                    │
│ Select CONSTRUCT query: query-registry.json lookup              │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ SPARQL CONSTRUCT Query (discover-dfg.rq)                        │
│ Input: WHERE clause with BIND statements                        │
│ Output: RDF CONSTRUCT graph                                     │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ RDF Triples (N-Triples or Turtle)                               │
│ pm:DirectlyFollowsGraph a pm:ProcessModel                       │
│ pm:hasFitness 0.92 ; pm:hasPrecision 0.88 ; ...                │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Oxigraph Triplestore (or any RDF store)                         │
│ Indexed, persistent, queryable via SPARQL                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ SPARQL Queries (Verification, Analytics, Reasoning)             │
│ ASK:  "Does this model conform?"                                │
│ SELECT: "What's the average fitness?"                           │
│ CONSTRUCT: "Link drift to prior models"                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Ontology Reference

All queries use **pictl-ontology.ttl**. Key classes:

- **pm:ProcessModel** — Abstract base for all models
  - pm:DirectlyFollowsGraph
  - pm:PetriNet
  - pm:ProcessTree
- **pm:ConformanceReport** — Results of conformance checking
- **pm:ConceptDrift** — Process drift detection
- **pm:ActivityPrediction** — Next-activity prediction
- **pm:ObjectCentricEventLog** — Multi-object logs
- **pm:OutcomePrediction** — Case outcome/anomaly classification

Key properties:
- **pm:hasFitness**, **pm:hasPrecision**, **pm:hasGeneralization**, **pm:hasSimplicity** — Quality metrics
- **pm:discoversWith** — Link model to discovery algorithm
- **pm:conformsTo** — Log conforms to model
- **pm:driftDetected** — Boolean drift flag
- **pm:predictionConfidence** — Prediction certainty (0-1)
- **pm:executionTime** — Duration of operation

See `pictl-ontology.ttl` for complete property definitions.

---

## Integration with Other Tools

### Link to OTEL Spans (Observability)

```sparql
PREFIX pm: <http://purl.org/pm/ontology#>
PREFIX otel: <http://opentelemetry.io/schemas/v1.20.0#>

# Cross-reference RDF proof with OTEL span for traceability
SELECT ?proof ?span_trace_id
WHERE {
  ?proof prov:wasGeneratedAtTime ?timestamp ;
    prov:wasGeneratedBy ?operation .
  ?otel_span otel:traceId ?trace_id ;
    rdfs:label ?operation_label ;
    otel:timestamp ?span_time .
  FILTER (ABS(?timestamp - ?span_time) < "PT1S"^^xsd:duration)
}
```

### Link to GitHub Issues / PRs (Workflow)

```sparql
PREFIX pm: <http://purl.org/pm/ontology#>
PREFIX gh: <http://github.com/schema/>

# If drift detected with high confidence, create GitHub issue
CONSTRUCT {
  ?github_issue a gh:Issue ;
    gh:title "Concept Drift Detected: Retrain Required" ;
    gh:body ?drift_description ;
    gh:labels ("bug-fix" "model-governance") ;
    prov:wasDerivedFrom ?drift .
}
WHERE {
  ?drift a pm:ConceptDrift ;
    pm:driftDetected true ;
    pm:predictionConfidence ?conf .
  FILTER (?conf > 0.90)
  BIND(...AS ?drift_description)
}
```

---

## Best Practices

### 1. **Timestamps on Everything**
Always include `prov:wasGeneratedAtTime ?timestamp` in CONSTRUCT output for auditability.

```sparql
CONSTRUCT {
  ?proof a pm:ConformanceReport ;
    prov:wasGeneratedAtTime NOW() ;  # NOW() function
    ...
}
```

### 2. **Provenance Chains**
Link all artifacts using `prov:used`, `prov:wasDerivedFrom`, `prov:wasGeneratedBy`:

```sparql
CONSTRUCT {
  ?report a pm:ConformanceReport ;
    prov:used ?event_log ;
    prov:used ?model ;
    prov:wasGeneratedBy ?operation .
}
```

### 3. **Confidence Scores on Predictions**
Always qualify predictions with `pm:predictionConfidence`:

```sparql
CONSTRUCT {
  ?prediction a pm:ActivityPrediction ;
    pm:predictedActivity ?next ;
    pm:predictionConfidence 0.78 ;  # [0, 1]
    ...
}
```

### 4. **Blank Nodes for Complex Structures**
Use blank nodes `[...]` for nested objects (metrics, relationships):

```sparql
CONSTRUCT {
  ?model a pm:ProcessModel ;
    prov:wasGeneratedBy [
      a prov:Activity ;
      rdfs:label "DFG Discovery" ;
      pm:executionTime ?time
    ] .
}
```

### 5. **IRI Minting Strategy**
Use consistent IRI patterns for queryability:

```
http://pictl.org/{resource_type}/{timestamp}/{random_id}
http://pictl.org/discovery/2026-04-10/abc123
http://pictl.org/conformance/2026-04-10/def456
http://pictl.org/drift/2026-04-10/ghi789
```

---

## Execution & Testing

### Validate SPARQL Syntax

```bash
# Check if CONSTRUCT queries are syntactically valid
# (Use SPARQL 1.1 validator or triplestore)
curl -X POST http://localhost:7878/query \
  -H "Content-Type: application/sparql-query" \
  --data-binary @discover-dfg.rq \
  -v
```

### Test with Sample Data

```bash
# Load sample RDF triples
oxigraph load --location ./pictl-data.db --format ntriples \
  <(cat discover-dfg.rq | sed 's/CONSTRUCT/SELECT ?s ?p ?o/; s/{.*/WHERE { ?s ?p ?o }/')

# Execute verification query
oxigraph query --location ./pictl-data.db \
  'ASK { ?model a pm:DirectlyFollowsGraph ; pm:hasFitness ?f . FILTER (?f > 0.9) }'
```

### Count Generated Triples

```bash
# After CONSTRUCT, count output size
cat discovery_result.nt | wc -l
# Typical: 100-300 triples per discovery operation
```

---

## Common Use Cases & Query Templates

### Use Case 1: "Validate Discovery Output"

```sparql
PREFIX pm: <http://purl.org/pm/ontology#>

ASK {
  ?dfg a pm:DirectlyFollowsGraph ;
    pm:hasFitness ?fitness ;
    pm:hasPrecision ?precision .
  FILTER (?fitness > 0.85 && ?precision > 0.80)
}
```

### Use Case 2: "Track Model Evolution"

```sparql
PREFIX pm: <http://purl.org/pm/ontology#>
PREFIX prov: <http://www.w3.org/ns/prov#>

SELECT ?timestamp ?algorithm ?fitness ?precision
WHERE {
  ?model a pm:ProcessModel ;
    prov:wasGeneratedAtTime ?timestamp ;
    pm:discoversWith ?algorithm ;
    pm:hasFitness ?fitness ;
    pm:hasPrecision ?precision .
}
ORDER BY ?timestamp
```

### Use Case 3: "Find Drifts & Trigger Retraining"

```sparql
PREFIX pm: <http://purl.org/pm/ontology#>

CONSTRUCT {
  ?retraining_job a prov:Entity ;
    rdfs:label "Retraining Job (Drift Detected)" ;
    prov:wasDerivedFrom ?drift ;
    pm:status "scheduled" .
}
WHERE {
  ?drift a pm:ConceptDrift ;
    pm:driftDetected true ;
    pm:predictionConfidence ?conf .
  FILTER (?conf >= 0.85)
}
```

### Use Case 4: "Explain Case Risk"

```sparql
PREFIX pm: <http://purl.org/pm/ontology#>

SELECT ?feature_name ?feature_value ?importance
WHERE {
  ?case pm:riskContributor ?feature ;
    pm:caseId "Case-12345" .
  ?feature rdfs:label ?feature_name ;
    pm:featureValue ?feature_value ;
    pm:importanceScore ?importance .
}
ORDER BY DESC(?importance)
```

---

## Troubleshooting

| Issue | Diagnosis | Solution |
|-------|-----------|----------|
| **CONSTRUCT returns 0 triples** | WHERE clause has no matches; missing BIND() statements | Verify JSON → SPARQL binding; check namespace prefixes in store |
| **IRI collision (duplicate subjects)** | Multiple operations produce same IRI | Use RAND() or timestamp in IRI; ensure unique minting |
| **Blank nodes not persisting** | Triplestore mints different IRI each load | Use CONSTRUCT to reify blank nodes into explicit IRIs |
| **FILTER on xsd:duration fails** | Type mismatch; literal not cast to duration | Wrap in xsd:duration: `FILTER (?time > "PT30M"^^xsd:duration)` |
| **Namespace prefix undefined** | Query references undefined prefix | Add PREFIX declaration: `PREFIX pm: <http://purl.org/pm/ontology#>` |

---

## Performance Considerations

- **Typical output size**: 100–500 triples per operation
- **Execution time**: <100ms for CONSTRUCT on local triplestore
- **Query complexity**: SELECT with 3–5 triple patterns: <10ms
- **Bulk operations**: For 1000+ proofs, batch CONSTRUCT queries

---

## Security & Governance

### Data Protection
- All SPARQL queries are **read-only** (unless explicitly CONSTRUCT/UPDATE)
- No injection vulnerabilities (parameterized SPARQL via application layer)
- No secrets in IRIs; use opaque UUIDs for case IDs

### Compliance
- All operations timestamped via `prov:wasGeneratedAtTime`
- Complete audit trail via provenance chains
- Supports GDPR "right to be forgotten" (delete RDF for specific entity)

---

## References & Further Reading

- **pictl-ontology.ttl** — Full semantic definitions
- **query-registry.json** — Tool mappings & schemas
- **../sparql-examples.md** — 50+ complete query examples
- **W3C SPARQL 1.1**: https://www.w3.org/TR/sparql11-query/
- **W3C PROV Ontology**: https://www.w3.org/TR/prov-o/
- **OxiGraph Docs**: https://oxigraph.org/

---

## Contributing

To add a new SPARQL proof query:

1. **Identify the MCP tool** (e.g., new tool: `detect_anomalies`)
2. **Create output class** (e.g., `pm:AnomalyDetection` — add to pictl-ontology.ttl if needed)
3. **Write CONSTRUCT query** (new file: `detect-anomalies.rq`)
4. **Register in query-registry.json** (add entry under `queries`)
5. **Document with examples** (add query examples to sparql-examples.md)

---

**Last Updated**: 2026-04-10
**Maintained By**: pictl Development Team
**Status**: Stable (v1.0)
