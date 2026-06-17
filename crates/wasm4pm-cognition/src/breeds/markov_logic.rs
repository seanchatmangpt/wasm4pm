//! Propositional Markov Logic Network MAP inference via MaxWalkSAT
//! (Richardson & Domingos 2006, "Markov logic networks", Machine Learning 62;
//! MaxWalkSAT: Kautz, Selman & Jiang 1997).
//!
//! Ground clauses are supplied as facts `mln:clause:<id>` with value
//! `<weight>|<lit>,<lit>,...` where a literal is `atom` or `!atom` and the
//! weight is a non-negative finite float. Evidence facts `evidence:<atom>` =
//! `true`/`false` clamp atoms (never flipped).
//!
//! MAP state = assignment minimizing `cost = Σ weight(unsatisfied clauses)`.
//!
//! Determinism-over-paper-fidelity choices (documented):
//! - initial assignment is evidence-clamped, all other atoms `false`
//!   (the paper's random init is replaced by a deterministic one);
//! - the ONLY RNG is `support::rng::seeded_rng()` (SmallRng seeded with 42).
//!
//! Caps: ≤ 256 atoms, ≤ 512 clauses, ≤ 5000 flips. Flip trace is sampled:
//! every flip up to 64, then every 64th.

use crate::breeds::support::rng::seeded_rng;
use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use rand::Rng;
use std::collections::BTreeMap;

/// Propositional MLN MAP solver (MaxWalkSAT).
pub struct MarkovLogic;

const MAX_ATOMS: usize = 256;
const MAX_CLAUSES: usize = 512;
const MAX_FLIPS: usize = 5000;
/// Noise probability numerator (out of 100): random-walk vs greedy move.
const NOISE_PCT: u32 = 50;

/// A weighted ground clause: disjunction of literals `(atom_index, positive)`.
#[derive(Debug, Clone)]
struct GroundClause {
    id: String,
    weight: f64,
    lits: Vec<(usize, bool)>,
}

fn parse_clauses(
    input: &BreedInput,
) -> Result<(Vec<String>, Vec<GroundClause>, BTreeMap<String, bool>), String> {
    // Collect atoms (sorted) and clauses from facts.
    let mut atom_set = std::collections::BTreeSet::new();
    let mut raw: Vec<(String, String)> = Vec::new();
    let mut evidence: BTreeMap<String, bool> = BTreeMap::new();
    for f in &input.facts {
        if let Some(id) = f.key.strip_prefix("mln:clause:") {
            raw.push((id.to_string(), f.value.clone()));
        } else if let Some(atom) = f.key.strip_prefix("evidence:") {
            let v = match f.value.as_str() {
                "true" => true,
                "false" => false,
                other => return Err(format!("evidence '{}' must be true/false, got '{}'", atom, other)),
            };
            evidence.insert(atom.to_string(), v);
            atom_set.insert(atom.to_string());
        }
    }
    if raw.is_empty() {
        return Err("markov_logic requires at least one 'mln:clause:<id>' fact".to_string());
    }
    if raw.len() > MAX_CLAUSES {
        return Err(format!("clause count exceeds {}", MAX_CLAUSES));
    }
    raw.sort();
    let mut parsed: Vec<(String, f64, Vec<(String, bool)>)> = Vec::new();
    for (id, val) in &raw {
        let (w_str, lits_str) = val
            .split_once('|')
            .ok_or_else(|| format!("clause '{}': expected '<weight>|<lits>'", id))?;
        let weight: f64 = w_str
            .trim()
            .parse()
            .map_err(|_| format!("clause '{}': bad weight '{}'", id, w_str))?;
        if !weight.is_finite() || weight < 0.0 {
            return Err(format!("clause '{}': weight must be finite and >= 0", id));
        }
        let mut lits = Vec::new();
        for l in lits_str.split(',') {
            let l = l.trim();
            if l.is_empty() {
                return Err(format!("clause '{}': empty literal", id));
            }
            let (atom, pos) = match l.strip_prefix('!') {
                Some(a) => (a.to_string(), false),
                None => (l.to_string(), true),
            };
            atom_set.insert(atom.clone());
            lits.push((atom, pos));
        }
        parsed.push((id.clone(), weight, lits));
    }
    if atom_set.len() > MAX_ATOMS {
        return Err(format!("atom count exceeds {}", MAX_ATOMS));
    }
    let atoms: Vec<String> = atom_set.into_iter().collect();
    let index: BTreeMap<&str, usize> = atoms
        .iter()
        .enumerate()
        .map(|(i, a)| (a.as_str(), i))
        .collect();
    let clauses = parsed
        .into_iter()
        .map(|(id, weight, lits)| GroundClause {
            id,
            weight,
            lits: lits
                .into_iter()
                .map(|(a, p)| (index[a.as_str()], p))
                .collect(),
        })
        .collect();
    Ok((atoms, clauses, evidence))
}

fn clause_satisfied(c: &GroundClause, assign: &[bool]) -> bool {
    c.lits.iter().any(|&(v, pos)| assign[v] == pos)
}

fn total_cost(clauses: &[GroundClause], assign: &[bool]) -> f64 {
    let s: f64 = clauses
        .iter()
        .filter(|c| !clause_satisfied(c, assign))
        .map(|c| c.weight)
        .sum();
    // Normalize -0.0 to +0.0 so fixed-precision output is bit-stable.
    s + 0.0
}

impl CognitionBreed for MarkovLogic {
    fn id(&self) -> BreedId {
        BreedId::MarkovLogic
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "mln_map_inference".to_string(),
            "max_walk_sat".to_string(),
            "weighted_ground_clauses".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        parse_clauses(input).map(|_| ())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let err = |m: String| BreedError {
            breed: BreedId::MarkovLogic,
            message: m,
        };
        let (atoms, clauses, evidence) = parse_clauses(input).map_err(err)?;

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

        push(
            "ground-clauses",
            format!("{} clauses over {} atoms", clauses.len(), atoms.len()),
            &mut trace,
        );

        // Clamp evidence.
        let mut clamped = vec![false; atoms.len()];
        let mut assign = vec![false; atoms.len()];
        for (atom, v) in &evidence {
            if let Ok(i) = atoms.binary_search(atom) {
                clamped[i] = true;
                assign[i] = *v;
            }
        }
        push(
            "clamp-evidence",
            if evidence.is_empty() {
                "no evidence".to_string()
            } else {
                evidence
                    .iter()
                    .map(|(a, v)| format!("{}={}", a, v))
                    .collect::<Vec<_>>()
                    .join(", ")
            },
            &mut trace,
        );

        // Deterministic init: evidence-clamped, others false.
        let init_cost = total_cost(&clauses, &assign);
        push(
            "init-assignment",
            format!("evidence-clamped, others false; cost={:.6}", init_cost),
            &mut trace,
        );

        let mut rng = seeded_rng();
        let mut best = assign.clone();
        let mut best_cost = init_cost;
        let mut flips_done = 0usize;

        for flip in 0..MAX_FLIPS {
            if best_cost == 0.0 {
                break;
            }
            // Unsatisfied clauses with at least one flippable var, in clause-id order.
            let unsat: Vec<&GroundClause> = clauses
                .iter()
                .filter(|c| !clause_satisfied(c, &assign))
                .filter(|c| c.lits.iter().any(|&(v, _)| !clamped[v]))
                .collect();
            if unsat.is_empty() {
                break; // all unsatisfied clauses fully clamped: no move possible
            }
            let c = unsat[rng.gen_range(0..unsat.len())];
            let mut flippable: Vec<usize> =
                c.lits.iter().map(|&(v, _)| v).filter(|&v| !clamped[v]).collect();
            flippable.sort_unstable();
            flippable.dedup();
            let var = if rng.gen_range(0..100) < NOISE_PCT {
                // Random walk move.
                flippable[rng.gen_range(0..flippable.len())]
            } else {
                // Greedy: var whose flip minimizes resulting cost (lex-least tie-break).
                let mut best_v = flippable[0];
                let mut best_delta = f64::INFINITY;
                for &v in &flippable {
                    assign[v] = !assign[v];
                    let cost = total_cost(&clauses, &assign);
                    assign[v] = !assign[v];
                    if cost < best_delta - 1e-12 {
                        best_delta = cost;
                        best_v = v;
                    }
                }
                best_v
            };
            assign[var] = !assign[var];
            flips_done = flip + 1;
            let cost = total_cost(&clauses, &assign);
            if cost < best_cost - 1e-12 {
                best_cost = cost;
                best = assign.clone();
            }
            // Sampled flip trace: every flip up to 64, then every 64th.
            if flip < 64 || flip % 64 == 0 {
                push(
                    "flip",
                    format!(
                        "#{} clause={} var={} cost={:.6} best={:.6}",
                        flip + 1,
                        c.id,
                        atoms[var],
                        cost,
                        best_cost
                    ),
                    &mut trace,
                );
            }
        }

        push(
            "map-found",
            format!("cost={:.6} after {} flips", best_cost, flips_done),
            &mut trace,
        );

        let mut facts = vec![
            Fact {
                key: "mln:cost".to_string(),
                value: format!("{:.6}", best_cost),
            },
            Fact {
                key: "mln:flips".to_string(),
                value: flips_done.to_string(),
            },
        ];
        for (i, a) in atoms.iter().enumerate() {
            facts.push(Fact {
                key: format!("mln:atom:{}", a),
                value: best[i].to_string(),
            });
        }

        Ok(BreedOutput {
            breed: BreedId::MarkovLogic,
            candidates: input.candidates.clone(),
            facts,
            selected: Some(format!("cost={:.6}", best_cost)),
            explanation: format!(
                "MaxWalkSAT MAP over {} clauses / {} atoms: cost {:.6} ({} flips, seed 42)",
                clauses.len(),
                atoms.len(),
                best_cost,
                flips_done
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        let tq = TraceQuery::from_output(output);
        tq.require_non_empty_with_kinds(&["map-found"])?;
        if !output.facts.iter().any(|f| f.key == "mln:cost") {
            return Err("missing mln:cost fact".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fact(k: &str, v: &str) -> Fact {
        Fact {
            key: k.into(),
            value: v.into(),
        }
    }

    fn input(facts: Vec<Fact>) -> BreedInput {
        BreedInput {
            intent: "map".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        }
    }

    #[test]
    fn satisfiable_reaches_zero_cost() {
        // (a | b) w=1.5, (!a | c) w=2.0 — satisfiable, MAP cost 0.
        let out = MarkovLogic
            .run(&input(vec![
                fact("mln:clause:c1", "1.5|a,b"),
                fact("mln:clause:c2", "2.0|!a,c"),
            ]))
            .expect("run ok");
        let cost = out.facts.iter().find(|f| f.key == "mln:cost").unwrap();
        assert_eq!(cost.value, "0.000000");
    }

    #[test]
    fn contradictory_unit_clauses_pick_heavier() {
        // (a) w=3.0 vs (!a) w=1.0 — optimum violates only the lighter: cost 1.0.
        let out = MarkovLogic
            .run(&input(vec![
                fact("mln:clause:pos", "3.0|a"),
                fact("mln:clause:neg", "1.0|!a"),
            ]))
            .expect("run ok");
        let cost = out.facts.iter().find(|f| f.key == "mln:cost").unwrap();
        assert_eq!(cost.value, "1.000000");
        let a = out.facts.iter().find(|f| f.key == "mln:atom:a").unwrap();
        assert_eq!(a.value, "true");
    }

    #[test]
    fn evidence_is_clamped() {
        // evidence a=false; clause (a) w=5 cannot be satisfied: cost 5.
        let out = MarkovLogic
            .run(&input(vec![
                fact("mln:clause:c", "5.0|a"),
                fact("evidence:a", "false"),
            ]))
            .expect("run ok");
        let cost = out.facts.iter().find(|f| f.key == "mln:cost").unwrap();
        assert_eq!(cost.value, "5.000000");
        let a = out.facts.iter().find(|f| f.key == "mln:atom:a").unwrap();
        assert_eq!(a.value, "false");
    }

    #[test]
    fn refuses_negative_weight_and_empty() {
        assert!(MarkovLogic
            .preconditions(&input(vec![fact("mln:clause:c", "-1.0|a")]))
            .is_err());
        assert!(MarkovLogic.preconditions(&input(vec![])).is_err());
    }

    #[test]
    fn double_run_bit_identical() {
        let inp = input(vec![
            fact("mln:clause:c1", "1.0|a,b"),
            fact("mln:clause:c2", "2.0|!a,c"),
            fact("mln:clause:c3", "0.5|!b,!c"),
            fact("evidence:c", "true"),
        ]);
        let a = MarkovLogic.run(&inp).expect("run1");
        let b = MarkovLogic.run(&inp).expect("run2");
        assert_eq!(
            serde_json::to_string(&a).unwrap(),
            serde_json::to_string(&b).unwrap()
        );
    }
}
