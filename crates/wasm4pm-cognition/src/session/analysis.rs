//! Hearsay-style fusion, MYCIN-style rules, and phase selection.

use super::model::*;
use crate::breeds::hearsay::noisy_or;
use crate::breeds::TraceStep;
use std::collections::{BTreeMap, BTreeSet};

type ConceptScores = BTreeMap<String, BTreeMap<String, f32>>;

fn update_concept_score(
    scores: &mut ConceptScores,
    track_id: &str,
    concept: &str,
    weight: f32,
) {
    let concepts = scores.entry(track_id.to_string()).or_default();
    let previous = concepts.get(concept).copied().unwrap_or(0.0);
    concepts.insert(concept.to_string(), noisy_or(previous, weight));
}

fn concept_score(scores: &ConceptScores, track_id: &str, concept: &str) -> f32 {
    scores
        .get(track_id)
        .and_then(|concepts| concepts.get(concept))
        .copied()
        .unwrap_or(0.0)
}

fn effective_track_weight(item: &EvidenceRecord, track_id: &str) -> f32 {
    let declared = item.track_weights.get(track_id).copied().unwrap_or(0.0);
    match item.polarity {
        EvidencePolarity::Positive => declared,
        EvidencePolarity::Negative => -declared,
    }
}

fn premise_certainty(evidence: &[EvidenceRecord], proposition: &str, track_id: &str) -> f32 {
    let mut support = 0.0_f32;
    let mut contradiction = 0.0_f32;
    for item in evidence
        .iter()
        .filter(|item| item.active && item.proposition == proposition)
    {
        let signed = effective_track_weight(item, track_id);
        if signed > 0.0 {
            support = noisy_or(support, signed);
        } else if signed < 0.0 {
            contradiction = noisy_or(contradiction, signed.abs());
        }
    }
    (support * (1.0 - contradiction)).clamp(0.0, 1.0)
}

pub(super) struct Analysis {
    pub(super) hypotheses: Vec<TrackHypothesis>,
    pub(super) top_track: Option<String>,
    pub(super) covered_by_track: BTreeMap<String, Vec<String>>,
    pub(super) missing_by_track: BTreeMap<String, Vec<String>>,
    pub(super) eligible_track: Option<String>,
}

pub(super) fn analyze(
    pack: &DomainPack,
    evidence: &[EvidenceRecord],
    rejected_tracks: &BTreeSet<String>,
    trace: &mut Vec<TraceStep>,
) -> Analysis {
    let mut support: BTreeMap<String, f32> = pack
        .tracks
        .iter()
        .map(|track| (track.id.clone(), 0.0))
        .collect();
    let mut contradiction = support.clone();
    let mut evidence_ids: BTreeMap<String, BTreeSet<String>> = pack
        .tracks
        .iter()
        .map(|track| (track.id.clone(), BTreeSet::new()))
        .collect();
    let mut concept_support: ConceptScores = BTreeMap::new();
    let mut concept_contradiction: ConceptScores = BTreeMap::new();

    for item in evidence.iter().filter(|item| item.active) {
        for track_id in item.track_weights.keys() {
            let signed = effective_track_weight(item, track_id);
            if signed > 0.0 {
                let previous = support.get(track_id).copied().unwrap_or(0.0);
                support.insert(track_id.clone(), noisy_or(previous, signed));
                if let Some(concept) = &item.concept {
                    update_concept_score(&mut concept_support, track_id, concept, signed);
                }
            } else if signed < 0.0 {
                let magnitude = signed.abs();
                let previous = contradiction.get(track_id).copied().unwrap_or(0.0);
                contradiction.insert(track_id.clone(), noisy_or(previous, magnitude));
                if let Some(concept) = &item.concept {
                    update_concept_score(
                        &mut concept_contradiction,
                        track_id,
                        concept,
                        magnitude,
                    );
                }
            }
            if signed.abs() > f32::EPSILON {
                evidence_ids
                    .entry(track_id.clone())
                    .or_default()
                    .insert(item.id.clone());
            }
        }
    }

    let mut fired_rules: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for rule in &pack.rules {
        let premise_certainties: Vec<f32> = rule
            .premises
            .iter()
            .map(|premise| premise_certainty(evidence, premise, &rule.track_id))
            .collect();
        let weakest_premise = premise_certainties
            .iter()
            .copied()
            .fold(1.0_f32, f32::min);
        let contribution = (weakest_premise * rule.certainty).clamp(0.0, 1.0);
        if contribution <= f32::EPSILON {
            continue;
        }

        let previous = support.get(&rule.track_id).copied().unwrap_or(0.0);
        support.insert(
            rule.track_id.clone(),
            noisy_or(previous, contribution),
        );
        fired_rules
            .entry(rule.track_id.clone())
            .or_default()
            .push(rule.id.clone());
        if let Some(concept) = &rule.concept {
            update_concept_score(
                &mut concept_support,
                &rule.track_id,
                concept,
                contribution,
            );
        }
        trace.push(TraceStep {
            step: trace.len(),
            kind: "fire-rule".to_string(),
            detail: format!(
                "rule={} track={} certainty={:.6} weakest_premise={:.6} contribution={:.6}",
                rule.id, rule.track_id, rule.certainty, weakest_premise, contribution
            ),
            depth: 0,
            objects: vec![("track".to_string(), rule.track_id.clone())],
        });
    }

    let mut hypotheses = Vec::with_capacity(pack.tracks.len());
    for track in &pack.tracks {
        let eliminated = rejected_tracks.contains(&track.id);
        let positive = support.get(&track.id).copied().unwrap_or(0.0);
        let negative = contradiction.get(&track.id).copied().unwrap_or(0.0);
        let score = if eliminated {
            0.0
        } else {
            (positive * (1.0 - negative)).clamp(0.0, 1.0)
        };
        let ids: Vec<String> = evidence_ids
            .remove(&track.id)
            .unwrap_or_default()
            .into_iter()
            .collect();
        let mut rules = fired_rules.remove(&track.id).unwrap_or_default();
        rules.sort();
        hypotheses.push(TrackHypothesis {
            id: track.id.clone(),
            label: track.label.clone(),
            support: positive,
            contradiction: negative,
            score,
            eliminated,
            evidence_ids: ids,
            fired_rules: rules,
        });
    }
    hypotheses.sort_by(|a, b| {
        b.score
            .total_cmp(&a.score)
            .then_with(|| a.id.cmp(&b.id))
    });

    for hypothesis in &hypotheses {
        trace.push(TraceStep {
            step: trace.len(),
            kind: "score-track".to_string(),
            detail: format!(
                "track={} support={:.6} contradiction={:.6} score={:.6} eliminated={}",
                hypothesis.id,
                hypothesis.support,
                hypothesis.contradiction,
                hypothesis.score,
                hypothesis.eliminated
            ),
            depth: 0,
            objects: vec![("track".to_string(), hypothesis.id.clone())],
        });
    }

    let top_track = hypotheses
        .first()
        .filter(|hypothesis| !hypothesis.eliminated && hypothesis.score > 0.0)
        .map(|hypothesis| hypothesis.id.clone());

    let mut covered_by_track = BTreeMap::new();
    let mut missing_by_track = BTreeMap::new();
    for track in &pack.tracks {
        let mut covered = Vec::new();
        let mut missing = Vec::new();
        for concept in &track.concepts {
            let positive = concept_score(&concept_support, &track.id, concept);
            let negative = concept_score(&concept_contradiction, &track.id, concept);
            if positive >= pack.thresholds.concept_coverage && positive > negative {
                covered.push(concept.clone());
            } else {
                missing.push(concept.clone());
            }
        }
        covered.sort();
        missing.sort();
        covered_by_track.insert(track.id.clone(), covered);
        missing_by_track.insert(track.id.clone(), missing);
    }

    let eligible_track = hypotheses.first().and_then(|top| {
        if top.eliminated || top.score <= 0.0 {
            return None;
        }
        let second_score = hypotheses.get(1).map(|hypothesis| hypothesis.score).unwrap_or(0.0);
        let coverage = covered_by_track
            .get(&top.id)
            .map(Vec::len)
            .unwrap_or_default();
        let eligible = top.score >= pack.thresholds.confidence
            && top.score - second_score >= pack.thresholds.margin
            && coverage >= pack.thresholds.minimum_coverage
            && top.contradiction <= pack.thresholds.maximum_contradiction;
        eligible.then_some(top.id.clone())
    });

    Analysis {
        hypotheses,
        top_track,
        covered_by_track,
        missing_by_track,
        eligible_track,
    }
}

pub(super) fn current_phase(
    pack: &DomainPack,
    committed_track: Option<&str>,
    covered: &[String],
) -> (String, String, bool) {
    let covered: BTreeSet<&str> = covered.iter().map(String::as_str).collect();
    let applicable_concepts: Option<BTreeSet<&str>> = committed_track.and_then(|track_id| {
        pack.tracks
            .iter()
            .find(|track| track.id == track_id)
            .map(|track| track.concepts.iter().map(String::as_str).collect())
    });

    for phase in &pack.phases {
        let commit_ok = !phase.requires_committed_track || committed_track.is_some();
        let concepts_ok = phase.required_concepts.iter().all(|concept| {
            let applies = applicable_concepts
                .as_ref()
                .is_none_or(|concepts| concepts.contains(concept.as_str()));
            !applies || covered.contains(concept.as_str())
        });
        if !(commit_ok && concepts_ok) {
            return (phase.id.clone(), phase.label.clone(), false);
        }
    }
    ("complete".to_string(), "Complete".to_string(), true)
}
