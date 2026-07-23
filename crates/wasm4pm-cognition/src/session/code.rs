//! Canonical source-code projection selected by the cognition kernel.

use super::{hash_domain_pack, verify_session_state, DomainPack, SessionError, SessionState};
use serde::{Deserialize, Serialize};

const CANONICAL_INTERVIEW_PACK: &str =
    include_str!("../../examples/cognition/interview_session/domain.json");

/// One canonical source artifact selected from an admitted cognition state.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct CodeProjection {
    /// Track whose implementation was selected.
    pub track_id: String,
    /// Human-readable track label.
    pub track_label: String,
    /// Whether the track is confirmed or only the current leading hypothesis.
    pub selection_status: String,
    /// Editor language identifier.
    pub language: String,
    /// Canonical file name.
    pub filename: String,
    /// Canonical first-class source text.
    pub source: String,
    /// Domain-separated BLAKE3 hash of the selected artifact.
    pub source_hash: String,
}

fn source_for(track_id: &str) -> Option<(&'static str, &'static str)> {
    match track_id {
        "coordinate_traversal" => Some((
            "coordinate_traversal.py",
            include_str!("../../examples/cognition/interview_session/python/coordinate_traversal.py"),
        )),
        "grid_dfs" => Some((
            "grid_dfs.py",
            include_str!("../../examples/cognition/interview_session/python/grid_dfs.py"),
        )),
        "graph_dfs" => Some((
            "graph_dfs.py",
            include_str!("../../examples/cognition/interview_session/python/graph_dfs.py"),
        )),
        "hash_lookup" => Some((
            "hash_lookup.py",
            include_str!("../../examples/cognition/interview_session/python/hash_lookup.py"),
        )),
        _ => None,
    }
}

fn verify_canonical_artifact_domain(pack: &DomainPack) -> Result<(), SessionError> {
    let canonical: DomainPack = serde_json::from_str(CANONICAL_INTERVIEW_PACK).map_err(|error| {
        SessionError::Serialization {
            reason: format!("canonical interview domain could not be decoded: {error}"),
        }
    })?;
    let supplied_hash = hash_domain_pack(pack)?;
    let canonical_hash = hash_domain_pack(&canonical)?;
    if supplied_hash != canonical_hash {
        return Err(SessionError::InvalidDomain {
            reason: "Python artifacts are bound to the canonical coding-interview-v2 domain pack"
                .to_string(),
        });
    }
    Ok(())
}

/// Replay-verify state and select the canonical Python artifact for its cognition track.
///
/// The embedded Python artifacts are admitted only for the exact canonical interview
/// domain pack. Reusing a canonical track identifier in another valid domain cannot
/// select these artifacts.
pub fn project_python_code(
    pack: &DomainPack,
    state: &SessionState,
) -> Result<Option<CodeProjection>, SessionError> {
    verify_session_state(pack, state)?;
    verify_canonical_artifact_domain(pack)?;

    let (track_id, selection_status) = if let Some(track_id) = &state.committed_track {
        (track_id.as_str(), "committed")
    } else if let Some(track) = state
        .hypotheses
        .iter()
        .find(|track| !track.eliminated && track.score > 0.0)
    {
        (track.id.as_str(), "leading_hypothesis")
    } else {
        return Ok(None);
    };

    let track = pack
        .tracks
        .iter()
        .find(|track| track.id == track_id)
        .ok_or_else(|| SessionError::UnknownTrack {
            id: track_id.to_string(),
        })?;
    let Some((filename, source)) = source_for(track_id) else {
        return Ok(None);
    };

    let mut hasher = blake3::Hasher::new_derive_key("wasm4pm.cognition.code-projection.v2");
    hasher.update(state.domain_pack_hash.as_bytes());
    hasher.update(track_id.as_bytes());
    hasher.update(filename.as_bytes());
    hasher.update(source.as_bytes());

    Ok(Some(CodeProjection {
        track_id: track_id.to_string(),
        track_label: track.label.clone(),
        selection_status: selection_status.to_string(),
        language: "python".to_string(),
        filename: filename.to_string(),
        source: source.to_string(),
        source_hash: hasher.finalize().to_hex().to_string(),
    }))
}
