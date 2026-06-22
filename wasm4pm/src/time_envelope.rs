//! # Time Envelope — Temporal Freshness Layer for the AutoMembrane
//!
//! Learns temporal statistics from an event log (case durations, inter-event
//! gaps, the latest observed timestamp) and scores incoming motion requests
//! against those baselines. This is the sixth membrane layer — the temporal
//! freshness check — of the AutoMembrane pre-control membrane.
//!
//! ## Van der Aalst framing
//!
//! Performance analysis in process mining characterises the time dimension of
//! a process: how long cases take, how dense events are within a case, and
//! whether observed timestamps are plausible relative to the training window.
//! The time envelope makes these temporal statistics machine-queryable so that
//! a motion arriving with an implausible timestamp (too stale, or predating the
//! training data by more than 3σ) can be flagged before any downstream algorithm
//! executes.
//!
//! ## WASM exports
//!
//! | Function | Purpose |
//! |----------|---------|
//! | `build_time_envelope` | Learn temporal statistics from a stored event log; returns handle |
//! | `score_time_motion` | Score a millisecond timestamp against the envelope |
//! | `get_time_envelope_stats` | Return the full envelope struct as JSON |

#![cfg(feature = "miniml")]

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::error::{codes, js_val, wasm_err};
use crate::models::{parse_timestamp_ms, AttributeValue};
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js_str;

const TIME_ENVELOPE_TYPE: &str = "time_envelope";
const MIN_TRACES: usize = 5;

// ---------------------------------------------------------------------------
// Storage struct
// ---------------------------------------------------------------------------

/// Temporal statistics derived from a training event log.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TimeEnvelope {
    #[serde(rename = "type")]
    pub envelope_type: String, // always TIME_ENVELOPE_TYPE
    /// Mean case duration across all traces (max_ts − min_ts per trace), in ms.
    pub avg_case_duration_ms: f64,
    /// Standard deviation of case durations, in ms.
    pub std_case_duration_ms: f64,
    /// Mean consecutive inter-event gap across all traces, in ms.
    pub avg_event_gap_ms: f64,
    /// 95th-percentile consecutive inter-event gap, in ms.
    pub p95_event_gap_ms: f64,
    /// Staleness window: motions older than this many ms after `last_event_ms` are warned.
    pub freshness_window_ms: f64,
    /// Maximum timestamp observed across all training events (Unix epoch ms).
    pub last_event_ms: f64,
    /// Event attribute key used to extract timestamps.
    pub timestamp_key: String,
    /// Number of traces the envelope was trained on.
    pub n_traces: usize,
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn mean(values: &[f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    values.iter().sum::<f64>() / values.len() as f64
}

fn std_dev(values: &[f64]) -> f64 {
    if values.len() < 2 {
        return 0.0;
    }
    let m = mean(values);
    let variance = values.iter().map(|v| (v - m) * (v - m)).sum::<f64>() / values.len() as f64;
    variance.sqrt()
}

fn percentile_95(sorted: &[f64]) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    // Linear interpolation at the 95th percentile
    let idx_f = 0.95 * (sorted.len() as f64 - 1.0);
    let lo = idx_f.floor() as usize;
    let hi = (lo + 1).min(sorted.len() - 1);
    let frac = idx_f - lo as f64;
    sorted[lo] * (1.0 - frac) + sorted[hi] * frac
}

/// Build a `TimeEnvelope` from an `EventLog`.  This is the non-WASM entry
/// point used by the wiring layer in `automembrane.rs`.
pub(crate) fn build_time_envelope_internal(
    log: &crate::models::EventLog,
    timestamp_key: &str,
    freshness_window_ms: f64,
) -> Result<TimeEnvelope, String> {
    let mut case_durations: Vec<f64> = Vec::new();
    let mut all_gaps: Vec<f64> = Vec::new();
    let mut global_max_ts: f64 = f64::NEG_INFINITY;

    for trace in &log.traces {
        // Collect timestamps for this trace
        let mut trace_ts: Vec<f64> = trace
            .events
            .iter()
            .filter_map(|event| {
                event.attributes.get(timestamp_key).and_then(|v| match v {
                    AttributeValue::Date(s) => parse_timestamp_ms(s).map(|i| i as f64),
                    AttributeValue::Float(f) => Some(*f),
                    AttributeValue::Int(i) => Some(*i as f64),
                    _ => None,
                })
            })
            .collect();

        // Sort ascending so gaps and duration are meaningful
        trace_ts.sort_unstable_by(|a, b| a.total_cmp(b));

        // Update global max timestamp
        if let Some(&max_ts) = trace_ts.last() {
            if max_ts > global_max_ts {
                global_max_ts = max_ts;
            }
        }

        // Case duration: only for traces with at least 2 timestamped events
        if trace_ts.len() >= 2 {
            let duration = trace_ts.last().unwrap() - trace_ts.first().unwrap();
            case_durations.push(duration.max(0.0));

            // Consecutive inter-event gaps
            for window in trace_ts.windows(2) {
                let gap = (window[1] - window[0]).max(0.0);
                all_gaps.push(gap);
            }
        }
    }

    if log.traces.len() < MIN_TRACES {
        return Err(format!(
            "Need at least {MIN_TRACES} traces to build time envelope; found {}",
            log.traces.len()
        ));
    }

    all_gaps.sort_unstable_by(|a, b| a.total_cmp(b));

    let avg_case_duration_ms = mean(&case_durations);
    let std_case_duration_ms = std_dev(&case_durations);
    let avg_event_gap_ms = mean(&all_gaps);
    let p95_event_gap_ms = percentile_95(&all_gaps);
    let last_event_ms = if global_max_ts.is_finite() {
        global_max_ts
    } else {
        0.0
    };

    Ok(TimeEnvelope {
        envelope_type: TIME_ENVELOPE_TYPE.to_owned(),
        avg_case_duration_ms,
        std_case_duration_ms,
        avg_event_gap_ms,
        p95_event_gap_ms,
        freshness_window_ms,
        last_event_ms,
        timestamp_key: timestamp_key.to_owned(),
        n_traces: log.traces.len(),
    })
}

// ---------------------------------------------------------------------------
// Scoring logic (pub(crate) — used by automembrane.rs)
// ---------------------------------------------------------------------------

/// Score a candidate motion timestamp against the trained time envelope.
///
/// Returns a `LayerVerdict` for the "time" layer.
pub(crate) fn score_time_motion_from_envelope(
    envelope: &TimeEnvelope,
    motion_timestamp_ms: Option<f64>,
) -> crate::automembrane::LayerVerdict {
    // No timestamp supplied → skip check at low confidence
    let motion_ts = match motion_timestamp_ms {
        None => {
            return crate::automembrane::LayerVerdict {
                layer: "time".to_string(),
                verdict: crate::automembrane::Verdict::Allow,
                confidence: 0.5,
                reason: "No timestamp in motion; time check skipped".to_string(),
                evidence_used: vec!["time_envelope".to_string()],
                missing_evidence: vec![],
            };
        }
        Some(ts) => ts,
    };

    let elapsed_since_last = motion_ts - envelope.last_event_ms;

    // Possible replay attack: motion timestamp predates training window by >3σ
    if envelope.std_case_duration_ms > 0.0
        && motion_ts < (envelope.last_event_ms - 3.0 * envelope.std_case_duration_ms)
    {
        return crate::automembrane::LayerVerdict {
            layer: "time".to_string(),
            verdict: crate::automembrane::Verdict::Escalate,
            confidence: 0.8,
            reason: format!(
                "Request timestamp predates training data by more than 3\u{03c3} (possible replay attack)"
            ),
            evidence_used: vec!["time_envelope".to_string()],
            missing_evidence: vec![],
        };
    }

    // Stale request: motion timestamp is beyond the freshness window
    if elapsed_since_last > envelope.freshness_window_ms {
        return crate::automembrane::LayerVerdict {
            layer: "time".to_string(),
            verdict: crate::automembrane::Verdict::Warn,
            confidence: 0.4,
            reason: format!(
                "Request timestamp is {elapsed_since_last:.0}ms after last known event \
                 (freshness window: {:.0}ms)",
                envelope.freshness_window_ms
            ),
            evidence_used: vec!["time_envelope".to_string()],
            missing_evidence: vec![],
        };
    }

    // All good
    crate::automembrane::LayerVerdict {
        layer: "time".to_string(),
        verdict: crate::automembrane::Verdict::Allow,
        confidence: 0.8,
        reason: "Timestamp within expected process time window".to_string(),
        evidence_used: vec!["time_envelope".to_string()],
        missing_evidence: vec![],
    }
}

// ---------------------------------------------------------------------------
// WASM export 1: build_time_envelope
// ---------------------------------------------------------------------------

/// Train temporal statistics from a stored event log and return an opaque handle.
///
/// # Parameters
/// * `log_handle`          — handle from `load_eventlog_from_xes` / `load_eventlog_from_json`
/// * `timestamp_key`       — event attribute for timestamps (`time:timestamp`)
/// * `freshness_window_ms` — how many milliseconds after the last training event a motion
///                           timestamp is still considered fresh; typically 24h = 86_400_000
///
/// # Errors
/// Returns a structured error JSON when fewer than 5 traces are present.
#[wasm_bindgen]
pub fn build_time_envelope(
    log_handle: &str,
    timestamp_key: &str,
    freshness_window_ms: f64,
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

        let envelope = build_time_envelope_internal(log, timestamp_key, freshness_window_ms)
            .map_err(|e| wasm_err(codes::INVALID_INPUT, e))?;

        serde_json::to_string(&envelope).map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!("TimeEnvelope serialisation failed: {e}"),
            )
        })
    })?;

    let handle = state.store_object(StoredObject::JsonString(envelope_json))?;
    Ok(js_val(&handle))
}

// ---------------------------------------------------------------------------
// WASM export 2: score_time_motion
// ---------------------------------------------------------------------------

/// Score a candidate motion against the trained time envelope.
///
/// # Parameters
/// * `envelope_handle` — handle returned by `build_time_envelope`
/// * `timestamp_ms`    — wall-clock time of the motion in milliseconds since Unix epoch
///
/// # Returns
/// JSON string (`LayerVerdict`). JS callers must call `JSON.parse()`.
#[wasm_bindgen]
pub fn score_time_motion(envelope_handle: &str, timestamp_ms: f64) -> Result<JsValue, JsValue> {
    let state = get_or_init_state();

    let result_json = state.with_object(envelope_handle, |obj| {
        let json_str = match obj {
            Some(StoredObject::JsonString(s)) => s,
            Some(_) => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    "Handle is not a time envelope (wrong type)",
                ))
            }
            None => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    format!("No object at handle '{envelope_handle}'"),
                ))
            }
        };

        let envelope: TimeEnvelope = serde_json::from_str(json_str).map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!("TimeEnvelope deserialisation failed: {e}"),
            )
        })?;

        let verdict = score_time_motion_from_envelope(&envelope, Some(timestamp_ms));

        serde_json::to_string(&verdict)
            .map_err(|e| wasm_err(codes::INTERNAL_ERROR, format!("Serialisation failed: {e}")))
    })?;

    to_js_str(&result_json)
}

// ---------------------------------------------------------------------------
// WASM export 3: get_time_envelope_stats
// ---------------------------------------------------------------------------

/// Return the full `TimeEnvelope` struct as a JSON string.
///
/// # Parameters
/// * `envelope_handle` — handle returned by `build_time_envelope`
#[wasm_bindgen]
pub fn get_time_envelope_stats(envelope_handle: &str) -> Result<JsValue, JsValue> {
    let state = get_or_init_state();

    let result_json = state.with_object(envelope_handle, |obj| {
        let json_str = match obj {
            Some(StoredObject::JsonString(s)) => s,
            Some(_) => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    "Handle is not a time envelope (wrong type)",
                ))
            }
            None => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    format!("No object at handle '{envelope_handle}'"),
                ))
            }
        };

        let envelope: TimeEnvelope = serde_json::from_str(json_str).map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!("TimeEnvelope deserialisation failed: {e}"),
            )
        })?;

        serde_json::to_string(&envelope)
            .map_err(|e| wasm_err(codes::INTERNAL_ERROR, format!("Serialisation failed: {e}")))
    })?;

    to_js_str(&result_json)
}

// ---------------------------------------------------------------------------
// Tests (native target only)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::automembrane::Verdict;

    fn make_envelope(
        last_event_ms: f64,
        freshness_window_ms: f64,
        std_case_duration_ms: f64,
    ) -> TimeEnvelope {
        TimeEnvelope {
            envelope_type: TIME_ENVELOPE_TYPE.to_owned(),
            avg_case_duration_ms: 3_600_000.0,
            std_case_duration_ms,
            avg_event_gap_ms: 600_000.0,
            p95_event_gap_ms: 1_800_000.0,
            freshness_window_ms,
            last_event_ms,
            timestamp_key: "time:timestamp".to_owned(),
            n_traces: 10,
        }
    }

    // -----------------------------------------------------------------------
    // Rank 1 — mathematical oracle: no timestamp → Allow at 0.5 confidence
    // -----------------------------------------------------------------------

    #[test]
    fn test_score_time_no_timestamp_allows() {
        let env = make_envelope(1_700_000_000_000.0, 86_400_000.0, 3_600_000.0);
        let verdict = score_time_motion_from_envelope(&env, None);
        assert_eq!(verdict.verdict, Verdict::Allow);
        assert!((verdict.confidence - 0.5).abs() < 1e-9);
        assert!(verdict.reason.contains("skipped"));
    }

    // -----------------------------------------------------------------------
    // Rank 2 — domain contract: stale request → Warn
    // -----------------------------------------------------------------------

    #[test]
    fn test_score_time_stale_request_warns() {
        // last_event_ms = 1_000_000_000, freshness_window_ms = 10_000
        // motion_ts = 1_000_011_000 → elapsed = 11_000 > 10_000 → Warn
        let env = make_envelope(1_000_000_000.0, 10_000.0, 0.0);
        let motion_ts = 1_000_011_000.0;
        let verdict = score_time_motion_from_envelope(&env, Some(motion_ts));
        assert_eq!(verdict.verdict, Verdict::Warn);
        assert!(verdict.confidence < 0.5);
        assert!(verdict.reason.contains("freshness window"));
    }

    // -----------------------------------------------------------------------
    // Rank 2 — domain contract: replay attack → Escalate
    // -----------------------------------------------------------------------

    #[test]
    fn test_score_time_replay_attack_escalates() {
        // last_event_ms = 1_000_000_000_000, std = 3_600_000
        // Replay threshold = 1_000_000_000_000 - 3 * 3_600_000 = 999_989_200_000
        // motion_ts = 900_000_000_000 < threshold → Escalate
        let env = make_envelope(1_000_000_000_000.0, 86_400_000_000.0, 3_600_000.0);
        let motion_ts = 900_000_000_000.0; // well before training data
        let verdict = score_time_motion_from_envelope(&env, Some(motion_ts));
        assert_eq!(verdict.verdict, Verdict::Escalate);
        assert!((verdict.confidence - 0.8).abs() < 1e-9);
        assert!(verdict.reason.contains("replay attack"));
    }

    // -----------------------------------------------------------------------
    // Rank 1 — mathematical oracle: fresh timestamp → Allow at 0.8 confidence
    // -----------------------------------------------------------------------

    #[test]
    fn test_score_time_fresh_timestamp_allows() {
        // last_event_ms = 1_000_000, freshness_window_ms = 86_400_000, std = 0
        // motion_ts = 1_005_000 → elapsed = 5_000 < 86_400_000 → Allow
        let env = make_envelope(1_000_000.0, 86_400_000.0, 0.0);
        let verdict = score_time_motion_from_envelope(&env, Some(1_005_000.0));
        assert_eq!(verdict.verdict, Verdict::Allow);
        assert!((verdict.confidence - 0.8).abs() < 1e-9);
    }

    // -----------------------------------------------------------------------
    // Rank 1 — mathematical oracle: percentile_95 on sorted slice
    // -----------------------------------------------------------------------

    #[test]
    fn test_percentile_95_single_element() {
        let v = vec![42.0_f64];
        assert!((percentile_95(&v) - 42.0).abs() < 1e-9);
    }

    #[test]
    fn test_percentile_95_empty_returns_zero() {
        assert_eq!(percentile_95(&[]), 0.0);
    }

    #[test]
    fn test_percentile_95_sorted_range() {
        // 20 elements: 1..=20 sorted; p95 index = 0.95 * 19 = 18.05 → lo=18, hi=19
        // interpolated = arr[18] * 0.95 + arr[19] * 0.05 = 19 * 0.95 + 20 * 0.05 = 19.05
        let v: Vec<f64> = (1..=20).map(|x| x as f64).collect();
        let p95 = percentile_95(&v);
        assert!((p95 - 19.05).abs() < 1e-9, "p95={p95}");
    }

    // -----------------------------------------------------------------------
    // Rank 1 — std_dev of identical values is 0
    // -----------------------------------------------------------------------

    #[test]
    fn test_std_dev_uniform_values() {
        let v = vec![5.0_f64; 10];
        assert!(std_dev(&v).abs() < 1e-9);
    }

    // -----------------------------------------------------------------------
    // Rank 1 — mean of empty slice is 0
    // -----------------------------------------------------------------------

    #[test]
    fn test_mean_empty_returns_zero() {
        assert_eq!(mean(&[]), 0.0);
    }

    // -----------------------------------------------------------------------
    // Rank 1 — serialisation round-trip
    // -----------------------------------------------------------------------

    #[test]
    fn test_time_envelope_round_trips() {
        let env = make_envelope(1_700_000_000_000.0, 86_400_000.0, 7_200_000.0);
        let json = serde_json::to_string(&env).unwrap();
        let restored: TimeEnvelope = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.envelope_type, TIME_ENVELOPE_TYPE);
        assert!((restored.freshness_window_ms - 86_400_000.0).abs() < 1e-9);
        assert_eq!(restored.n_traces, 10);
    }
}
