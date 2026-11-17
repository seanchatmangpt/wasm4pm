use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::borrow::Cow;
use std::collections::BTreeMap;

/// SAM (Script Applier Mechanism) breed (Schank 1977).
///
/// Align observations to scripts and infer missing "gap" scenes.
/// Enforces bounded-inference (A8 counter): only scenes BETWEEN observed
/// scenes are inferred.
pub struct ScriptSam;

impl ScriptSam {
    fn parse_scene(s: &str) -> (String, Vec<String>) {
        if let Some(pos) = s.find('(') {
            let name = s[..pos].trim().to_string();
            let args_part = &s[pos + 1..s.len() - 1];
            let args = args_part.split(',').map(|a| a.trim().to_string()).collect();
            (name, args)
        } else {
            (s.trim().to_string(), vec![])
        }
    }

    /// Canonical built-in restaurant script ($RESTAURANT, Schank & Abelson
    /// 1977 Chapter 3): enter, order, eat, pay, leave — with the customer
    /// role as the single variable filler.
    fn builtin_restaurant_script() -> crate::breeds::Rule {
        crate::breeds::Rule {
            id: "restaurant_script".to_string(),
            premise: vec![
                "enter($customer)".to_string(),
                "order($customer)".to_string(),
                "eat($customer)".to_string(),
                "pay($customer)".to_string(),
                "leave($customer)".to_string(),
            ],
            conclusion: "restaurant".to_string(),
            certainty: 1.0,
        }
    }

    /// Canonical built-in airport script: checkin, security, board, fly —
    /// with the passenger role as the single variable filler. SAM carries
    /// both travel and dining scripts in its script inventory.
    fn builtin_airport_script() -> crate::breeds::Rule {
        crate::breeds::Rule {
            id: "airport_script".to_string(),
            premise: vec![
                "checkin($passenger)".to_string(),
                "security($passenger)".to_string(),
                "board($passenger)".to_string(),
                "fly($passenger)".to_string(),
            ],
            conclusion: "airport".to_string(),
            certainty: 1.0,
        }
    }

    /// The built-in script inventory, in deterministic evaluation order.
    fn builtin_scripts() -> Vec<crate::breeds::Rule> {
        vec![
            Self::builtin_airport_script(),
            Self::builtin_restaurant_script(),
        ]
    }

    /// Normalize a fact into an observed scene instance `scene(filler)`.
    ///
    /// Accepts two encodings:
    /// - historical: `key == "observation"`, value already `scene(filler)`.
    /// - SAM fixture: `key == "sam:event:N"`, value `scene:filler`
    ///   (colon-separated scene token and role filler).
    fn observation_from_fact(f: &Fact) -> Option<String> {
        if f.key == "observation" {
            return Some(f.value.clone());
        }
        if f.key.starts_with("sam:event:") {
            // value form "scene:filler" -> "scene(filler)"; bare scene -> "scene"
            if let Some((scene, filler)) = f.value.split_once(':') {
                return Some(format!("{}({})", scene.trim(), filler.trim()));
            }
            return Some(f.value.trim().to_string());
        }
        None
    }

    fn match_scene(pattern: &str, instance: &str, bindings: &mut BTreeMap<String, String>) -> bool {
        let (p_name, p_args) = Self::parse_scene(pattern);
        let (i_name, i_args) = Self::parse_scene(instance);

        if p_name != i_name || p_args.len() != i_args.len() {
            return false;
        }

        let mut local_bindings = bindings.clone();
        for (p_arg, i_arg) in p_args.iter().zip(i_args.iter()) {
            if p_arg.starts_with('$') {
                if let Some(val) = local_bindings.get(p_arg) {
                    if val != i_arg {
                        return false;
                    }
                } else {
                    local_bindings.insert(p_arg.clone(), i_arg.clone());
                }
            } else if p_arg != i_arg {
                return false;
            }
        }

        *bindings = local_bindings;
        true
    }

    fn apply_bindings(pattern: &str, bindings: &BTreeMap<String, String>) -> String {
        let (name, args) = Self::parse_scene(pattern);
        if args.is_empty() {
            return name;
        }
        let bound_args: Vec<String> = args
            .iter()
            .map(|a| {
                if a.starts_with('$') {
                    bindings.get(a).cloned().unwrap_or_else(|| a.clone())
                } else {
                    a.clone()
                }
            })
            .collect();
        format!("{}({})", name, bound_args.join(","))
    }
}

impl CognitionBreed for ScriptSam {
    fn id(&self) -> BreedId {
        BreedId::ScriptSam
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "script-selection".to_string(),
            "alignment".to_string(),
            "gap-inference".to_string(),
            "role-binding".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let has_observations = input
            .facts
            .iter()
            .any(|f| Self::observation_from_fact(f).is_some());
        if !has_observations {
            return Err(
                "no observations to align (need 'observation' or 'sam:event:N' facts)".to_string(),
            );
        }
        // Scripts come either from input.rules or the built-in script inventory.
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();
        let mut inferred_facts = Vec::new();

        let observations: Vec<String> = input
            .facts
            .iter()
            .filter_map(Self::observation_from_fact)
            .collect();

        if observations.is_empty() {
            return Err(BreedError {
                breed: self.id(),
                message: "no observations to align".to_string(),
            });
        }

        // SAM carries a script inventory built-in: if no scripts are supplied
        // in input.rules, fall back to the canonical inventory (airport,
        // restaurant). Otherwise the supplied scripts ARE the inventory.
        let scripts: Cow<'_, [crate::breeds::Rule]> = if input.rules.is_empty() {
            Cow::Owned(Self::builtin_scripts())
        } else {
            Cow::Borrowed(&input.rules)
        };

        // Script selection: evaluate every candidate script against the
        // observation sequence and keep those where ALL observations align
        // (in order, with gaps allowed forward). Overlap = matched events.
        let mut best: Option<(usize, &crate::breeds::Rule, Vec<usize>, BTreeMap<String, String>)> =
            None;
        for script_rule in scripts.as_ref() {
            let script = &script_rule.premise;
            let mut bindings = BTreeMap::new();
            let mut alignment = Vec::new();
            let mut last_idx = 0;
            let mut possible = true;

            for obs in &observations {
                let mut found = false;
                for i in last_idx..script.len() {
                    let mut temp_bindings = bindings.clone();
                    if Self::match_scene(&script[i], obs.as_str(), &mut temp_bindings) {
                        bindings = temp_bindings;
                        alignment.push(i);
                        last_idx = i + 1;
                        found = true;
                        break;
                    }
                }
                if !found {
                    possible = false;
                    break;
                }
            }

            trace.push(TraceStep {
                step: trace.len(),
                kind: "select-script".to_string(),
                detail: format!(
                    "Selected script '{}' (overlap {}/{} events)",
                    script_rule.conclusion,
                    if possible {
                        observations.len()
                    } else {
                        alignment.len()
                    },
                    observations.len()
                ),
                depth: 0,
                objects: vec![("script".to_string(), script_rule.conclusion.clone())],
            });

            if possible {
                let better = match &best {
                    None => true,
                    Some((n, _, _, _)) => alignment.len() > *n,
                };
                if better {
                    best = Some((alignment.len(), script_rule, alignment, bindings));
                }
            }
        }

        let (_, script_rule, alignment, best_bindings) = match best {
            Some(b) => b,
            None => {
                return Err(BreedError {
                    breed: self.id(),
                    message: format!(
                        "could not align observations to any known script (tried {})",
                        scripts.len()
                    ),
                });
            }
        };

        let script = &script_rule.premise;

        // Alignment surface: one step per matched observation.
        for (obs, &scene_idx) in observations.iter().zip(alignment.iter()) {
            let (scene_name, _) = Self::parse_scene(obs);
            trace.push(TraceStep {
                step: trace.len(),
                kind: "align-event".to_string(),
                detail: format!(
                    "'{}' -> scene {} of '{}'",
                    scene_name, scene_idx, script_rule.conclusion
                ),
                depth: 0,
                objects: vec![("script".to_string(), script_rule.conclusion.clone())],
            });
        }

        // Role bindings are script-driven: each `$role` variable bound by the
        // alignment becomes a bind-role step and a sam:role:<role> fact.
        let mut role_count = 0usize;
        for (role_var, filler) in &best_bindings {
            let role = role_var.trim_start_matches('$').to_string();
            inferred_facts.push(Fact {
                key: format!("sam:role:{}", role),
                value: filler.clone(),
            });
            trace.push(TraceStep {
                step: trace.len(),
                kind: "bind-role".to_string(),
                detail: format!("{} := {}", role, filler),
                depth: 0,
                objects: vec![("filler".to_string(), filler.clone())],
            });
            role_count += 1;
        }

        // Bounded gap inference: only scenes BETWEEN the first and last
        // aligned scene indices are inferred (A8 counter).
        let min_idx = alignment[0];
        let max_idx = alignment[alignment.len() - 1];
        let mut gap_count = 0usize;
        for i in min_idx..=max_idx {
            if !alignment.contains(&i) {
                let inferred_scene_pattern = &script[i];
                let inferred_scene = Self::apply_bindings(inferred_scene_pattern, &best_bindings);
                let (scene_name, scene_args) = Self::parse_scene(&inferred_scene);
                let filler = scene_args.first().cloned().unwrap_or_default();

                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "infer-gap".to_string(),
                    detail: format!(
                        "scene '{}' inferred (filler: {})",
                        scene_name, filler
                    ),
                    depth: 0,
                    objects: vec![("scene".to_string(), inferred_scene.clone())],
                });

                // Key the inferred scene by its derived scene token under the
                // sam:inferred: namespace, with the bound role filler as value.
                inferred_facts.push(Fact {
                    key: format!("sam:inferred:{}", scene_name),
                    value: filler,
                });
                gap_count += 1;
            }
        }

        // Summary step (always last): the aligned/gap/role counts.
        let summary_detail = format!(
            "script '{}': {} aligned, {} inferred, {} role binding(s)",
            script_rule.conclusion, alignment.len(), gap_count, role_count
        );
        trace.push(TraceStep {
            step: trace.len(),
            kind: "summary".to_string(),
            detail: summary_detail,
            depth: 0,
            objects: vec![],
        });

        let explanation = format!(
            "Aligned {} observation(s) to script '{}' and inferred {} missing scene(s) \
             with {} role binding(s).",
            alignment.len(),
            script_rule.conclusion,
            gap_count,
            role_count
        );

        Ok(BreedOutput {
            breed: self.id(),
            candidates: input.candidates.clone(),
            facts: inferred_facts,
            selected: Some(script_rule.conclusion.clone()),
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("empty inference trace".to_string());
        }
        let has_select = output
            .inference_trace
            .iter()
            .any(|t| t.kind == "select-script");
        let has_summary = output.inference_trace.iter().any(|t| t.kind == "summary");
        if !has_select || !has_summary {
            return Err("trace must include select-script and summary steps".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_restaurant_gap_inference() {
        let input = BreedInput {
            intent: "".into(),
            candidates: vec![],
            facts: vec![
                Fact {
                    key: "sam:event:1".into(),
                    value: "enter:john".into(),
                },
                Fact {
                    key: "sam:event:2".into(),
                    value: "order:john".into(),
                },
                Fact {
                    key: "sam:event:3".into(),
                    value: "pay:john".into(),
                },
                Fact {
                    key: "sam:event:4".into(),
                    value: "leave:john".into(),
                },
            ],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let out = ScriptSam.run(&input).unwrap();
        assert_eq!(out.selected.as_deref(), Some("restaurant"));
        let eat = out
            .facts
            .iter()
            .find(|f| f.key == "sam:inferred:eat")
            .expect("eat gap must be inferred");
        assert_eq!(eat.value, "john");
        let role = out
            .facts
            .iter()
            .find(|f| f.key == "sam:role:customer")
            .expect("customer role must be bound");
        assert_eq!(role.value, "john");
        assert_eq!(
            out.inference_trace.last().map(|t| t.kind.as_str()),
            Some("summary")
        );
    }

    #[test]
    fn test_airport_builtin_and_gaps() {
        let input = BreedInput {
            intent: "".into(),
            candidates: vec![],
            facts: vec![
                Fact {
                    key: "sam:event:1".into(),
                    value: "checkin: pia".into(),
                },
                Fact {
                    key: "sam:event:2".into(),
                    value: "fly: pia".into(),
                },
            ],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let out = ScriptSam.run(&input).unwrap();
        assert_eq!(out.selected.as_deref(), Some("airport"));
        for scene in ["security", "board"] {
            assert!(
                out.facts
                    .iter()
                    .any(|f| f.key == format!("sam:inferred:{}", scene)
                        && f.value == "pia"),
                "gap '{}' must be inferred for pia",
                scene
            );
        }
        assert!(out
            .facts
            .iter()
            .any(|f| f.key == "sam:role:passenger" && f.value == "pia"));
    }

    #[test]
    fn test_refusal_no_alignable_script() {
        let input = BreedInput {
            intent: "".into(),
            candidates: vec![],
            facts: vec![Fact {
                key: "sam:event:1".into(),
                value: "levitate:zorp".into(),
            }],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        assert!(ScriptSam.run(&input).is_err());
    }

    #[test]
    fn test_refusal_no_observations() {
        let input = BreedInput {
            intent: "".into(),
            candidates: vec![],
            facts: vec![],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        assert!(ScriptSam.preconditions(&input).is_err());
    }
}
