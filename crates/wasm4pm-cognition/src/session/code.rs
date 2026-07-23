//! Canonical source-code projection selected by the cognition kernel.

use super::{verify_session_state, DomainPack, SessionError, SessionState};
use serde::{Deserialize, Serialize};

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
            include_str!("../examples/cognition/interview_session/python/coordinate_traversal.py"),
        )),
        "grid_dfs" => Some((
            "grid_dfs.py",
            include_str!("../examples/cognition/interview_session/python/grid_dfs.py"),
        )),
        "graph_dfs" => Some((
            "graph_dfs.py",
            include_str!("../examples/cognition/interview_session/python/graph_dfs.py"),
        )),
        "hash_lookup" => Some((
            "hash_lookup.py",
            include_str!("../examples/cognition/interview_session/python/hash_lookup.py"),
        )),
        _ => None,
    }
}

/// Replay-verify state and select the canonical Python artifact for its cognition track.
pub fn project_python_code(
    pack: &DomainPack,
    state: &SessionState,
) -> Result<Option<CodeProjection>, SessionError> {
    verify_session_state(pack, state)?;

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

    let mut hasher = blake3::Hasher::new_derive_key("wasm4pm.cognition.code-projection.v1");
    hasher.update(pack.id.as_bytes());
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
