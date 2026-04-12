# Process Mining Conformance Audit Report

**Generated**: {{ timestamp }}
**Duration**: {{ duration_ms }}ms
**Audit Type**: Van der Aalst Doctrine (Event-Log Falsification)

---

## Verdict

**Status**: {{ verdict.status }}
**Confidence**: {{ verdict.confidence | round 2 }} ({{ verdict.confidence * 100 | round 1 }}%)
**Message**: {{ verdict.message }}

### Interpretation

- **TRUTHFUL** (≥0.95): Process is truthful—implementation matches declared behavior perfectly
- **VARIANCE** (0.70–0.95): Process shows variance—undocumented branches or rework detected
- **DECEPTIVE** (<0.70): Process is deceptive—implementation contradicts declared model

---

## Conformance Metrics

| Metric | Score | Interpretation |
|--------|-------|-----------------|
| **Fitness** | {{ metrics.fitness | round 2 }} | How well observed behavior fits declared model |
| **Precision** | {{ metrics.precision | round 2 }} | How specific discovered model is (not over-generalized) |
| **Generalization** | {{ metrics.generalization | round 2 }} | How general discovered model is (captures variant behavior) |
| **Simplicity** | {{ metrics.simplicity | round 2 }} | How simple discovered model is (fewer deviations) |

### Metric Definitions

- **Fitness**: Ratio of events that conform to declared process. 1.0 = perfect conformance, 0.0 = no conformance.
- **Precision**: Ratio of observed transitions to allowed transitions in declared model. Prevents over-generalization.
- **Generalization**: Ability of discovered model to represent unseen behavior. 0.0 = deterministic, 1.0 = allows all behavior.
- **Simplicity**: Inverse of deviation count. 1.0 = no deviations, 0.0 = many deviations.

---

## Event Log Summary

- **Events Captured**: {{ ocel_summary.event_count }}
- **Objects Created**: {{ ocel_summary.object_count }}
- **Object Types**: {{ ocel_summary.object_types | join ', ' }}
- **Time Range**: {{ timestamp_range[0] }} → {{ timestamp_range[1] }}

### Object Types

Objects tracked in OCEL:
- **tool_invocation**: Individual MCP tool calls
- **discovery_result**: Process discovery operation outputs
- **conformance_result**: Conformance checking operation outputs
- **analysis_result**: Analysis and statistics operations
- **federation_vote**: Federation quorum votes
- **receipt_chain**: Receipt chaining for verification

---

## Process Comparison

### Declared vs Discovered

Declared Process:
```
START → pm.discovery → pm.conformance → pm.analysis → federation.quorum_vote → federation.receipt_chain → END
```

Discovered Process (from event log):
```
{{ evidence.most_common_variant }}
```

### Coverage

- **Activities Declared**: {{ comparison.declared_activities | length }}
- **Activities Executed**: {{ comparison.executed_activities | length }}
- **Activity Coverage**: {{ comparison.activity_coverage | round 2 }} ({{ comparison.activity_coverage * 100 | round 1 }}%)

---

## Deviations Detected

{% if comparison.deviations and comparison.deviations.length > 0 %}

**Total Deviations**: {{ comparison.total_deviations }}
(Showing first {{ comparison.deviations.length }} of {{ comparison.total_deviations }})

{% for deviation in comparison.deviations %}

### Deviation {{ loop.index }}: {{ deviation.type }}

- **Severity**: {{ deviation.severity }}
- **Message**: {{ deviation.message }}
{% if deviation.activity %}
- **Activity**: {{ deviation.activity }}
{% endif %}
{% if deviation.transition %}
- **Transition**: {{ deviation.transition }}
{% endif %}

{% endfor %}

{% else %}

✓ No deviations detected. Process execution matches declared model perfectly.

{% endif %}

---

## Discovered Process Structure

### Activities

Unique activities observed during execution:

```
{{ evidence.dfg_nodes | json_stringify }}
```

- **Total Activities**: {{ evidence.dfg_nodes }}
- **Edges (Transitions)**: {{ evidence.dfg_edges }}
- **Complexity**: {{ (evidence.dfg_edges / evidence.dfg_nodes) | round 2 }} edges per activity (avg)

### Directly-Follows Graph (DFG)

```
Nodes: {{ evidence.dfg_nodes }}
Edges: {{ evidence.dfg_edges }}
```

A more complex graph indicates more rework, loops, or undeclared branches.

---

## Variant Analysis

### Trace Variants

The event log reveals the following execution patterns:

{% for variant in evidence.variant_frequencies %}

**Variant {{ loop.index }}** ({{ variant.frequency }} occurrences, {{ variant.percentage }}%)
```
{{ variant.sequence }}
```

{% endfor %}

### Variant Explosion Assessment

- **Variant Count**: {{ evidence.variant_count }}
- **Most Common**: Variant 1 ({{ evidence.variant_frequencies[0].percentage }}% of execution)

**Interpretation**:
- Low variant count (1–3): Deterministic process, follows declared model strictly
- Medium variant count (4–10): Expected variance, some undocumented paths or optional steps
- High variant count (>10): Significant variant explosion, possible uncontrolled rework or loops

---

## Object Lifecycle Analysis

### Sample Lifecycles

Objects tracked from creation to completion:

{% for lifecycle in evidence.object_lifecycles %}

**{{ lifecycle.id }}** ({{ lifecycle.type }})
- Lifecycle Length: {{ lifecycle.lifecycle_length }} events
- Activities: [events traced across object]

{% endfor %}

### Lifecycle Soundness

- **Orphan Objects**: Objects created but never completed (0 expected)
- **Duplicate Terminal States**: Objects in both success/failure states simultaneously (0 expected)
- **Temporal Violations**: Objects with impossible orderings (0 expected)

---

## Negative Testing

To strengthen audit confidence, the following impossible scenarios should be rejected:

- [ ] Release without validate
- [ ] Validate without prior breeding
- [ ] Concurrent terminal states (both success and failure)
- [ ] Missing required transition
- [ ] Orphan object (no creator)
- [ ] Circular dependency (A depends on B, B depends on A)

---

## Root Cause Analysis (if applicable)

{% if verdict.status == 'VARIANCE' or verdict.status == 'DECEPTIVE' %}

### Why Deviations Occurred

Based on event log analysis:

1. **Undeclared Activities**: Check for:
   - Retries or error recovery loops
   - Conditional branches not captured in declared model
   - Fallback or degraded-mode paths

2. **Missing Activities**: Check for:
   - Skipped steps (possible security or performance optimization)
   - Feature flags disabling declared steps
   - Dead code paths (declared but unused)

3. **Transition Violations**: Check for:
   - Interleaving of concurrent steps
   - Out-of-order execution (e.g., analysis before discovery)
   - Loop-back transitions (rework)

### Recommended Fixes

- Update declared process model to match observed behavior
- Add feature flags to document conditional paths
- Implement stronger conformance guards to prevent undeclared paths
- Review event log for evidence of system bugs or unexpected behavior

{% endif %}

---

## Audit Confidence

**Methodology**: Object-Centric Event Log (OCEL) conformance checking per van der Aalst process mining standards.

**Data Sources**:
- OpenTelemetry spans captured from pictl execution
- OCEL conversion with artifact/receipt/proof object types
- Process discovery via directly-follows graph analysis
- Fitness calculation via deviation counting

**Limitations**:
- Simplified DFG-based discovery (production uses pm4py token replay)
- Deviation counts are approximate (full token replay recommended)
- Variant analysis based on object-centric grouping (not trace-centric)

**Validation Checklist**:
- [ ] Span timestamps are valid and ordered
- [ ] All required attributes present in spans
- [ ] Object references correctly extracted from attributes
- [ ] Discovered process matches actual observed behavior
- [ ] Deviations are real (not noise from sampling)

---

## Conclusion

{% if verdict.status == 'TRUTHFUL' %}

✓ **AUDIT PASSED**: The pictl system's claimed behavior is proven by the event log. Implementation truthfully matches the declared process model with ≥95% fitness.

The system exhibits:
- Perfect activity sequencing
- No undeclared execution paths
- All declared steps executed in order
- Deterministic behavior (variance < 5%)

**Next Step**: System is ready for production deployment. No conformance issues detected.

{% elsif verdict.status == 'VARIANCE' %}

⚠ **AUDIT PASSED WITH VARIANCE**: The pictl system mostly follows the declared model ({{ metrics.fitness | round 1 }}% fitness) but exhibits undocumented execution paths.

The system exhibits:
- Some undeclared activities ({{ comparison.total_deviations }} deviations)
- Optional or conditional branches not captured in model
- Possible rework or retry logic
- Runtime variance

**Next Step**: Update declared process model to document observed variance, then re-audit to confirm new model.

{% else %}

✗ **AUDIT FAILED**: The pictl system's behavior fundamentally contradicts the declared model. The implementation is deceptive ({{ metrics.fitness | round 1 }}% fitness).

The system exhibits:
- Severe deviation from declared process ({{ comparison.total_deviations }} deviations)
- Critical steps missing or out of order
- Fundamental architecture mismatch
- Possible system bugs or malicious behavior

**Next Step**: Investigate root cause. Review source code against declared process. Fix discrepancies before deploying.

{% endif %}

---

## Van der Aalst Doctrine

> "If the code says it worked but the event log cannot prove a lawful process happened, then it did not work."

This audit follows Wil van der Aalst's principle that observable event evidence (not code inspection or status returns) is the ground truth for system behavior. The verdict above is based solely on what the event log proves, not what the system claims.

---

*Audit generated by Process Mining Conformance Auditor v1.0*
*For more information: pictl/docs/process-mining-audit.md*
