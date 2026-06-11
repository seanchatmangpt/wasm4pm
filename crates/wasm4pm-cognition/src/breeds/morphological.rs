//! Zwicky General Morphological Analysis with Cross-Consistency Assessment
//! (Zwicky 1947, "Morphology and nomenclature of jet engines", Aeronautical
//! Engineering Review 6(6); Zwicky 1969, "Discovery, Invention, Research
//! Through the Morphological Approach"; Ritchey 2011, "Wicked Problems —
//! Social Messes", Springer, Chapter 2, DOI 10.1007/978-3-642-19653-9_2).
//!
//! Algorithm:
//! 1. Parse the morphological field from `morph:param:<name>` facts, each
//!    holding a `|`-separated value range. Parameters are kept in a BTreeMap
//!    (sorted by name) so enumeration order is deterministic.
//! 2. Compute the field size: the number of formal configurations is the
//!    product of the number of values under each parameter (Ritchey 2011,
//!    §2.4). Zwicky's 1947 "propulsive system morphology" had six dimensions
//!    and 4 × 4 × 3 × 3 × 2 × 2 = 576 formal configurations (Ritchey 2011,
//!    Fig. 2.1).
//! 3. Cross-Consistency Assessment (CCA): parse pairwise exclusion judgments
//!    from `morph:exclude` facts (`pA=vA|pB=vB`), compare all configurations
//!    against them, and weed out mutually contradictory conditions (Ritchey
//!    2011, §2.3, Fig. 2.2 — Zwicky called this the "principle of
//!    contradiction and reduction").
//! 4. Synthesize the solution space: the subset of internally consistent
//!    configurations. Select the first consistent configuration in
//!    lexicographic (odometer) order, and report the reduction in basis
//!    points (Ritchey: a typical field "can be reduced by up to 90 or even
//!    99%").
//!
//! Structural fingerprint: a field with NO exclusion constraints must produce
//! ZERO `cca-assess` trace steps — the CCA machinery only runs when judgments
//! exist.
//!
//! Caps: ≤ 16 parameters, ≤ 16 values per parameter, field size ≤ 1,000,000
//! configurations (refusal, not silent truncation).

use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::{BTreeMap, BTreeSet};

/// Zwicky morphological field construction + cross-consistency assessment.
pub struct Morphological;

const PARAM_PREFIX: &str = "morph:param:";
const EXCLUDE_KEY: &str = "morph:exclude";
const MAX_PARAMS: usize = 16;
const MAX_VALUES: usize = 16;
const MAX_FIELD: u64 = 1_000_000;

/// One CCA exclusion judgment: the two (parameter, value) conditions cannot
/// coexist in an internally consistent configuration.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Exclusion {
    param_a: String,
    value_a: String,
    param_b: String,
    value_b: String,
}

/// Parse `morph:param:<name>` facts into a sorted field. Duplicate values
/// within one parameter are an input defect (reported by preconditions).
fn parse_field(input: &BreedInput) -> BTreeMap<String, Vec<String>> {
    let mut field: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for fact in &input.facts {
        if let Some(name) = fact.key.strip_prefix(PARAM_PREFIX) {
            let values: Vec<String> = fact
                .value
                .split('|')
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
                .collect();
            field.insert(name.to_string(), values);
        }
    }
    field
}

/// Parse `morph:exclude` facts of the form `pA=vA|pB=vB`.
fn parse_exclusions(input: &BreedInput) -> Result<Vec<Exclusion>, String> {
    let mut out = Vec::new();
    for fact in &input.facts {
        if fact.key != EXCLUDE_KEY {
            continue;
        }
        let parts: Vec<&str> = fact.value.split('|').collect();
        if parts.len() != 2 {
            return Err(format!(
                "morph:exclude must be 'pA=vA|pB=vB', got '{}'",
                fact.value
            ));
        }
        let mut pair = Vec::with_capacity(2);
        for part in parts {
            let (p, v) = part
                .split_once('=')
                .ok_or_else(|| format!("exclusion condition '{}' missing '='", part))?;
            pair.push((p.trim().to_string(), v.trim().to_string()));
        }
        if pair[0].0 == pair[1].0 {
            return Err(format!(
                "exclusion '{}' pairs a parameter with itself; CCA judgments are cross-parameter",
                fact.value
            ));
        }
        out.push(Exclusion {
            param_a: pair[0].0.clone(),
            value_a: pair[0].1.clone(),
            param_b: pair[1].0.clone(),
            value_b: pair[1].1.clone(),
        });
    }
    Ok(out)
}

/// Field size = product of per-parameter value counts (checked arithmetic).
fn field_size(field: &BTreeMap<String, Vec<String>>) -> Option<u64> {
    field
        .values()
        .try_fold(1u64, |acc, vs| acc.checked_mul(vs.len() as u64))
}

/// Does the configuration (one value index per sorted parameter) violate the
/// exclusion? Both conditions must hold for the configuration to be
/// inconsistent.
fn violates(
    params: &[(&String, &Vec<String>)],
    config: &[usize],
    ex: &Exclusion,
) -> bool {
    let mut hit_a = false;
    let mut hit_b = false;
    for (i, (name, values)) in params.iter().enumerate() {
        let v = &values[config[i]];
        if **name == ex.param_a && *v == ex.value_a {
            hit_a = true;
        }
        if **name == ex.param_b && *v == ex.value_b {
            hit_b = true;
        }
    }
    hit_a && hit_b
}

impl CognitionBreed for Morphological {
    fn id(&self) -> BreedId {
        BreedId::Morphological
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "morphological_field".to_string(),
            "cross_consistency_assessment".to_string(),
            "solution_space_synthesis".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let field = parse_field(input);
        if field.len() < 2 {
            return Err(
                "morphological requires >= 2 'morph:param:<name>' facts (a model must contain \
                 two or more parameters; Ritchey 2011 §2.3)"
                    .to_string(),
            );
        }
        if field.len() > MAX_PARAMS {
            return Err(format!("field exceeds {} parameters", MAX_PARAMS));
        }
        for (name, values) in &field {
            if values.is_empty() {
                return Err(format!("parameter '{}' has an empty value range", name));
            }
            if values.len() > MAX_VALUES {
                return Err(format!(
                    "parameter '{}' exceeds {} values",
                    name, MAX_VALUES
                ));
            }
            let unique: BTreeSet<&String> = values.iter().collect();
            if unique.len() != values.len() {
                return Err(format!("parameter '{}' has duplicate values", name));
            }
        }
        let size = field_size(&field).ok_or("field size overflows u64")?;
        if size > MAX_FIELD {
            return Err(format!(
                "field has {} configurations, exceeding the {} cap",
                size, MAX_FIELD
            ));
        }
        for ex in parse_exclusions(input)? {
            for (p, v) in [(&ex.param_a, &ex.value_a), (&ex.param_b, &ex.value_b)] {
                let values = field
                    .get(p)
                    .ok_or_else(|| format!("exclusion references unknown parameter '{}'", p))?;
                if !values.contains(v) {
                    return Err(format!(
                        "exclusion references unknown value '{}' for parameter '{}'",
                        v, p
                    ));
                }
            }
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let err = |m: String| BreedError {
            breed: BreedId::Morphological,
            message: m,
        };
        self.preconditions(input).map_err(err)?;

        let field = parse_field(input);
        let exclusions = parse_exclusions(input).map_err(err)?;
        let total = field_size(&field).ok_or_else(|| err("field overflow".to_string()))?;

        let mut trace: Vec<TraceStep> = Vec::new();
        let mut push = |kind: &str, detail: String, trace: &mut Vec<TraceStep>| {
            trace.push(TraceStep {
                step: trace.len(),
                kind: kind.to_string(),
                detail,
                depth: 0,
                objects: vec![],
            });
        };

        for (name, values) in &field {
            push(
                "define-parameter",
                format!("{}: {} values [{}]", name, values.len(), values.join("|")),
                &mut trace,
            );
        }
        push(
            "compute-field-size",
            format!(
                "{} = {}",
                field
                    .values()
                    .map(|v| v.len().to_string())
                    .collect::<Vec<_>>()
                    .join(" x "),
                total
            ),
            &mut trace,
        );

        // Cross-Consistency Assessment: enumerate configurations in odometer
        // order over the sorted parameters; a configuration is consistent iff
        // it violates no exclusion judgment.
        let params: Vec<(&String, &Vec<String>)> = field.iter().collect();
        let mut excluded_per: Vec<u64> = vec![0; exclusions.len()];
        let mut consistent: u64 = 0;
        let mut first_consistent: Option<Vec<usize>> = None;
        let mut config = vec![0usize; params.len()];
        loop {
            let mut ok = true;
            for (i, ex) in exclusions.iter().enumerate() {
                if violates(&params, &config, ex) {
                    excluded_per[i] += 1;
                    ok = false;
                }
            }
            if ok {
                consistent += 1;
                if first_consistent.is_none() {
                    first_consistent = Some(config.clone());
                }
            }
            // odometer increment (last parameter varies fastest)
            let mut pos = params.len();
            loop {
                if pos == 0 {
                    break;
                }
                pos -= 1;
                config[pos] += 1;
                if config[pos] < params[pos].1.len() {
                    break;
                }
                config[pos] = 0;
                if pos == 0 {
                    pos = usize::MAX; // exhausted
                    break;
                }
            }
            if pos == usize::MAX {
                break;
            }
        }

        for (i, ex) in exclusions.iter().enumerate() {
            push(
                "cca-assess",
                format!(
                    "{}={} x {}={} -> excluded in {} configurations",
                    ex.param_a, ex.value_a, ex.param_b, ex.value_b, excluded_per[i]
                ),
                &mut trace,
            );
        }

        // basis points of the field weeded out by CCA (integer; no floats)
        let reduction_bp = if total > 0 {
            (total - consistent) * 10_000 / total
        } else {
            0
        };
        push(
            "synthesize-solution-space",
            format!(
                "{} of {} configurations internally consistent ({} bp reduced)",
                consistent, total, reduction_bp
            ),
            &mut trace,
        );

        let selected = first_consistent.map(|cfg| {
            params
                .iter()
                .enumerate()
                .map(|(i, (name, values))| format!("{}={}", name, values[cfg[i]]))
                .collect::<Vec<_>>()
                .join(";")
        });

        let mut facts = vec![
            Fact {
                key: "morphological:field_size".to_string(),
                value: total.to_string(),
            },
            Fact {
                key: "morphological:solution_space".to_string(),
                value: consistent.to_string(),
            },
            Fact {
                key: "morphological:reduction_bp".to_string(),
                value: reduction_bp.to_string(),
            },
        ];
        if let Some(sel) = &selected {
            facts.push(Fact {
                key: "morphological:first_consistent".to_string(),
                value: sel.clone(),
            });
        }

        let explanation = format!(
            "Morphological field of {} parameters: {} formal configurations; CCA with {} \
             judgments leaves a solution space of {} ({} bp reduced)",
            field.len(),
            total,
            exclusions.len(),
            consistent,
            reduction_bp
        );

        Ok(BreedOutput {
            breed: BreedId::Morphological,
            candidates: input.candidates.clone(),
            facts,
            selected,
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        let tq = TraceQuery::from_output(output);
        tq.require_non_empty_with_kinds(&["compute-field-size", "synthesize-solution-space"])?;

        let get = |key: &str| -> Result<u64, String> {
            output
                .facts
                .iter()
                .find(|f| f.key == key)
                .ok_or_else(|| format!("missing fact '{}'", key))?
                .value
                .parse::<u64>()
                .map_err(|e| format!("fact '{}' is not a count: {}", key, e))
        };
        let total = get("morphological:field_size")?;
        let consistent = get("morphological:solution_space")?;

        // Independent recomputation of the field size from the input —
        // the output must equal the product of the value counts.
        let recomputed =
            field_size(&parse_field(input)).ok_or("field size overflow in postcondition")?;
        if total != recomputed {
            return Err(format!(
                "field_size {} != product of value counts {}",
                total, recomputed
            ));
        }
        if consistent > total {
            return Err(format!(
                "solution space {} exceeds field size {}",
                consistent, total
            ));
        }
        if output.selected.is_some() && consistent == 0 {
            return Err("selected a configuration from an empty solution space".to_string());
        }
        if output.selected.is_none() && consistent > 0 {
            return Err("non-empty solution space but no configuration selected".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fact(key: &str, value: &str) -> Fact {
        Fact {
            key: key.to_string(),
            value: value.to_string(),
        }
    }

    fn input(facts: Vec<Fact>) -> BreedInput {
        BreedInput {
            intent: "morphological analysis".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        }
    }

    /// Zwicky's 1947 "propulsive system morphology": six dimensions, all
    /// parameter values transcribed from Ritchey 2011, Fig. 2.1 (Springer,
    /// DOI 10.1007/978-3-642-19653-9_2, p. 10), which reproduces Zwicky's
    /// 1947 jet-engine field. Published total: 4 x 4 x 3 x 3 x 2 x 2 = 576
    /// formal configurations.
    fn zwicky_jet_engine_facts() -> Vec<Fact> {
        vec![
            fact(
                "morph:param:chemical-reactions",
                "self-contained|air-propelled|water-propelled|earth-propelled",
            ),
            fact(
                "morph:param:thrust-augmentation-1",
                "no-motion|translatory-motion|rotary-motion|oscillatory-motion",
            ),
            fact(
                "morph:param:thrust-augmentation-2",
                "no-augmentation|internal-augmentation|external-augmentation",
            ),
            fact(
                "morph:param:propellant-state",
                "gaseous|liquid|solid",
            ),
            fact(
                "morph:param:operating-mode",
                "continuous|intermittent",
            ),
            fact(
                "morph:param:reactivity",
                "self-igniting|artificial-ignition",
            ),
        ]
    }

    #[test]
    fn zwicky_1947_jet_engine_field_is_576() {
        // Provenance: Zwicky (1947), via Ritchey (2011) Fig. 2.1:
        // "Zwicky's 'propulsive system morphology' from 1947, containing six
        //  dimensions (parameters) and 576 (4 x 4 x 3 x 3 x 2 x 2) formal
        //  configurations".
        let out = Morphological
            .run(&input(zwicky_jet_engine_facts()))
            .expect("run ok");
        let size = out
            .facts
            .iter()
            .find(|f| f.key == "morphological:field_size")
            .expect("field_size fact");
        assert_eq!(size.value, "576");
        // No CCA judgments: the whole field is the solution space.
        let space = out
            .facts
            .iter()
            .find(|f| f.key == "morphological:solution_space")
            .expect("solution_space fact");
        assert_eq!(space.value, "576");
        assert!(out.selected.is_some());
        Morphological
            .postconditions(&input(zwicky_jet_engine_facts()), &out)
            .expect("postconditions");
    }

    #[test]
    fn ritchey_foi_organisational_field_is_186624() {
        // Provenance: Ritchey (2011) §2.4, p. 15: "The morphological field
        // for the organisational structure model is shown in Fig. 2.3. It
        // contains 186,624 possible configurations — which is simply the
        // product of the number of values under each parameter."
        // Per-parameter values transcribed from Fig. 2.3 (7 parameters:
        // 6 x 6 x 6 x 6 x 4 x 6 x 6 = 186,624).
        let facts = vec![
            fact(
                "morph:param:organisation-type",
                "official-state-agency|government-owned-enterprise|academy|trade-institute|consultant-firm|learning-organisation",
            ),
            fact(
                "morph:param:leadership-culture",
                "bureaucratic-hierarchy|strong-scientific-leadership|marketing-division-leadership|umbrella-management|gatekeeper|skunk-works",
            ),
            fact(
                "morph:param:dominant-buyer-structure",
                "ministry-dominated|military-and-material-dominated|defence-industry|civilian-agencies|private-markets|international-markets",
            ),
            fact(
                "morph:param:dominant-product-service",
                "process-and-method-support|soft-studies|hard-studies|basic-research|testing-construction|second-opinion",
            ),
            fact(
                "morph:param:cooperation-strategies",
                "outside-help-when-needed|joint-ventures|consultant-purchasing|mediator-only",
            ),
            fact(
                "morph:param:principle-employee-profile",
                "life-long-service|career-researcher|development-engineer|consultant|entrepreneur|elite-troops",
            ),
            fact(
                "morph:param:main-employee-incentive",
                "money|managerial-career|pleasure-in-ones-work|educational-motivation|titles-specialist-career|organisation-gives-status",
            ),
        ];
        let out = Morphological.run(&input(facts)).expect("run ok");
        let size = out
            .facts
            .iter()
            .find(|f| f.key == "morphological:field_size")
            .expect("field_size fact");
        assert_eq!(size.value, "186624");
    }

    #[test]
    fn cca_single_exclusion_weeds_exact_count() {
        // CCA per Ritchey (2011) §2.3: pairwise judgments weed out mutually
        // contradictory conditions. Excluding (chemical-reactions =
        // self-contained x thrust-augmentation-1 = no-motion) removes exactly
        // 576 / (4 x 4) = 36 configurations: solution space = 540.
        let mut facts = zwicky_jet_engine_facts();
        facts.push(fact(
            "morph:exclude",
            "chemical-reactions=self-contained|thrust-augmentation-1=no-motion",
        ));
        let out = Morphological.run(&input(facts)).expect("run ok");
        let space = out
            .facts
            .iter()
            .find(|f| f.key == "morphological:solution_space")
            .expect("solution_space fact");
        assert_eq!(space.value, "540");
        assert!(out
            .inference_trace
            .iter()
            .any(|t| t.kind == "cca-assess" && t.detail.contains("36 configurations")));
    }

    #[test]
    fn cca_overlapping_exclusions_inclusion_exclusion() {
        // Two overlapping judgments: A x B kills 36, A x C kills
        // 576 / (4 x 2) = 72, their overlap (A & B & C) is
        // 576 / (4 x 4 x 2) = 18 — by inclusion-exclusion the solution
        // space is 576 - 36 - 72 + 18 = 486. Enumeration must not
        // double-count the overlap.
        let mut facts = zwicky_jet_engine_facts();
        facts.push(fact(
            "morph:exclude",
            "chemical-reactions=self-contained|thrust-augmentation-1=no-motion",
        ));
        facts.push(fact(
            "morph:exclude",
            "chemical-reactions=self-contained|operating-mode=continuous",
        ));
        let out = Morphological.run(&input(facts)).expect("run ok");
        let space = out
            .facts
            .iter()
            .find(|f| f.key == "morphological:solution_space")
            .expect("solution_space fact");
        assert_eq!(space.value, "486");
    }

    #[test]
    fn no_cca_run_has_zero_cca_assess_steps() {
        // Structural fingerprint: without exclusion judgments the CCA
        // machinery must not fire.
        let out = Morphological
            .run(&input(zwicky_jet_engine_facts()))
            .expect("run ok");
        assert_eq!(
            out.inference_trace
                .iter()
                .filter(|t| t.kind == "cca-assess")
                .count(),
            0,
            "no exclusions -> no cca-assess steps"
        );
    }

    #[test]
    fn first_consistent_configuration_is_lexicographic() {
        // Parameters sort by name; the odometer picks index 0 everywhere
        // unless excluded. Excluding the all-zeros prefix pair forces the
        // selection to advance deterministically.
        let mut facts = zwicky_jet_engine_facts();
        facts.push(fact(
            "morph:exclude",
            "chemical-reactions=self-contained|operating-mode=continuous",
        ));
        let out = Morphological.run(&input(facts)).expect("run ok");
        let sel = out.selected.expect("a consistent configuration exists");
        // sorted param order: chemical-reactions, operating-mode,
        // propellant-state, reactivity, thrust-augmentation-1,
        // thrust-augmentation-2; first consistent flips operating-mode.
        assert_eq!(
            sel,
            "chemical-reactions=self-contained;operating-mode=intermittent;\
             propellant-state=gaseous;reactivity=self-igniting;\
             thrust-augmentation-1=no-motion;thrust-augmentation-2=no-augmentation"
        );
    }

    #[test]
    fn empty_solution_space_selects_nothing() {
        // Two binary parameters, all four cross pairs excluded.
        let facts = vec![
            fact("morph:param:a", "x|y"),
            fact("morph:param:b", "p|q"),
            fact("morph:exclude", "a=x|b=p"),
            fact("morph:exclude", "a=x|b=q"),
            fact("morph:exclude", "a=y|b=p"),
            fact("morph:exclude", "a=y|b=q"),
        ];
        let out = Morphological.run(&input(facts.clone())).expect("run ok");
        assert_eq!(out.selected, None);
        let space = out
            .facts
            .iter()
            .find(|f| f.key == "morphological:solution_space")
            .expect("solution_space fact");
        assert_eq!(space.value, "0");
        Morphological
            .postconditions(&input(facts), &out)
            .expect("postconditions");
    }

    #[test]
    fn refuses_single_parameter_field() {
        // Ritchey (2011) §2.3: a model must contain two or more parameters.
        let facts = vec![fact("morph:param:only", "a|b")];
        assert!(Morphological.preconditions(&input(facts)).is_err());
    }

    #[test]
    fn refuses_exclusion_referencing_unknown_value() {
        let mut facts = zwicky_jet_engine_facts();
        facts.push(fact(
            "morph:exclude",
            "chemical-reactions=warp-drive|operating-mode=continuous",
        ));
        assert!(Morphological.preconditions(&input(facts)).is_err());
    }

    #[test]
    fn refuses_same_parameter_exclusion() {
        let mut facts = zwicky_jet_engine_facts();
        facts.push(fact(
            "morph:exclude",
            "operating-mode=continuous|operating-mode=intermittent",
        ));
        assert!(Morphological.preconditions(&input(facts)).is_err());
    }

    #[test]
    fn refuses_field_over_cap() {
        // 8 parameters x 16 values = 16^8 > 1,000,000.
        let facts: Vec<Fact> = (0..8)
            .map(|i| {
                let values: Vec<String> = (0..16).map(|v| format!("v{}", v)).collect();
                fact(&format!("morph:param:p{}", i), &values.join("|"))
            })
            .collect();
        assert!(Morphological.preconditions(&input(facts)).is_err());
    }

    #[test]
    fn reduction_basis_points_are_exact() {
        // 36 of 576 excluded -> 36 * 10000 / 576 = 625 bp.
        let mut facts = zwicky_jet_engine_facts();
        facts.push(fact(
            "morph:exclude",
            "chemical-reactions=self-contained|thrust-augmentation-1=no-motion",
        ));
        let out = Morphological.run(&input(facts)).expect("run ok");
        let bp = out
            .facts
            .iter()
            .find(|f| f.key == "morphological:reduction_bp")
            .expect("reduction_bp fact");
        assert_eq!(bp.value, "625");
    }
}
