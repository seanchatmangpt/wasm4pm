//! Domain-pack admission.

use super::model::*;
use std::collections::{BTreeMap, BTreeSet};

/// Admit a domain pack only when every identifier, reference, threshold, and bound is valid.
pub fn validate_domain_pack(pack: &DomainPack) -> Result<(), SessionError> {
    let invalid = |reason: String| SessionError::InvalidDomain { reason };
    if pack.version != "2" {
        return Err(invalid(format!(
            "unsupported domain-pack version {}; expected 2",
            pack.version
        )));
    }
    if pack.id.trim().is_empty() {
        return Err(invalid("domain id must be non-empty".to_string()));
    }
    if pack.concepts.is_empty() {
        return Err(invalid(
            "at least one guidance concept is required".to_string(),
        ));
    }
    for (id, concept) in &pack.concepts {
        if id.trim().is_empty()
            || concept.label.trim().is_empty()
            || concept.prompt.trim().is_empty()
        {
            return Err(invalid(format!("malformed concept: {id}")));
        }
    }
    if pack.tracks.is_empty() || pack.tracks.len() > pack.bounds.max_tracks {
        return Err(invalid(
            "track count is empty or exceeds max_tracks".to_string(),
        ));
    }
    if pack.patterns.len() > pack.bounds.max_patterns {
        return Err(invalid("pattern count exceeds max_patterns".to_string()));
    }
    if pack.rules.len() > pack.bounds.max_rules {
        return Err(invalid("rule count exceeds max_rules".to_string()));
    }
    if pack.bounds.max_turns == 0
        || pack.bounds.max_observations == 0
        || pack.bounds.max_evidence == 0
        || pack.bounds.max_observation_bytes == 0
        || pack.bounds.max_tracks == 0
        || pack.bounds.max_patterns == 0
        || pack.bounds.max_rules == 0
    {
        return Err(invalid("all session bounds must be positive".to_string()));
    }
    if !pack.thresholds.confidence.is_finite()
        || !pack.thresholds.margin.is_finite()
        || !pack.thresholds.concept_coverage.is_finite()
        || !pack.thresholds.maximum_contradiction.is_finite()
        || !(0.0..=1.0).contains(&pack.thresholds.confidence)
        || !(0.0..=1.0).contains(&pack.thresholds.margin)
        || !(0.0..=1.0).contains(&pack.thresholds.concept_coverage)
        || !(0.0..=1.0).contains(&pack.thresholds.maximum_contradiction)
    {
        return Err(invalid(
            "thresholds must be finite and inside [0,1]".to_string(),
        ));
    }
    if pack.phases.is_empty() {
        return Err(invalid("at least one phase is required".to_string()));
    }

    let mut track_ids = BTreeSet::new();
    let mut track_concepts: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let mut minimum_track_concepts = usize::MAX;
    for track in &pack.tracks {
        if track.id.trim().is_empty() || track.label.trim().is_empty() {
            return Err(invalid(
                "track id and label must be non-empty".to_string(),
            ));
        }
        if !track_ids.insert(track.id.clone()) {
            return Err(invalid(format!("duplicate track id: {}", track.id)));
        }
        if track.concepts.is_empty() {
            return Err(invalid(format!(
                "track {} has no expected concepts",
                track.id
            )));
        }
        let mut concepts = BTreeSet::new();
        for concept in &track.concepts {
            if !pack.concepts.contains_key(concept) {
                return Err(invalid(format!(
                    "track {} references unknown concept {}",
                    track.id, concept
                )));
            }
            if !concepts.insert(concept.clone()) {
                return Err(invalid(format!(
                    "track {} repeats concept {}",
                    track.id, concept
                )));
            }
        }
        minimum_track_concepts = minimum_track_concepts.min(concepts.len());
        track_concepts.insert(track.id.clone(), concepts);
    }
    if pack.thresholds.minimum_coverage > minimum_track_concepts {
        return Err(invalid(format!(
            "minimum_coverage {} exceeds at least one track concept count",
            pack.thresholds.minimum_coverage
        )));
    }

    for (alias, canonical) in &pack.aliases {
        if alias.trim().is_empty() || canonical.trim().is_empty() {
            return Err(invalid(
                "aliases must have non-empty keys and values".to_string(),
            ));
        }
        if alias.trim().eq_ignore_ascii_case(canonical.trim()) {
            return Err(invalid(format!("alias maps to itself: {alias}")));
        }
    }

    let mut pattern_ids = BTreeSet::new();
    let mut propositions = BTreeSet::new();
    for pattern in &pack.patterns {
        if !pattern_ids.insert(pattern.id.clone()) {
            return Err(invalid(format!(
                "duplicate pattern id: {}",
                pattern.id
            )));
        }
        if pattern.id.trim().is_empty()
            || pattern.proposition.trim().is_empty()
            || pattern.phrases.is_empty()
            || pattern.phrases.iter().any(|phrase| phrase.trim().is_empty())
        {
            return Err(invalid(format!("malformed pattern: {}", pattern.id)));
        }
        propositions.insert(pattern.proposition.clone());
        for (track, weight) in &pattern.track_weights {
            if !track_ids.contains(track) {
                return Err(invalid(format!(
                    "pattern {} references unknown track {}",
                    pattern.id, track
                )));
            }
            if !weight.is_finite() || !(-1.0..=1.0).contains(weight) {
                return Err(invalid(format!(
                    "pattern {} has invalid weight for {}",
                    pattern.id, track
                )));
            }
            if let Some(concept) = &pattern.concept {
                let belongs = track_concepts
                    .get(track)
                    .is_some_and(|concepts| concepts.contains(concept));
                if !belongs {
                    return Err(invalid(format!(
                        "pattern {} assigns concept {} to inapplicable track {}",
                        pattern.id, concept, track
                    )));
                }
            }
        }
        if let Some(concept) = &pattern.concept {
            if !pack.concepts.contains_key(concept) {
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
        for premise in &rule.premises {
            if !propositions.contains(premise) {
                return Err(invalid(format!(
                    "rule {} references unknown proposition {}",
                    rule.id, premise
                )));
            }
        }
        if !track_ids.contains(&rule.track_id) {
            return Err(invalid(format!(
                "rule {} references unknown track {}",
                rule.id, rule.track_id
            )));
        }
        if !rule.certainty.is_finite() || !(0.0..=1.0).contains(&rule.certainty) {
            return Err(invalid(format!(
                "rule {} certainty outside [0,1]",
                rule.id
            )));
        }
        if let Some(concept) = &rule.concept {
            let belongs = track_concepts
                .get(&rule.track_id)
                .is_some_and(|concepts| concepts.contains(concept));
            if !belongs {
                return Err(invalid(format!(
                    "rule {} assigns concept {} outside track {}",
                    rule.id, concept, rule.track_id
                )));
            }
        }
    }

    let mut phase_ids = BTreeSet::new();
    for phase in &pack.phases {
        if phase.id.trim().is_empty() || phase.label.trim().is_empty() {
            return Err(invalid(
                "phase id and label must be non-empty".to_string(),
            ));
        }
        if !phase_ids.insert(phase.id.clone()) {
            return Err(invalid(format!("duplicate phase id: {}", phase.id)));
        }
        for concept in &phase.required_concepts {
            if !pack.concepts.contains_key(concept) {
                return Err(invalid(format!(
                    "phase {} references unknown concept {}",
                    phase.id, concept
                )));
            }
        }
    }
    Ok(())
}
