# pictl Semantic Conventions Index

> **Complete RDF/SPARQL ecosystem for process mining proofs**  
> **Version**: 1.0 | **Status**: Production-Ready | **Date**: 2026-04-10

---

## File Map

### Core Ontology & Validation

| File | Purpose | Read First? |
|------|---------|-----------|
| **pictl-ontology.ttl** | RDF class/property definitions (pm: namespace) | YES (reference) |
| **pictl-shapes.ttl** | SHACL validation constraints | Validation-aware code |
| **pictl-process-mining.yaml** | OpenTelemetry semantic conventions | OTEL integration |

### SPARQL Proof Engine

#### Directory: `/sparql-proofs/`

| File | Purpose | Audience |
|------|---------|----------|
| **discover-dfg.rq** | CONSTRUCT: DFG discovery JSON → pm:DirectlyFollowsGraph RDF | Developers |
| **conformance-check.rq** | CONSTRUCT: Conformance metrics → pm:ConformanceReport RDF | Developers |
| **detect-drift.rq** | CONSTRUCT: Drift detection → pm:ConceptDrift RDF | Developers |
| **predict-activity.rq** | CONSTRUCT: Activity prediction → pm:ActivityPrediction RDF | Developers |
| **ocel-load.rq** | CONSTRUCT: OCEL loading → pm:ObjectCentricEventLog RDF | Developers |
| **ml-classify.rq** | CONSTRUCT: ML classification → pm:OutcomePrediction RDF | Developers |
| **query-registry.json** | Central registry: tool→query mappings + schemas | Integrators |
| **README.md** | Full technical guide (architecture, patterns, integration) | Getting Started |
| **QUICK-REFERENCE.md** | Developer cheat sheet (pipelines, queries, filters) | Daily Use |

### SPARQL Query Examples (Main Directory)

| File | Purpose | Contains |
|------|---------|----------|
| **sparql-examples.md** | 50+ complete SPARQL examples | ASK (5), SELECT (6), CONSTRUCT (5), workflows, governance |

---

## Quick Navigation

### I Want To...

**Understand the big picture**
→ Start here: [sparql-proofs/README.md](./sparql-proofs/README.md) (5 min read)

**Get started quickly**
→ [sparql-proofs/QUICK-REFERENCE.md](./sparql-proofs/QUICK-REFERENCE.md) (cheat sheet)

**See working SPARQL examples**
→ [sparql-examples.md](./sparql-examples.md) (50+ patterns)

**Map MCP tools to SPARQL queries**
→ [sparql-proofs/query-registry.json](./sparql-proofs/query-registry.json)

**Understand RDF classes & properties**
→ [pictl-ontology.ttl](./pictl-ontology.ttl) (reference)

**Validate RDF output against constraints**
→ [pictl-shapes.ttl](./pictl-shapes.ttl)

**Integrate OTEL tracing**
→ [pictl-process-mining.yaml](./pictl-process-mining.yaml)

---

## Architecture Overview

```
pictl MCP Tool            JSON Result              SPARQL CONSTRUCT      RDF Triples
(discover_dfg)      →    {nodes, edges,    →    discover-dfg.rq   →   pm:DirectlyFollowsGraph
                         fitness: 0.92}                                 pm:hasFitness 0.92
                                                                        pm:hasPrecision 0.88
                                                                        (150-200 triples)

                                                                                  ↓
                                                                            Oxigraph
                                                                          (Triplestore)
                                                                                  ↓
                     SPARQL Queries (Verification, Analytics, Reasoning)
                     ASK "Does fitness > 90%?"
                     SELECT "Average fitness by algorithm?"
                     CONSTRUCT "Link to prior models"
```

---

## Five-Step Integration Pipeline

1. **Call MCP Tool** (pictl)
   - Input: XES event log
   - Output: JSON {nodes, edges, metrics, executionTime, ...}

2. **Look Up Query** (query-registry.json)
   - Find: tool → CONSTRUCT query mapping

3. **Bind JSON to SPARQL**
   - Parse JSON
   - Create SPARQL BIND() statements
   - Inject into WHERE clause

4. **Execute CONSTRUCT**
   - Run CONSTRUCT query
   - Output: RDF triples (N-Triples or Turtle)

5. **Load & Query**
   - Store in Oxigraph
   - Run SPARQL queries (ASK/SELECT/CONSTRUCT)
   - Automate workflows based on results

---

## MCP Tools → SPARQL Queries Mapping

| MCP Tool | CONSTRUCT Query | Output RDF Class | Use Case |
|----------|-----------------|------------------|----------|
| `discover_dfg` | discover-dfg.rq | pm:DirectlyFollowsGraph | Fast, lossless process discovery |
| `check_conformance` | conformance-check.rq | pm:ConformanceReport | Verify log-to-model alignment |
| `detect_concept_drift` | detect-drift.rq | pm:ConceptDrift | Monitor process changes |
| `predict_activity_next` | predict-activity.rq | pm:ActivityPrediction | Case-level activity prediction |
| `load_ocel` | ocel-load.rq | pm:ObjectCentricEventLog | Multi-object process modeling |
| `classify_case` | ml-classify.rq | pm:OutcomePrediction | Case risk/outcome classification |

---

## SPARQL Query Patterns (Cheat Sheet)

### Verification (ASK) — Yes/No Questions

```sparql
# Does this model conform with fitness > 80%?
ASK {
  ?log pm:conformsTo ?model ;
    a pm:EventLog .
  ?report a pm:ConformanceReport ;
    prov:used ?log ;
    pm:hasFitness ?fitness .
  FILTER (?fitness > 0.8)
}
```

### Analytics (SELECT) — Aggregate Data

```sparql
# Average fitness by algorithm
SELECT ?algorithm (AVG(?fitness) AS ?avg)
WHERE {
  ?model pm:discoversWith ?algorithm ;
    pm:hasFitness ?fitness .
}
GROUP BY ?algorithm
ORDER BY DESC(?avg)
```

### Reasoning (CONSTRUCT) — Link Proofs

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

## Ontology Reference (Key Classes)

### Model Classes

- **pm:ProcessModel** — Abstract base
  - pm:DirectlyFollowsGraph
  - pm:PetriNet
  - pm:ProcessTree

### Analysis Classes

- **pm:ConformanceReport** — Log-to-model alignment
- **pm:ConceptDrift** — Process behavior changes
- **pm:Bottleneck** — Performance problems
- **pm:ObjectCentricEventLog** — Multi-object logs

### Prediction Classes

- **pm:ActivityPrediction** — Next activity
- **pm:DurationPrediction** — Remaining time
- **pm:OutcomePrediction** — Case outcome
- **pm:AnomalyDetection** — Unusual behavior

---

## Key Properties

| Property | Type | Example |
|----------|------|---------|
| pm:hasFitness | xsd:double | 0.92 |
| pm:hasPrecision | xsd:double | 0.88 |
| pm:predictionConfidence | xsd:double | 0.78 |
| pm:driftDetected | xsd:boolean | true |
| pm:executionTime | xsd:duration | PT5S |
| pm:discoversWith | URI | pm:DFGDiscovery |
| pm:conformsTo | URI | (model IRI) |
| prov:wasGeneratedAtTime | xsd:dateTime | 2026-04-10T22:30Z |
| prov:used | URI | (input resource) |
| prov:wasDerivedFrom | URI | (source artifact) |

---

## Getting Started Checklist

- [ ] Read [sparql-proofs/README.md](./sparql-proofs/README.md) (architecture & integration)
- [ ] Review [sparql-proofs/QUICK-REFERENCE.md](./sparql-proofs/QUICK-REFERENCE.md) (quick start)
- [ ] Check [query-registry.json](./sparql-proofs/query-registry.json) (tool mappings)
- [ ] Study [sparql-examples.md](./sparql-examples.md) (working queries)
- [ ] Reference [pictl-ontology.ttl](./pictl-ontology.ttl) (class definitions)
- [ ] Implement JSON→SPARQL binding in your app
- [ ] Deploy Oxigraph or Jena triplestore
- [ ] Load pictl-ontology.ttl
- [ ] Execute your first CONSTRUCT query
- [ ] Run ASK/SELECT queries

---

## Common Use Cases

### Use Case 1: Validate Discovery Results

```sparql
ASK {
  ?dfg a pm:DirectlyFollowsGraph ;
    pm:hasFitness ?fitness ;
    pm:hasPrecision ?precision .
  FILTER (?fitness > 0.85 && ?precision > 0.80)
}
```
→ See [sparql-examples.md](./sparql-examples.md#ask-1)

### Use Case 2: Track Model Evolution

```sparql
SELECT ?timestamp ?algorithm ?fitness
WHERE {
  ?model a pm:ProcessModel ;
    prov:wasGeneratedAtTime ?timestamp ;
    pm:discoversWith ?algorithm ;
    pm:hasFitness ?fitness .
}
ORDER BY ?timestamp
```
→ See [sparql-examples.md](./sparql-examples.md#select-1)

### Use Case 3: Detect & Respond to Drift

```sparql
CONSTRUCT {
  ?retraining a prov:Entity ;
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
→ See [sparql-examples.md](./sparql-examples.md#construct-1)

---

## Documentation Structure

```
pictl/semconv/
├── INDEX.md (this file)
├── pictl-ontology.ttl              ← RDF definitions
├── pictl-shapes.ttl                ← SHACL validation
├── pictl-process-mining.yaml       ← OTEL semconv
├── sparql-examples.md              ← 50+ query examples
│
└── sparql-proofs/
    ├── README.md                   ← Full technical guide
    ├── QUICK-REFERENCE.md          ← Developer cheat sheet
    ├── discover-dfg.rq             ← 6 CONSTRUCT queries
    ├── conformance-check.rq
    ├── detect-drift.rq
    ├── predict-activity.rq
    ├── ocel-load.rq
    ├── ml-classify.rq
    └── query-registry.json         ← Central registry
```

---

## Troubleshooting

**Q: CONSTRUCT returns 0 triples**
A: Check WHERE clause matching. Verify JSON→SPARQL BIND() statements. Check namespace prefixes.
→ See [README.md#troubleshooting](./sparql-proofs/README.md#troubleshooting)

**Q: How do I map a new MCP tool?**
A: Create new .rq file, register in query-registry.json, add examples to sparql-examples.md.
→ See [README.md#contributing](./sparql-proofs/README.md#contributing)

**Q: Which triplestore should I use?**
A: Oxigraph (fast, SPARQL 1.1, WASM-friendly) or Apache Jena (mature, REST API).

**Q: How do I integrate OTEL tracing?**
A: Link RDF proof timestamps to OTEL span timestamps. See integration section in examples.md.

---

## References

- **W3C SPARQL 1.1**: https://www.w3.org/TR/sparql11-query/
- **W3C PROV Ontology**: https://www.w3.org/TR/prov-o/
- **Oxigraph**: https://oxigraph.org/
- **pictl MCP Server**: ./wasm4pm/MCP.md

---

## Support

- **Full Guide**: [sparql-proofs/README.md](./sparql-proofs/README.md)
- **Quick Start**: [sparql-proofs/QUICK-REFERENCE.md](./sparql-proofs/QUICK-REFERENCE.md)
- **Examples**: [sparql-examples.md](./sparql-examples.md)
- **Schemas**: [query-registry.json](./sparql-proofs/query-registry.json)

---

**Version**: 1.0  
**Status**: Production-Ready ✓  
**Last Updated**: 2026-04-10  
**Maintainer**: pictl Development Team
