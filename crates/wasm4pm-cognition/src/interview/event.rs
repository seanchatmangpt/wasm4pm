//! Canonical event envelope (ARD §3.2 Event Gateway).
//!
//! Every heterogeneous input (editor change, transcript line, compiler
//! diagnostic, ...) is normalized into this shape before anything downstream
//! ever sees it. Timestamps are caller-supplied rather than sampled from a
//! wall clock so event construction stays deterministic and replayable.

use serde::{Deserialize, Serialize};

/// A normalized interview event.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Event {
    /// Caller-assigned unique identifier for this event.
    pub event_id: String,
    /// Coarse event family, e.g. `"editor.change"`, `"transcript.line"`.
    pub event_type: String,
    /// Caller-supplied logical timestamp (monotonic counter or wall-clock ms).
    pub occurred_at: u64,
    /// Where the event came from, e.g. `"editor"`, `"transcript"`, `"timer"`.
    pub source: String,
    /// The session this event belongs to.
    pub session_id: String,
    /// BLAKE3 hex digest of the raw payload, for downstream integrity checks.
    pub payload_hash: String,
    /// Free-form provenance note (who/what produced this event).
    pub provenance: String,
    /// Caller's confidence in this event's fidelity, in `[0.0, 1.0]`.
    pub confidence: f32,
    /// Policy scope this event was observed under.
    pub policy_scope: String,
}

/// A raw, not-yet-normalized event as received from some external source.
pub struct RawEvent<'a> {
    /// Event family.
    pub event_type: &'a str,
    /// Payload text; hashed to produce [`Event::payload_hash`].
    pub payload: &'a str,
    /// Source identifier.
    pub source: &'a str,
    /// Caller-supplied provenance.
    pub provenance: &'a str,
    /// Caller-supplied confidence.
    pub confidence: f32,
    /// Policy scope in effect when this event was observed.
    pub policy_scope: &'a str,
}

/// Normalize a [`RawEvent`] into a canonical [`Event`].
///
/// `event_id` and `occurred_at` are caller-supplied so normalization stays a
/// pure function — no hidden UUID or clock reads.
pub fn normalize_event(
    event_id: impl Into<String>,
    occurred_at: u64,
    session_id: impl Into<String>,
    raw: RawEvent<'_>,
) -> Event {
    Event {
        event_id: event_id.into(),
        event_type: raw.event_type.to_string(),
        occurred_at,
        source: raw.source.to_string(),
        session_id: session_id.into(),
        payload_hash: blake3::hash(raw.payload.as_bytes()).to_hex().to_string(),
        provenance: raw.provenance.to_string(),
        confidence: raw.confidence,
        policy_scope: raw.policy_scope.to_string(),
    }
}
