//! Structure-Mapping Engine (Falkenhainer, Forbus & Gentner 1989).
//!
//! SME maps a base domain onto a target domain by aligning relational
//! structure, not surface attributes. Expressions are s-expressions
//! (facts `base:<i>` / `target:<i>`). A local match between two expressions
//! exists when their functors and arities agree recursively; entities
//! (atoms) align freely but the final mapping must be 1:1 in both
//! directions (parallel connectivity + one-to-one constraint).
//!
//! Systematicity: a match rooted at a relation scores
//! `1 + 2·Σ(child relation scores)` so deeply nested causal chains dominate
//! any count of shallow attribute matches — Gentner's systematicity
//! principle made arithmetic. Gmaps are merged greedily in descending score
//! order subject to 1:1 consistency; candidate inferences are unmatched base
//! expressions whose entities are all covered by the winning mapping.
//!
//! Caps (refusals): ≤32 expressions per side, depth ≤8.

use crate::breeds::support::sexpr::Sexpr;
use crate::breeds::{BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep};
use std::collections::BTreeMap;

/// SME greedy-merge structure mapper.
pub struct AnalogySme;

fn collect(input: &BreedInput, prefix: &str) -> Result<Vec<(String, Sexpr)>, String> {
    let mut out: Vec<(String, Sexpr)> = Vec::new();
    for f in &input.facts {
        if f.key.starts_with(prefix) {
            let e = Sexpr::parse(&f.value)
                .map_err(|e| format!("failed to parse {} '{}': {}", f.key, f.value, e))?;
            out.push((f.key.clone(), e));
        }
    }
    out.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(out)
}

/// Recursive structural alignment. Returns the entity pairs and the
/// systematicity score, or None on functor/arity mismatch.
fn align(b: &Sexpr, t: &Sexpr) -> Option<(Vec<(String, String)>, u64)> {
    match (b, t) {
        (Sexpr::Atom(x), Sexpr::Atom(y)) => Some((vec![(x.clone(), y.clone())], 0)),
        (Sexpr::List(bi), Sexpr::List(ti)) => {
            if b.functor()? != t.functor()? || bi.len() != ti.len() {
                return None;
            }
            let mut pairs: Vec<(String, String)> = Vec::new();
            let mut child_score: u64 = 0;
            for (bc, tc) in bi.iter().zip(ti.iter()).skip(1) {
                let (p, s) = align(bc, tc)?;
                pairs.extend(p);
                child_score += s;
            }
            // Systematicity weight: depth dominates breadth.
            Some((pairs, 1 + 2 * child_score))
        }
        _ => None,
    }
}

/// Check 1:1 consistency of a set of entity pairs (both directions).
fn consistent(mapping: &BTreeMap<String, String>, pairs: &[(String, String)]) -> bool {
    let mut fwd = mapping.clone();
    let mut rev: BTreeMap<String, String> =
        mapping.iter().map(|(k, v)| (v.clone(), k.clone())).collect();
    for (b, t) in pairs {
        if let Some(existing) = fwd.get(b) {
            if existing != t {
                return false;
            }
        }
        if let Some(existing) = rev.get(t) {
            if existing != b {
                return false;
            }
        }
        fwd.insert(b.clone(), t.clone());
        rev.insert(t.clone(), b.clone());
    }
    true
}

fn substitute(e: &Sexpr, mapping: &BTreeMap<String, String>) -> Sexpr {
    match e {
        Sexpr::Atom(a) => Sexpr::Atom(mapping.get(a).cloned().unwrap_or_else(|| a.clone())),
        Sexpr::List(items) => Sexpr::List(items.iter().map(|i| substitute(i, mapping)).collect()),
    }
}

fn entities(e: &Sexpr, out: &mut Vec<String>) {
    match e {
        Sexpr::Atom(a) => out.push(a.clone()),
        Sexpr::List(items) => {
            for i in items.iter().skip(1) {
                entities(i, out);
            }
        }
    }
}

impl CognitionBreed for AnalogySme {
    fn id(&self) -> BreedId {
        BreedId::AnalogySme
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "structure_mapping".to_string(),
            "systematicity_scoring".to_string(),
            "candidate_inference".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let base = collect(input, "base:")?;
        let target = collect(input, "target:")?;
        if base.is_empty() || target.is_empty() {
            return Err("analogy_sme requires at least one base: and one target: expression".to_string());
        }
        if base.len() > 32 || target.len() > 32 {
            return Err(format!(
                "complexity cap exceeded: {} base / {} target expressions > 32 (refusal)",
                base.len(),
                target.len()
            ));
        }
        for (k, e) in base.iter().chain(target.iter()) {
            if e.depth() > 8 {
                return Err(format!("expression '{}' exceeds depth cap 8 (refusal)", k));
            }
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        self.preconditions(input).map_err(|m| BreedError {
            breed: self.id(),
            message: m,
        })?;
        let err = |m: String| BreedError {
            breed: self.id(),
            message: m,
        };
        let base = collect(input, "base:").map_err(&err)?;
        let target = collect(input, "target:").map_err(&err)?;

        let mut trace: Vec<TraceStep> = Vec::new();
        let mut push = |trace: &mut Vec<TraceStep>, kind: &str, detail: String| {
            trace.push(TraceStep {
                step: trace.len(),
                kind: kind.to_string(),
                detail,
                depth: 0,
                objects: vec![],
            });
        };

        for (k, e) in base.iter().chain(target.iter()) {
            push(&mut trace, "parse-expr", format!("{} = {}", k, e));
        }

        // Local match hypotheses between root expressions.
        struct Mh {
            bkey: String,
            tkey: String,
            pairs: Vec<(String, String)>,
            score: u64,
            bidx: usize,
        }
        let mut mhs: Vec<Mh> = Vec::new();
        for (bi, (bk, be)) in base.iter().enumerate() {
            for (tk, te) in &target {
                if let Some((pairs, score)) = align(be, te) {
                    push(
                        &mut trace,
                        "local-match",
                        format!("{} <-> {} (systematicity={})", bk, tk, score),
                    );
                    mhs.push(Mh {
                        bkey: bk.clone(),
                        tkey: tk.clone(),
                        pairs,
                        score,
                        bidx: bi,
                    });
                }
            }
        }
        if mhs.is_empty() {
            return Err(err("no structurally consistent local match between base and target".to_string()));
        }

        // Greedy merge in descending score order (lex tiebreak).
        mhs.sort_by(|a, b| {
            b.score
                .cmp(&a.score)
                .then_with(|| a.bkey.cmp(&b.bkey))
                .then_with(|| a.tkey.cmp(&b.tkey))
        });
        let mut mapping: BTreeMap<String, String> = BTreeMap::new();
        let mut used_targets: Vec<String> = Vec::new();
        let mut matched_base: Vec<usize> = Vec::new();
        let mut gmap_score: u64 = 0;
        for mh in &mhs {
            if matched_base.contains(&mh.bidx) || used_targets.contains(&mh.tkey) {
                continue;
            }
            if consistent(&mapping, &mh.pairs) {
                for (b, t) in &mh.pairs {
                    mapping.insert(b.clone(), t.clone());
                }
                used_targets.push(mh.tkey.clone());
                matched_base.push(mh.bidx);
                gmap_score += mh.score;
                push(
                    &mut trace,
                    "merge-gmap",
                    format!("merged {} <-> {} (gmap score now {})", mh.bkey, mh.tkey, gmap_score),
                );
            }
        }

        // Candidate inferences: unmatched base expressions all of whose
        // entities are covered by the winning mapping.
        let mut facts: Vec<Fact> = mapping
            .iter()
            .map(|(b, t)| Fact {
                key: format!("map:{}", b),
                value: t.clone(),
            })
            .collect();
        let mut inferences = 0usize;
        for (bi, (bk, be)) in base.iter().enumerate() {
            if matched_base.contains(&bi) {
                continue;
            }
            let mut ents = Vec::new();
            entities(be, &mut ents);
            if !ents.is_empty() && ents.iter().all(|e| mapping.contains_key(e)) {
                let inferred = substitute(be, &mapping);
                push(
                    &mut trace,
                    "candidate-inference",
                    format!("{} carried over: {}", bk, inferred),
                );
                facts.push(Fact {
                    key: format!("inference:{}", inferences),
                    value: inferred.to_string(),
                });
                inferences += 1;
            }
        }

        push(
            &mut trace,
            "decision",
            format!(
                "gmap score={}; {} entity correspondences; {} candidate inferences",
                gmap_score,
                mapping.len(),
                inferences
            ),
        );

        facts.push(Fact {
            key: "sme:score".to_string(),
            value: gmap_score.to_string(),
        });

        Ok(BreedOutput {
            breed: self.id(),
            candidates: input.candidates.clone(),
            facts,
            selected: Some(format!("gmap:{}", gmap_score)),
            explanation: format!(
                "SME mapped {} base expressions onto target (systematicity score {}); {} candidate inferences",
                matched_base.len(),
                gmap_score,
                inferences
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("empty inference trace — no evidence of structure mapping".to_string());
        }
        if !output.inference_trace.iter().any(|t| t.kind == "local-match") {
            return Err("no local-match step — mapping did not run".to_string());
        }
        Ok(())
    }
}
