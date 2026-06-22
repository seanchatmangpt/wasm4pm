//! Mitchell's Candidate Elimination Version Space boundary tracker (Mitchell 1982).
//!
//! Steps: `vs-init`, `vs-update`, `vs-verdict`.
//! Enforces General (G) and Specific (S) boundary constraints.

use crate::breeds::support::domain_bound::{BoundedBreed, DomainBound};
use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, CognitionError, Fact, TraceStep,
};
use std::collections::{BTreeMap, BTreeSet};

/// Version Space Breed
pub struct VersionSpace;

#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
struct Hypothesis {
    constraints: Vec<String>,
}

impl Hypothesis {
    fn more_general_or_equal(&self, other: &Hypothesis) -> bool {
        for (c1, c2) in self.constraints.iter().zip(other.constraints.iter()) {
            if c1 == "?" {
                continue;
            }
            if c2 == "Ø" {
                continue;
            }
            if c1 == "Ø" {
                if c2 != "Ø" {
                    return false;
                }
            } else if c1 != c2 {
                return false;
            }
        }
        true
    }

    fn matches(&self, instance: &[String]) -> bool {
        for (c, v) in self.constraints.iter().zip(instance.iter()) {
            if c == "Ø" {
                return false;
            }
            if c == "?" {
                continue;
            }
            if c != v {
                return false;
            }
        }
        true
    }
}

#[derive(Clone, Debug)]
struct Example {
    values: Vec<String>,
    label: bool,
}

impl CognitionBreed for VersionSpace {
    fn id(&self) -> BreedId {
        BreedId::VersionSpace
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "learning".to_string(),
            "classification".to_string(),
            "version_space".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let has_attributes = input
            .facts
            .iter()
            .any(|f| f.key == "attribute" || f.key == "vs:attrs");
        let has_examples = input
            .facts
            .iter()
            .any(|f| f.key == "example" || f.key.starts_with("vs:example"));
        if !has_attributes || !has_examples {
            return Err(
                "Version Space requires attribute declarations and example facts".to_string(),
            );
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();

        // Parse attributes and their domains.
        // Two encodings supported:
        //  (1) historical: key="attribute", value="Name:val1,val2,..." (explicit domain)
        //  (2) fixture: key="vs:attrs", value="name1,name2,..." (positional, domains
        //      inferred from observed example values)
        let mut attr_names = Vec::new();
        let mut attr_domains: BTreeMap<String, Vec<String>> = BTreeMap::new();
        let mut positional = false;
        for fact in &input.facts {
            if fact.key == "vs:attrs" {
                positional = true;
                for name in fact.value.split(',').map(|s| s.trim().to_string()) {
                    if !name.is_empty() {
                        attr_names.push(name.clone());
                        attr_domains.entry(name).or_default();
                    }
                }
            } else if fact.key == "attribute" {
                if let Some(colon) = fact.value.find(':') {
                    let name = fact.value[..colon].trim().to_string();
                    let values: Vec<String> = fact.value[colon + 1..]
                        .split(',')
                        .map(|s| s.trim().to_string())
                        .collect();
                    attr_names.push(name.clone());
                    attr_domains.insert(name, values);
                }
            }
        }

        trace.push(TraceStep {
            step: trace.len(),
            kind: "vs-init".to_string(),
            detail: format!("Version Space initialized: attributes={:?}", attr_names),
            depth: 0,
            objects: vec![],
        });

        // Parse examples. Collect (index, fact) so positional examples are processed
        // in declared order (vs:example:1..N).
        let mut example_facts: Vec<(u64, &Fact)> = Vec::new();
        for fact in &input.facts {
            if fact.key == "example" {
                example_facts.push((example_facts.len() as u64, fact));
            } else if let Some(suffix) = fact.key.strip_prefix("vs:example") {
                let idx = suffix.trim_start_matches(':').parse::<u64>().unwrap_or(0);
                example_facts.push((idx, fact));
            }
        }
        example_facts.sort_unstable_by_key(|(i, _)| *i);

        let mut examples = Vec::new();
        for (_, fact) in &example_facts {
            // Positional fixture encoding: "v1,v2,...,vN:label"
            if positional {
                let (vals_str, label_str) = match fact.value.rsplit_once(':') {
                    Some((v, l)) => (v, l.trim().to_lowercase()),
                    None => (fact.value.as_str(), String::new()),
                };
                let label = matches!(label_str.as_str(), "positive" | "+" | "1" | "true");
                let values: Vec<String> =
                    vals_str.split(',').map(|s| s.trim().to_string()).collect();
                // Infer domains from observed values.
                for (i, v) in values.iter().enumerate() {
                    if let Some(name) = attr_names.get(i) {
                        let dom = attr_domains.entry(name.clone()).or_default();
                        if !dom.contains(v) {
                            dom.push(v.clone());
                        }
                    }
                }
                examples.push(Example { values, label });
                continue;
            }

            // Historical "k=v,...,label" encoding.
            let parts: Vec<&str> = fact.value.split(',').map(|s| s.trim()).collect();
            if parts.len() > 1 {
                let label_str = parts.last().unwrap().to_lowercase();
                let label = label_str == "positive"
                    || label_str == "+"
                    || label_str == "1"
                    || label_str == "true";

                let mut val_map = BTreeMap::new();
                for part in &parts[..parts.len() - 1] {
                    if let Some(eq) = part.find('=') {
                        let k = part[..eq].trim().to_string();
                        let v = part[eq + 1..].trim().to_string();
                        val_map.insert(k, v);
                    }
                }

                let mut values = Vec::new();
                for attr in &attr_names {
                    let val = val_map
                        .get(attr)
                        .cloned()
                        .unwrap_or_else(|| "?".to_string());
                    values.push(val);
                }
                examples.push(Example { values, label });
            }
        }

        // Initialize S and G sets
        let mut s_set: BTreeSet<Hypothesis> = BTreeSet::new();
        s_set.insert(Hypothesis {
            constraints: vec!["Ø".to_string(); attr_names.len()],
        });

        let mut g_set: BTreeSet<Hypothesis> = BTreeSet::new();
        g_set.insert(Hypothesis {
            constraints: vec!["?".to_string(); attr_names.len()],
        });

        // Update loop. Track |G| after each example for intermediate-boundary evidence.
        let mut g_sizes: Vec<usize> = Vec::new();
        for (idx, example) in examples.iter().enumerate() {
            if example.label {
                // Positive example
                g_set.retain(|g| g.matches(&example.values));

                let mut new_s: BTreeSet<Hypothesis> = BTreeSet::new();
                for s in &s_set {
                    if s.matches(&example.values) {
                        new_s.insert(s.clone());
                    } else {
                        let mut generalized = s.constraints.clone();
                        for i in 0..generalized.len() {
                            if generalized[i] == "Ø" {
                                generalized[i] = example.values[i].clone();
                            } else if generalized[i] != example.values[i] {
                                generalized[i] = "?".to_string();
                            }
                        }
                        let h_gen = Hypothesis {
                            constraints: generalized,
                        };
                        if g_set.iter().any(|g| g.more_general_or_equal(&h_gen)) {
                            new_s.insert(h_gen);
                        }
                    }
                }

                let mut minimal_s: BTreeSet<Hypothesis> = BTreeSet::new();
                for h1 in &new_s {
                    let mut keep = true;
                    for h2 in &new_s {
                        if h1 != h2 && h1.more_general_or_equal(h2) {
                            keep = false;
                            break;
                        }
                    }
                    if keep {
                        minimal_s.insert(h1.clone());
                    }
                }
                s_set = minimal_s;
            } else {
                // Negative example
                s_set.retain(|s| !s.matches(&example.values));

                let mut new_g: BTreeSet<Hypothesis> = BTreeSet::new();
                for g in &g_set {
                    if !g.matches(&example.values) {
                        new_g.insert(g.clone());
                    } else {
                        for i in 0..g.constraints.len() {
                            if g.constraints[i] == "?" {
                                let attr_name = &attr_names[i];
                                if let Some(domain) = attr_domains.get(attr_name) {
                                    for val in domain {
                                        if val != &example.values[i] {
                                            let mut specialized = g.constraints.clone();
                                            specialized[i] = val.clone();
                                            let h_spec = Hypothesis {
                                                constraints: specialized,
                                            };
                                            if s_set.iter().any(|s| h_spec.more_general_or_equal(s))
                                            {
                                                new_g.insert(h_spec);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                let mut maximal_g: BTreeSet<Hypothesis> = BTreeSet::new();
                for h1 in &new_g {
                    let mut keep = true;
                    for h2 in &new_g {
                        if h1 != h2 && h2.more_general_or_equal(h1) {
                            keep = false;
                            break;
                        }
                    }
                    if keep {
                        maximal_g.insert(h1.clone());
                    }
                }
                g_set = maximal_g;
            }

            g_sizes.push(g_set.len());

            // Deterministic, sorted constraint snapshots for the trace detail
            // BTreeSet iteration is sorted by (PartialOrd, Ord) — no sort scaffolding needed.
            let s_snap: Vec<_> = s_set.iter().map(|h| h.constraints.clone()).collect();
            let g_snap: Vec<_> = g_set.iter().map(|h| h.constraints.clone()).collect();

            trace.push(TraceStep {
                step: trace.len(),
                kind: "vs-update".to_string(),
                detail: format!("Update {}: S={:?}, G={:?}", idx + 1, s_snap, g_snap),
                depth: 0,
                objects: vec![],
            });
        }

        // Parse classify target
        let mut classify_instance = None;
        for fact in &input.facts {
            if fact.key == "classify" {
                let parts: Vec<&str> = fact.value.split(',').map(|s| s.trim()).collect();
                let mut val_map = BTreeMap::new();
                for part in &parts {
                    if let Some(eq) = part.find('=') {
                        let k = part[..eq].trim().to_string();
                        let v = part[eq + 1..].trim().to_string();
                        val_map.insert(k, v);
                    }
                }
                let mut values = Vec::new();
                for attr in &attr_names {
                    let val = val_map
                        .get(attr)
                        .cloned()
                        .unwrap_or_else(|| "?".to_string());
                    values.push(val);
                }
                classify_instance = Some(values);
            }
        }

        let mut verdict = "unknown".to_string();
        if let Some(instance) = &classify_instance {
            let matches_all_s = !s_set.is_empty() && s_set.iter().all(|s| s.matches(instance));
            let matches_any_g = g_set.iter().any(|g| g.matches(instance));
            if matches_all_s {
                verdict = "positive".to_string();
            } else if !matches_any_g {
                verdict = "negative".to_string();
            }
        }

        // Deterministic, sorted boundary snapshots (BTreeSet ordering via sorted Vec).
        let s_strs: Vec<String> = s_set.iter().map(|h| h.constraints.join(",")).collect();
        let g_strs: Vec<String> = g_set.iter().map(|h| h.constraints.join(",")).collect();

        // |G| immediately after the final negative example (intermediate G3 in
        // Mitchell's worked EnjoySport derivation).
        let intermediate_g_size = examples
            .iter()
            .enumerate()
            .filter(|(_, e)| !e.label)
            .last()
            .and_then(|(i, _)| g_sizes.get(i).copied())
            .unwrap_or_else(|| g_sizes.last().copied().unwrap_or(0));

        // The candidate-elimination algorithm has converged iff S == G.
        let converged = s_strs == g_strs;

        let mut out_facts = input.facts.clone();
        out_facts.push(Fact {
            key: "vs:S".to_string(),
            value: s_strs.join(" | "),
        });
        out_facts.push(Fact {
            key: "vs:G".to_string(),
            value: g_strs.join(" | "),
        });
        out_facts.push(Fact {
            key: "vs:intermediate_g_size".to_string(),
            value: intermediate_g_size.to_string(),
        });
        out_facts.push(Fact {
            key: "vs:converged".to_string(),
            value: converged.to_string(),
        });

        let explanation = format!(
            "Version Space boundaries: S_size={}, G_size={}. S={}; G={}; \
             intermediate_g_size={}; converged={}. Classification: {}",
            s_set.len(),
            g_set.len(),
            s_strs.join(" | "),
            g_strs.join(" | "),
            intermediate_g_size,
            converged,
            verdict
        );

        trace.push(TraceStep {
            step: trace.len(),
            kind: "vs-verdict".to_string(),
            detail: explanation.clone(),
            depth: 0,
            objects: vec![],
        });

        Ok(BreedOutput {
            breed: self.id(),
            candidates: input.candidates.clone(),
            facts: out_facts,
            selected: Some(verdict),
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("Version Space must record update steps".to_string());
        }
        let kinds: BTreeSet<_> = output
            .inference_trace
            .iter()
            .map(|t| t.kind.clone())
            .collect();
        if !kinds.contains("vs-init")
            || !kinds.contains("vs-update")
            || !kinds.contains("vs-verdict")
        {
            return Err("Version Space trace missing required kinds".to_string());
        }
        Ok(())
    }
}
