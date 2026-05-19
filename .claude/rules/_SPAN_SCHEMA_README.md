# Autonomic Healing Observability — OTEL Span Schema Design

**Deliverable:** Complete JSON schema + design documentation for 3 new OTEL span types  
**Status:** DESIGN_ONLY — No Rust code implementation included  
**Date:** 2026-05-18  
**Audience:** Cycle 3-5 implementation teams (backend developers)

---

## 📋 Contents

This deliverable includes two files:

### 1. `_SPAN_SCHEMA.json` (44 KB, 719 lines)

**Authoritative specification** for three new OTEL span types. Machine-readable JSON schema with:

- **Complete attribute specifications** (name, type, range, cardinality, semantics)
- **Chicago TDD oracle mappings** (Rank-1 mathematical, Rank-2 domain contract, Rank-3 metamorphic)
- **Jaeger query patterns** (5 queries per span type for independent oracle validation)
- **FM-5 prevention sections** (self-referential testing blocks)
- **Example payloads** (end of file)

Use this file as the **source of truth** when implementing span emission in Rust code.

### 2. `_SPAN_SCHEMA_DESIGN_SUMMARY.md` (19 KB, 534 lines)

**Human-readable design guide** with:

- Executive summary (why these 3 spans, why these oracles)
- Design rationale (FM-5 blocking, attribute separation, Jaeger integration)
- Cross-span correlation (how spans work together to prove autonomic healing)
- Implementation timeline (Cycles 3-5 roadmap with test coverage)
- Design decisions with detailed justification
- Compliance with critical constraints (chicago-tdd.md, critical-constraints.md, verification.md)

Use this file to **understand the design** before implementation.

---

## 🎯 Quick Reference: The Three Spans

| Span | Purpose | Emission | Oracle | Attributes |
|------|---------|----------|--------|-----------|
| **`rl.convergence_diagnostics`** | Prove RL agent learning, not stuck | Every 10 cycles | Rank-1 (Bellman) + Rank-4 (convergence trend) | 20+ (TD error, Q-values, weight norms, learning rate) |
| **`autonomic.spc_rule_violation`** | Prove SPC rules fire correctly | On-demand (rule fires) | Rank-1 (Western Electric) + Rank-2 (reward penalty) | 15+ (z-score, consecutive count, rule metadata) |
| **`autonomic.circuit_breaker_decision_impact`** | Prove circuit FSM correct, decisions impact health | On-demand (transition/block) | Rank-2 (FSM rules) + Rank-3 (metamorphic) | 18+ (state, timeout operands, decision impact) |

---

## 🔍 Schema Structure (JSON)

```json
{
  "metadata": {
    "title": "...",
    "version": "2.0",
    "status": "DESIGN_ONLY_NO_CODE_CHANGES"
  },
  "spans": {
    "rl_convergence_diagnostics": {
      "span_name": "rl.convergence_diagnostics",
      "category": "RL Learning Stability",
      "oracle_type": "Rank-1 + Rank-4",
      "emission_frequency": { ... },
      "description": "...",
      "semantic_meaning": { ... },
      "required_attributes": { ... },
      "optional_attributes": { ... },
      "jaeger_query_pattern": { ... },
      "rank_1_oracle_proof": { ... },
      "rank_4_oracle_proof": { ... },
      "fm5_prevention": { ... }
    },
    // ... 2 more spans
  },
  "cross_span_correlation": { ... },
  "implementation_readiness": { ... }
}
```

Each span includes:
- **Semantic meaning** (chicago-tdd.md binding, failure detection)
- **Required attributes** (30-40 fields per span, fully typed)
- **Optional attributes** (diagnostic, for root-cause analysis)
- **Jaeger query patterns** (5 concrete queries per span for oracle validation)
- **Oracle proofs** (mathematical theorems, statistical properties, metamorphic relations)
- **FM-5 prevention** (blocking self-referential testing)

---

## 📊 Jaeger Query Examples

### Example 1: Prove RL Convergence (Rank-4 Oracle)

```
service.name:wpm AND span.name:"rl.convergence_diagnostics"
→ Extract [cycle, td_error_convergence_ratio]
→ Plot trend over 10-cycle windows
→ Expected: early windows ~0.95-1.0, later windows <0.8
→ If trend shows convergence: oracle satisfied ✓
```

### Example 2: Validate SPC Rule 1 (Rank-1 Oracle)

```
service.name:wpm AND span.name:"autonomic.spc_rule_violation" AND rule_violated:"rule_1_outlier"
→ For each span: recompute z_independently = (metric_value - mean) / stddev
→ Verify: all |z| > 3.0 ✓
→ If any |z| ≤ 3.0: rule fired incorrectly (bug found)
```

### Example 3: Validate Circuit FSM (Rank-2 Oracle)

```
service.name:wpm AND span.name:"autonomic.circuit_breaker_decision_impact" AND state_transition_occurred:true
→ Extract [cycle, transition_direction] sorted by cycle ASC
→ Validate: only legal transitions (Closed→Open, Open→HalfOpen, HalfOpen→{Closed,Open})
→ If any invalid transition found (e.g., Closed→HalfOpen): FSM bug ✗
```

All queries are **auditor-runnable** (no code modification required).

---

## 🛡️ FM-5 Prevention Strategy

Each span blocks self-referential testing via **attribute structure**:

**Anti-pattern (BLOCKED):**
```
Span emits: {z_score: 3.5}
Test checks: |z_score| > 3.0 ✓
Problem: Derives z from data, then tests z (self-confirming, FM-5 violation)
```

**Correct pattern (ENFORCED):**
```
Span emits: {metric_value: 850.5, control_limit_mean: 420, control_limit_stddev: 120, z_score: 3.58}
Test checks: 
  1. Recompute z_independent = (850.5 - 420) / 120 = 3.58
  2. Verify: z_independent == z_score ✓
  3. Check: |z_independent| > 3.0 ✓ (oracle is external theorem)
Benefit: Oracle (normal distribution property) is independent of code logic
```

**Schema enforces this** by:
- Requiring raw metrics (metric_value, mean, stddev) to be included
- Making computed values (z_score, convergence_ratio) separate fields
- Oracle validation external to span emission (Jaeger recomputes)

---

## 📅 Implementation Timeline

### Cycle 3: Core Implementation
- **Phase 1.1:** `rl.convergence_diagnostics` in `rl_orchestrator.rs`
- **Phase 1.2:** `autonomic.spc_rule_violation` in `spc.rs`
- **Phase 1.3:** `autonomic.circuit_breaker_decision_impact` in `self_healing.rs`

### Cycle 4: Test Harness
- **Phase 2.1:** Chicago TDD oracle validators (Rank-1, Rank-2, Rank-3 tests)
- **Phase 2.2:** Jaeger query documentation

### Cycle 5: Integration
- **Phase 3.1:** End-to-end autonomic healing test
- **Phase 3.2:** CI/CD pipeline validation

---

## ✅ Compliance Checklist

- ✅ **chicago-tdd.md §3:** 100% operations emit OTEL spans (all 3 types included)
- ✅ **critical-constraints.md §2:** `service_name` + `status` fields mandatory
- ✅ **verification.md:** Three-layer evidence (spans, tests, schema)
- ✅ **Rank-1 oracles:** Bellman equation, Western Electric rules
- ✅ **Rank-2 oracles:** Circuit FSM, SPC→reward mapping
- ✅ **Rank-3 oracles:** Metamorphic decision→health relations
- ✅ **Rank-4 oracles:** Statistical convergence (5 seeds, 50+ cycles)
- ✅ **FM-5 blocked:** Raw metrics + computed values separated
- ✅ **Jaeger queries:** 5 patterns per span for independent validation

---

## 📖 How to Use This Deliverable

### For **Cycle 3 Implementation** (Backend Developers)

1. **Read:** `_SPAN_SCHEMA_DESIGN_SUMMARY.md` (start here, 15 min)
2. **Reference:** `_SPAN_SCHEMA.json` (for exact attribute specs, 20 min)
3. **Implement:** Each phase per timeline
4. **Validate:** Use Jaeger query patterns to test oracle satisfaction

### For **Test Writers** (Cycle 4)

1. **Study:** Oracle proof sections (Rank-1/2/3/4 definitions)
2. **Write:** Chicago TDD validators using seeds and confidence bounds
3. **Integrate:** Jaeger query patterns into test harness

### For **Auditors** (Post-Cycle-5)

1. **Query:** Jaeger for each span type
2. **Validate:** Oracles using provided query patterns
3. **Report:** Autonomic healing observability compliance

---

## 🚫 What This Deliverable Does NOT Include

- ❌ Rust code implementation
- ❌ TypeScript integration changes
- ❌ Test code (structure only, implementation in Cycles 3-4)
- ❌ Cargo.toml modifications
- ❌ CLI changes (observer pattern only)

**These are deliverables for Cycle 3-5 implementation teams.**

---

## 📝 Key Design Principles

1. **Observability via Spans:** Each autonomic healing decision is an OTEL event
2. **Independent Oracles:** No span attribute derives expected value from code formula
3. **Jaeger as Auditor:** Proof validated by querying traces, not code inspection
4. **Causality Chain:** SPC violation → reward penalty → health degradation → circuit transition
5. **Three Subsystems:** RL (learning) + SPC (monitoring) + Circuit (protection) operate independently
6. **Rank Hierarchy:** Rank-1 (mathematical) > Rank-2 (domain contract) > Rank-3 (property) > Rank-4 (statistical)

---

## 📞 Questions?

**For schema clarification:** See `_SPAN_SCHEMA.json` (authoritative)  
**For design rationale:** See `_SPAN_SCHEMA_DESIGN_SUMMARY.md` (detailed explanations)  
**For implementation:** See this README + Cycle 3 timeline

---

**Status:** Schema design complete and ready for Phase 1 implementation  
**Next:** Cycle 3 teams begin code implementation per timeline  
**Target:** Full autonomic healing observability by end of Cycle 5

---

## 📚 Related Documentation

- `.claude/rules/chicago-tdd.md` — Van der Aalst process mining validation doctrine
- `.claude/rules/critical-constraints.md` — MTTR, TPS, OTEL requirements
- `.claude/rules/verification.md` — Testing hierarchy, three-layer evidence
- `.claude/rules/_JAEGER_QUERY_PATTERNS.md` — Expanded Jaeger examples (TBD Cycle 4)
- `wasm4pm/.claude/rules/_iteration10/rl-learning-stability-audit.md` — RL findings
- `wasm4pm/.claude/rules/_cycle4/autoinstincts-audit-cycle4.md` — SPC/Circuit findings
