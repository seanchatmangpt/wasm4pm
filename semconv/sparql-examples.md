# SPARQL Query Examples for pictl RDF Proofs

> **Purpose**: Demonstrate SPARQL patterns for querying pictl proof artifacts stored as RDF triples.
> **Audience**: Process mining analysts, data engineers, semantic reasoning developers.
> **Ontology**: `pictl-ontology.ttl` (pm: = http://purl.org/pm/ontology#)

---

## Overview: Three Query Classes

### 1. **Verification Queries (ASK)**
Answer yes/no questions: "Does this model conform?" "Is drift detected?"

### 2. **Analytics Queries (SELECT)**
Aggregate and analyze results: "What's the average fitness?" "Which activities are bottlenecks?"

### 3. **Chaining Queries (CONSTRUCT)**
Combine multiple proof artifacts: "If drift detected, which algorithms were used before?"

---

## 1. Verification Queries (ASK)

### ASK 1: Does This Log Conform to the Model?

```sparql
PREFIX pm: <http://purl.org/pm/ontology#>
PREFIX prov: <http://www.w3.org/ns/prov#>

ASK {
  ?log pm:conformsTo ?model .
  ?log a pm:EventLog .
  ?model a pm:ProcessModel .
  ?report a pm:ConformanceReport ;
    prov:used ?log ;
    prov:used ?model ;
    pm:hasFitness ?fitness .
  FILTER (?fitness > 0.8)
}
```

**Answer**: Returns `true` if the log conforms to the model with fitness > 80%.

**Use Case**: Pre-processing check before applying more expensive algorithms.

---

### ASK 2: Has Concept Drift Been Detected?

```sparql
PREFIX pm: <http://purl.org/pm/ontology#>

ASK {
  ?drift a pm:ConceptDrift ;
    pm:driftDetected true ;
    pm:predictionConfidence ?confidence .
  FILTER (?confidence >= 0.85)
}
```

**Answer**: Returns `true` if drift was detected with high confidence (≥85%).

**Use Case**: Trigger model retraining pipeline when drift is confirmed.

---

### ASK 3: Did DFG Discovery Complete Without Warnings?

```sparql
PREFIX pm: <http://purl.org/pm/ontology#>
PREFIX prov: <http://www.w3.org/ns/prov#>

ASK {
  ?discovery a pm:DirectlyFollowsGraph ;
    pm:discoversWith pm:DFGDiscovery ;
    pm:executionTime ?time ;
    prov:wasGeneratedAtTime ?timestamp .
  ?quality a prov:Report ;
    prov:wasDerivedFrom ?discovery ;
    pm:hasFitness ?fitness ;
    pm:hasPrecision ?precision .
  FILTER (?fitness > 0.9 && ?precision > 0.9)
}
```

**Answer**: Returns `true` if DFG discovery completed with high quality (fitness & precision > 90%).

**Use Case**: Confidence assertion for automated model deployment.

---

### ASK 4: Is This Activity a Bottleneck?

```sparql
PREFIX pm: <http://purl.org/pm/ontology#>

ASK {
  ?activity a pm:Activity ;
    rdfs:label "Review Application" .
  ?bottleneck a pm:Bottleneck ;
    prov:describes ?activity ;
    pm:averageDuration ?avg_duration ;
    pm:frequency ?freq .
  FILTER (?avg_duration > "PT1H"^^xsd:duration && ?freq > 0.75)
}
```

**Answer**: Returns `true` if "Review Application" is a bottleneck (long duration, high frequency).

**Use Case**: Prioritize process optimization efforts.

---

### ASK 5: Does This Case Have High Anomaly Risk?

```sparql
PREFIX pm: <http://purl.org/pm/ontology#>

ASK {
  ?classification a pm:AnomalyDetection ;
    pm:predictedOutcome "high_risk" ;
    pm:predictionConfidence ?conf ;
    prov:describes ?case .
  ?case a pm:Case ;
    rdfs:label "Case 98765" .
  FILTER (?conf > 0.85)
}
```

**Answer**: Returns `true` if the case is flagged as high-risk anomaly with >85% confidence.

**Use Case**: Trigger case escalation or intervention workflows.

---

## 2. Analytics Queries (SELECT)

### SELECT 1: Average Fitness Across All Discovered Models

```sparql
PREFIX pm: <http://purl.org/pm/ontology#>
PREFIX prov: <http://www.w3.org/ns/prov#>

SELECT ?algorithm (AVG(?fitness) AS ?avg_fitness) (COUNT(?model) AS ?model_count)
WHERE {
  ?model a pm:ProcessModel ;
    pm:discoversWith ?algorithm ;
    pm:hasFitness ?fitness .
}
GROUP BY ?algorithm
ORDER BY DESC(?avg_fitness)
```

**Output**:
```
algorithm                  | avg_fitness | model_count
pm:DFGDiscovery           | 0.92        | 15
pm:HeuristicMinerDiscovery| 0.88        | 10
pm:AlphaPlusPlusDiscovery | 0.85        | 8
```

**Use Case**: Compare algorithm quality across historical runs.

---

### SELECT 2: Bottleneck Activities Ranked by Impact

```sparql
PREFIX pm: <http://purl.org/pm/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?activity_name 
       ?avg_duration 
       ?frequency 
       ?impact_score
WHERE {
  ?activity a pm:Activity ;
    rdfs:label ?activity_name .
  ?bottleneck a pm:Bottleneck ;
    prov:describes ?activity ;
    pm:averageDuration ?avg_duration ;
    pm:frequency ?frequency ;
    pm:impactScore ?impact_score .
}
ORDER BY DESC(?impact_score)
LIMIT 10
```

**Output**:
```
activity_name           | avg_duration  | frequency | impact_score
Review Application      | PT45M         | 0.95      | 42.75
Approval Sign-off       | PT2H30M       | 0.87      | 37.50
Compliance Check        | PT1H15M       | 0.72      | 18.45
...
```

**Use Case**: Identify top improvement opportunities for process optimization.

---

### SELECT 3: All Deviations in Non-Conforming Traces

```sparql
PREFIX pm: <http://purl.org/pm/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?case_id ?deviation_type ?activity_sequence ?position
WHERE {
  ?deviation a pm:Deviation ;
    pm:caseId ?case_id ;
    pm:deviationType ?deviation_type ;
    pm:traceVariant ?activity_sequence ;
    pm:position ?position .
  ?report a pm:ConformanceReport ;
    prov:mentions ?deviation .
  FILTER (?deviation_type IN ("missing_activity", "wrong_order"))
}
ORDER BY ?case_id
LIMIT 50
```

**Output**:
```
case_id  | deviation_type  | activity_sequence       | position
Case-101 | missing_activity | [A, C, E]             | 2
Case-102 | wrong_order     | [A, B, D, C]            | 3
Case-103 | missing_activity | [A, B, E]              | 3
...
```

**Use Case**: Root-cause analysis of trace deviations; identify systematic process violations.

---

### SELECT 4: Timeline of Drift Events

```sparql
PREFIX pm: <http://purl.org/pm/ontology#>
PREFIX prov: <http://www.w3.org/ns/prov#>

SELECT ?timestamp ?change_point ?confidence ?drift_type ?before_activity ?after_activity
WHERE {
  ?drift a pm:ConceptDrift ;
    pm:driftDetected true ;
    pm:changePoint ?change_point ;
    pm:predictionConfidence ?confidence ;
    pm:driftType ?drift_type ;
    prov:wasGeneratedAtTime ?timestamp ;
    prov:mentions ?before_metrics ;
    prov:mentions ?after_metrics .
  ?before_metrics rdfs:label "Pre-Drift Metrics" ;
    pm:dominantActivity ?before_activity .
  ?after_metrics rdfs:label "Post-Drift Metrics" ;
    pm:dominantActivity ?after_activity .
}
ORDER BY ?timestamp
```

**Output**:
```
timestamp           | change_point | confidence | drift_type | before_activity    | after_activity
2026-02-15T10:00Z  | 500          | 0.87       | gradual    | CreateOrder        | ReviewOrder
2026-03-22T14:30Z  | 1200         | 0.92       | abrupt     | ApprovalSignoff    | DirectRelease
...
```

**Use Case**: Track process evolution; identify when and why the process changed.

---

### SELECT 5: Prediction Accuracy by Case Risk Level

```sparql
PREFIX pm: <http://purl.org/pm/ontology#>
PREFIX prov: <http://www.w3.org/ns/prov#>

SELECT ?risk_level 
       (AVG(?prediction_conf) AS ?avg_confidence) 
       (COUNT(?prediction) AS ?prediction_count)
WHERE {
  ?case a pm:Case ;
    pm:riskLevel ?risk_level .
  ?prediction a pm:ActivityPrediction ;
    prov:describes ?case ;
    pm:predictionConfidence ?prediction_conf .
}
GROUP BY ?risk_level
ORDER BY ?avg_confidence DESC
```

**Output**:
```
risk_level | avg_confidence | prediction_count
low        | 0.91           | 450
medium     | 0.78           | 220
high       | 0.62           | 85
```

**Use Case**: Understand prediction model performance variability by case characteristics.

---

### SELECT 6: Object-Centric Relationships in OCEL

```sparql
PREFIX pm: <http://purl.org/pm/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?type1 ?type2 ?relation_type ?strength ?frequency
WHERE {
  ?rel a rdf:Statement ;
    rdf:subject ?obj_type1 ;
    rdf:predicate pm:relatesTo ;
    rdf:object ?obj_type2 ;
    pm:relationType ?relation_type ;
    pm:relationStrength ?strength ;
    pm:frequency ?frequency .
  ?obj_type1 rdfs:label ?type1 .
  ?obj_type2 rdfs:label ?type2 .
}
ORDER BY DESC(?strength)
```

**Output**:
```
type1   | type2   | relation_type | strength | frequency
Order   | Invoice | one-to-many   | 0.92     | 1200
Invoice | Payment | one-to-one    | 0.88     | 1145
Order   | Payment | many-to-many  | 0.76     | 980
```

**Use Case**: Understand object interaction patterns in multi-object processes.

---

## 3. Chaining Queries (CONSTRUCT & Complex Reasoning)

### CONSTRUCT 1: Combine Drift Detection with Preceding Algorithm Results

```sparql
PREFIX pm: <http://purl.org/pm/ontology#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

# Goal: If drift detected, create a new proof artifact linking to the model 
# that was used for discovery BEFORE drift occurred

CONSTRUCT {
  ?investigation a prov:Entity ;
    rdfs:label "Drift-Triggered Investigation" ;
    prov:wasInformedBy ?drift ;
    prov:used ?pre_drift_model ;
    prov:mentions ?retraining_recommendation ;
    pm:nextStep "retrain_model" .
}
WHERE {
  ?drift a pm:ConceptDrift ;
    pm:driftDetected true ;
    pm:predictionConfidence ?conf ;
    pm:changePoint ?cp .
  
  # Find the model that existed before drift
  ?pre_drift_model a pm:ProcessModel ;
    prov:wasGeneratedAtTime ?model_time ;
    pm:discoversWith ?algorithm .
  
  ?drift prov:wasGeneratedAtTime ?drift_time .
  
  # Ensure model was created before drift detection
  FILTER (?model_time < ?drift_time && ?conf >= 0.85)
  
  # Create recommendation artifact
  BIND(IRI(CONCAT("http://pictl.org/recommendation/", RAND())) AS ?retraining_recommendation)
}
```

**Output**: New RDF describing investigation linking drift event to prior model + retraining recommendation.

**Use Case**: Automated workflow trigger for model refresh after drift confirmation.

---

### CONSTRUCT 2: Feature Importance Propagation to Cases

```sparql
PREFIX pm: <http://purl.org/pm/ontology#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

# Goal: For all cases classified as high-risk, annotate with the top-3 
# contributing features and their importance scores

CONSTRUCT {
  ?case prov:wasInfluencedBy ?feature ;
    pm:riskContributor ?feature ;
    pm:riskContributionScore ?importance ;
    rdfs:comment ?feature_insight .
}
WHERE {
  ?classification a pm:OutcomePrediction ;
    pm:predictedOutcome "high_risk" ;
    pm:predictionConfidence ?conf ;
    prov:describes ?case .
  
  ?feature a rdf:Property ;
    pm:importanceScore ?importance ;
    rdfs:label ?feature_label ;
    pm:featureValue ?feature_value ;
    pm:impactDirection ?direction .
  
  FILTER (?conf > 0.80 && ?importance > 0.15)
  
  BIND(CONCAT("Feature ", ?feature_label, " contributes ", 
    STR(?importance), " risk (", ?direction, ")") 
    AS ?feature_insight)
}
LIMIT 100
```

**Output**: Enhanced case RDF with feature attributions for explainability.

**Use Case**: Case-level explainability; support intervention design.

---

### CONSTRUCT 3: Trace-Conformance-to-Optimization Workflow

```sparql
PREFIX pm: <http://purl.org/pm/ontology#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

# Goal: Link conformance deviations → bottleneck detection → optimization recommendations

CONSTRUCT {
  ?optimization_target a prov:Entity ;
    rdfs:label ?target_label ;
    prov:wasInformedBy ?deviation ;
    prov:wasInformedBy ?bottleneck ;
    pm:optimizationPriority ?priority ;
    pm:estimatedImpact ?impact ;
    rdfs:comment ?recommendation .
}
WHERE {
  # Start with non-conforming deviation
  ?deviation a pm:Deviation ;
    pm:deviationType ?dev_type ;
    prov:describes ?activity ;
    pm:position ?position .
  
  # Is that activity a bottleneck?
  ?bottleneck a pm:Bottleneck ;
    prov:describes ?activity ;
    pm:frequency ?freq ;
    pm:averageDuration ?duration .
  
  # Calculate optimization priority
  BIND(IF(?freq > 0.8, "critical", IF(?freq > 0.5, "high", "medium")) AS ?priority)
  BIND(?freq * 0.5 + 0.5 AS ?impact)  # Simple scoring
  
  BIND(CONCAT("Optimize ", STR(?activity), ": appears in deviations (",
    STR(?position), ") and is bottleneck (freq=", STR(?freq), ")") 
    AS ?recommendation)
  
  BIND(IRI(CONCAT("http://pictl.org/optimization/", RAND())) AS ?optimization_target)
  BIND(CONCAT("Optimize: ", STR(?activity)) AS ?target_label)
}
ORDER BY DESC(?impact)
```

**Output**: RDF describing optimization candidates with justification chain (deviation → bottleneck → action).

**Use Case**: Systematic process improvement roadmap generation.

---

### CONSTRUCT 4: Historical Model Quality Regression Detection

```sparql
PREFIX pm: <http://purl.org/pm/ontology#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

# Goal: Compare quality metrics across versions of the same model type 
# to detect regressions and trigger alerts

CONSTRUCT {
  ?quality_alert a prov:Entity ;
    rdfs:label ?alert_label ;
    pm:alertType "quality_regression" ;
    pm:severity ?severity ;
    pm:comparedModels ?model1 ;
    pm:comparedModels ?model2 ;
    pm:metricsChange ?metrics_delta ;
    pm:recommendation "investigate_and_retrain" .
}
WHERE {
  # Find two versions of the same algorithm
  ?model1 a pm:ProcessModel ;
    pm:discoversWith pm:HeuristicMinerDiscovery ;
    prov:wasGeneratedAtTime ?time1 ;
    pm:hasFitness ?fitness1 ;
    pm:hasPrecision ?precision1 .
  
  ?model2 a pm:ProcessModel ;
    pm:discoversWith pm:HeuristicMinerDiscovery ;
    prov:wasGeneratedAtTime ?time2 ;
    pm:hasFitness ?fitness2 ;
    pm:hasPrecision ?precision2 .
  
  # Ensure different versions (time difference)
  FILTER (?time2 > ?time1 && (?time2 - ?time1) > "P1D"^^xsd:duration)
  
  # Detect regressions
  BIND(?fitness1 - ?fitness2 AS ?fitness_delta)
  BIND(?precision1 - ?precision2 AS ?precision_delta)
  
  FILTER ((?fitness_delta > 0.05) || (?precision_delta > 0.05))
  
  BIND(IF(?fitness_delta > 0.10, "critical", "warning") AS ?severity)
  BIND(CONCAT("Fitness: ", STR(?fitness_delta), ", Precision: ", STR(?precision_delta)) 
    AS ?metrics_delta)
  BIND(CONCAT("Quality regression detected in Heuristic Miner: ",
    "v", STR(?time1), " → v", STR(?time2)) AS ?alert_label)
  
  BIND(IRI(CONCAT("http://pictl.org/alert/", RAND())) AS ?quality_alert)
}
```

**Output**: Alert RDF with regression details and recommendation.

**Use Case**: Automated quality assurance; early warning for model degradation.

---

### CONSTRUCT 5: Process Mining Quality Assessment (Multi-Axis)

```sparql
PREFIX pm: <http://purl.org/pm/ontology#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

# Goal: Synthesize discovery + conformance + drift + bottleneck data 
# into a comprehensive process quality score

CONSTRUCT {
  ?process_quality_assessment a prov:Report ;
    rdfs:label "Comprehensive Process Quality Assessment" ;
    pm:overallQualityScore ?quality_score ;
    pm:discoveryQuality ?discovery_quality ;
    pm:conformanceQuality ?conformance_quality ;
    pm:stabilityQuality ?stability_quality ;
    pm:performanceQuality ?performance_quality ;
    prov:mentions ?discovery ;
    prov:mentions ?conformance ;
    prov:mentions ?drift ;
    prov:mentions ?bottleneck ;
    pm:assessment ?assessment ;
    pm:riskLevel ?risk_category .
}
WHERE {
  # Gather evidence from all proof types
  ?discovery a pm:DirectlyFollowsGraph ;
    pm:hasFitness ?fitness ;
    pm:hasPrecision ?precision ;
    pm:hasGeneralization ?generalization .
  
  ?conformance a pm:ConformanceReport ;
    pm:hasFitness ?conf_fitness .
  
  ?drift a pm:ConceptDrift ;
    pm:driftDetected ?drift_flag .
  
  ?bottleneck a pm:Bottleneck ;
    pm:frequency ?bottleneck_severity .
  
  # Weighted scoring
  BIND((?fitness + ?precision) / 2 AS ?discovery_quality)
  BIND(?conf_fitness AS ?conformance_quality)
  BIND(IF(?drift_flag = false, 1.0, 0.6) AS ?stability_quality)
  BIND(IF(?bottleneck_severity < 0.5, 1.0, 1.0 - ?bottleneck_severity) AS ?performance_quality)
  
  BIND((?discovery_quality + ?conformance_quality + ?stability_quality + ?performance_quality) / 4 
    AS ?quality_score)
  
  # Risk categorization
  BIND(IF(?quality_score >= 0.85, "healthy", 
          IF(?quality_score >= 0.70, "acceptable", "critical")) 
    AS ?risk_category)
  
  BIND(CONCAT("Discovery quality: ", STR(?discovery_quality), 
              "; Conformance: ", STR(?conformance_quality),
              "; Stability: ", STR(?stability_quality),
              "; Performance: ", STR(?performance_quality)) 
    AS ?assessment)
  
  BIND(IRI(CONCAT("http://pictl.org/assessment/", RAND())) AS ?process_quality_assessment)
}
```

**Output**: Holistic process quality RDF integrating all proof dimensions.

**Use Case**: Executive dashboards, compliance certification, risk monitoring.

---

## 4. Complex Multi-Step Reasoning Chains

### Example: Drift → Root Cause Investigation

```sparql
# Step 1: Find drift events
PREFIX pm: <http://purl.org/pm/ontology#>

SELECT ?drift WHERE {
  ?drift a pm:ConceptDrift ;
    pm:driftDetected true ;
    pm:predictionConfidence ?conf .
  FILTER (?conf > 0.85)
}

# For each drift result:
# Step 2: Look up models used BEFORE drift

SELECT ?pre_drift_model ?algorithm WHERE {
  ?model a pm:ProcessModel ;
    prov:wasGeneratedAtTime ?time ;
    pm:discoversWith ?algorithm .
  FILTER (?time < ?drift_time)
}
ORDER BY DESC(?time)
LIMIT 1

# Step 3: Check for bottlenecks in pre-drift period

SELECT ?bottleneck_activity ?avg_duration ?frequency WHERE {
  ?activity a pm:Activity .
  ?bottleneck a pm:Bottleneck ;
    prov:describes ?activity ;
    pm:averageDuration ?avg_duration ;
    pm:frequency ?frequency .
  FILTER (?frequency > 0.70)
}

# Step 4: Correlate deviations with drift

SELECT ?deviation_type ?activity ?frequency AS ?occurrence_count WHERE {
  ?deviation a pm:Deviation ;
    pm:deviationType ?deviation_type ;
    prov:describes ?activity .
}
GROUP BY ?deviation_type ?activity
HAVING (COUNT(?deviation) > 10)  # Systematic issue

# Step 5: Create root cause hypothesis

CONSTRUCT {
  ?hypothesis a prov:Entity ;
    rdfs:label "Drift Root Cause Hypothesis" ;
    pm:hypothesis "Increased bottleneck severity caused process variance" ;
    prov:wasDerivedFrom ?drift ;
    prov:mentions ?bottleneck_activity ;
    pm:confidence ?conf ;
    pm:nextSteps "validate_hypothesis_with_domain_expert" .
}
WHERE {
  # (Combine results from steps 1-4)
}
```

**Use Case**: Automated incident investigation; root cause analysis with evidence trail.

---

## 5. Governance & Compliance Queries

### SELECT: Model Lineage & Traceability

```sparql
PREFIX pm: <http://purl.org/pm/ontology#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

# Show complete lineage: discovery → conformance check → deployment decision

SELECT ?discovery_time ?algorithm ?fitness ?precision 
       ?conformance_time ?conformance_fitness ?decision_time ?decision
WHERE {
  ?discovery a pm:ProcessModel ;
    prov:wasGeneratedAtTime ?discovery_time ;
    pm:discoversWith ?algorithm ;
    pm:hasFitness ?fitness ;
    pm:hasPrecision ?precision .
  
  ?conformance a pm:ConformanceReport ;
    prov:wasGeneratedAtTime ?conformance_time ;
    prov:wasDerivedFrom ?discovery ;
    pm:hasFitness ?conformance_fitness .
  
  ?decision a prov:Entity ;
    prov:wasGeneratedAtTime ?decision_time ;
    prov:wasDerivedFrom ?conformance ;
    rdfs:comment ?decision .
}
ORDER BY ?discovery_time
```

**Use Case**: Audit trail, governance compliance, model validation history.

---

## 6. Performance & Optimization Queries

### SELECT: Algorithm Efficiency Comparison

```sparql
PREFIX pm: <http://purl.org/pm/ontology#>

SELECT ?algorithm 
       (AVG(?execution_time) AS ?avg_time) 
       (MIN(?execution_time) AS ?min_time)
       (MAX(?execution_time) AS ?max_time)
       (COUNT(?model) AS ?run_count)
WHERE {
  ?model a pm:ProcessModel ;
    pm:discoversWith ?algorithm ;
    pm:executionTime ?execution_time .
}
GROUP BY ?algorithm
ORDER BY ?avg_time
```

**Output**: Execution time statistics for algorithm selection.

**Use Case**: Performance optimization, resource allocation planning.

---

## 7. Integration Patterns

### Pattern: Proof Artifact Validation

```sparql
# Before trusting a proof, verify:
# 1. Has timestamp (prov:wasGeneratedAtTime)
# 2. Has execution time (pm:executionTime)
# 3. Has confidence/fitness metric
# 4. Links to source (prov:used, prov:wasDerivedFrom)

PREFIX pm: <http://purl.org/pm/ontology#>
PREFIX prov: <http://www.w3.org/ns/prov#>

ASK {
  ?proof a pm:ConformanceReport ;
    prov:wasGeneratedAtTime ?timestamp ;
    pm:executionTime ?time ;
    pm:hasFitness ?fitness ;
    prov:used ?event_log ;
    prov:used ?model .
  
  FILTER (
    ?timestamp > "2026-04-01T00:00:00Z"^^xsd:dateTime &&
    ?fitness >= 0.0 && ?fitness <= 1.0
  )
}
```

---

## Appendix: SPARQL Filters & Functions

### Common Filter Patterns

```sparql
# Numeric range
FILTER (?fitness > 0.80 && ?fitness <= 1.0)

# Duration comparison
FILTER (?duration > "PT30M"^^xsd:duration)

# Timestamp filtering
FILTER (?timestamp > "2026-04-01"^^xsd:date)

# String matching
FILTER (CONTAINS(?activity_name, "Review"))

# Aggregation
FILTER (COUNT(?activity) > 5)
```

### Useful Functions

```sparql
# Type checking
FILTER (isLiteral(?value))
FILTER (isURI(?resource))

# Math
BIND((?a + ?b) / 2 AS ?average)

# String operations
BIND(SUBSTR(?str, 1, 10) AS ?first_ten)
BIND(CONCAT(?a, " - ", ?b) AS ?combined)

# Conditional
BIND(IF(?condition, ?value_if_true, ?value_if_false) AS ?result)
```

---

## Resources

- **pictl Ontology**: `pictl-ontology.ttl`
- **Query Registry**: `query-registry.json`
- **SPARQL 1.1 Standard**: https://www.w3.org/TR/sparql11-query/
- **W3C PROV Ontology**: https://www.w3.org/TR/prov-o/

---

**Last Updated**: 2026-04-10
