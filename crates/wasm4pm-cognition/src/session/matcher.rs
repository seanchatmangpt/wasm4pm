//! Deterministic all-match observation extraction.

use super::hash::hash_serializable;
use super::model::*;
use crate::breeds::TraceStep;
use std::collections::{BTreeMap, BTreeSet};

fn normalize_characters(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut previous_space = true;
    for ch in text.chars().flat_map(char::to_lowercase) {
        if ch.is_alphanumeric() || ch == '_' {
            out.push(ch);
            previous_space = false;
        } else if matches!(ch, '\'' | '’') {
            // Preserve contractions as one token: "don't" -> "dont".
        } else if !previous_space {
            out.push(' ');
            previous_space = true;
        }
    }
    out.trim().to_string()
}

fn normalize(text: &str, aliases: &BTreeMap<String, String>) -> String {
    let mut normalized = normalize_characters(text);
    let mut alias_pairs: Vec<_> = aliases.iter().collect();
    alias_pairs.sort_by(|(ak, _), (bk, _)| bk.len().cmp(&ak.len()).then_with(|| ak.cmp(bk)));
    for (alias, canonical) in alias_pairs {
        let alias = normalize_characters(alias);
        let canonical = normalize_characters(canonical);
        normalized = replace_phrase(&normalized, &alias, &canonical);
    }
    normalized
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
        format!("never {phrase}"),
    ];
    if negations.iter().any(|needle| contains_phrase(text, needle)) {
        EvidencePolarity::Negative
    } else {
        EvidencePolarity::Positive
    }
}

fn phrase_matches(text: &str, phrase: &str) -> bool {
    contains_phrase(text, phrase)
        || ["not", "no", "without", "dont", "do not", "wouldnt", "would not", "never"]
            .iter()
            .any(|prefix| contains_phrase(text, &format!("{prefix} {phrase}")))
}

pub(super) fn extract_evidence(
    pack: &DomainPack,
    observation: &Observation,
    trace: &mut Vec<TraceStep>,
) -> Result<Vec<EvidenceRecord>, SessionError> {
    let normalized = normalize(&observation.text, &pack.aliases);
    let mut records = Vec::new();
    for pattern in &pack.patterns {
        let matched_phrase = pattern
            .phrases
            .iter()
            .map(|phrase| normalize(phrase, &pack.aliases))
            .find(|phrase| phrase_matches(&normalized, phrase));
        let Some(phrase) = matched_phrase else {
            continue;
        };
        let polarity = phrase_polarity(&normalized, &phrase);
        let evidence_material = (
            &observation.id,
            &pattern.id,
            &pattern.proposition,
            &phrase,
            &normalized,
            polarity,
        );
        let id = hash_serializable("wasm4pm.cognition.session.evidence.v2", &evidence_material)?;
        trace.push(TraceStep {
            step: trace.len(),
            kind: "match-pattern".to_string(),
            detail: format!(
                "observation={} pattern={} phrase={} proposition={} polarity={:?}",
                observation.id, pattern.id, phrase, pattern.proposition, polarity
            ),
            depth: 0,
            objects: vec![
                ("observation".to_string(), observation.id.clone()),
                ("evidence".to_string(), id.clone()),
            ],
        });
        records.push(EvidenceRecord {
            id,
            observation_id: observation.id.clone(),
            pattern_id: pattern.id.clone(),
            matched_phrase: phrase,
            proposition: pattern.proposition.clone(),
            track_weights: pattern.track_weights.clone(),
            concept: pattern.concept.clone(),
            polarity,
            active: true,
        });
    }
    Ok(records)
}

pub(super) fn active_propositions(
    evidence: &[EvidenceRecord],
) -> (BTreeSet<String>, BTreeSet<String>) {
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
