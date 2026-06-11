//! Version-space candidate elimination (Mitchell, "Generalization as Search",
//! Artificial Intelligence 18(2), 1982).
//!
//! Conjunctive hypotheses over nominal attributes. Hypothesis language:
//! each attribute slot is a specific value, `?` (any), or `0` (bottom / no
//! value). The S boundary is a single maximally-specific hypothesis; the G
//! boundary is a set of maximally-general hypotheses.
//!
//! Input facts:
//! - `vs:attrs`        value "a1,a2,..."                 — attribute names
//! - `vs:example:<i>`  value "v1,v2,...:+" or "...:-"    — training examples
//!   (processed in ascending numeric order of <i>)
//!
//! Positive example: minimally generalize S; prune G members not covering it.
//! Negative example: minimally specialize each covering G member using values
//! from S; prune non-maximal and S-incompatible specializations. Boundary
//! collapse (S over-generalized past G, or G empty) is an error.

use crate::breeds::support::domain_bound::{BoundedBreed, DomainBound};
use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, CognitionError, Fact, TraceStep,
};

/// Maximum number of attributes.
const MAX_ATTRS: usize = 12;
/// Maximum number of examples.
const MAX_EXAMPLES: usize = 64;

/// Mitchell candidate-elimination breed.
pub struct VersionSpace;

type Hyp = Vec<String>; // per-attribute: value | "?" | "0"

fn covers(h: &Hyp, ex: &[String]) -> bool {
    h.iter()
        .zip(ex.iter())
        .all(|(s, v)| s == "?" || (s != "0" && s == v))
}

/// h1 more-general-or-equal h2.
fn more_general_eq(h1: &Hyp, h2: &Hyp) -> bool {
    h1.iter().zip(h2.iter()).all(|(a, b)| {
        a == "?" || (a != "0" && a == b) || b == "0"
    })
}

fn render(h: &Hyp) -> String {
    format!("<{}>", h.join(","))
}

struct Parsed {
    attrs: Vec<String>,
    examples: Vec<(Vec<String>, bool)>,
}

fn parse(input: &BreedInput) -> Result<Parsed, String> {
    let attrs: Vec<String> = input
        .facts
        .iter()
        .find(|f| f.key == "vs:attrs")
        .ok_or("missing vs:attrs fact")?
        .value
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let mut indexed: Vec<(usize, Vec<String>, bool)> = Vec::new();
    for f in &input.facts {
        if let Some(i) = f.key.strip_prefix("vs:example:") {
            let idx: usize = i
                .parse()
                .map_err(|_| format!("malformed vs:example index '{}'", i))?;
            let (vals, label) = f
                .value
                .rsplit_once(':')
                .ok_or_else(|| format!("malformed example '{}' (need values:+/-)", f.value))?;
            let pos = match label.trim() {
                "+" => true,
                "-" => false,
                other => return Err(format!("malformed example label '{}'", other)),
            };
            let values: Vec<String> = vals.split(',').map(|s| s.trim().to_string()).collect();
            if values.len() != attrs.len() {
                return Err(format!(
                    "example {} has {} values but {} attributes",
                    idx,
                    values.len(),
                    attrs.len()
                ));
            }
            indexed.push((idx, values, pos));
        }
    }
    indexed.sort_by_key(|(i, _, _)| *i);
    Ok(Parsed {
        attrs,
        examples: indexed.into_iter().map(|(_, v, p)| (v, p)).collect(),
    })
}

impl BoundedBreed for VersionSpace {
    fn breed_name(&self) -> &'static str {
        "version_space"
    }

    fn domain_bound(&self) -> DomainBound {
        DomainBound::default()
    }

    fn custom_check(&self, input: &BreedInput) -> Option<CognitionError> {
        // Unparseable inputs are content errors, reported by preconditions().
        let p = parse(input).ok()?;
        if p.attrs.len() > MAX_ATTRS {
            return Some(CognitionError::ComplexityCap {
                breed: self.breed_name(),
                detail: format!("attribute count {} exceeds cap {}", p.attrs.len(), MAX_ATTRS),
            });
        }
        if p.examples.len() > MAX_EXAMPLES {
            return Some(CognitionError::ComplexityCap {
                breed: self.breed_name(),
                detail: format!(
                    "example count {} exceeds cap {}",
                    p.examples.len(),
                    MAX_EXAMPLES
                ),
            });
        }
        None
    }
}

impl CognitionBreed for VersionSpace {
    fn id(&self) -> BreedId {
        BreedId::VersionSpace
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "candidate-elimination".to_string(),
            "s-g-boundary-maintenance".to_string(),
            "concept-convergence".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let p = parse(input)?;
        if p.attrs.is_empty() {
            return Err("vs:attrs must list at least one attribute".to_string());
        }
        self.check_domain_bounds(input).map_err(|e| e.to_string())?;
        if p.examples.is_empty() {
            return Err("version_space requires at least one vs:example:* fact".to_string());
        }
        if !p.examples.iter().any(|(_, pos)| *pos) {
            return Err("version_space requires at least one positive example".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let p = parse(input).map_err(|m| BreedError {
            breed: BreedId::VersionSpace,
            message: m,
        })?;
        let n = p.attrs.len();

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

        let mut s: Hyp = vec!["0".to_string(); n];
        let mut g: Vec<Hyp> = vec![vec!["?".to_string(); n]];
        tr(
            &mut trace,
            "vs-init",
            format!("S={}, G={{{}}}", render(&s), render(&g[0])),
            0,
        );

        for (i, (ex, pos)) in p.examples.iter().enumerate() {
            if *pos {
                tr(
                    &mut trace,
                    "vs-update",
                    format!("example {} <{}>", i, ex.join(",")),
                    1,
                );
                // Minimally generalize S to cover ex.
                if !covers(&s, ex) {
                    for j in 0..n {
                        if s[j] == "0" {
                            s[j] = ex[j].clone();
                        } else if s[j] != "?" && s[j] != ex[j] {
                            s[j] = "?".to_string();
                        }
                    }
                    tr(&mut trace, "vs-update", format!("S := {}", render(&s)), 2);
                }
                // Prune G members that fail to cover the positive example.
                let before = g.len();
                g.retain(|h| covers(h, ex));
                if g.len() != before {
                    tr(
                        &mut trace,
                        "vs-update",
                        format!("G pruned {} -> {} (non-covering)", before, g.len()),
                        2,
                    );
                }
            } else {
                tr(
                    &mut trace,
                    "vs-update",
                    format!("example {} <{}>", i, ex.join(",")),
                    1,
                );
                if covers(&s, ex) {
                    return Err(BreedError {
                        breed: BreedId::VersionSpace,
                        message: format!(
                            "version space collapsed: S {} covers negative example {}",
                            render(&s),
                            i
                        ),
                    });
                }
                // Specialize each covering G member.
                let mut new_g: Vec<Hyp> = Vec::new();
                for h in &g {
                    if !covers(h, ex) {
                        new_g.push(h.clone());
                        continue;
                    }
                    for j in 0..n {
                        if h[j] == "?" && s[j] != "0" && s[j] != "?" && s[j] != ex[j] {
                            let mut h2 = h.clone();
                            h2[j] = s[j].clone();
                            tr(
                                &mut trace,
                                "vs-update",
                                format!("{} -> {}", render(h), render(&h2)),
                                2,
                            );
                            new_g.push(h2);
                        }
                    }
                }
                // Prune: keep only maximal members, more general than or equal to S.
                let before = new_g.len();
                new_g.retain(|h| more_general_eq(h, &s));
                new_g.sort();
                new_g.dedup();
                let snapshot = new_g.clone();
                new_g.retain(|h| {
                    !snapshot
                        .iter()
                        .any(|h2| h2 != h && more_general_eq(h2, h))
                });
                if new_g.len() != before {
                    tr(
                        &mut trace,
                        "vs-update",
                        format!("G pruned {} -> {} (non-maximal / below S)", before, new_g.len()),
                        2,
                    );
                }
                g = new_g;
                if g.is_empty() {
                    return Err(BreedError {
                        breed: BreedId::VersionSpace,
                        message: format!("version space collapsed: G empty after example {}", i),
                    });
                }
            }
            // Record boundary sizes for auditability.
            tr(
                &mut trace,
                "vs-update",
                format!("|S|=1 S={}, |G|={}", render(&s), g.len()),
                1,
            );
        }

        let converged = g.len() == 1 && g[0] == s;
        if converged {
            tr(&mut trace, "vs-verdict", format!("S == G == {}", render(&s)), 0);
        } else {
            tr(
                &mut trace,
                "vs-verdict",
                format!(
                    "S={}, G={{{}}}",
                    render(&s),
                    g.iter().map(|h| render(h)).collect::<Vec<_>>().join(", ")
                ),
                0,
            );
        }

        let mut facts = vec![Fact {
            key: "vs:s".to_string(),
            value: s.join(","),
        }];
        for (i, h) in g.iter().enumerate() {
            facts.push(Fact {
                key: format!("vs:g:{}", i),
                value: h.join(","),
            });
        }
        facts.push(Fact {
            key: "vs:converged".to_string(),
            value: converged.to_string(),
        });

        Ok(BreedOutput {
            breed: BreedId::VersionSpace,
            candidates: input.candidates.clone(),
            facts,
            selected: Some(s.join(",")),
            explanation: format!(
                "Candidate elimination over {} examples: S={}, |G|={}, converged={}.",
                p.examples.len(),
                render(&s),
                g.len(),
                converged
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        let tq = TraceQuery::from_output(output);
        tq.require_non_empty()?;
        tq.require_first("vs-init")?;
        tq.require_last("vs-verdict")?;
        if !output.facts.iter().any(|f| f.key == "vs:s") {
            return Err("missing vs:s fact".to_string());
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
            intent: "learn concept".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        }
    }

    /// Mitchell's EnjoySport: final S = <Sunny,Warm,?,Strong,?,?>,
    /// intermediate |G| = 3 after the negative example, final |G| = 2.
    #[test]
    fn enjoysport_mitchell_1982() {
        let facts = vec![
            fact("vs:attrs", "sky,airtemp,humidity,wind,water,forecast"),
            fact("vs:example:1", "Sunny,Warm,Normal,Strong,Warm,Same:+"),
            fact("vs:example:2", "Sunny,Warm,High,Strong,Warm,Same:+"),
            fact("vs:example:3", "Rainy,Cold,High,Strong,Warm,Change:-"),
            fact("vs:example:4", "Sunny,Warm,High,Strong,Cool,Change:+"),
        ];
        let out = VersionSpace.run(&input(facts)).unwrap();
        let s = out.facts.iter().find(|f| f.key == "vs:s").unwrap();
        assert_eq!(s.value, "Sunny,Warm,?,Strong,?,?");
        let g: Vec<&str> = out
            .facts
            .iter()
            .filter(|f| f.key.starts_with("vs:g:"))
            .map(|f| f.value.as_str())
            .collect();
        assert_eq!(g.len(), 2);
        assert!(g.contains(&"Sunny,?,?,?,?,?"));
        assert!(g.contains(&"?,Warm,?,?,?,?"));
        // Intermediate |G| = 3 after the negative example (Mitchell 1982 G3).
        assert!(out
            .inference_trace
            .iter()
            .any(|t| t.kind == "vs-update" && t.detail.contains("|G|=3")));
    }

    /// Convergence: S == G after enough examples.
    #[test]
    fn convergence_s_equals_g() {
        let facts = vec![
            fact("vs:attrs", "shape,size,color"),
            fact("vs:example:1", "round,big,red:+"),
            fact("vs:example:2", "square,small,red:-"),
            fact("vs:example:3", "round,big,blue:+"),
            fact("vs:example:4", "round,small,blue:-"),
            fact("vs:example:5", "square,big,green:+"),
        ];
        let out = VersionSpace.run(&input(facts)).unwrap();
        assert!(out
            .facts
            .iter()
            .any(|f| f.key == "vs:converged" && f.value == "true"));
        assert!(out
            .facts
            .iter()
            .any(|f| f.key == "vs:s" && f.value == "?,big,?"));
        assert!(out.inference_trace.iter().any(|t| t.kind == "vs-verdict"));
    }

    /// Collapse: contradictory labels are refused at run time.
    #[test]
    fn collapse_on_contradiction() {
        let facts = vec![
            fact("vs:attrs", "a"),
            fact("vs:example:1", "x:+"),
            fact("vs:example:2", "x:-"),
        ];
        assert!(VersionSpace.run(&input(facts)).is_err());
    }
}
