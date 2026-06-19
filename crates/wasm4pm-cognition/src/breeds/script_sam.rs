use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::HashMap;

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

    /// Canonical built-in restaurant script ($RESTAURANT, Schank & Abelson 1977
    /// Chapter 3): enter, order, eat, pay, leave — with the customer role as the
    /// single variable filler. SAM carries this script built-in, so an empty
    /// `input.rules` triggers it.
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

    /// Normalize a fact into an observed scene instance `scene(filler)`.
    ///
    /// Accepts two encodings:
    /// - legacy: `key == "observation"`, value already `scene(filler)`.
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

    fn match_scene(
        pattern: &str,
        instance: &str,
        bindings: &mut HashMap<String, String>,
    ) -> bool {
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

    fn apply_bindings(pattern: &str, bindings: &HashMap<String, String>) -> String {
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
            return Err("no observations to align (need 'observation' or 'sam:event:N' facts)".to_string());
        }
        // Scripts come either from input.rules or the built-in restaurant script.
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();
        let mut inferred_facts = Vec::new();
        let mut step_count = 0;

        let observations: Vec<String> = input
            .facts
            .iter()
            .filter_map(Self::observation_from_fact)
            .collect();

        // SAM carries the restaurant script built-in: if no scripts are
        // supplied in input.rules, fall back to the canonical inventory.
        let scripts: Vec<crate::breeds::Rule> = if input.rules.is_empty() {
            vec![Self::builtin_restaurant_script()]
        } else {
            input.rules.clone()
        };

        if observations.is_empty() {
            return Ok(BreedOutput {
                breed: self.id(),
                candidates: input.candidates.clone(),
                facts: vec![],
                selected: None,
                explanation: "No observations to align.".to_string(),
                inference_trace: trace,
                ocel_log: None,
                retained_cases: vec![],
            });
        }

        let mut best_script = None;
        let mut best_alignment = None;
        let mut best_bindings = HashMap::new();

        for script_rule in &scripts {
            trace.push(TraceStep {
                step: step_count,
                kind: "script-selection".to_string(),
                detail: format!("Evaluating script: {}", script_rule.conclusion),
                depth: 0,
                objects: vec![("script".to_string(), script_rule.conclusion.clone())],
            });
            step_count += 1;

            let script = &script_rule.premise;
            let mut bindings = HashMap::new();
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

            if possible {
                trace.push(TraceStep {
                    step: step_count,
                    kind: "alignment-success".to_string(),
                    detail: format!("Aligned script {} with {} matches", script_rule.conclusion, alignment.len()),
                    depth: 0,
                    objects: vec![("script".to_string(), script_rule.conclusion.clone())],
                });
                step_count += 1;

                if best_alignment.as_ref().map_or(true, |a: &Vec<usize>| alignment.len() > a.len()) {
                    best_script = Some(script_rule);
                    best_alignment = Some(alignment);
                    best_bindings = bindings;
                }
            }
        }

        if let (Some(script_rule), Some(alignment)) = (best_script, best_alignment) {
            let min_idx = alignment[0];
            let max_idx = alignment[alignment.len() - 1];

            trace.push(TraceStep {
                step: step_count,
                kind: "inference-bounds".to_string(),
                detail: format!("Inference bounds: [{}, {}]", min_idx, max_idx),
                depth: 0,
                objects: vec![],
            });
            step_count += 1;

            // Surface the bound role filler (e.g. the customer = john). The
            // single script variable maps to the customer role in $RESTAURANT.
            if let Some(filler) = best_bindings.get("$customer") {
                inferred_facts.push(Fact {
                    key: "sam:role:customer".to_string(),
                    value: filler.clone(),
                });
                trace.push(TraceStep {
                    step: step_count,
                    kind: "role-binding".to_string(),
                    detail: format!("Bound customer role to {}", filler),
                    depth: 0,
                    objects: vec![("filler".to_string(), filler.clone())],
                });
                step_count += 1;
            }

            for i in min_idx..=max_idx {
                if !alignment.contains(&i) {
                    let inferred_scene_pattern = &script_rule.premise[i];
                    let inferred_scene = Self::apply_bindings(inferred_scene_pattern, &best_bindings);
                    let (scene_name, scene_args) = Self::parse_scene(&inferred_scene);
                    let filler = scene_args.first().cloned().unwrap_or_default();

                    trace.push(TraceStep {
                        step: step_count,
                        kind: "gap-inference".to_string(),
                        detail: format!("Inferred scene: {} ({}={})", inferred_scene, scene_name, filler),
                        depth: 0,
                        objects: vec![("scene".to_string(), inferred_scene.clone())],
                    });
                    step_count += 1;

                    // Key the inferred scene by its derived scene token under the
                    // sam:inferred: namespace, with the bound role filler as value.
                    inferred_facts.push(Fact {
                        key: format!("sam:inferred:{}", scene_name),
                        value: filler,
                    });
                }
            }
        }

        // inferred_count is the number of inferred (gap) scenes, excluding the
        // role-binding fact.
        let inferred_count = inferred_facts
            .iter()
            .filter(|f| f.key.starts_with("sam:inferred:"))
            .count();

        let explanation = if best_script.is_some() {
            format!("Successfully aligned to script '{}' and inferred {} missing scenes.", best_script.unwrap().conclusion, inferred_count)
        } else {
            "Could not align observations to any known script.".to_string()
        };

        Ok(BreedOutput {
            breed: self.id(),
            candidates: input.candidates.clone(),
            facts: inferred_facts,
            selected: best_script.map(|s| s.conclusion.clone()),
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
        Ok(())
    }
}
