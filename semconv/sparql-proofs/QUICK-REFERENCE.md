# SPARQL Proof Engine — Quick Reference Card

**Location**: `/Users/sac/chatmangpt/pictl/semconv/sparql-proofs/`  
**Version**: 1.0 | **Status**: Production  
**What**: Convert pictl MCP tool outputs (JSON) → RDF triples (SPARQL CONSTRUCT)  
**Why**: Make process mining results queryable, reasonably sound, and governed with provenance.

---

## File Inventory (7 files)

| File | Type | Purpose |
|------|------|---------|
| `discover-dfg.rq` | SPARQL CONSTRUCT | discover_dfg JSON → pm:DirectlyFollowsGraph RDF |
| `conformance-check.rq` | SPARQL CONSTRUCT | check_conformance JSON → pm:ConformanceReport RDF |
| `detect-drift.rq` | SPARQL CONSTRUCT | detect_concept_drift JSON → pm:ConceptDrift RDF |
| `predict-activity.rq` | SPARQL CONSTRUCT | predict_activity_next JSON → pm:ActivityPrediction RDF |
| `ocel-load.rq` | SPARQL CONSTRUCT | load_ocel JSON → pm:ObjectCentricEventLog RDF |
| `ml-classify.rq` | SPARQL CONSTRUCT | classify_case JSON → pm:OutcomePrediction RDF |
| `query-registry.json` | JSON Registry | Central map: MCP tools → SPARQL queries + schemas |

**Plus Documentation**:
- `README.md` — Full guide (architecture, patterns, integration)
- `../sparql-examples.md` — 50+ SPARQL examples (ASK, SELECT, CONSTRUCT)
- `QUICK-REFERENCE.md` — This file

---

## The Pipeline (5 Steps)

```
JSON Result          →  SPARQL BIND()      →  CONSTRUCT Query  →  RDF Triples  →  Triplestore
discover_dfg()          {nodes: [...]}        discover-dfg.rq       pm:DirectlyFollowsGraph   Oxigraph
returns JSON                                  (WHERE clause)        (Turtle/N-Triples)
```

### Step-by-Step

```javascript
// 1. Call MCP Tool
const result = await mcp.call('discover_dfg', { xes_content });
// Returns: {nodes: [...], edges: [...], metrics: {...}, fitness: 0.92, ...}

// 2. Look up Query in Registry
const query_file = require('query-registry.json').queries['discover-dfg'].file;
// 'discover-dfg.rq'

// 3. Parse JSON → Create SPARQL BIND Statements
const where_clause = `
  BIND(${result.fitness} AS ?fitness)
  BIND(${result.precision} AS ?precision)
  BIND("${result.executionTime}" AS ?execution_time)
  ...
`;

// 4. Execute CONSTRUCT (app inserts BIND into WHERE clause)
const sparql = readFile('discover-dfg.rq')
  .replace(/WHERE \{/, `WHERE { ${where_clause}`)
const rdf = await sparqlEndpoint.construct(sparql);
// Returns: RDF triples as N-Triples or Turtle

// 5. Load into Triplestore
await oxigraph.load(rdf);
// Triples now searchable via SPARQL
```

---

## Query Patterns (Cheat Sheet)

### Verification (ASK — True/False)

```sparql
# Does this model conform?
ASK {
  ?log pm:conformsTo ?model ;
    a pm:EventLog .
  FILTER (?model_fitness > 0.80)
}
```

### Analytics (SELECT — Aggregate)

```sparql
# Average fitness by algorithm
SELECT ?algorithm (AVG(?fitness) AS ?avg)
WHERE {
  ?model pm:discoversWith ?algorithm ;
    pm:hasFitness ?fitness .
}
GROUP BY ?algorithm
```

### Reasoning (CONSTRUCT — Link Proofs)

```sparql
# If drift detected, create investigation
CONSTRUCT {
  ?investigation prov:wasDerivedFrom ?drift ;
    prov:used ?pre_drift_model ;
    pm:nextStep "retrain" .
}
WHERE {
  ?drift a pm:ConceptDrift ;
    pm:driftDetected true .
}
```

---

## Namespace Prefix (Always Use)

```sparql
PREFIX pm: <http://purl.org/pm/ontology#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
```

---

## Key RDF Classes Produced

| Class | From Tool | Represents |
|-------|-----------|-----------|
| **pm:DirectlyFollowsGraph** | discover_dfg | Process model (activities + edges) |
| **pm:ConformanceReport** | check_conformance | Conformance metrics + deviations |
| **pm:ConceptDrift** | detect_concept_drift | Drift with before/after snapshots |
| **pm:ActivityPrediction** | predict_activity_next | Next-activity prediction + top-k |
| **pm:ObjectCentricEventLog** | load_ocel | OCEL structure + object relationships |
| **pm:OutcomePrediction** | classify_case | Case classification + feature importance |

---

## Key RDF Properties

| Property | Type | Example |
|----------|------|---------|
| **pm:hasFitness** | xsd:double | 0.92 |
| **pm:hasPrecision** | xsd:double | 0.88 |
| **pm:predictionConfidence** | xsd:double | 0.78 |
| **pm:driftDetected** | xsd:boolean | true |
| **pm:executionTime** | xsd:duration | PT5.2S |
| **pm:eventCount** | xsd:integer | 45000 |
| **pm:discoversWith** | URI | pm:DFGDiscovery |
| **pm:conformsTo** | URI | (model IRI) |
| **prov:wasGeneratedAtTime** | xsd:dateTime | 2026-04-10T22:30:00Z |

---

## Common Filters

```sparql
# Numeric
FILTER (?fitness > 0.80 && ?fitness <= 1.0)

# String
FILTER (CONTAINS(?name, "Review"))

# Duration
FILTER (?duration > "PT30M"^^xsd:duration)

# Timestamp
FILTER (?timestamp > "2026-04-01"^^xsd:date)

# Boolean
FILTER (?drift_detected = true)

# In list
FILTER (?deviation_type IN ("missing", "wrong_order"))
```

---

## Diagnostic Queries (Copy-Paste)

### "How many models have fitness > 90%?"

```sparql
SELECT (COUNT(?model) AS ?count)
WHERE {
  ?model a pm:ProcessModel ;
    pm:hasFitness ?fitness .
  FILTER (?fitness > 0.90)
}
```

### "What's the average execution time for DFG?"

```sparql
SELECT (AVG(STRDATETIME(?duration)) AS ?avg_time)
WHERE {
  ?model pm:discoversWith pm:DFGDiscovery ;
    pm:executionTime ?duration .
}
```

### "List all detected drifts with confidence ≥ 85%"

```sparql
SELECT ?timestamp ?change_point ?confidence
WHERE {
  ?drift a pm:ConceptDrift ;
    pm:driftDetected true ;
    pm:predictionConfidence ?confidence ;
    pm:changePoint ?change_point ;
    prov:wasGeneratedAtTime ?timestamp .
  FILTER (?confidence >= 0.85)
}
ORDER BY DESC(?confidence)
```

### "Which cases are flagged as high-risk anomalies?"

```sparql
SELECT ?case_id ?prediction_confidence
WHERE {
  ?classification a pm:OutcomePrediction ;
    pm:predictedOutcome "high_risk" ;
    pm:predictionConfidence ?prediction_confidence ;
    prov:describes ?case .
  ?case rdfs:label ?case_id .
}
LIMIT 20
```

---

## Integration Checklist

- [ ] Read `query-registry.json` to understand tool→query mapping
- [ ] Review `README.md` for architecture & best practices
- [ ] Test one CONSTRUCT query locally (e.g., `discover-dfg.rq`)
- [ ] Set up Oxigraph or equivalent triplestore
- [ ] Create JSON→SPARQL binding logic in application
- [ ] Load RDF output into triplestore
- [ ] Run verification ASK queries (see `../sparql-examples.md`)
- [ ] Set up automated governance (e.g., "if drift → create GitHub issue")

---

## Common Pitfalls & Fixes

| Problem | Cause | Fix |
|---------|-------|-----|
| "0 triples generated" | WHERE clause doesn't match | Verify BIND statements; check namespace prefixes |
| "Blank nodes are ephemeral" | RDF store generates new IRI on reload | Use CONSTRUCT to reify to explicit IRIs |
| "Type mismatch in FILTER" | Literal vs typed value | Cast: `FILTER (?time > "PT30M"^^xsd:duration)` |
| "IRI collision (duplicates)" | Same IRI minted twice | Use RAND() + timestamp in IRI pattern |
| "Can't query results" | Forgot to load RDF into store | Run: `oxigraph load --location db discovery.nt` |

---

## File Locations

```
/Users/sac/chatmangpt/pictl/semconv/
├── sparql-proofs/
│   ├── discover-dfg.rq               ← DFG discovery
│   ├── conformance-check.rq          ← Conformance analysis
│   ├── detect-drift.rq               ← Drift detection
│   ├── predict-activity.rq           ← Activity prediction
│   ├── ocel-load.rq                  ← OCEL loading
│   ├── ml-classify.rq                ← ML classification
│   ├── query-registry.json           ← Central registry
│   ├── README.md                     ← Full guide
│   ├── QUICK-REFERENCE.md            ← This file
│   └── ../sparql-examples.md         ← 50+ examples
│
├── pictl-ontology.ttl                ← Semantic definitions
├── pictl-shapes.ttl                  ← SHACL validation
└── pictl-process-mining.yaml         ← OTel semconv defs
```

---

## Further Reading

1. **README.md** — Architecture, best practices, troubleshooting
2. **../sparql-examples.md** — Complete query patterns (ASK, SELECT, CONSTRUCT)
3. **query-registry.json** — Tool mappings, schemas, integration guide
4. **pictl-ontology.ttl** — Full RDF class/property definitions

---

## Support

**Questions?**
- Check `README.md` → Troubleshooting section
- Review `../sparql-examples.md` → Find similar query
- Inspect `query-registry.json` → See input/output schemas

**Report Issues**:
- Syntax errors in SPARQL → Validate with SPARQL 1.1 validator
- Ontology gaps → Add class/property to `pictl-ontology.ttl`
- New MCP tools → Add CONSTRUCT query + register in `query-registry.json`

---

**Last Updated**: 2026-04-10 | **Version**: 1.0 | **Stable**
