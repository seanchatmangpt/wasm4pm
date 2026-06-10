//! Description Logic: EL completion-rule classification
//! (Baader, Brandt & Lutz, "Pushing the EL Envelope", IJCAI 2005).
//!
//! Normalized EL TBox axioms are supplied as facts:
//! - `dl:subclass:<A>`        value `<B>`        — A ⊑ B
//! - `dl:conj:<A1>+<A2>`      value `<B>`        — A1 ⊓ A2 ⊑ B
//! - `dl:exists_rhs:<A>`      value `<r>.<B>`    — A ⊑ ∃r.B
//! - `dl:exists_lhs:<r>.<A>`  value `<B>`        — ∃r.A ⊑ B
//!
//! Subsumption queries are goals: `Goal { predicate: "dl:subsumes", value: "<A>:<B>" }`
//! asking whether A ⊑ B is entailed.
//!
//! Completion rules (to fixpoint over `S(C)` subsumer sets and `R(r)` role edges):
//! - CR1: A' ∈ S(A), A' ⊑ B           ⇒ B ∈ S(A)
//! - CR2: A1,A2 ∈ S(A), A1 ⊓ A2 ⊑ B   ⇒ B ∈ S(A)
//! - CR3: A' ∈ S(A), A' ⊑ ∃r.B        ⇒ (A,B) ∈ R(r)
//! - CR4: (A,B) ∈ R(r), B' ∈ S(B), ∃r.B' ⊑ C ⇒ C ∈ S(A)
//!
//! Soundness+completeness for normalized EL TBoxes per the paper's Theorem 1
//! (restricted here to the role-inclusion-free fragment).

use std::collections::{BTreeMap, BTreeSet};

use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};

/// Maximum number of distinct concept names.
const MAX_CONCEPTS: usize = 32;

/// EL completion-rule classifier.
pub struct DescriptionLogic;

struct Tbox {
    /// A ⊑ B
    subclass: Vec<(String, String)>,
    /// A1 ⊓ A2 ⊑ B
    conj: Vec<(String, String, String)>,
    /// A ⊑ ∃r.B
    exists_rhs: Vec<(String, String, String)>,
    /// ∃r.A ⊑ B
    exists_lhs: Vec<(String, String, String)>,
    /// all concept names
    concepts: BTreeSet<String>,
}

fn parse_tbox(input: &BreedInput) -> Result<Tbox, String> {
    let mut t = Tbox {
        subclass: vec![],
        conj: vec![],
        exists_rhs: vec![],
        exists_lhs: vec![],
        concepts: BTreeSet::new(),
    };
    for f in &input.facts {
        if let Some(a) = f.key.strip_prefix("dl:subclass:") {
            t.concepts.insert(a.to_string());
            t.concepts.insert(f.value.clone());
            t.subclass.push((a.to_string(), f.value.clone()));
        } else if let Some(ab) = f.key.strip_prefix("dl:conj:") {
            let (a1, a2) = ab
                .split_once('+')
                .ok_or_else(|| format!("malformed dl:conj key '{}' (need A1+A2)", f.key))?;
            t.concepts.insert(a1.to_string());
            t.concepts.insert(a2.to_string());
            t.concepts.insert(f.value.clone());
            t.conj.push((a1.to_string(), a2.to_string(), f.value.clone()));
        } else if let Some(a) = f.key.strip_prefix("dl:exists_rhs:") {
            let (r, b) = f
                .value
                .split_once('.')
                .ok_or_else(|| format!("malformed dl:exists_rhs value '{}' (need r.B)", f.value))?;
            t.concepts.insert(a.to_string());
            t.concepts.insert(b.to_string());
            t.exists_rhs
                .push((a.to_string(), r.to_string(), b.to_string()));
        } else if let Some(ra) = f.key.strip_prefix("dl:exists_lhs:") {
            let (r, a) = ra
                .split_once('.')
                .ok_or_else(|| format!("malformed dl:exists_lhs key '{}' (need r.A)", f.key))?;
            t.concepts.insert(a.to_string());
            t.concepts.insert(f.value.clone());
            t.exists_lhs
                .push((r.to_string(), a.to_string(), f.value.clone()));
        }
    }
    Ok(t)
}

impl CognitionBreed for DescriptionLogic {
    fn id(&self) -> BreedId {
        BreedId::DescriptionLogic
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "el-subsumption".to_string(),
            "completion-rules-cr1-cr4".to_string(),
            "polynomial-classification".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let t = parse_tbox(input)?;
        if t.subclass.is_empty() && t.conj.is_empty() && t.exists_rhs.is_empty() && t.exists_lhs.is_empty()
        {
            return Err("description_logic requires at least one dl:* TBox axiom fact".to_string());
        }
        if t.concepts.len() > MAX_CONCEPTS {
            return Err(format!(
                "concept count {} exceeds cap {}",
                t.concepts.len(),
                MAX_CONCEPTS
            ));
        }
        if !input.goals.iter().any(|g| g.predicate == "dl:subsumes") {
            return Err("description_logic requires at least one dl:subsumes query goal".to_string());
        }
        for g in input.goals.iter().filter(|g| g.predicate == "dl:subsumes") {
            if !g.value.contains(':') {
                return Err(format!("malformed dl:subsumes goal '{}' (need A:B)", g.value));
            }
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let t = parse_tbox(input).map_err(|m| BreedError {
            breed: BreedId::DescriptionLogic,
            message: m,
        })?;

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
            "normalize",
            format!(
                "{} concepts, {} subclass, {} conj, {} exists-rhs, {} exists-lhs axioms",
                t.concepts.len(),
                t.subclass.len(),
                t.conj.len(),
                t.exists_rhs.len(),
                t.exists_lhs.len()
            ),
            0,
        );

        // S(C) = {C}; ⊤ omitted (no ⊤-axioms in this fragment).
        let mut s: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
        for c in &t.concepts {
            s.insert(c.clone(), BTreeSet::from([c.clone()]));
        }
        // R(r) edges
        let mut r_edges: BTreeSet<(String, String, String)> = BTreeSet::new();

        loop {
            let mut changed = false;

            // CR1
            for a in t.concepts.iter() {
                let subs: Vec<String> = s[a].iter().cloned().collect();
                for ap in &subs {
                    for (x, b) in &t.subclass {
                        if x == ap && !s[a].contains(b) {
                            s.get_mut(a).unwrap().insert(b.clone());
                            tr(&mut trace, "apply-cr1", format!("{} ⊑ {} (via {} ⊑ {})", a, b, ap, b), 1);
                            changed = true;
                        }
                    }
                }
            }
            // CR2
            for a in t.concepts.iter() {
                for (a1, a2, b) in &t.conj {
                    if s[a].contains(a1) && s[a].contains(a2) && !s[a].contains(b) {
                        s.get_mut(a).unwrap().insert(b.clone());
                        tr(&mut trace, "apply-cr2", format!("{} ⊑ {} (via {} ⊓ {})", a, b, a1, a2), 1);
                        changed = true;
                    }
                }
            }
            // CR3
            for a in t.concepts.iter() {
                let subs: Vec<String> = s[a].iter().cloned().collect();
                for ap in &subs {
                    for (x, r, b) in &t.exists_rhs {
                        if x == ap {
                            let edge = (r.clone(), a.clone(), b.clone());
                            if !r_edges.contains(&edge) {
                                tr(&mut trace, "apply-cr3", format!("({},{}) ∈ R({})", a, b, r), 1);
                                r_edges.insert(edge);
                                changed = true;
                            }
                        }
                    }
                }
            }
            // CR4
            let edges: Vec<(String, String, String)> = r_edges.iter().cloned().collect();
            for (r, a, b) in &edges {
                let subs_b: Vec<String> = s[b].iter().cloned().collect();
                for bp in &subs_b {
                    for (r2, x, c) in &t.exists_lhs {
                        if r2 == r && x == bp && !s[a].contains(c) {
                            s.get_mut(a).unwrap().insert(c.clone());
                            tr(&mut trace, "apply-cr4", format!("{} ⊑ {} (via ∃{}.{})", a, c, r, bp), 1);
                            changed = true;
                        }
                    }
                }
            }

            if !changed {
                break;
            }
        }

        let total: usize = s.values().map(|v| v.len()).sum();
        tr(
            &mut trace,
            "fixpoint",
            format!("saturated: {} subsumptions, {} role edges", total, r_edges.len()),
            0,
        );

        let mut facts: Vec<Fact> = Vec::new();
        let mut verdicts: Vec<String> = Vec::new();
        for g in input.goals.iter().filter(|g| g.predicate == "dl:subsumes") {
            let (a, b) = g.value.split_once(':').unwrap_or((g.value.as_str(), ""));
            let holds = s.get(a).map(|set| set.contains(b)).unwrap_or(false);
            tr(
                &mut trace,
                "classify-verdict",
                format!("{} ⊑ {} : {}", a, b, holds),
                0,
            );
            facts.push(Fact {
                key: format!("dl:verdict:{}:{}", a, b),
                value: holds.to_string(),
            });
            verdicts.push(format!("{}⊑{}={}", a, b, holds));
        }

        Ok(BreedOutput {
            breed: BreedId::DescriptionLogic,
            candidates: input.candidates.clone(),
            facts,
            selected: verdicts.first().cloned(),
            explanation: format!(
                "EL completion (CR1–CR4) to fixpoint over {} concepts; verdicts: {}",
                t.concepts.len(),
                verdicts.join("; ")
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("empty inference trace (FM-5 fraud signal)".to_string());
        }
        if !output.inference_trace.iter().any(|t| t.kind == "fixpoint") {
            return Err("missing 'fixpoint' step".to_string());
        }
        if !output
            .inference_trace
            .iter()
            .any(|t| t.kind == "classify-verdict")
        {
            return Err("missing 'classify-verdict' step".to_string());
        }
        if !output.facts.iter().any(|f| f.key.starts_with("dl:verdict:")) {
            return Err("missing dl:verdict fact".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::Goal;

    fn fact(key: &str, value: &str) -> Fact {
        Fact {
            key: key.into(),
            value: value.into(),
        }
    }

    fn input(facts: Vec<Fact>, queries: Vec<&str>) -> BreedInput {
        BreedInput {
            intent: "classify".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: queries
                .into_iter()
                .enumerate()
                .map(|(i, q)| Goal {
                    id: format!("q{}", i),
                    predicate: "dl:subsumes".into(),
                    value: q.into(),
                })
                .collect(),
            state: vec![],
        }
    }

    /// Subsumption derivable only via role chain (CR3 + CR4); reverse NOT derived.
    #[test]
    fn role_chain_subsumption_and_precision() {
        let facts = vec![
            fact("dl:exists_rhs:Zorp", "hasPart.Wibble"),
            fact("dl:subclass:Wibble", "Gronk"),
            fact("dl:exists_lhs:hasPart.Gronk", "Flarn"),
        ];
        let out = DescriptionLogic
            .run(&input(facts, vec!["Zorp:Flarn", "Flarn:Zorp"]))
            .unwrap();
        assert!(out
            .facts
            .iter()
            .any(|f| f.key == "dl:verdict:Zorp:Flarn" && f.value == "true"));
        assert!(out
            .facts
            .iter()
            .any(|f| f.key == "dl:verdict:Flarn:Zorp" && f.value == "false"));
        assert!(out.inference_trace.iter().any(|t| t.kind == "apply-cr3"));
        assert!(out.inference_trace.iter().any(|t| t.kind == "apply-cr4"));
    }

    /// CR1 transitivity + CR2 conjunction.
    #[test]
    fn cr1_cr2_chain() {
        let facts = vec![
            fact("dl:subclass:A", "B"),
            fact("dl:subclass:B", "C"),
            fact("dl:subclass:A", "D"),
            fact("dl:conj:C+D", "E"),
        ];
        let out = DescriptionLogic.run(&input(facts, vec!["A:E"])).unwrap();
        assert!(out
            .facts
            .iter()
            .any(|f| f.key == "dl:verdict:A:E" && f.value == "true"));
        assert!(out.inference_trace.iter().any(|t| t.kind == "apply-cr2"));
    }

    #[test]
    fn refuses_without_query() {
        let facts = vec![fact("dl:subclass:A", "B")];
        let mut inp = input(facts, vec![]);
        inp.goals.clear();
        assert!(DescriptionLogic.preconditions(&inp).is_err());
    }
}
