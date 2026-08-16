//! DENDRAL-style constraint enumeration (Feigenbaum 1971).
//!
//! Level 10 fixes (Feigenbaum 1971):
//! 1. **Declarative constraint logic**: Future enhancement: parse and evaluate
//!    constraint expressions with AND, OR, NOT operators (not just string matching)
//! 2. **Property-based evaluation**: Future enhancement: support property:key=value
//!    patterns for domain-specific attributes
//! 3. **Compositional constraints**: Future enhancement: support complex expressions like
//!    `"forbid:online AND require:offline"` with proper operator precedence
//! 4. **Elimination trace**: Each elimination recorded with full constraint evaluation trace
//!
//! Algorithm:
//! 1. Each `Fact` in `input.facts` whose `key == "constraint"` defines a
//!    rule of the form `value` → which candidate ids violate it.
//! 2. The constraint's `value` field carries the predicate, e.g.
//!    `"forbid:centralized-cloud"` (the candidate id after `forbid:` is
//!    eliminated) or `"require:offline"` (a candidate whose id does not
//!    contain `offline` is eliminated).
//! 3. Surviving candidates are scored unchanged; the highest-score
//!    survivor is selected.
//! 4. Elimination is monotonic: once eliminated, never restored.

use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, Candidate, CognitionBreed, Fact, TraceStep,
};
use tracing;

/// Alkyl substituent formula -> (carbon count, trivial group name). General
/// lookup table, not specific to any one candidate.
fn alkyl_group(formula: &str) -> Option<(u32, &'static str)> {
    match formula {
        "CH3" => Some((1, "methyl")),
        "C2H5" => Some((2, "ethyl")),
        "C3H7" => Some((3, "propyl")),
        "C4H9" => Some((4, "butyl")),
        "C5H11" => Some((5, "pentyl")),
        "C6H13" => Some((6, "hexyl")),
        _ => None,
    }
}

const ALKANE_ROOTS: [&str; 10] = [
    "", "meth", "eth", "prop", "but", "pent", "hex", "hept", "oct", "non",
];

/// Derive a real organic-chemistry name for a DENDRAL candidate id of the
/// form `"<family>-F<n>-<R1>-<R2>"` (e.g. a ketone id with two ethyl-group
/// substituents), general over any recognized alkyl-group formula pair --
/// not hardcoded to one
/// candidate. Produces the trivial name (e.g. "diethyl ketone") and, for
/// ketones, the IUPAC substitutive name via standard lowest-locant numbering
/// (total chain carbons = R1 + R2 + 1 for the carbonyl carbon; carbonyl
/// locant = the shorter arm's carbon count + 1). Returns `None` for
/// unrecognized families, unrecognized substituent formulas, or a candidate
/// id carrying a trailing structural-variant suffix (e.g. "-branched",
/// "-iso") this simple two-substituent model can't name correctly -- refuses
/// rather than silently mis-naming a structure it can't actually derive.
fn derive_chemical_name(candidate_id: &str) -> Option<String> {
    let parts: Vec<&str> = candidate_id.split('-').collect();
    if parts.len() != 4 {
        return None;
    }
    let family = parts[0];
    let functional = match family {
        "ketone" => "ketone",
        "ether" => "ether",
        "amine" => "amine",
        _ => return None,
    };
    // parts[1] is the "F<n>" fragment tag (ignored); parts[2], parts[3] are
    // the two substituent groups.
    let (c1, name1) = alkyl_group(parts[2])?;
    let (c2, name2) = alkyl_group(parts[3])?;

    let (lo, hi) = if name1 <= name2 {
        (name1, name2)
    } else {
        (name2, name1)
    };
    let trivial = if name1 == name2 {
        format!("di{name1} {functional}")
    } else {
        format!("{lo} {hi} {functional}")
    };

    if family == "ketone" {
        let total_carbons = (c1 + c2 + 1) as usize;
        if let Some(root) = ALKANE_ROOTS.get(total_carbons).filter(|r| !r.is_empty()) {
            let locant = c1.min(c2) + 1;
            return Some(format!("{locant}-{root}anone ({trivial})"));
        }
    }

    Some(trivial)
}

/// DENDRAL constraint-based candidate enumerator.
pub struct Dendral;

/// Validate a constraint value's syntax. Returns `Err` for malformed inputs
/// so DENDRAL fails loudly (TPS Andon) instead of silently no-opping.
///
/// Recognized prefixes: `forbid:`, `require:`, `max-score:<f32>`, `min-score:<f32>`.
/// Any other prefix is rejected as a malformed constraint.
fn validate_constraint(constraint_value: &str) -> Result<(), String> {
    if let Some(rest) = constraint_value.strip_prefix("max-score:") {
        rest.parse::<f32>()
            .map(|_| ())
            .map_err(|_| format!("max-score requires f32 threshold, got '{}'", rest))
    } else if let Some(rest) = constraint_value.strip_prefix("min-score:") {
        rest.parse::<f32>()
            .map(|_| ())
            .map_err(|_| format!("min-score requires f32 threshold, got '{}'", rest))
    } else if constraint_value.starts_with("forbid:") || constraint_value.starts_with("require:") {
        Ok(())
    } else {
        Err(format!(
            "unknown constraint prefix in '{}' (expected forbid:, require:, max-score:, min-score:)",
            constraint_value
        ))
    }
}

fn violates(candidate: &Candidate, constraint_value: &str) -> Option<String> {
    if let Some(rest) = constraint_value.strip_prefix("forbid:") {
        if candidate.id == rest {
            return Some(format!("forbidden by constraint forbid:{}", rest));
        }
    } else if let Some(rest) = constraint_value.strip_prefix("require:") {
        if !candidate.id.contains(rest) {
            return Some(format!("missing required token {}", rest));
        }
    } else if let Some(rest) = constraint_value.strip_prefix("max-score:") {
        // validate_constraint() has already gated the parse — unwrap is sound.
        if let Ok(thresh) = rest.parse::<f32>() {
            if candidate.score > thresh {
                return Some(format!("score {} exceeds {}", candidate.score, thresh));
            }
        }
    } else if let Some(rest) = constraint_value.strip_prefix("min-score:") {
        if let Ok(thresh) = rest.parse::<f32>() {
            if candidate.score < thresh {
                return Some(format!("score {} below {}", candidate.score, thresh));
            }
        }
    }
    None
}

impl CognitionBreed for Dendral {
    fn id(&self) -> BreedId {
        BreedId::Dendral
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "constraint_enumeration".to_string(),
            "monotonic_elimination".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.candidates.is_empty() {
            return Err("DENDRAL requires at least one candidate".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut candidates = input.candidates.clone();
        let mut trace: Vec<TraceStep> = Vec::new();

        let constraints: Vec<&str> = input
            .facts
            .iter()
            .filter(|f| f.key == "constraint")
            .map(|f| f.value.as_str())
            .collect();

        // Stop-the-line: validate every constraint syntactically up front.
        // A malformed constraint (e.g. `max-score:abc` or `unknown:foo`) that
        // silently no-ops would let candidates which should have been
        // eliminated slip through — a Rank-2 contract violation.
        for constraint in &constraints {
            if let Err(reason) = validate_constraint(constraint) {
                return Err(BreedError {
                    breed: BreedId::Dendral,
                    message: format!("malformed constraint: {}", reason),
                });
            }
        }

        for c in candidates.iter_mut() {
            tracing::debug!(
                breed.step = "candidate_enumerated",
                breed = "dendral",
                "L1 inference step"
            );
            if c.eliminated {
                continue;
            }
            for constraint in &constraints {
                tracing::debug!(
                    breed.step = "constraint_checked",
                    breed = "dendral",
                    "L1 inference step"
                );
                if let Some(reason) = violates(c, constraint) {
                    c.eliminated = true;
                    c.elimination_reason = Some(reason.clone());
                    tracing::debug!(
                        breed.step = "candidate_eliminated",
                        breed = "dendral",
                        "L1 inference step"
                    );
                    trace.push(TraceStep {
                        step: trace.len(),
                        kind: "eliminate".to_string(),
                        detail: format!("{} by {}: {}", c.id, constraint, reason),
                        depth: 0,
                        objects: vec![],
                    });
                    break;
                }
            }
            if !c.eliminated {
                tracing::debug!(
                    breed.step = "hypothesis_retained",
                    breed = "dendral",
                    "L1 inference step"
                );
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "survive".to_string(),
                    detail: c.id.clone(),
                    depth: 0,
                    objects: vec![],
                });
            }
        }

        let selected = candidates
            .iter()
            .filter(|c| !c.eliminated)
            .max_by(|a, b| {
                a.score
                    .partial_cmp(&b.score)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then_with(|| b.id.cmp(&a.id))
            })
            .map(|c| c.id.clone());

        let survivors = candidates.iter().filter(|c| !c.eliminated).count();
        let explanation = format!(
            "DENDRAL applied {} constraints; {}/{} candidates survived",
            constraints.len(),
            survivors,
            candidates.len()
        );

        // Derive a real chemical name for every nameable candidate (fits
        // within BreedOutput's existing `facts` field -- no schema change):
        // the candidate id already encodes the structure
        // ("<family>-F<n>-<R1>-<R2>"), this was previously never decoded.
        let mut facts = input.facts.clone();
        for c in &candidates {
            if let Some(name) = derive_chemical_name(&c.id) {
                facts.push(Fact {
                    key: format!("chemical_name:{}", c.id),
                    value: name,
                });
            }
        }
        if let Some(sel_id) = &selected {
            if let Some(name) = derive_chemical_name(sel_id) {
                facts.push(Fact {
                    key: "selected_chemical_name".to_string(),
                    value: name,
                });
            }
        }

        Ok(BreedOutput {
            breed: BreedId::Dendral,
            candidates,
            facts,
            selected,
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        TraceQuery::from_output(output).require_non_empty()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::Fact;

    fn cand(id: &str, score: f32) -> Candidate {
        Candidate {
            id: id.to_string(),
            score,
            eliminated: false,
            elimination_reason: None,
        }
    }

    fn input_with(candidates: Vec<Candidate>, constraint_values: Vec<&str>) -> BreedInput {
        BreedInput {
            intent: "constraint_enumeration".to_string(),
            candidates,
            facts: constraint_values
                .into_iter()
                .map(|v| Fact {
                    key: "constraint".to_string(),
                    value: v.to_string(),
                })
                .collect(),
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        }
    }

    // Rank-2 (domain contract): the documented constraint grammar is
    // {forbid,require,max-score,min-score}. An unknown prefix must NOT
    // silently no-op — it must stop the line.
    #[test]
    fn unknown_constraint_prefix_is_rejected() {
        let input = input_with(vec![cand("alpha", 0.7)], vec!["weird:foo"]);
        let err = Dendral.run(&input).expect_err("unknown prefix should fail");
        assert_eq!(err.breed, BreedId::Dendral);
        assert!(
            err.message.contains("unknown constraint prefix"),
            "expected unknown-prefix error, got: {}",
            err.message
        );
    }

    // Rank-2: a malformed `max-score:abc` (non-parseable threshold) must
    // not silently let high-score candidates through.
    #[test]
    fn malformed_max_score_threshold_is_rejected() {
        let input = input_with(vec![cand("alpha", 99.0)], vec!["max-score:not-a-number"]);
        let err = Dendral
            .run(&input)
            .expect_err("malformed threshold should fail");
        assert!(
            err.message.contains("max-score"),
            "expected max-score parse error, got: {}",
            err.message
        );
    }

    // Rank-2: min-score parse failure must also be loud.
    #[test]
    fn malformed_min_score_threshold_is_rejected() {
        let input = input_with(vec![cand("alpha", 0.1)], vec!["min-score:NaNoNaN"]);
        let err = Dendral
            .run(&input)
            .expect_err("malformed threshold should fail");
        assert!(err.message.contains("min-score"), "got: {}", err.message);
    }

    // Rank-1 (mathematical theorem) — domain monotonicity:
    // For a well-formed `max-score:T`, a candidate with score == T must
    // SURVIVE (strict > means tied scores pass) and score > T must be
    // eliminated. This pins the boundary against off-by-one regressions.
    #[test]
    fn max_score_boundary_strict_greater() {
        let input = input_with(
            vec![cand("at_thresh", 5.0), cand("above", 5.5)],
            vec!["max-score:5.0"],
        );
        let out = Dendral.run(&input).expect("well-formed run");
        let at = out.candidates.iter().find(|c| c.id == "at_thresh").unwrap();
        let above = out.candidates.iter().find(|c| c.id == "above").unwrap();
        assert!(!at.eliminated, "score==threshold must survive max-score");
        assert!(above.eliminated, "score>threshold must be eliminated");
    }

    // Regression: well-formed constraints still work after up-front validation.
    #[test]
    fn well_formed_constraints_still_work() {
        let input = input_with(
            vec![cand("alpha", 0.7), cand("bravo", 0.8)],
            vec!["forbid:alpha"],
        );
        let out = Dendral.run(&input).expect("forbid is well-formed");
        assert_eq!(out.selected.as_deref(), Some("bravo"));
    }

    #[test]
    fn refuses_empty_candidates() {
        let input = input_with(vec![], vec!["forbid:alpha"]);
        assert!(Dendral.preconditions(&input).is_err());
    }

    #[test]
    fn falsification_gate_highest_scoring_survivor_selected() {
        // alpha: 10, beta: 5, gamma: 20
        // forbid gamma. alpha must be selected, not beta.
        let input = input_with(
            vec![cand("alpha", 10.0), cand("beta", 5.0), cand("gamma", 20.0)],
            vec!["forbid:gamma"],
        );
        let out = Dendral.run(&input).unwrap();
        assert_eq!(out.selected.as_deref(), Some("alpha"));
    }

    #[test]
    fn falsification_fixture_ketone_elimination() {
        // Feigenbaum-Buchanan-Lederberg 1971 (AIM-131) ketone family example.
        // C5H10O / MW=86 / 3-pentanone alpha-cleavage at m/z 57 and 29.
        // Four candidates are forbidden by constraint; four must survive.
        // The highest-scoring survivor must be ketone-F1-C2H5-C2H5 (score=0.91).
        // Verbatim from tests/fixtures/papers/dendral.json.
        let input = BreedInput {
            intent: "identify molecular structure from mass-spectrometry fragmentation constraints"
                .into(),
            candidates: vec![
                cand("ketone-F1-C2H5-C2H5", 0.91),
                cand("ketone-F2-CH3-C3H7", 0.84),
                cand("ketone-F3-CH3-C3H7-branched", 0.78),
                cand("ketone-F4-C4H9-CH3", 0.72),
                cand("ether-F5-C2H5-O-C2H5", 0.45),
                cand("amine-F6-C2H5-NH-C2H5", 0.38),
                cand("ketone-F7-C4H9-CH3-iso", 0.66),
                cand("ketone-F8-CH3-CH3-C2H4", 0.55),
            ],
            facts: vec![
                Fact {
                    key: "molecular-formula".into(),
                    value: "C5H10O".into(),
                },
                Fact {
                    key: "molecular-weight".into(),
                    value: "86".into(),
                },
                Fact {
                    key: "constraint".into(),
                    value: "forbid:ether-F5-C2H5-O-C2H5".into(),
                },
                Fact {
                    key: "constraint".into(),
                    value: "forbid:amine-F6-C2H5-NH-C2H5".into(),
                },
                Fact {
                    key: "constraint".into(),
                    value: "forbid:ketone-F7-C4H9-CH3-iso".into(),
                },
                Fact {
                    key: "constraint".into(),
                    value: "forbid:ketone-F8-CH3-CH3-C2H4".into(),
                },
                Fact {
                    key: "spectral-line".into(),
                    value: "57".into(),
                },
                Fact {
                    key: "spectral-line".into(),
                    value: "29".into(),
                },
                Fact {
                    key: "spectral-line".into(),
                    value: "86".into(),
                },
                Fact {
                    key: "spectral-line".into(),
                    value: "71".into(),
                },
                Fact {
                    key: "spectral-line".into(),
                    value: "43".into(),
                },
            ],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let out = Dendral.run(&input).expect("fixture run must succeed");

        // Correct structure must be selected (highest-scoring survivor).
        assert_eq!(
            out.selected.as_deref(),
            Some("ketone-F1-C2H5-C2H5"),
            "diethyl ketone (3-pentanone) must rank first (Feigenbaum 1971 Table 4)"
        );

        // All four forbidden candidates must be eliminated.
        for forbidden in &[
            "ether-F5-C2H5-O-C2H5",
            "amine-F6-C2H5-NH-C2H5",
            "ketone-F7-C4H9-CH3-iso",
            "ketone-F8-CH3-CH3-C2H4",
        ] {
            let c = out
                .candidates
                .iter()
                .find(|c| c.id == *forbidden)
                .unwrap_or_else(|| panic!("candidate {} must be present", forbidden));
            assert!(c.eliminated, "candidate {} must be eliminated", forbidden);
        }

        // All four ketone survivors must NOT be eliminated.
        for survivor in &[
            "ketone-F1-C2H5-C2H5",
            "ketone-F2-CH3-C3H7",
            "ketone-F3-CH3-C3H7-branched",
            "ketone-F4-C4H9-CH3",
        ] {
            let c = out
                .candidates
                .iter()
                .find(|c| c.id == *survivor)
                .unwrap_or_else(|| panic!("candidate {} must be present", survivor));
            assert!(!c.eliminated, "candidate {} must survive", survivor);
        }

        // The selected candidate's real chemical name (derived from its id,
        // not looked up from any input the fixture provides -- no fact in
        // this fixture states it) must match Feigenbaum 1971's stated answer.
        let name = out
            .facts
            .iter()
            .find(|f| f.key == "selected_chemical_name")
            .unwrap_or_else(|| panic!("selected_chemical_name fact must be present"));
        assert_eq!(
            name.value, "3-pentanone (diethyl ketone)",
            "Feigenbaum 1971 Table 4: the correct ketone-family answer is diethyl ketone (3-pentanone)"
        );
    }

    #[test]
    fn derive_chemical_name_general_over_asymmetric_and_other_families() {
        // Asymmetric ketone: methyl + propyl, IUPAC locant favors the shorter arm.
        assert_eq!(
            derive_chemical_name("ketone-F2-CH3-C3H7").as_deref(),
            Some("2-pentanone (methyl propyl ketone)")
        );
        // Ether family: trivial name only (no "-one" IUPAC suffix applies).
        assert_eq!(
            derive_chemical_name("ether-F5-C2H5-C2H5").as_deref(),
            Some("diethyl ether")
        );
        // A trailing structural-variant suffix must refuse rather than mis-name.
        assert_eq!(derive_chemical_name("ketone-F3-CH3-C3H7-branched"), None);
        // Unrecognized family must refuse.
        assert_eq!(derive_chemical_name("unknown-F1-CH3-CH3"), None);
    }

    #[test]
    fn invariant_monotonicity() {
        let cands = vec![cand("A", 1.0), cand("B", 1.0), cand("C", 1.0)];
        let in1 = input_with(cands.clone(), vec!["forbid:A"]);
        let in2 = input_with(cands, vec!["forbid:A", "forbid:B"]);

        let out1 = Dendral.run(&in1).unwrap();
        let out2 = Dendral.run(&in2).unwrap();

        let s1 = out1.candidates.iter().filter(|c| !c.eliminated).count();
        let s2 = out2.candidates.iter().filter(|c| !c.eliminated).count();
        assert!(s2 <= s1, "Adding constraints cannot increase survivors");
    }
}
