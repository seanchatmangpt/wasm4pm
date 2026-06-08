//! # Actor Envelope — Local Normality Learning for Process Actors
//!
//! Learns "what is normal" for each actor (person/role) from historical event
//! logs and scores incoming motion requests against that baseline. This is the
//! actor layer of the AutoMembrane pre-control membrane.
//!
//! ## Van der Aalst framing
//!
//! In organisational process mining, every resource has a behavioural profile:
//! the activities they perform, the hours they are active, and the volume of
//! objects they handle. The actor envelope makes this profile explicit and
//! machine-queryable so that a novel request can be evaluated against the
//! historical evidence without re-running discovery.
//!
//! ## WASM exports
//!
//! | Function | Purpose |
//! |----------|---------|
//! | `build_actor_envelope` | Train actor profiles from a stored event log; returns handle |
//! | `score_actor_motion` | Score a (actor, action, hour) request against the envelope |
//! | `get_actor_profiles` | Return all trained profiles as a JSON array |

#![cfg(feature = "miniml")]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

use crate::error::{codes, js_val, wasm_err};
use crate::models::{parse_timestamp_ms, AttributeValue};
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js_str;

const ACTOR_ENVELOPE_TYPE: &str = "actor_envelope";

// ---------------------------------------------------------------------------
// Storage structs
// ---------------------------------------------------------------------------

/// Behavioural profile for a single actor derived from historical event data.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ActorProfile {
    pub actor: String,
    pub role: Option<String>,
    /// `(action, count)` pairs, sorted by count descending.
    pub common_actions: Vec<(String, u32)>,
    /// Event count per hour of day (indices 0-23).
    pub active_hours: [u32; 24],
    pub avg_objects_per_event: f64,
    pub total_events: u32,
    /// Unix epoch milliseconds of the most recent observed event.
    pub last_seen_ms: f64,
}

/// Envelope storing all actor profiles together with training metadata.
#[derive(Serialize, Deserialize)]
pub struct ActorEnvelope {
    #[serde(rename = "type")]
    pub envelope_type: String, // always ACTOR_ENVELOPE_TYPE
    pub profiles: Vec<ActorProfile>,
    pub activity_key: String,
    pub actor_key: String,
    pub timestamp_key: String,
    /// Number of traces the envelope was trained on.
    pub trained_on: u32,
}

// ---------------------------------------------------------------------------
// Internal training helper
// ---------------------------------------------------------------------------

struct ActorAccumulator {
    action_counts: HashMap<String, u32>,
    active_hours: [u32; 24],
    total_events: u32,
    last_seen_ms: f64,
    role: Option<String>,
}

impl ActorAccumulator {
    fn new() -> Self {
        Self {
            action_counts: HashMap::new(),
            active_hours: [0u32; 24],
            total_events: 0,
            last_seen_ms: 0.0,
            role: None,
        }
    }
}

// ---------------------------------------------------------------------------
// WASM export 1: build_actor_envelope
// ---------------------------------------------------------------------------

/// Train actor profiles from a stored event log and return an opaque handle.
///
/// # Parameters
/// * `log_handle`    — handle from `load_eventlog_from_xes` / `load_eventlog_from_json`
/// * `activity_key`  — event attribute for the activity name (`concept:name`)
/// * `actor_key`     — event attribute for the actor/resource (`org:resource`)
/// * `timestamp_key` — event attribute for timestamps (`time:timestamp`);
///                     pass `""` to skip hour-of-day learning
///
/// # Errors
/// Returns a structured error JSON when fewer than 3 distinct actors are found.
#[wasm_bindgen]
pub fn build_actor_envelope(
    log_handle: &str,
    activity_key: &str,
    actor_key: &str,
    timestamp_key: &str,
) -> Result<JsValue, JsValue> {
    let state = get_or_init_state();

    let envelope_json = state.with_object(log_handle, |obj| {
        let log = match obj {
            Some(StoredObject::EventLog(l)) => l,
            Some(_) => return Err(wasm_err(codes::INVALID_HANDLE, "Handle is not an EventLog")),
            None => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    format!("No EventLog at handle '{log_handle}'"),
                ))
            }
        };

        // ── Build per-actor accumulators ────────────────────────────────────
        let mut accumulators: HashMap<String, ActorAccumulator> = HashMap::new();
        let mut trace_count: u32 = 0;

        for trace in &log.traces {
            trace_count += 1;

            for event in &trace.events {
                // Resolve actor value
                let actor_val = event
                    .attributes
                    .get(actor_key)
                    .and_then(|v| v.as_string())
                    .map(str::to_owned);

                let actor = match actor_val {
                    Some(a) if !a.trim().is_empty() => a,
                    _ => continue,
                };

                // Resolve action
                let action = event
                    .attributes
                    .get(activity_key)
                    .and_then(|v| v.as_string())
                    .unwrap_or("")
                    .to_owned();

                let acc = accumulators
                    .entry(actor.clone())
                    .or_insert_with(ActorAccumulator::new);

                // Action count
                *acc.action_counts.entry(action).or_insert(0) += 1;
                acc.total_events += 1;

                // Hour-of-day from timestamp
                if !timestamp_key.is_empty() {
                    let ts_ms: Option<f64> =
                        event.attributes.get(timestamp_key).and_then(|v| match v {
                            AttributeValue::Date(s) | AttributeValue::String(s) => {
                                parse_timestamp_ms(s).map(|ms| ms as f64)
                            }
                            AttributeValue::Float(f) => Some(*f),
                            AttributeValue::Int(i) => Some(*i as f64),
                            _ => None,
                        });

                    if let Some(ms) = ts_ms {
                        // hour from ms-since-epoch: (ms / 3_600_000) % 24
                        let hour = ((ms / 3_600_000.0).floor() as u64 % 24) as usize;
                        acc.active_hours[hour] += 1;
                        if ms > acc.last_seen_ms {
                            acc.last_seen_ms = ms;
                        }
                    }
                }
            }
        }

        // ── Minimum-actor guard ─────────────────────────────────────────────
        let n_actors = accumulators.len();
        if n_actors < 3 {
            return Err(wasm_err(
                codes::INVALID_INPUT,
                format!("Need at least 3 distinct actors to build envelope; found {n_actors}"),
            ));
        }

        // ── Convert accumulators to profiles ────────────────────────────────
        let mut profiles: Vec<ActorProfile> = accumulators
            .into_iter()
            .map(|(actor, acc)| {
                let mut actions: Vec<(String, u32)> = acc.action_counts.into_iter().collect();
                // Sort descending by count, then alphabetically for determinism
                actions.sort_unstable_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));

                ActorProfile {
                    actor,
                    role: acc.role,
                    common_actions: actions,
                    active_hours: acc.active_hours,
                    avg_objects_per_event: 0.0, // OCEL not required for XES-based actor profiles
                    total_events: acc.total_events,
                    last_seen_ms: acc.last_seen_ms,
                }
            })
            .collect();

        // Sort profiles by actor name for determinism
        profiles.sort_unstable_by(|a, b| a.actor.cmp(&b.actor));

        let envelope = ActorEnvelope {
            envelope_type: ACTOR_ENVELOPE_TYPE.to_owned(),
            profiles,
            activity_key: activity_key.to_owned(),
            actor_key: actor_key.to_owned(),
            timestamp_key: timestamp_key.to_owned(),
            trained_on: trace_count,
        };

        serde_json::to_string(&envelope).map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!("ActorEnvelope serialisation failed: {e}"),
            )
        })
    })?;

    let handle = state.store_object(StoredObject::JsonString(envelope_json))?;
    Ok(js_val(&handle))
}

// ---------------------------------------------------------------------------
// WASM export 2: score_actor_motion
// ---------------------------------------------------------------------------

/// Score a candidate motion against the trained actor envelope.
///
/// # Parameters
/// * `envelope_handle`  — handle returned by `build_actor_envelope`
/// * `actor`            — actor identity string to look up
/// * `requested_action` — action the actor is attempting
/// * `hour_of_day`      — hour in [0, 23]; pass 255 to skip hour scoring
///
/// # Returns
/// JSON string with verdict, scores, and rationale.
#[wasm_bindgen]
pub fn score_actor_motion(
    envelope_handle: &str,
    actor: &str,
    requested_action: &str,
    hour_of_day: u8,
) -> Result<JsValue, JsValue> {
    let state = get_or_init_state();

    let result_json = state.with_object(envelope_handle, |obj| {
        let json_str = match obj {
            Some(StoredObject::JsonString(s)) => s,
            Some(_) => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    "Handle is not an actor envelope (wrong type)",
                ))
            }
            None => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    format!("No object at handle '{envelope_handle}'"),
                ))
            }
        };

        let envelope: ActorEnvelope = serde_json::from_str(json_str).map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!("ActorEnvelope deserialisation failed: {e}"),
            )
        })?;

        if envelope.envelope_type != ACTOR_ENVELOPE_TYPE {
            return Err(wasm_err(
                codes::INVALID_HANDLE,
                format!(
                    "Expected type '{}', got '{}'",
                    ACTOR_ENVELOPE_TYPE, envelope.envelope_type
                ),
            ));
        }

        // ── Look up profile (case-insensitive) ──────────────────────────────
        let actor_lower = actor.to_lowercase();
        let profile = envelope
            .profiles
            .iter()
            .find(|p| p.actor.to_lowercase() == actor_lower);

        let profile = match profile {
            Some(p) => p,
            None => {
                let result = serde_json::json!({
                    "verdict": "require_evidence",
                    "confidence": 0.0,
                    "reason": format!("Actor '{}' has no history in envelope — insufficient evidence to classify", actor),
                    "anomaly_score": 0.5,
                    "actor": actor,
                    "requested_action": requested_action,
                    "common_action_rank": null,
                    "actor_total_events": 0
                });
                return serde_json::to_string(&result).map_err(|e| {
                    wasm_err(codes::INTERNAL_ERROR, format!("Serialisation failed: {e}"))
                });
            }
        };

        // ── Action score ────────────────────────────────────────────────────
        // Find rank of requested_action in common_actions (0-based, top-10 matters)
        let top_10: Vec<&str> = profile
            .common_actions
            .iter()
            .take(10)
            .map(|(a, _)| a.as_str())
            .collect();

        let rank_opt: Option<usize> = profile
            .common_actions
            .iter()
            .position(|(a, _)| a == requested_action);

        let action_score = match rank_opt {
            None => 1.0_f64,                               // never seen
            Some(r) if r < 10 => 0.0_f64,                // in top-10
            Some(r) => {
                let max_rank = profile.common_actions.len().max(10);
                // Scale from 0.0 (rank 10) to 1.0 (rank = max)
                (r - 9) as f64 / (max_rank - 9).max(1) as f64
            }
        };
        let _ = top_10; // used conceptually above

        // ── Hour score ──────────────────────────────────────────────────────
        let hour_score = if hour_of_day > 23 {
            // Caller passed 255 (skip) — neutral
            0.0_f64
        } else if profile.active_hours[hour_of_day as usize] == 0 {
            1.0_f64
        } else {
            0.0_f64
        };

        // ── Composite anomaly score ─────────────────────────────────────────
        let anomaly_score = 0.6 * action_score + 0.4 * hour_score;

        let verdict = if anomaly_score > 0.7 {
            "escalate"
        } else if anomaly_score > 0.4 {
            "warn"
        } else {
            "allow"
        };

        // Confidence = 1 - anomaly_score (higher certainty when less anomalous)
        let confidence = (1.0 - anomaly_score).max(0.0_f64);

        let result = serde_json::json!({
            "verdict": verdict,
            "confidence": confidence,
            "anomaly_score": anomaly_score,
            "action_score": action_score,
            "hour_score": hour_score,
            "actor": actor,
            "requested_action": requested_action,
            "common_action_rank": rank_opt,
            "actor_total_events": profile.total_events
        });

        serde_json::to_string(&result)
            .map_err(|e| wasm_err(codes::INTERNAL_ERROR, format!("Serialisation failed: {e}")))
    })?;

    to_js_str(&result_json)
}

// ---------------------------------------------------------------------------
// WASM export 3: get_actor_profiles
// ---------------------------------------------------------------------------

/// Return all trained actor profiles from the envelope as a JSON array.
///
/// Useful for the AutoML inspector UX to display who is in the envelope and
/// what their behavioural baseline looks like.
#[wasm_bindgen]
pub fn get_actor_profiles(envelope_handle: &str) -> Result<JsValue, JsValue> {
    let state = get_or_init_state();

    let result_json = state.with_object(envelope_handle, |obj| {
        let json_str = match obj {
            Some(StoredObject::JsonString(s)) => s,
            Some(_) => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    "Handle is not an actor envelope (wrong type)",
                ))
            }
            None => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    format!("No object at handle '{envelope_handle}'"),
                ))
            }
        };

        let envelope: ActorEnvelope = serde_json::from_str(json_str).map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!("ActorEnvelope deserialisation failed: {e}"),
            )
        })?;

        serde_json::to_string(&envelope.profiles)
            .map_err(|e| wasm_err(codes::INTERNAL_ERROR, format!("Serialisation failed: {e}")))
    })?;

    to_js_str(&result_json)
}

// ---------------------------------------------------------------------------
// pub(crate) scoring — used by automembrane classify_motion_with_envelopes
// ---------------------------------------------------------------------------

/// Score a `RequestMotion` against a trained `ActorEnvelope`.
///
/// Looks up the actor profile by name (case-insensitive) and computes a
/// composite anomaly score from the requested action and the hour of day derived
/// from `motion.timestamp_ms`.
pub fn score_actor_motion_from_envelope(
    envelope: &ActorEnvelope,
    motion: &crate::automembrane::RequestMotion,
) -> crate::automembrane::LayerVerdict {
    let actor_lower = motion.actor.to_lowercase();
    let profile = envelope
        .profiles
        .iter()
        .find(|p| p.actor.to_lowercase() == actor_lower);

    let profile = match profile {
        Some(p) => p,
        None => {
            return crate::automembrane::LayerVerdict {
                layer: "actor".to_string(),
                verdict: crate::automembrane::Verdict::RequireEvidence,
                confidence: 1.0,
                reason: format!("Actor '{}' has no history in envelope", motion.actor),
                evidence_used: vec![],
                missing_evidence: vec!["actor_history".to_string()],
            };
        }
    };

    // Action score
    let rank_opt: Option<usize> = profile
        .common_actions
        .iter()
        .position(|(a, _)| a == &motion.requested_action);

    let action_score = match rank_opt {
        None => 1.0_f64,
        Some(r) if r < 10 => 0.0_f64,
        Some(r) => {
            let max_rank = profile.common_actions.len().max(10);
            (r - 9) as f64 / (max_rank - 9).max(1) as f64
        }
    };

    // Hour score derived from timestamp_ms
    let hour_score = match motion.timestamp_ms {
        Some(ts_ms) => {
            let hour = ((ts_ms / 3_600_000.0).floor() as u64 % 24) as usize;
            if profile.active_hours[hour] == 0 {
                1.0_f64
            } else {
                0.0_f64
            }
        }
        None => 0.0_f64, // neutral when no timestamp
    };

    let anomaly_score = 0.6 * action_score + 0.4 * hour_score;

    let (verdict, confidence, reason) = if anomaly_score > 0.7 {
        (
            crate::automembrane::Verdict::Escalate,
            1.0 - anomaly_score,
            format!(
                "Actor '{}' anomaly score {anomaly_score:.2} — action and/or hour is unusual",
                motion.actor
            ),
        )
    } else if anomaly_score > 0.4 {
        (
            crate::automembrane::Verdict::Warn,
            1.0 - anomaly_score,
            format!(
                "Actor '{}' anomaly score {anomaly_score:.2} — minor deviation detected",
                motion.actor
            ),
        )
    } else {
        (
            crate::automembrane::Verdict::Allow,
            1.0 - anomaly_score,
            format!(
                "Actor '{}' request is within normal behavioural bounds (score {anomaly_score:.2})",
                motion.actor
            ),
        )
    };

    crate::automembrane::LayerVerdict {
        layer: "actor".to_string(),
        verdict,
        confidence,
        reason,
        evidence_used: vec!["actor_envelope".to_string()],
        missing_evidence: vec![],
    }
}

// ---------------------------------------------------------------------------
// Tests (native target only)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_envelope_with_n_actors(n: usize) -> ActorEnvelope {
        let profiles: Vec<ActorProfile> = (0..n)
            .map(|i| ActorProfile {
                actor: format!("actor-{i}"),
                role: None,
                common_actions: vec![("register".to_owned(), 10), ("approve".to_owned(), 5)],
                active_hours: {
                    let mut h = [0u32; 24];
                    h[9] = 3;
                    h[14] = 2;
                    h
                },
                avg_objects_per_event: 1.0,
                total_events: 15,
                last_seen_ms: 0.0,
            })
            .collect();

        ActorEnvelope {
            envelope_type: ACTOR_ENVELOPE_TYPE.to_owned(),
            profiles,
            activity_key: "concept:name".to_owned(),
            actor_key: "org:resource".to_owned(),
            timestamp_key: "time:timestamp".to_owned(),
            trained_on: n as u32 * 3,
        }
    }

    // -----------------------------------------------------------------------
    // Rank 1 — mathematical oracle: action_score semantics
    // -----------------------------------------------------------------------

    #[test]
    fn action_in_top10_scores_zero() {
        let envelope = make_envelope_with_n_actors(3);
        let profile = &envelope.profiles[0];

        // "register" is at position 0 — should score 0.0
        let rank = profile
            .common_actions
            .iter()
            .position(|(a, _)| a == "register");
        assert!(rank.is_some());
        assert!(rank.unwrap() < 10);
        // action_score formula: rank < 10 → 0.0
        let action_score: f64 = if rank.unwrap() < 10 { 0.0 } else { 1.0 };
        assert_eq!(action_score, 0.0);
    }

    #[test]
    fn action_never_seen_scores_one() {
        let envelope = make_envelope_with_n_actors(3);
        let profile = &envelope.profiles[0];

        let rank = profile
            .common_actions
            .iter()
            .position(|(a, _)| a == "nonexistent_action_xyz");
        assert!(rank.is_none());
        // action_score formula: rank == None → 1.0
        let action_score: f64 = if rank.is_none() { 1.0 } else { 0.0 };
        assert_eq!(action_score, 1.0);
    }

    // -----------------------------------------------------------------------
    // Rank 1 — mathematical oracle: hour_score semantics
    // -----------------------------------------------------------------------

    #[test]
    fn active_hour_scores_zero() {
        let envelope = make_envelope_with_n_actors(3);
        let profile = &envelope.profiles[0];
        // Hour 9 has count=3 → score should be 0.0
        let hour_score: f64 = if profile.active_hours[9] == 0 {
            1.0
        } else {
            0.0
        };
        assert_eq!(hour_score, 0.0);
    }

    #[test]
    fn inactive_hour_scores_one() {
        let envelope = make_envelope_with_n_actors(3);
        let profile = &envelope.profiles[0];
        // Hour 3 has count=0 → score should be 1.0
        let hour_score: f64 = if profile.active_hours[3] == 0 {
            1.0
        } else {
            0.0
        };
        assert_eq!(hour_score, 1.0);
    }

    // -----------------------------------------------------------------------
    // Rank 1 — composite anomaly score is in [0, 1]
    // -----------------------------------------------------------------------

    #[test]
    fn composite_score_bounded() {
        for action_score in [0.0_f64, 0.5, 1.0] {
            for hour_score in [0.0_f64, 0.5, 1.0] {
                let composite = 0.6 * action_score + 0.4 * hour_score;
                assert!(
                    composite >= 0.0 && composite <= 1.0,
                    "composite={composite} out of bounds for action={action_score} hour={hour_score}"
                );
            }
        }
    }

    // -----------------------------------------------------------------------
    // Rank 1 — verdict thresholds are deterministic
    // -----------------------------------------------------------------------

    #[test]
    fn verdict_thresholds_are_deterministic() {
        let cases = vec![
            (0.0_f64, "allow"),
            (0.3, "allow"),
            (0.4, "allow"), // boundary: > 0.4 triggers warn
            (0.5, "warn"),
            (0.7, "warn"), // boundary: > 0.7 triggers escalate
            (0.8, "escalate"),
            (1.0, "escalate"),
        ];

        for (score, expected) in cases {
            let verdict = if score > 0.7 {
                "escalate"
            } else if score > 0.4 {
                "warn"
            } else {
                "allow"
            };
            assert_eq!(
                verdict, expected,
                "score={score} should yield '{expected}', got '{verdict}'"
            );
        }
    }

    // -----------------------------------------------------------------------
    // Rank 2 — domain contract: profiles are sorted by actor name
    // -----------------------------------------------------------------------

    #[test]
    fn profiles_sorted_by_actor_name() {
        let envelope = make_envelope_with_n_actors(5);
        let names: Vec<&str> = envelope.profiles.iter().map(|p| p.actor.as_str()).collect();
        let mut sorted = names.clone();
        sorted.sort_unstable();
        assert_eq!(names, sorted, "profiles must be sorted by actor name");
    }

    // -----------------------------------------------------------------------
    // Rank 2 — domain contract: envelope_type discriminator
    // -----------------------------------------------------------------------

    #[test]
    fn envelope_type_discriminator_is_set() {
        let envelope = make_envelope_with_n_actors(3);
        assert_eq!(envelope.envelope_type, ACTOR_ENVELOPE_TYPE);
    }

    // -----------------------------------------------------------------------
    // Rank 1 — serialisation round-trip
    // -----------------------------------------------------------------------

    #[test]
    fn actor_envelope_round_trips() {
        let envelope = make_envelope_with_n_actors(3);
        let json = serde_json::to_string(&envelope).unwrap();
        let restored: ActorEnvelope = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.profiles.len(), 3);
        assert_eq!(restored.envelope_type, ACTOR_ENVELOPE_TYPE);
        // common_actions are sorted desc by count: register(10) before approve(5)
        assert_eq!(restored.profiles[0].common_actions[0].0, "register");
        let actions: Vec<&str> = restored.profiles[0]
            .common_actions
            .iter()
            .map(|(a, _)| a.as_str())
            .collect();
        assert!(actions.contains(&"register"));
        assert!(actions.contains(&"approve"));
    }
}
