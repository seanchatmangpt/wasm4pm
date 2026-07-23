//! Domain-pack admission.

use super::model::*;
use std::collections::BTreeSet;

/// Admit a domain pack only when every identifier, reference, threshold, and bound is valid.
pub fn validate_domain_pack(pack: &DomainPack) -> Result<(), SessionError> {
    let invalid = |reason: String| SessionError::InvalidDomain { reason };
    if pack.version.trim().is_empty() || pack.id.trim().is_empty() {
        return Err(invalid("version and id must be non-empty".to_string()));
    }
    if pack.tracks.is_empty() || pack.tracks.len() > pack.bounds.max_tracks {
        return Err(invalid("track count is empty or exceeds max_tracks".to_string()));
    }
    if pack.patterns.len() > pack.bounds.max_patterns {
        return Err(invalid("pattern count exceeds max_patterns".to_string()));
    }
    if pack.rules.len() > pack.bounds.max_rules {
        return Err(invalid("rule count exceeds max_rules".to_string()));
    }
    if pack.bounds.max_observations == 0
        || pack.bounds.max_evidence == 0
        || pack.bounds.max_observation_bytes == 0
    {
        return Err(invalid("all session bounds must be positive".to_string()));
    }
    if !(0.0..=1.0).contains(&pack.thresholds.confidence)
        || !(0.0..=1.0).contains(&pack.thresholds.margin)
        || !(0.0..=1.0).contains(&pack.thresholds.maximum_contradiction)
    {
        return Err(invalid("thresholds must be inside [0,1]".to_string()));
    }
    if pack.phases.is_empty() {
        return Err(invalid("at least one phase is required".to_string()));
    }

    let mut track_ids = BTreeSet::new();
    let mut all_concepts = BTreeSet::new();
    for track in &pack.tracks {
        if track.id.trim().is_empty() || track.label.trim().is_empty() {
            return Err(invalid("track id and label must be non-empty".to_string()));
        }
        if !track_ids.insert(track.id.clone()) {
            return Err(invalid(format!("duplicate track id: {}", track.id)));
        }
        for concept in &track.concepts {
            if concept.trim().is_empty() {
                return Err(invalid(format!("empty concept in track {}", track.id)));
            }
            all_concepts.insert(concept.clone());
        }
    }

    let mut pattern_ids = BTreeSet::new();
    for pattern in &pack.patterns {
        if !pattern_ids.insert(pattern.id.clone()) {
            return Err(invalid(format!("duplicate pattern id: {}", pattern.id)));
        }
        if pattern.id.trim().is_empty()
            || pattern.proposition.trim().is_empty()
            || pattern.phrases.is_empty()
            || pattern.phrases.iter().any(|p| p.trim().is_empty())
        {
            return Err(invalid(format!("malformed pattern: {}", pattern.id)));
        }
        for (track, weight) in &pattern.track_weights {
            if !track_ids.contains(track) {
                return Err(invalid(format!(
                    "pattern {} references unknown track {}",
                    pattern.id, track
                )));
            }
            if !(-1.0..=1.0).contains(weight) || !weight.is_finite() {
                return Err(invalid(format!(
                    "pattern {} has invalid weight for {}",
                    pattern.id, track
                )));
            }
        }
        if let Some(concept) = &pattern.concept {
            if !all_concepts.contains(concept) {
                return Err(invalid(format!(
                    "pattern {} references unknown concept {}",
                    pattern.id, concept
                )));
            }
        }
    }

    let mut rule_ids = BTreeSet::new();
    for rule in &pack.rules {
        if !rule_ids.insert(rule.id.clone()) {
            return Err(invalid(format!("duplicate rule id: {}", rule.id)));
        }
        if rule.id.trim().is_empty() || rule.premises.is_empty() {
            return Err(invalid(format!("malformed rule: {}", rule.id)));
        }
        if !track_ids.contains(&rule.track_id) {
            return Err(invalid(format!(
                "rule {} references unknown track {}",
                rule.id, rule.track_id
            )));
        }
        if !(0.0..=1.0).contains(&rule.certainty) || !rule.certainty.is_finite() {
            return Err(invalid(format!("rule {} certainty outside [0,1]", rule.id)));
        }
        if let Some(concept) = &rule.concept {
            if !all_concepts.contains(concept) {
                return Err(invalid(format!(
                    "rule {} references unknown concept {}",
                    rule.id, concept
                )));
            }
        }
    }

    let mut phase_ids = BTreeSet::new();
    for phase in &pack.phases {
        if phase.id.trim().is_empty() || phase.label.trim().is_empty() {
            return Err(invalid("phase id and label must be non-empty".to_string()));
        }
        if !phase_ids.insert(phase.id.clone()) {
            return Err(invalid(format!("duplicate phase id: {}", phase.id)));
        }
        for concept in &phase.required_concepts {
            if !all_concepts.contains(concept) {
                return Err(invalid(format!(
                    "phase {} references unknown concept {}",
                    phase.id, concept
                )));
            }
        }
    }
    Ok(())
}
