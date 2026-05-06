# Quality Threshold Justification

These thresholds are used in the G3 quality-threshold gate.

| Threshold | Value | Rationale | Source |
|-----------|-------|-----------|--------|
| fitness ≥ 0.95 | 0.95 | At 0.95, at most 5% of token operations involve missing or remaining tokens. Below 0.90 the model cannot replay 10%+ of observed behavior. 0.95 is the standard "production-quality model" criterion in academic process mining literature. | van der Aalst (2016) Ch. 7 |
| precision ≥ 0.80 | 0.80 | ETConformance precision below 0.80 means ≥20% of transitions enabled by the model are never observed in the log — significant overgeneralization. | Munoz-Gama & Carmona (2010) |
| zeta ≤ 2.0 | 2.0 | Two sigma from mean inter-activity time; the standard Western Electric rule boundary for "within normal temporal behavior". | Carmona et al. (2018) pp. 201–202 |

## Cross-references
- Canonical formula: `docs/CANONICAL_FITNESS_FORMULA.md`
- Implementation: `wasm4pm/benches/closed_claw/gates.rs`
