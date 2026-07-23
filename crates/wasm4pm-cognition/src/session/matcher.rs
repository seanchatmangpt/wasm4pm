//! Deterministic all-match observation extraction.

use super::hash::hash_serializable;
use super::model::*;
use crate::breeds::TraceStep;
use std::collections::{BTreeMap, BTreeSet};

fn normalize(text: &str, aliases: &BTreeMap<String, String>) -> String {
    let mut normalized = String::with_capacity(text.len());
    let mut previous_space = true;
    for ch in text.chars().flat_map(char::to_lowercase) {
        if ch.is_alphanumeric() || ch == '_' {
            normalized.push(ch);
            previous_space = false;
        } else if !previous_space {
            normalized.push(' ');
            previous_space = true;
        }
    }
    let mut normalized = normalized.trim().to_string();
    let mut alias_pairs: Vec<_> = aliases.iter().collect();
    alias_pairs.sort_by(|(ak, _), (bk, _)| bk.len().cmp(&ak.len()).then_with(|| ak.cmp(bk)));
    for (alias, canonical) in alias_pairs {
        let alias = normalize_without_aliases(alias);
        let canonical = normalize_without_aliases(canonical);
        normalized = replace_phrase(&normalized, &alias, &canonical);
    }
    normalized
}

fn normalize_without_aliases(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut previous_space = true;
    for ch in text.chars().flat_map(char::to_lowercase) {
        if ch.is_alphanumeric() || ch == '_' {
            out.push(ch);
            previous_space = false;
        } else if !previous_space {
            out.push(' ');
            previous_space = true;
        }
    }
    out.trim().to_string()
}

fn replace_phrase(text: &str, from: &str, to: &str) -> String {
    if from.is_empty() {
        return text.to_string();
    }
    let padded = format!(" {text} ");
    let needle = format!(" {from} ");
    let replacement = format!(" {to} ");
    padded.replace(&needle, &replacement).trim().to_string()
}

fn contains_phrase(text: &str, phrase: &str) -> bool {
    if phrase.is_empty() {
        return false;
    }
    format!(" {text} ").contains(&format!(" {phrase} "))
}

fn phrase_polarity(text: &str, phrase: &str) -> EvidencePolarity {
    let negations = [
        format!("not {phrase}"),
        format!("no {phrase}"),
        format!("without {phrase}"),
        format!("dont {phrase}"),
        format!("do not {phrase}"),
        format!("wouldnt {phrase}"),
        format!("would not {phrase}"),
    ];
    if negations.iter().any(|needle| contains_phrase(text, needle)) {
        EvidencePolarity::Negative
    } else {
        EvidencePolarity::Positive
    }
}

pub(super) fn extract_evidence(
    pack: &DomainPack,
    observation: &Observation,
    trace: &mut Vec<TraceStep>,
) -> Result<Vec<EvidenceRecord>, SessionError> {
    let normalized = normalize(&observation.text, &pack.aliases);
    let mut records = Vec::new();
    for pattern in &pack.patterns {
        let mut matched_phrase: Option<String> = None;
        for phrase in &pattern.phrases {
            let phrase = normalize(phrase, &pack.aliases);
            if contains_phrase(&normalized, &phrase)
                || contains_phrase(&normalized, &format!("not {phrase}"))
                || contains_phrase(&normalized, &format!("no {phrase}"))
                || contains_phrase(&normalized, &format!("without {phrase}"))
                || contains_phrase(&normalized, &format!("do not {phrase}"))
                || contains_phrase(&normalized, &format!("would not {phrase}"))
            {
                matched_phrase = Some(phrase);
                break;
            }
        }
        let Some(phrase) = matched_phrase else {
            continue;
        };
        let polarity = phrase_polarity(&normalized, &phrase);
        let evidence_material = (
            &observation.id,
            &pattern.id,
            &pattern.proposition,
            &normalized,
            polarity,
        );
        let id = hash_serializable("wasm4pm.cognition.session.evidence.v1", &evidence_material)?;
        trace.push(TraceStep {
            step: trace.len(),
            kind: "match-pattern".to_string(),
            detail: format!(
                "observation={} pattern={} proposition={} polarity={:?}",
                observation.id, pattern.id, pattern.proposition, polarity
            ),
            depth: 0,
            objects: vec![("observation".to_string(), observation.id.clone())],
        });
        records.push(EvidenceRecord {
            id,
            observation_id: observation.id.clone(),
            pattern_id: pattern.id.clone(),
            proposition: pattern.proposition.clone(),
            track_weights: pattern.track_weights.clone(),
            concept: pattern.concept.clone(),
            polarity,
            active: true,
        });
    }
    Ok(records)
}

pub(super) fn active_propositions(evidence: &[EvidenceRecord]) -> (BTreeSet<String>, BTreeSet<String>) {
    let mut positive = BTreeSet::new();
    let mut negative = BTreeSet::new();
    for item in evidence.iter().filter(|e| e.active) {
        match item.polarity {
            EvidencePolarity::Positive => {
                positive.insert(item.proposition.clone());
            }
            EvidencePolarity::Negative => {
                negative.insert(item.proposition.clone());
            }
        }
    }
    (positive, negative)
}

pub(super) fn concept_confidence(item: &EvidenceRecord) -> f32 {
    item.track_weights
        .values()
        .map(|v| v.abs())
        .fold(0.0_f32, f32::max)
        .max(0.5)
        .min(1.0)
}
