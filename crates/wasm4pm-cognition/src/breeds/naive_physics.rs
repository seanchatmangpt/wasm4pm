//! Naive physics: hand-coded commonsense axiom saturation (Hayes 1979,
//! "The Naive Physics Manifesto"; Hayes 1985, "Naive physics I: ontology
//! for liquids").
//!
//! Unlike the rule-driven breeds, the axioms here are built into the breed
//! (Hayes's point: commonsense physical law is a fixed theory, not user
//! input). The scene is declared with facts; events perturb it; the engine
//! saturates the axioms to a fixpoint and emits predictions, naming the
//! axiom responsible for every derived atom.
//!
//! Axioms:
//! - `ax-support`               — an object is stable iff its support chain
//!                                bottoms out at ground (support transitivity)
//! - `ax-unsupported-falls`     — an object whose direct support is removed
//!                                or itself falls, falls
//! - `ax-containment-transport` — contents of a falling container fall with it
//! - `ax-liquid-spill`          — liquid in a falling/removed container spills
//!
//! Fact contract: `np:on:<a>` = b, `np:in:<a>` = c, `np:liquid:<l>` = c,
//! `np:ground:<x>` = true, `np:remove:<x>` = true.
//! Caps (refusals): ≤64 objects; cyclic support is a refusal.

use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::{BTreeMap, BTreeSet};

/// Hayes-style naive-physics saturation engine.
pub struct NaivePhysics;

struct Scene {
    /// object -> its direct support (on or in)
    support: BTreeMap<String, (String, &'static str)>,
    /// liquid -> container
    liquids: BTreeMap<String, String>,
    grounds: BTreeSet<String>,
    removed: BTreeSet<String>,
    objects: BTreeSet<String>,
}

fn parse_scene(input: &BreedInput) -> Result<Scene, String> {
    let mut support = BTreeMap::new();
    let mut liquids = BTreeMap::new();
    let mut grounds = BTreeSet::new();
    let mut removed = BTreeSet::new();
    let mut objects = BTreeSet::new();
    let mut any = false;
    for f in &input.facts {
        if let Some(a) = f.key.strip_prefix("np:on:") {
            support.insert(a.to_string(), (f.value.clone(), "on"));
            objects.insert(a.to_string());
            objects.insert(f.value.clone());
            any = true;
        } else if let Some(a) = f.key.strip_prefix("np:in:") {
            support.insert(a.to_string(), (f.value.clone(), "in"));
            objects.insert(a.to_string());
            objects.insert(f.value.clone());
            any = true;
        } else if let Some(l) = f.key.strip_prefix("np:liquid:") {
            liquids.insert(l.to_string(), f.value.clone());
            objects.insert(f.value.clone());
            any = true;
        } else if let Some(x) = f.key.strip_prefix("np:ground:") {
            grounds.insert(x.to_string());
            objects.insert(x.to_string());
            any = true;
        } else if let Some(x) = f.key.strip_prefix("np:remove:") {
            removed.insert(x.to_string());
            any = true;
        }
    }
    if !any {
        return Err("naive_physics requires a scene (np:* facts)".to_string());
    }
    if objects.len() > 64 {
        return Err(format!(
            "complexity cap exceeded: {} objects > 64 (refusal, not truncation)",
            objects.len()
        ));
    }
    // Cycle detection on the support chain.
    for start in support.keys() {
        let mut seen = BTreeSet::new();
        let mut cur: &str = start;
        while let Some((next, _)) = support.get(cur) {
            if !seen.insert(cur) {
                return Err(format!(
                    "cyclic support chain involving '{}' (refusal)",
                    start
                ));
            }
            cur = next;
        }
    }
    Ok(Scene {
        support,
        liquids,
        grounds,
        removed,
        objects,
    })
}

impl CognitionBreed for NaivePhysics {
    fn id(&self) -> BreedId {
        BreedId::NaivePhysics
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "support_transitivity".to_string(),
            "containment_transport".to_string(),
            "liquid_behaviour".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        parse_scene(input).map(|_| ())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let scene = parse_scene(input).map_err(|m| BreedError {
            breed: self.id(),
            message: m,
        })?;

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

        push(
            &mut trace,
            "load-scene",
            format!(
                "{} objects, {} support relations, {} liquids, removed: {{{}}}",
                scene.objects.len(),
                scene.support.len(),
                scene.liquids.len(),
                scene.removed.iter().map(String::as_str).collect::<Vec<_>>().join(",")
            ),
        );

        // ax-support: stability via support transitivity.
        for o in &scene.objects {
            if scene.removed.contains(o) {
                continue;
            }
            let mut cur = o.clone();
            let is_stable = loop {
                if scene.grounds.contains(&cur) {
                    break true;
                }
                match scene.support.get(&cur) {
                    Some((sup, _)) => {
                        if scene.removed.contains(sup) {
                            break false;
                        }
                        cur = sup.clone();
                    }
                    None => break false, // unsupported, not ground
                }
            };
            push(
                &mut trace,
                "apply-axiom",
                format!(
                    "ax-support: '{}' is {}",
                    o,
                    if is_stable { "stable" } else { "unstable" }
                ),
            );
        }

        // ax-unsupported-falls + ax-containment-transport: fixpoint.
        let mut falls: BTreeSet<String> = BTreeSet::new();
        let mut axiom_of: BTreeMap<String, &'static str> = BTreeMap::new();
        loop {
            let mut changed = false;
            for o in &scene.objects {
                if falls.contains(o) || scene.removed.contains(o) || scene.grounds.contains(o) {
                    continue;
                }
                if let Some((sup, rel)) = scene.support.get(o) {
                    let support_gone = scene.removed.contains(sup) || falls.contains(sup);
                    if support_gone {
                        falls.insert(o.clone());
                        let ax = if *rel == "in" {
                            "ax-containment-transport"
                        } else {
                            "ax-unsupported-falls"
                        };
                        axiom_of.insert(o.clone(), ax);
                        changed = true;
                    }
                }
            }
            if !changed {
                break;
            }
        }
        let mut falls_sorted: Vec<&String> = falls.iter().collect();
        falls_sorted.sort();
        for o in &falls_sorted {
            push(
                &mut trace,
                "apply-axiom",
                format!("{}: '{}' falls", axiom_of[*o], o),
            );
        }

        // ax-liquid-spill.
        let mut spills: BTreeSet<String> = BTreeSet::new();
        for (l, c) in &scene.liquids {
            if falls.contains(c) || scene.removed.contains(c) {
                spills.insert(l.clone());
                push(
                    &mut trace,
                    "apply-axiom",
                    format!("ax-liquid-spill: '{}' spills from '{}'", l, c),
                );
            }
        }

        let mut facts: Vec<Fact> = Vec::new();
        for o in &falls {
            push(&mut trace, "predict", format!("falls:{}", o));
            facts.push(Fact {
                key: format!("falls:{}", o),
                value: "true".to_string(),
            });
        }
        for l in &spills {
            push(&mut trace, "predict", format!("spills:{}", l));
            facts.push(Fact {
                key: format!("spills:{}", l),
                value: "true".to_string(),
            });
        }

        push(
            &mut trace,
            "decision",
            format!(
                "{} objects fall, {} liquids spill",
                falls.len(),
                spills.len()
            ),
        );

        Ok(BreedOutput {
            breed: self.id(),
            candidates: input.candidates.clone(),
            facts,
            selected: Some(format!("predictions:{}", falls.len() + spills.len())),
            explanation: format!(
                "naive_physics saturated 4 Hayes axioms: {} falls, {} spills predicted",
                falls.len(),
                spills.len()
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        let tq = TraceQuery::from_output(output);
        tq.require_non_empty_with_kinds(&["apply-axiom"])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{BreedInput, Fact};

    fn dummy_input() -> BreedInput {
        BreedInput {
            ..Default::default()
        }
    }

    #[test]
    fn refuses_cyclic_support() {
        let breed = NaivePhysics;
        let mut input = dummy_input();
        input.facts = vec![
            Fact {
                key: "np:on:a".into(),
                value: "b".into(),
            },
            Fact {
                key: "np:on:b".into(),
                value: "c".into(),
            },
            Fact {
                key: "np:on:c".into(),
                value: "a".into(),
            },
        ];
        let err = breed.preconditions(&input).unwrap_err();
        assert!(err.contains("cyclic support"));
    }

    #[test]
    fn falsification_gate_containment_transport() {
        let breed = NaivePhysics;
        let mut input = dummy_input();
        input.facts = vec![
            Fact {
                key: "np:on:table".into(),
                value: "floor".into(),
            },
            Fact {
                key: "np:ground:floor".into(),
                value: "true".into(),
            },
            Fact {
                key: "np:on:cup".into(),
                value: "table".into(),
            },
            Fact {
                key: "np:in:water".into(),
                value: "cup".into(),
            },
            Fact {
                key: "np:liquid:water".into(),
                value: "cup".into(),
            },
            Fact {
                key: "np:remove:table".into(),
                value: "true".into(),
            },
        ];
        let out = breed.run(&input).expect("should run");

        let mut falls = vec![];
        let mut spills = vec![];
        for f in &out.facts {
            if f.key.starts_with("falls:") {
                falls.push(f.key.replace("falls:", ""));
            }
            if f.key.starts_with("spills:") {
                spills.push(f.key.replace("spills:", ""));
            }
        }
        falls.sort();
        spills.sort();
        assert!(falls.contains(&"cup".to_string()));
        assert!(falls.contains(&"water".to_string()));
        assert!(spills.contains(&"water".to_string()));
    }

    /// Hayes 1979 / 1985 paper fixture (naive_physics.json):
    /// cup falls when table is removed; water spills from cup; floor does NOT fall.
    /// The fixture's expected.not_falls = ["floor","table"] — over-derivation is a defect.
    #[test]
    fn hayes_1985_cup_falls_water_spills_floor_stable() {
        let breed = NaivePhysics;
        let mut input = dummy_input();
        input.facts = vec![
            Fact {
                key: "np:ground:floor".into(),
                value: "true".into(),
            },
            Fact {
                key: "np:on:table".into(),
                value: "floor".into(),
            },
            Fact {
                key: "np:on:cup".into(),
                value: "table".into(),
            },
            Fact {
                key: "np:liquid:water".into(),
                value: "cup".into(),
            },
            Fact {
                key: "np:remove:table".into(),
                value: "true".into(),
            },
        ];
        let out = breed.run(&input).expect("should run");

        // cup falls: its direct support (table) was removed — ax-unsupported-falls
        assert!(
            out.facts
                .iter()
                .any(|f| f.key == "falls:cup" && f.value == "true"),
            "cup must fall when table is removed"
        );
        // water spills: its container (cup) fell — ax-liquid-spill
        assert!(
            out.facts
                .iter()
                .any(|f| f.key == "spills:water" && f.value == "true"),
            "water must spill when cup falls"
        );
        // floor must NOT fall: it is ground (over-derivation is a defect per Hayes fixture)
        assert!(
            !out.facts.iter().any(|f| f.key == "falls:floor"),
            "floor must not fall — it is ground; over-derivation is a defect"
        );
        // table was removed (not fallen), must NOT appear in falls set
        assert!(
            !out.facts.iter().any(|f| f.key == "falls:table"),
            "table was removed, not fallen — must not appear in falls"
        );
    }

    #[test]
    fn invariant_monotonicity() {
        let breed = NaivePhysics;
        let mut input1 = dummy_input();
        input1.facts = vec![
            Fact {
                key: "np:on:b1".into(),
                value: "b2".into(),
            },
            Fact {
                key: "np:on:b2".into(),
                value: "floor".into(),
            },
            Fact {
                key: "np:ground:floor".into(),
                value: "true".into(),
            },
        ];
        let out1 = breed.run(&input1).unwrap();

        let mut input2 = input1.clone();
        input2.facts.push(Fact {
            key: "np:remove:floor".into(),
            value: "true".into(),
        });
        let out2 = breed.run(&input2).unwrap();

        let count1: usize = out1
            .selected
            .unwrap()
            .replace("predictions:", "")
            .parse()
            .unwrap();
        let count2: usize = out2
            .selected
            .unwrap()
            .replace("predictions:", "")
            .parse()
            .unwrap();

        assert!(count2 >= count1, "Monotonicity invariant");
    }
}
