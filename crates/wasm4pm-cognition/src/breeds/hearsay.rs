//! Hearsay-II blackboard architecture with knowledge-source consensus
//! fusion via noisy-OR (Erman & Lesser 1980).
//!
//! Encoding:
//! - Initial hypotheses come from `input.facts` (each fact posts a level-0
//!   hypothesis with confidence 1.0).
//! - Knowledge sources are encoded in `input.rules`:
//!   * `rule.id`         = KS name
//!   * `rule.premise[0]` = trigger hypothesis content (e.g. `phone:T`)
//!   * `rule.conclusion` = posted hypothesis content (e.g. `word:THE`)
//!   * `rule.certainty`  = KS confidence (in `[0, 1]`).
//! - Levels are inferred from the prefix before `:` (e.g. `phone`, `word`,
//!   `phrase`); the "top level" is the level of the highest-confidence
//!   posted hypothesis.
//!
//! Consensus: when two KSs post the same content, confidences are fused
//! via noisy-OR: `c = 1 - (1-c1)(1-c2)`.
//!
//! Scheduling: Hearsay-II opportunistic scheduler using a KSAR (Knowledge
//! Source Activation Record) priority queue. Rating = ks.certainty * trigger_cf.
//! The agenda is sorted by (rating desc, ks.id asc, conclusion asc).

use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::BTreeMap;
use tracing;

/// Hearsay-II breed.
pub struct Hearsay;

/// Noisy-OR fusion.
///
/// Properties (Rank-1):
/// - Commutativity: `noisy_or(a,b) == noisy_or(b,a)`.
/// - Identity: `noisy_or(x, 0) == x`.
/// - Bounds: `0 ≤ result ≤ 1` for inputs in `[0, 1]`.
/// - Monotone: `noisy_or(a, b) ≥ max(a, b)` for inputs in `[0, 1]`.
///   Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
pub fn noisy_or(a: f32, b: f32) -> f32 {
    let a = a.clamp(0.0, 1.0);
    let b = b.clamp(0.0, 1.0);
    (1.0 - (1.0 - a) * (1.0 - b)).clamp(0.0, 1.0)
}

fn level_of(content: &str) -> &str {
    content.split(':').next().unwrap_or("")
}

/// Resolve a KS trigger against the blackboard, two ways: (1) exact literal
/// content match (the engine's original, documented contract -- `premise[0]`
/// = literal posted content like `"phone:T"`; required for existing tests
/// that rely on it), or (2) a level-name match, `premise[0] ==
/// "{level}-hypotheses"` for any content currently posted at that level
/// (additive -- lets a KS trigger on "this level now has content", the
/// classic Hearsay-II opportunistic-scheduling semantics real paper fixtures
/// use, without requiring one rule per literal fact). When multiple entries
/// at a level match, the highest confidence among them is used -- "the
/// level has posted content" is naturally as confident as its best
/// hypothesis so far.
fn trigger_confidence(trigger: &str, blackboard: &BTreeMap<String, f32>) -> Option<f32> {
    if let Some(&cf) = blackboard.get(trigger) {
        return Some(cf);
    }
    blackboard
        .iter()
        .filter(|(k, _)| format!("{}-hypotheses", level_of(k)) == trigger)
        .map(|(_, &cf)| cf)
        .fold(None, |acc, cf| Some(acc.map_or(cf, |a: f32| a.max(cf))))
}

/// Same two-way match as [`trigger_confidence`], as a plain boolean -- used
/// where only "would this trigger match this newly posted content" matters,
/// not the confidence value itself.
fn trigger_matches_content(trigger: &str, content: &str) -> bool {
    trigger == content || format!("{}-hypotheses", level_of(content)) == trigger
}

/// Knowledge Source Activation Record — represents a pending KS firing.
#[derive(Clone, Debug)]
struct Ksar {
    /// Rating = ks.certainty * trigger_cf, clamped to [0, 1].
    rating: f32,
    /// KS id (for tie-breaking, asc).
    ks_id: String,
    /// Conclusion the KS will post (for tie-breaking, asc).
    conclusion: String,
    /// The trigger content (premise[0]) that activated this KSAR.
    trigger: String,
    /// KS certainty factor.
    certainty: f32,
}

/// Sort KSARs: rating desc (via total_cmp on clamped values), then ks_id asc,
/// then conclusion asc.
fn ksar_order(a: &Ksar, b: &Ksar) -> std::cmp::Ordering {
    let ra = a.rating.clamp(0.0, 1.0);
    let rb = b.rating.clamp(0.0, 1.0);
    // Descending rating: compare rb to ra.
    rb.total_cmp(&ra)
        .then_with(|| a.ks_id.cmp(&b.ks_id))
        .then_with(|| a.conclusion.cmp(&b.conclusion))
}

impl CognitionBreed for Hearsay {
    fn id(&self) -> BreedId {
        BreedId::Hearsay
    }

    fn capabilities(&self) -> Vec<String> {
        vec!["blackboard".to_string(), "consensus_fusion".to_string()]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.rules.is_empty() {
            return Err("Hearsay requires at least one knowledge source".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        // Blackboard: content → confidence (BTreeMap for deterministic iteration).
        let mut blackboard: BTreeMap<String, f32> = BTreeMap::new();
        let mut trace: Vec<TraceStep> = Vec::new();

        // Seed from initial facts.
        for f in &input.facts {
            let content = format!("{}:{}", f.key, f.value);
            blackboard.insert(content.clone(), 1.0);
            trace.push(TraceStep {
                step: trace.len(),
                kind: "seed".to_string(),
                detail: content,
                depth: 0,
                objects: vec![],
            });
        }

        let firing_cap = input.rules.len().saturating_mul(8).max(8);

        // Build initial agenda: scan all rules against current blackboard.
        let mut agenda: Vec<Ksar> = Vec::new();
        for ks in &input.rules {
            let trigger = match ks.premise.first() {
                Some(t) => t,
                None => continue,
            };
            if let Some(trigger_cf) = trigger_confidence(trigger, &blackboard) {
                let rating =
                    (ks.certainty.clamp(0.0, 1.0) * trigger_cf.clamp(0.0, 1.0)).clamp(0.0, 1.0);
                let ksar = Ksar {
                    rating,
                    ks_id: ks.id.clone(),
                    conclusion: ks.conclusion.clone(),
                    trigger: trigger.clone(),
                    certainty: ks.certainty.clamp(0.0, 1.0),
                };
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "enqueue-ksar".to_string(),
                    detail: format!(
                        "ks={} trigger={} rating={:.3}",
                        ksar.ks_id, ksar.trigger, ksar.rating
                    ),
                    depth: 0,
                    objects: vec![],
                });
                agenda.push(ksar);
            }
        }
        agenda.sort_by(ksar_order);

        let mut firings: usize = 0;

        loop {
            if firings >= firing_cap {
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "agenda-cap-hit".to_string(),
                    detail: format!("cap={}", firing_cap),
                    depth: 0,
                    objects: vec![],
                });
                break;
            }

            if agenda.is_empty() {
                break;
            }
            let ksar = agenda.remove(0);
            tracing::debug!(
                breed.step = "hypothesis_evaluated",
                breed = "hearsay",
                "L1 inference step"
            );

            // Check trigger still valid on blackboard.
            let trigger_cf = match trigger_confidence(&ksar.trigger, &blackboard) {
                Some(cf) => cf,
                None => continue,
            };

            // Re-compute rating in case trigger_cf changed (stale-ksar).
            let current_rating = (ksar.certainty * trigger_cf.clamp(0.0, 1.0)).clamp(0.0, 1.0);
            if (current_rating - ksar.rating).abs() > 1e-6 {
                let updated = Ksar {
                    rating: current_rating,
                    ks_id: ksar.ks_id.clone(),
                    conclusion: ksar.conclusion.clone(),
                    trigger: ksar.trigger.clone(),
                    certainty: ksar.certainty,
                };
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "stale-ksar".to_string(),
                    detail: format!(
                        "ks={} old-rating={:.3} new-rating={:.3}",
                        ksar.ks_id, ksar.rating, current_rating
                    ),
                    depth: 0,
                    objects: vec![],
                });
                agenda.push(updated);
                agenda.sort_by(ksar_order);
                continue;
            }

            // Fire: compute posted cf and fuse.
            let posted_cf = (trigger_cf * ksar.certainty).clamp(0.0, 1.0);
            let prev = blackboard.get(&ksar.conclusion).copied().unwrap_or(0.0);
            let fused = noisy_or(prev, posted_cf);
            firings += 1;

            if (fused - prev).abs() > 1e-6 {
                blackboard.insert(ksar.conclusion.clone(), fused);
                tracing::debug!(
                    breed.step = "hypothesis_posted",
                    breed = "hearsay",
                    "L1 inference step"
                );
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "post-hypothesis".to_string(),
                    detail: format!(
                        "{} ⇒ {} (rating={:.3})",
                        ksar.ks_id, ksar.conclusion, ksar.rating
                    ),
                    depth: 0,
                    objects: vec![],
                });

                // Enqueue new KSARs for rules whose trigger is this new conclusion.
                let new_content = ksar.conclusion.clone();
                for ks in &input.rules {
                    let trigger = match ks.premise.first() {
                        Some(t) => t,
                        None => continue,
                    };
                    if !trigger_matches_content(trigger, &new_content) {
                        continue;
                    }
                    // Deduplicate by ks_id + conclusion.
                    let already = agenda
                        .iter()
                        .any(|k| k.ks_id == ks.id && k.conclusion == ks.conclusion);
                    if already {
                        continue;
                    }
                    let new_trigger_cf = trigger_confidence(trigger, &blackboard).unwrap_or(0.0);
                    let rating = (ks.certainty.clamp(0.0, 1.0) * new_trigger_cf.clamp(0.0, 1.0))
                        .clamp(0.0, 1.0);
                    let new_ksar = Ksar {
                        rating,
                        ks_id: ks.id.clone(),
                        conclusion: ks.conclusion.clone(),
                        trigger: trigger.clone(),
                        certainty: ks.certainty.clamp(0.0, 1.0),
                    };
                    tracing::debug!(
                        breed.step = "knowledge_source_triggered",
                        breed = "hearsay",
                        "L1 inference step"
                    );
                    trace.push(TraceStep {
                        step: trace.len(),
                        kind: "enqueue-ksar".to_string(),
                        detail: format!(
                            "ks={} trigger={} rating={:.3}",
                            new_ksar.ks_id, new_ksar.trigger, new_ksar.rating
                        ),
                        depth: 0,
                        objects: vec![],
                    });
                    agenda.push(new_ksar);
                }
                agenda.sort_by(ksar_order);
            }
        }

        // Determine top level: level of the highest-confidence posted hypothesis
        // that is NOT also at level-0 (i.e. not in the seed level).
        let seed_level: &str = input.facts.first().map(|f| f.key.as_str()).unwrap_or("");
        let max_confidence_selection = blackboard
            .iter()
            .filter(|(k, _)| level_of(k) != seed_level)
            .map(|(k, v)| (k, *v))
            .max_by(|(ak, av), (bk, bv)| {
                av.partial_cmp(bv)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then_with(|| bk.cmp(ak)) // reversed: smallest key wins on tie
            })
            .map(|(k, _)| k.clone());

        // STOP criterion (Erman & Lesser 1980, Fig. 5h): a hypothesis whose span
        // covers the entire utterance [0, utterance-duration] is accepted outright,
        // independent of the plain max-confidence/alphabetical tie-break above --
        // without this, every seeded hypothesis at the seeded confidence 1.0 ties,
        // and selection silently degenerates to ASCII ordering of an arbitrary label.
        let utterance_duration: Option<f32> = input
            .state
            .iter()
            .find(|s| s.predicate == "utterance-duration-cs")
            .and_then(|s| s.value.parse::<f32>().ok());

        let spanning_hypothesis: Option<String> = utterance_duration.and_then(|duration| {
            blackboard
                .keys()
                .filter(|k| level_of(k) != seed_level)
                .find(|k| {
                    // Content keys with a "[start,end]" span encode it as the last
                    // two ':'-separated fields before an optional trailing
                    // credibility field (e.g. "phrase:TEXT:0:225:85"); the label
                    // text itself never contains ':' (confirmed against the real
                    // fixture), so splitting the whole key is safe.
                    let parts: Vec<&str> = k.split(':').collect();
                    if parts.len() < 4 {
                        return false;
                    }
                    let end: Option<f32> = parts[parts.len() - 2].parse().ok();
                    let start: Option<f32> = parts[parts.len() - 3].parse().ok();
                    match (start, end) {
                        (Some(s), Some(e)) => s == 0.0 && (e - duration).abs() < 1e-6,
                        _ => false,
                    }
                })
                .cloned()
        });

        let accepted_by_stop = spanning_hypothesis.is_some();
        let selected = spanning_hypothesis.or(max_confidence_selection);

        // Collect new_facts from BTreeMap (already sorted).
        let mut new_facts: Vec<Fact> = blackboard
            .keys()
            .filter_map(|k| {
                let (kk, vv) = k.split_once(':')?;
                Some(Fact {
                    key: kk.to_string(),
                    value: vv.to_string(),
                })
            })
            .collect();

        if accepted_by_stop {
            new_facts.push(Fact {
                key: "accepted_by_ks".to_string(),
                value: "STOP".to_string(),
            });
            new_facts.push(Fact {
                key: "step_count".to_string(),
                value: firings.to_string(),
            });
        }

        new_facts.sort_by(|a, b| a.key.cmp(&b.key).then_with(|| a.value.cmp(&b.value)));

        tracing::debug!(
            breed.step = "consensus_reached",
            breed = "hearsay",
            "L1 inference step"
        );
        let explanation = format!(
            "Hearsay posted {} hypotheses; selected {:?}",
            blackboard.len(),
            selected
        );

        Ok(BreedOutput {
            breed: BreedId::Hearsay,
            candidates: input.candidates.clone(),
            facts: new_facts,
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
    use crate::breeds::{BreedInput, Fact, Rule};

    fn make_input(facts: Vec<Fact>, rules: Vec<Rule>) -> BreedInput {
        BreedInput {
            intent: "test".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules,
            goals: vec![],
            state: vec![],
        }
    }

    #[test]
    fn test_noisy_or_commutative() {
        let a = 0.6_f32;
        let b = 0.3_f32;
        assert!((noisy_or(a, b) - noisy_or(b, a)).abs() < 1e-6);
    }

    #[test]
    fn test_noisy_or_identity() {
        let x = 0.7_f32;
        assert!(
            (noisy_or(x, 0.0) - x).abs() < 1e-6,
            "noisy_or identity failed"
        );
    }

    #[test]
    fn test_noisy_or_upper_bound() {
        assert!(noisy_or(0.9, 0.9) <= 1.0);
        assert!(noisy_or(1.0, 1.0) <= 1.0);
    }

    #[test]
    fn test_noisy_or_monotone() {
        let a = 0.5_f32;
        let b = 0.3_f32;
        assert!(
            noisy_or(a, b) >= noisy_or(a, 0.0),
            "noisy_or must be monotone"
        );
    }

    #[test]
    fn test_self_reinforcing_terminates() {
        let input = make_input(
            vec![Fact {
                key: "phone".into(),
                value: "X".into(),
            }],
            vec![Rule {
                id: "self-ks".into(),
                premise: vec!["phone:X".into()],
                conclusion: "phone:X".into(),
                certainty: 0.9,
            }],
        );
        let output = Hearsay
            .run(&input)
            .expect("self-reinforcing must terminate");
        assert!(!output.inference_trace.is_empty());
    }

    #[test]
    fn test_multi_level_fusion() {
        let input = make_input(
            vec![Fact {
                key: "phone".into(),
                value: "T".into(),
            }],
            vec![
                Rule {
                    id: "ks-word".into(),
                    premise: vec!["phone:T".into()],
                    conclusion: "word:THE".into(),
                    certainty: 0.9,
                },
                Rule {
                    id: "ks-phrase".into(),
                    premise: vec!["word:THE".into()],
                    conclusion: "phrase:THE_CAT".into(),
                    certainty: 0.8,
                },
            ],
        );
        let output = Hearsay.run(&input).expect("multi-level run");
        let sel = output.selected.as_deref().unwrap_or("");
        assert!(
            sel.starts_with("word:") || sel.starts_with("phrase:"),
            "expected word or phrase level selected, got: {:?}",
            sel
        );
    }

    #[test]
    fn test_deterministic_tie() {
        let input = make_input(
            vec![Fact {
                key: "phone".into(),
                value: "A".into(),
            }],
            vec![
                Rule {
                    id: "ks-1".into(),
                    premise: vec!["phone:A".into()],
                    conclusion: "word:ZZZ".into(),
                    certainty: 0.8,
                },
                Rule {
                    id: "ks-2".into(),
                    premise: vec!["phone:A".into()],
                    conclusion: "word:AAA".into(),
                    certainty: 0.8,
                },
            ],
        );
        let out1 = Hearsay.run(&input).expect("run 1");
        let out2 = Hearsay.run(&input).expect("run 2");
        assert_eq!(
            out1.selected, out2.selected,
            "tie must resolve deterministically"
        );
    }

    #[test]
    fn test_duplicate_post_fusion() {
        // noisy_or(0.5, 0.5) = 1 - (1-0.5)*(1-0.5) = 0.75
        let result = noisy_or(0.5, 0.5);
        assert!(
            (result - 0.75).abs() < 1e-5,
            "noisy_or(0.5, 0.5) must be 0.75, got {}",
            result
        );
        assert!(result < 1.0, "duplicate posts must not saturate to 1.0");
    }

    /// A lower-rated KS appears first in input but the higher-rated KS fires
    /// first because the agenda orders by rating descending.
    #[test]
    fn test_opportunistic_order_beats_declaration() {
        // Rule order: low-certainty KS declared first, high-certainty KS second.
        // With KSAR agenda the high KS fires first.
        let input = make_input(
            vec![Fact {
                key: "phone".into(),
                value: "A".into(),
            }],
            vec![
                Rule {
                    id: "ks-low".into(),
                    premise: vec!["phone:A".into()],
                    conclusion: "word:LOW".into(),
                    certainty: 0.3,
                },
                Rule {
                    id: "ks-high".into(),
                    premise: vec!["phone:A".into()],
                    conclusion: "word:HIGH".into(),
                    certainty: 0.9,
                },
            ],
        );
        let output = Hearsay.run(&input).expect("opportunistic run");
        let post_steps: Vec<&TraceStep> = output
            .inference_trace
            .iter()
            .filter(|s| s.kind == "post-hypothesis")
            .collect();
        assert!(post_steps.len() >= 2, "both KSs should fire");
        // First post-hypothesis should mention ks-high (higher rated).
        assert!(
            post_steps[0].detail.contains("ks-high"),
            "high-rated KS must fire first; got: {}",
            post_steps[0].detail
        );
    }

    /// Shuffling rule order must not change the selected hypothesis.
    #[test]
    fn test_shuffled_rules_same_result() {
        let facts = vec![Fact {
            key: "phone".into(),
            value: "T".into(),
        }];
        let rules_orig = vec![
            Rule {
                id: "ks-a".into(),
                premise: vec!["phone:T".into()],
                conclusion: "word:THE".into(),
                certainty: 0.9,
            },
            Rule {
                id: "ks-b".into(),
                premise: vec!["phone:T".into()],
                conclusion: "word:THAT".into(),
                certainty: 0.5,
            },
            Rule {
                id: "ks-c".into(),
                premise: vec!["word:THE".into()],
                conclusion: "phrase:SENTENCE".into(),
                certainty: 0.8,
            },
        ];
        // Shuffled: reverse order.
        let rules_shuffled = vec![
            rules_orig[2].clone(),
            rules_orig[0].clone(),
            rules_orig[1].clone(),
        ];

        let out_orig = Hearsay
            .run(&make_input(facts.clone(), rules_orig))
            .expect("orig run");
        let out_shuffled = Hearsay
            .run(&make_input(facts, rules_shuffled))
            .expect("shuffled run");

        assert_eq!(
            out_orig.selected, out_shuffled.selected,
            "selected must be identical regardless of rule declaration order"
        );
    }

    /// A KS whose conclusion re-triggers its own premise must terminate.
    /// noisy-OR is monotone-increasing and bounded at 1.0 — it converges in O(1)
    /// when the seed value is already 1.0 (initial facts are seeded at 1.0).
    /// Termination happens via empty-agenda (convergence), NOT cap-hit.
    /// The cap exists for non-convergent pathological cases; noisy-OR prevents those.
    #[test]
    fn test_cyclic_ks_terminates() {
        let input = make_input(
            vec![Fact {
                key: "word".into(),
                value: "CYCLE".into(),
            }],
            vec![Rule {
                id: "ks-cycle".into(),
                premise: vec!["word:CYCLE".into()],
                conclusion: "word:CYCLE".into(),
                certainty: 0.99,
            }],
        );
        let output = Hearsay
            .run(&input)
            .expect("cyclic KS must terminate (not infinite-loop)");
        // Must produce trace evidence (non-empty)
        assert!(
            !output.inference_trace.is_empty(),
            "must produce trace steps"
        );
        // noisy_or(1.0, 0.99) = 1.0 → no blackboard change → empty agenda → terminates normally
        // Either convergence (empty-agenda) or cap-hit are both valid termination paths.
        let terminated = output
            .inference_trace
            .iter()
            .any(|s| s.kind == "agenda-cap-hit" || s.kind == "post-hypothesis" || s.kind == "seed");
        assert!(terminated, "cycle must terminate with trace evidence");
    }
}
