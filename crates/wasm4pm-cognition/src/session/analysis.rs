//! Hearsay-style fusion, MYCIN-style rules, and phase selection.

use super::matcher::{active_propositions, concept_confidence};
use super::model::*;
use crate::breeds::hearsay::noisy_or;
use crate::breeds::TraceStep;
use std::collections::{BTreeMap, BTreeSet};

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

    let mut concept_support: BTreeMap<String, f32> = BTreeMap::new();
    let mut concept_contradiction: BTreeMap<String, f32> = BTreeMap::new();

    for item in evidence.iter().filter(|e| e.active) {
        for (track_id, declared_weight) in &item.track_weights {
            let signed = match item.polarity {
                EvidencePolarity::Positive => *declared_weight,
                EvidencePolarity::Negative => -*declared_weight,
            };
            if signed > 0.0 {
                let previous = support.get(track_id).copied().unwrap_or(0.0);
                support.insert(track_id.clone(), noisy_or(previous, signed));
            } else if signed < 0.0 {
                let previous = contradiction.get(track_id).copied().unwrap_or(0.0);
                contradiction.insert(track_id.clone(), noisy_or(previous, signed.abs()));
            }
            evidence_ids
                .entry(track_id.clone())
                .or_default()
                .insert(item.id.clone());
        }
        if let Some(concept) = &item.concept {
            let confidence = concept_confidence(item);
            match item.polarity {
                EvidencePolarity::Positive => {
                    let previous = concept_support.get(concept).copied().unwrap_or(0.0);
                    concept_support.insert(concept.clone(), noisy_or(previous, confidence));
                }
                EvidencePolarity::Negative => {
                    let previous = concept_contradiction.get(concept).copied().unwrap_or(0.0);
                    concept_contradiction.insert(concept.clone(), noisy_or(previous, confidence));
                }
            }
        }
    }

    let (positive_props, negative_props) = active_propositions(evidence);
    let mut fired_rules: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for rule in &pack.rules {
        let fires = rule
            .premises
            .iter()
            .all(|p| positive_props.contains(p) && !negative_props.contains(p));
        if !fires {
            continue;
        }
        let previous = support.get(&rule.track_id).copied().unwrap_or(0.0);
        support.insert(rule.track_id.clone(), noisy_or(previous, rule.certainty));
        fired_rules
            .entry(rule.track_id.clone())
            .or_default()
            .push(rule.id.clone());
        if let Some(concept) = &rule.concept {
            let previous = concept_support.get(concept).copied().unwrap_or(0.0);
            concept_support.insert(concept.clone(), noisy_or(previous, rule.certainty));
        }
        trace.push(TraceStep {
            step: trace.len(),
            kind: "fire-rule".to_string(),
            detail: format!(
                "rule={} track={} certainty={:.6}",
                rule.id, rule.track_id, rule.certainty
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
        let mut ids: Vec<String> = evidence_ids
            .remove(&track.id)
            .unwrap_or_default()
            .into_iter()
            .collect();
        ids.sort();
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
        .filter(|h| !h.eliminated && h.score > 0.0)
        .map(|h| h.id.clone());

    let mut covered_by_track = BTreeMap::new();
    let mut missing_by_track = BTreeMap::new();
    for track in &pack.tracks {
        let mut covered = Vec::new();
        let mut missing = Vec::new();
        for concept in &track.concepts {
            let positive = concept_support.get(concept).copied().unwrap_or(0.0);
            let negative = concept_contradiction.get(concept).copied().unwrap_or(0.0);
            if positive > 0.2 && positive > negative {
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
        let second_score = hypotheses.get(1).map(|h| h.score).unwrap_or(0.0);
        let coverage = covered_by_track
            .get(&top.id)
            .map(Vec::len)
            .unwrap_or_default();
        let eligible = top.score >= pack.thresholds.confidence
            && top.score - second_score >= pack.thresholds.margin
            && coverage >= pack.thresholds.minimum_coverage
            && top.contradiction <= pack.thresholds.maximum_contradiction;
        eligible.then(|| top.id.clone())
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
    committed_track: &Option<String>,
    covered: &[String],
) -> (String, String, bool) {
    let covered: BTreeSet<&str> = covered.iter().map(String::as_str).collect();
    for phase in &pack.phases {
        let commit_ok = !phase.requires_committed_track || committed_track.is_some();
        let concepts_ok = phase
            .required_concepts
            .iter()
            .all(|concept| covered.contains(concept.as_str()));
        if !(commit_ok && concepts_ok) {
            return (phase.id.clone(), phase.label.clone(), false);
        }
    }
    ("complete".to_string(), "Complete".to_string(), true)
}
