//! Belief merging: distance-based IC merging operators Σ and GMax
//! (Konieczny & Pino Pérez, "Merging Information Under Constraints: A Logical
//! Framework", Journal of Logic and Computation 12(5), 2002).
//!
//! Input facts:
//! - `bm:atoms`     value "p,q,..."       — propositional atoms (≤12)
//! - `bm:base:<i>`  value "p,-q"          — belief base K_i as a literal conjunction
//! - `bm:ic`        value "p,-q" | "true" — integrity constraint (literal conjunction)
//! - `bm:operator`  value "sum" | "gmax"  — aggregation function (default "sum")
//!
//! Worlds are enumerated as bitmasks; the Dalal distance from a world to a
//! literal-conjunction base is the number of violated literals (= minimal
//! Hamming distance to the base's models). The merged belief is the set of
//! IC-worlds with minimal aggregated distance vector (Σ: sum; GMax: leximax
//! on the descending-sorted vector).
use std::collections::BTreeMap;

use crate::breeds::support::domain_bound::{BoundedBreed, DomainBound};
use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, CognitionError, Fact, TraceStep,
};

/// Maximum number of atoms (2^12 worlds).
const MAX_ATOMS: usize = 12;

/// Distance-based belief-merging breed.
pub struct BeliefMerging;

impl BoundedBreed for BeliefMerging {
    fn breed_name(&self) -> &'static str {
        "belief_merging"
    }

    fn domain_bound(&self) -> DomainBound {
        DomainBound::default()
    }

    fn custom_check(&self, input: &BreedInput) -> Option<CognitionError> {
        let p = parse(input).ok()?;
        if p.atoms.len() > MAX_ATOMS {
            return Some(CognitionError::ComplexityCap {
                breed: self.breed_name(),
                detail: format!("atom count {} exceeds cap {}", p.atoms.len(), MAX_ATOMS),
            });
        }
        None
    }
}

/// A literal conjunction: (atom index, positive?).
type Conj = Vec<(usize, bool)>;

fn parse_conj(spec: &str, atoms: &[String]) -> Result<Conj, String> {
    let mut lits = Vec::new();
    if spec.trim() == "true" {
        return Ok(lits);
    }
    for raw in spec.split(',').map(str::trim).filter(|s| !s.is_empty()) {
        let (positive, name) = match raw.strip_prefix('-') {
            Some(n) => (false, n.trim()),
            None => (true, raw),
        };
        let idx = atoms
            .iter()
            .position(|a| a == name)
            .ok_or_else(|| format!("unknown atom '{}' in '{}'", name, spec))?;
        lits.push((idx, positive));
    }
    Ok(lits)
}

fn satisfies(world: u32, conj: &Conj) -> bool {
    conj.iter().all(|&(i, pos)| (world & (1 << i) != 0) == pos)
}

/// Dalal distance from a world to a literal-conjunction base.
fn dalal(world: u32, base: &Conj) -> usize {
    base.iter()
        .filter(|&&(i, pos)| (world & (1 << i) != 0) != pos)
        .count()
}

fn render_world(world: u32, atoms: &[String]) -> String {
    atoms
        .iter()
        .enumerate()
        .map(|(i, a)| {
            if world & (1 << i) != 0 {
                a.clone()
            } else {
                format!("-{}", a)
            }
        })
        .collect::<Vec<_>>()
        .join(",")
}

struct Parsed {
    atoms: Vec<String>,
    bases: BTreeMap<String, Conj>,
    ic: Conj,
    gmax: bool,
}

fn parse(input: &BreedInput) -> Result<Parsed, String> {
    let atoms: Vec<String> = input
        .facts
        .iter()
        .find(|f| f.key == "bm:atoms")
        .ok_or("missing bm:atoms fact")?
        .value
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let mut bases: BTreeMap<String, Conj> = BTreeMap::new();
    for f in &input.facts {
        if let Some(i) = f.key.strip_prefix("bm:base:") {
            bases.insert(i.to_string(), parse_conj(&f.value, &atoms)?);
        }
    }
    let ic = input
        .facts
        .iter()
        .find(|f| f.key == "bm:ic")
        .map(|f| parse_conj(&f.value, &atoms))
        .transpose()?
        .unwrap_or_default();
    let gmax = input
        .facts
        .iter()
        .find(|f| f.key == "bm:operator")
        .map(|f| f.value.trim() == "gmax")
        .unwrap_or(false);
    if let Some(f) = input.facts.iter().find(|f| f.key == "bm:operator") {
        if f.value.trim() != "sum" && f.value.trim() != "gmax" {
            return Err(format!("unknown bm:operator '{}'", f.value));
        }
    }
    Ok(Parsed {
        atoms,
        bases,
        ic,
        gmax,
    })
}

impl CognitionBreed for BeliefMerging {
    fn id(&self) -> BreedId {
        BreedId::BeliefMerging
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "ic-merging".to_string(),
            "dalal-distance".to_string(),
            "sigma-and-gmax-aggregation".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let p = parse(input)?;
        if p.atoms.is_empty() {
            return Err("bm:atoms must list at least one atom".to_string());
        }
        self.check_domain_bounds(input).map_err(|e| e.to_string())?;
        if p.bases.len() < 2 {
            return Err("belief merging requires at least two bm:base:* bases".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let p = parse(input).map_err(|m| BreedError {
            breed: BreedId::BeliefMerging,
            message: m,
        })?;
        let n = p.atoms.len();

        let mut trace: Vec<TraceStep> = Vec::new();
        let mut step = 0usize;
        let mut tr = |trace: &mut Vec<TraceStep>, kind: &str, detail: String, depth: u32| {
            trace.push(TraceStep {
                step,
                kind: kind.to_string(),
                detail,
                depth,
                objects: vec![],
            });
            step += 1;
        };

        tr(
            &mut trace,
            "enumerate-worlds",
            format!(
                "{} atoms -> {} worlds, {} bases",
                n,
                1u32 << n,
                p.bases.len()
            ),
            0,
        );

        let ic_worlds: Vec<u32> = (0..(1u32 << n)).filter(|w| satisfies(*w, &p.ic)).collect();
        tr(
            &mut trace,
            "filter-ic",
            format!("{} IC-worlds of {}", ic_worlds.len(), 1u32 << n),
            0,
        );
        if ic_worlds.is_empty() {
            return Err(BreedError {
                breed: BreedId::BeliefMerging,
                message: "integrity constraint is unsatisfiable".to_string(),
            });
        }

        // Score each IC-world.
        let mut scored: Vec<(u32, Vec<usize>, Vec<usize>, usize)> = Vec::new();
        for &w in &ic_worlds {
            let dists: Vec<usize> = p.bases.iter().map(|(_, b)| dalal(w, b)).collect();
            tr(
                &mut trace,
                "distance",
                format!(
                    "w=({}) d=({})",
                    render_world(w, &p.atoms),
                    dists
                        .iter()
                        .map(|d| d.to_string())
                        .collect::<Vec<_>>()
                        .join(",")
                ),
                1,
            );
            let sum: usize = dists.iter().sum();
            let mut sorted_desc = dists.clone();
            sorted_desc.sort_unstable_by(|a, b| b.cmp(a));
            tr(
                &mut trace,
                "aggregate",
                if p.gmax {
                    format!(
                        "w=({}) gmax=({})",
                        render_world(w, &p.atoms),
                        sorted_desc
                            .iter()
                            .map(|d| d.to_string())
                            .collect::<Vec<_>>()
                            .join(",")
                    )
                } else {
                    format!("w=({}) sum={}", render_world(w, &p.atoms), sum)
                },
                1,
            );
            scored.push((w, dists, sorted_desc, sum));
        }

        // Select minimal set under the chosen aggregation.
        let min_set: Vec<u32> = if p.gmax {
            let best = scored.iter().map(|(_, _, v, _)| v).min().unwrap();
            scored
                .iter()
                .filter(|(_, _, v, _)| v == best)
                .map(|(w, _, _, _)| *w)
                .collect()
        } else {
            let best = scored.iter().map(|(_, _, _, s)| *s).min().unwrap();
            scored
                .iter()
                .filter(|(_, _, _, s)| *s == best)
                .map(|(w, _, _, _)| *w)
                .collect()
        };
        tr(
            &mut trace,
            "select-min",
            format!(
                "{} minimal world(s) under {}",
                min_set.len(),
                if p.gmax { "GMax" } else { "Σ" }
            ),
            0,
        );

        let mut facts: Vec<Fact> = Vec::new();
        for (i, w) in min_set.iter().enumerate() {
            facts.push(Fact {
                key: format!("bm:model:{}", i),
                value: render_world(*w, &p.atoms),
            });
        }
        facts.push(Fact {
            key: "bm:model_count".to_string(),
            value: min_set.len().to_string(),
        });
        tr(
            &mut trace,
            "merged-belief",
            format!(
                "[{}]",
                min_set
                    .iter()
                    .map(|w| format!("({})", render_world(*w, &p.atoms)))
                    .collect::<Vec<_>>()
                    .join(" ")
            ),
            0,
        );

        Ok(BreedOutput {
            breed: BreedId::BeliefMerging,
            candidates: input.candidates.clone(),
            facts,
            selected: min_set.first().map(|w| render_world(*w, &p.atoms)),
            explanation: format!(
                "{} merging of {} bases over {} atoms: {} model(s) in the merged belief.",
                if p.gmax { "GMax" } else { "Σ" },
                p.bases.len(),
                n,
                min_set.len()
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        let tq = TraceQuery::from_output(output);
        tq.require_non_empty()?;
        tq.require_first("enumerate-worlds")?;
        tq.require_last("merged-belief")?;
        if !output.facts.iter().any(|f| f.key == "bm:model_count") {
            return Err("missing bm:model_count fact".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fact(key: &str, value: &str) -> Fact {
        Fact {
            key: key.into(),
            value: value.into(),
        }
    }

    fn input(facts: Vec<Fact>) -> BreedInput {
        BreedInput {
            intent: "merge".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        }
    }

    /// Konieczny & Pino Pérez 2002: Σ is majoritarian, GMax is egalitarian —
    /// they disagree on the profile {p∧q, p∧q, ¬p∧¬q} with IC ⊤.
    #[test]
    fn sigma_vs_gmax_discrimination() {
        let base_facts = vec![
            fact("bm:atoms", "p,q"),
            fact("bm:base:1", "p,q"),
            fact("bm:base:2", "p,q"),
            fact("bm:base:3", "-p,-q"),
            fact("bm:ic", "true"),
        ];
        // Σ: world (p,q) has distance vector (0,0,2) sum 2 — unique minimum.
        let mut sum_facts = base_facts.clone();
        sum_facts.push(fact("bm:operator", "sum"));
        let out_sum = BeliefMerging.run(&input(sum_facts)).unwrap();
        assert_eq!(out_sum.selected.as_deref(), Some("p,q"));
        assert!(out_sum
            .facts
            .iter()
            .any(|f| f.key == "bm:model_count" && f.value == "1"));

        // GMax: (1,1,1) beats (2,0,0); minima are (p,¬q) and (¬p,q).
        let mut gmax_facts = base_facts;
        gmax_facts.push(fact("bm:operator", "gmax"));
        let out_gmax = BeliefMerging.run(&input(gmax_facts)).unwrap();
        let models: Vec<&str> = out_gmax
            .facts
            .iter()
            .filter(|f| f.key.starts_with("bm:model:"))
            .map(|f| f.value.as_str())
            .collect();
        assert_eq!(models.len(), 2);
        assert!(models.contains(&"p,-q"));
        assert!(models.contains(&"-p,q"));
    }

    /// Majority opinion excluded by IC: must pick minimal-distance IC-worlds.
    #[test]
    fn ic_overrides_majority() {
        let facts = vec![
            fact("bm:atoms", "a,b"),
            fact("bm:base:1", "a,b"),
            fact("bm:base:2", "a,b"),
            fact("bm:base:3", "-a,-b"),
            fact("bm:ic", "-a"),
        ];
        let out = BeliefMerging.run(&input(facts)).unwrap();
        // IC-worlds: (-a,b) d=(1,1,1) sum 3; (-a,-b) d=(2,2,0) sum 4.
        assert_eq!(out.selected.as_deref(), Some("-a,b"));
        assert!(out
            .facts
            .iter()
            .any(|f| f.key == "bm:model_count" && f.value == "1"));
        assert!(out
            .inference_trace
            .iter()
            .any(|t| t.kind == "distance" && t.detail.contains("d=(1,1,1)")));
    }

    #[test]
    fn refuses_single_base() {
        let facts = vec![fact("bm:atoms", "a"), fact("bm:base:1", "a")];
        assert!(BeliefMerging.preconditions(&input(facts)).is_err());
    }

    #[test]
    fn refuses_domain_cap_violation() {
        let facts = vec![
            fact("bm:atoms", "a,b,c,d,e,f,g,h,i,j,k,l,m"),
            fact("bm:base:1", "a"),
            fact("bm:base:2", "a"),
        ];
        assert!(BeliefMerging.custom_check(&input(facts)).is_some());
    }

    #[test]
    fn falsification_gate_distance_tie_breaker() {
        let facts_sum = vec![
            fact("bm:atoms", "a,b"),
            fact("bm:base:1", "a,b"),
            fact("bm:base:2", "-a,-b"),
            fact("bm:ic", "true"),
            fact("bm:operator", "sum"),
        ];
        let out_sum = BeliefMerging.run(&input(facts_sum)).unwrap();
        assert_eq!(
            out_sum
                .facts
                .iter()
                .find(|f| f.key == "bm:model_count")
                .unwrap()
                .value,
            "4"
        );

        let facts_gmax = vec![
            fact("bm:atoms", "a,b"),
            fact("bm:base:1", "a,b"),
            fact("bm:base:2", "-a,-b"),
            fact("bm:ic", "true"),
            fact("bm:operator", "gmax"),
        ];
        let out_gmax = BeliefMerging.run(&input(facts_gmax)).unwrap();
        assert_eq!(
            out_gmax
                .facts
                .iter()
                .find(|f| f.key == "bm:model_count")
                .unwrap()
                .value,
            "2"
        );
        let models: Vec<&str> = out_gmax
            .facts
            .iter()
            .filter(|f| f.key.starts_with("bm:model:"))
            .map(|f| f.value.as_str())
            .collect();
        assert!(models.contains(&"a,-b"));
        assert!(models.contains(&"-a,b"));
    }

    #[test]
    fn invariant_symmetry_of_bases() {
        let facts1 = vec![
            fact("bm:atoms", "p,q"),
            fact("bm:base:1", "p"),
            fact("bm:base:2", "-p"),
            fact("bm:ic", "q"),
            fact("bm:operator", "sum"),
        ];
        let facts2 = vec![
            fact("bm:atoms", "p,q"),
            fact("bm:base:1", "-p"),
            fact("bm:base:2", "p"),
            fact("bm:ic", "q"),
            fact("bm:operator", "sum"),
        ];
        let out1 = BeliefMerging.run(&input(facts1)).unwrap();
        let out2 = BeliefMerging.run(&input(facts2)).unwrap();

        let mut models1: Vec<&str> = out1
            .facts
            .iter()
            .filter(|f| f.key.starts_with("bm:model:"))
            .map(|f| f.value.as_str())
            .collect();
        let mut models2: Vec<&str> = out2
            .facts
            .iter()
            .filter(|f| f.key.starts_with("bm:model:"))
            .map(|f| f.value.as_str())
            .collect();
        models1.sort();
        models2.sort();
        assert_eq!(models1, models2);
    }
}
