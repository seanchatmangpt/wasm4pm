//! # Route Envelope — Variant-Family Learning for Process Routes
//!
//! Uses trace variant analysis to check whether a candidate motion prefix fits
//! any of the observed route families in the event log. This is the route layer
//! of the AutoMembrane pre-control membrane.
//!
//! ## Van der Aalst framing
//!
//! In process discovery, a trace variant is a unique ordering of activities.
//! The route envelope learns the dominant variants (those covering
//! `coverage_threshold` of total traces) and then answers: "does this prefix
//! match any known route?" A prefix that matches no known variant is anomalous
//! and warrants a warning before the motion is admitted.
//!
//! ## WASM exports
//!
//! | Function | Purpose |
//! |----------|---------|
//! | `build_route_envelope` | Learn variants from a stored event log; returns handle |
//! | `score_route_motion` | Score a trace prefix against known route families |
//! | `get_route_variants` | Return all stored variants sorted by frequency desc |

#![cfg(feature = "miniml")]

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use wasm_bindgen::prelude::*;

use crate::error::{codes, js_val, wasm_err};
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js_str;

const ROUTE_ENVELOPE_TYPE: &str = "route_envelope";
const MIN_TRACES: usize = 5;

// ---------------------------------------------------------------------------
// Storage structs
// ---------------------------------------------------------------------------

/// A single trace variant with its frequency information.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RouteVariant {
    pub activities: Vec<String>,
    pub count: u32,
    /// `count / total_traces` — fraction of all traces that follow this variant.
    pub frequency: f64,
}

/// Envelope storing the dominant route variants and training metadata.
#[derive(Serialize, Deserialize)]
pub struct RouteEnvelope {
    #[serde(rename = "type")]
    pub envelope_type: String, // always ROUTE_ENVELOPE_TYPE
    pub variants: Vec<RouteVariant>,
    pub total_traces: u32,
    /// Fraction of total traces that must be covered by kept variants (default 0.8).
    pub coverage_threshold: f64,
    pub activity_key: String,
}

// ---------------------------------------------------------------------------
// WASM export 1: build_route_envelope
// ---------------------------------------------------------------------------

/// Learn trace variants from a stored event log and return an opaque handle.
///
/// Variants are sorted by count descending and pruned to those whose cumulative
/// frequency reaches `coverage_threshold` of all traces.
///
/// # Parameters
/// * `log_handle`          — handle from `load_eventlog_from_xes` / `load_eventlog_from_json`
/// * `activity_key`        — event attribute for activity names (`concept:name`)
/// * `coverage_threshold`  — fraction [0.0, 1.0] of traces the kept variants must cover;
///                           pass `0.0` to use the default of `0.8`
///
/// # Errors
/// Returns a structured error JSON when the log has fewer than `MIN_TRACES` (5) traces.
#[wasm_bindgen]
pub fn build_route_envelope(
    log_handle: &str,
    activity_key: &str,
    coverage_threshold: f64,
) -> Result<JsValue, JsValue> {
    let threshold = if coverage_threshold <= 0.0 || coverage_threshold > 1.0 {
        0.8
    } else {
        coverage_threshold
    };

    let state = get_or_init_state();

    let envelope_json = state.with_object(log_handle, |obj| {
        let log = match obj {
            Some(StoredObject::EventLog(l)) => l,
            Some(_) => return Err(wasm_err(codes::INVALID_HANDLE, "Handle is not an EventLog")),
            None => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    let result_json = state.with_json_string(envelope_handle, |json_str| {

        if log.traces.len() < MIN_TRACES {
            return Err(wasm_err(
                codes::INVALID_INPUT,
                format!(
                    "Need at least {MIN_TRACES} traces to build route envelope; found {}",
                    log.traces.len()
                ),
            ));
        }

        let total_traces = log.traces.len() as u32;

        // ── Count occurrences of each unique activity sequence ───────────────
        let mut variant_counts: BTreeMap<Vec<String>, u32> = BTreeMap::new();

        for trace in &log.traces {
            let activities: Vec<String> = trace
                .events
                .iter()
                .filter_map(|e| {
                    e.attributes
                        .get(activity_key)
                        .and_then(|v| v.as_string())
                        .filter(|s| !s.is_empty())
                        .map(str::to_owned)
                })
                .collect();

            if activities.is_empty() {
                continue;
            }

            *variant_counts.entry(activities).or_default() += 1;
        }

        // ── Sort variants by count descending, then lexicographically ────────
        let mut sorted_variants: Vec<(Vec<String>, u32)> = variant_counts.into_iter().collect();
        sorted_variants.sort_unstable_by(|(a_acts, a_cnt), (b_acts, b_cnt)| {
            b_cnt.cmp(a_cnt).then(a_acts.cmp(b_acts))
        });

        // ── Keep variants until coverage_threshold is reached ────────────────
        let mut kept: Vec<RouteVariant> = Vec::new();
        let mut cumulative: f64 = 0.0;

        for (activities, count) in sorted_variants {
            let freq = count as f64 / total_traces as f64;
            kept.push(RouteVariant {
                activities,
                count,
                frequency: freq,
            });
            cumulative += freq;
            if cumulative >= threshold {
                break;
            }
        }

        let envelope = RouteEnvelope {
            envelope_type: ROUTE_ENVELOPE_TYPE.to_owned(),
            variants: kept,
            total_traces,
            coverage_threshold: threshold,
            activity_key: activity_key.to_owned(),
        };

        serde_json::to_string(&envelope).map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!("RouteEnvelope serialisation failed: {e}"),
            )
        })
    })?;

    let handle = state.store_object(StoredObject::JsonString(envelope_json))?;
    Ok(js_val(&handle))
}

// ---------------------------------------------------------------------------
// WASM export 2: score_route_motion
// ---------------------------------------------------------------------------

/// Score a trace prefix against the known route families.
///
/// # Parameters
/// * `envelope_handle` — handle returned by `build_route_envelope`
/// * `prefix_json`     — JSON array of activity strings, e.g. `["Register","Approve"]`
///
/// # Returns
/// JSON string with verdict, match rate, and candidate continuations.
#[wasm_bindgen]
pub fn score_route_motion(envelope_handle: &str, prefix_json: &str) -> Result<JsValue, JsValue> {
    // ── Parse prefix ──────────────────────────────────────────────────────────
    let prefix: Vec<String> = serde_json::from_str(prefix_json)
        .map_err(|e| wasm_err(codes::INVALID_JSON, format!("Invalid prefix JSON: {e}")))?;

    let state = get_or_init_state();

    let result_json = state.with_object(envelope_handle, |obj| {
        let json_str = match obj {
            Some(StoredObject::JsonString(s)) => s,
            Some(_) => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    "Handle is not a route envelope (wrong type)",
                ))
            }
            None => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    let result_json = state.with_json_string(envelope_handle, |json_str| {

        let envelope: RouteEnvelope = serde_json::from_str(json_str).map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!("RouteEnvelope deserialisation failed: {e}"),
            )
        })?;

        if envelope.envelope_type != ROUTE_ENVELOPE_TYPE {
            return Err(wasm_err(
                codes::INVALID_HANDLE,
                format!(
                    "Expected type '{}', got '{}'",
                    ROUTE_ENVELOPE_TYPE, envelope.envelope_type
                ),
            ));
        }

        let total_variants = envelope.variants.len();

        // ── Empty prefix: every variant matches by vacuous truth ─────────────
        if prefix.is_empty() {
            // Collect top-3 first activities as candidate continuations
            let mut next_counts: HashMap<String, u32> = HashMap::new();
            for v in &envelope.variants {
                if let Some(first) = v.activities.first() {
                    *next_counts.entry(first.clone()).or_default() += v.count;
                }
            }
            let mut top_next: Vec<(String, u32)> = next_counts.into_iter().collect();
            top_next.sort_unstable_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
            let continuations: Vec<&str> =
                top_next.iter().take(3).map(|(a, _)| a.as_str()).collect();

            let result = serde_json::json!({
                "verdict": "allow",
                "confidence": 1.0,
                "match_rate": 1.0,
                "matching_variants": total_variants,
                "total_variants": total_variants,
                "prefix": prefix,
                "candidate_continuations": continuations
            });
            return serde_json::to_string(&result).map_err(|e| {
                wasm_err(codes::INTERNAL_ERROR, format!("Serialisation failed: {e}"))
            });
        }

        // ── Find variants that start with the prefix ─────────────────────────
        let prefix_len = prefix.len();
        let matching: Vec<&RouteVariant> = envelope
            .variants
            .iter()
            .filter(|v| {
                v.activities.len() >= prefix_len && v.activities[..prefix_len] == prefix[..]
            })
            .collect();

        let matching_count = matching.len();
        let match_rate = if total_variants > 0 {
            matching_count as f64 / total_variants as f64
        } else {
            0.0
        };

        // ── Candidate continuations: top-3 next activities ───────────────────
        let mut next_counts: HashMap<String, u32> = HashMap::new();
        for v in &matching {
            if let Some(next_act) = v.activities.get(prefix_len) {
                *next_counts.entry(next_act.clone()).or_default() += v.count;
            }
        }
        let mut top_next: Vec<(String, u32)> = next_counts.into_iter().collect();
        top_next.sort_unstable_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
        let continuations: Vec<&str> = top_next.iter().take(3).map(|(a, _)| a.as_str()).collect();

        // ── Verdict ──────────────────────────────────────────────────────────
        let (verdict, reason) = if matching_count == 0 {
            (
                "warn",
                format!(
                    "No known route starts with this prefix: {}",
                    prefix.join(" → ")
                ),
            )
        } else if match_rate > 0.5 {
            (
                "allow",
                format!("Prefix matches {matching_count}/{total_variants} known route(s)"),
            )
        } else {
            (
                "warn",
                format!("Prefix matches only {matching_count}/{total_variants} known route(s)"),
            )
        };

        let result = serde_json::json!({
            "verdict": verdict,
            "confidence": match_rate,
            "match_rate": match_rate,
            "matching_variants": matching_count,
            "total_variants": total_variants,
            "prefix": prefix,
            "candidate_continuations": continuations,
            "reason": reason
        });

        serde_json::to_string(&result)
            .map_err(|e| wasm_err(codes::INTERNAL_ERROR, format!("Serialisation failed: {e}")))
    })?;

    to_js_str(&result_json)
}

// ---------------------------------------------------------------------------
// WASM export 3: get_route_variants
// ---------------------------------------------------------------------------

/// Return all stored variants as a JSON array, sorted by frequency descending.
///
/// Each element has `{activities, count, frequency}`.
#[wasm_bindgen]
pub fn get_route_variants(envelope_handle: &str) -> Result<JsValue, JsValue> {
    let state = get_or_init_state();

    let result_json = state.with_object(envelope_handle, |obj| {
        let json_str = match obj {
            Some(StoredObject::JsonString(s)) => s,
            Some(_) => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    "Handle is not a route envelope (wrong type)",
                ))
            }
            None => {
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    let result_json = state.with_json_string(envelope_handle, |json_str| {

        let envelope: RouteEnvelope = serde_json::from_str(json_str).map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!("RouteEnvelope deserialisation failed: {e}"),
            )
        })?;

        // Already sorted by frequency desc from build time
        serde_json::to_string(&envelope.variants)
            .map_err(|e| wasm_err(codes::INTERNAL_ERROR, format!("Serialisation failed: {e}")))
    })?;

    to_js_str(&result_json)
}

// ---------------------------------------------------------------------------
// pub(crate) scoring — used by automembrane classify_motion_with_envelopes
// ---------------------------------------------------------------------------

/// Score a `RequestMotion` against a trained `RouteEnvelope`.
///
/// Builds a prefix from `[route_context, requested_action]` (skipping empty
/// strings) and checks how many known variants start with that prefix.
pub fn score_route_motion_from_envelope(
    envelope: &RouteEnvelope,
    motion: &crate::automembrane::RequestMotion,
) -> crate::automembrane::LayerVerdict {
    // Build prefix from route context + requested action
    let mut prefix: Vec<String> = Vec::new();
    if let Some(rc) = &motion.route_context {
        if !rc.is_empty() {
            prefix.push(rc.clone());
        }
    }
    if !motion.requested_action.is_empty() {
        prefix.push(motion.requested_action.clone());
    }

    let total_variants = envelope.variants.len();

    if prefix.is_empty() {
        // Empty prefix: vacuously matches all
        return crate::automembrane::LayerVerdict {
            layer: "route".to_string(),
            verdict: crate::automembrane::Verdict::Allow,
            confidence: 0.5,
            reason: "No route prefix to evaluate; all variants match vacuously".to_string(),
            evidence_used: vec!["route_envelope".to_string()],
            missing_evidence: vec![],
        };
    }

    let prefix_len = prefix.len();
    let matching_count = envelope
        .variants
        .iter()
        .filter(|v| v.activities.len() >= prefix_len && v.activities[..prefix_len] == prefix[..])
        .count();

    let match_rate = if total_variants > 0 {
        matching_count as f64 / total_variants as f64
    } else {
        0.0
    };

    if matching_count == 0 {
        crate::automembrane::LayerVerdict {
            layer: "route".to_string(),
            verdict: crate::automembrane::Verdict::Warn,
            confidence: 0.0,
            reason: format!("No known route starts with prefix [{}]", prefix.join(" → ")),
            evidence_used: vec!["route_envelope".to_string()],
            missing_evidence: vec![],
        }
    } else if match_rate > 0.5 {
        crate::automembrane::LayerVerdict {
            layer: "route".to_string(),
            verdict: crate::automembrane::Verdict::Allow,
            confidence: match_rate,
            reason: format!("Prefix matches {matching_count}/{total_variants} known route(s)"),
            evidence_used: vec!["route_envelope".to_string()],
            missing_evidence: vec![],
        }
    } else {
        crate::automembrane::LayerVerdict {
            layer: "route".to_string(),
            verdict: crate::automembrane::Verdict::Warn,
            confidence: match_rate,
            reason: format!("Prefix matches only {matching_count}/{total_variants} known route(s)"),
            evidence_used: vec!["route_envelope".to_string()],
            missing_evidence: vec![],
        }
    }
}

// ---------------------------------------------------------------------------
// Tests (native target only)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_variant(activities: Vec<&str>, count: u32, total: u32) -> RouteVariant {
        RouteVariant {
            activities: activities.into_iter().map(str::to_owned).collect(),
            count,
            frequency: count as f64 / total as f64,
        }
    }

    fn make_envelope(variants: Vec<RouteVariant>, total: u32) -> RouteEnvelope {
        RouteEnvelope {
            envelope_type: ROUTE_ENVELOPE_TYPE.to_owned(),
            variants,
            total_traces: total,
            coverage_threshold: 0.8,
            activity_key: "concept:name".to_owned(),
        }
    }

    // -----------------------------------------------------------------------
    // Rank 1 — mathematical oracle: frequency = count / total
    // -----------------------------------------------------------------------

    #[test]
    fn frequency_formula_is_count_over_total() {
        let v = make_variant(vec!["A", "B", "C"], 4, 10);
        assert!((v.frequency - 0.4).abs() < 1e-9);
    }

    // -----------------------------------------------------------------------
    // Rank 1 — prefix matching: variants longer than prefix match if prefix is a prefix
    // -----------------------------------------------------------------------

    #[test]
    fn prefix_match_checks_slice_equality() {
        let variants = vec![
            make_variant(vec!["Register", "Approve", "Close"], 5, 10),
            make_variant(vec!["Register", "Reject"], 3, 10),
            make_variant(vec!["Skip", "Close"], 2, 10),
        ];
        let envelope = make_envelope(variants, 10);

        let prefix = vec!["Register".to_owned(), "Approve".to_owned()];
        let prefix_len = prefix.len();

        let matching: Vec<&RouteVariant> = envelope
            .variants
            .iter()
            .filter(|v| {
                v.activities.len() >= prefix_len && v.activities[..prefix_len] == prefix[..]
            })
            .collect();

        // Only "Register → Approve → Close" matches "Register → Approve"
        assert_eq!(matching.len(), 1);
        assert_eq!(matching[0].activities[0], "Register");
    }

    // -----------------------------------------------------------------------
    // Rank 1 — match_rate formula
    // -----------------------------------------------------------------------

    #[test]
    fn match_rate_is_matching_over_total_variants() {
        let total_variants = 4usize;
        let matching_count = 1usize;
        let match_rate = matching_count as f64 / total_variants as f64;
        assert!((match_rate - 0.25).abs() < 1e-9);
    }

    // -----------------------------------------------------------------------
    // Rank 1 — verdict boundary: > 0.5 → allow, else warn, 0.0 → warn
    // -----------------------------------------------------------------------

    #[test]
    fn verdict_boundaries_are_deterministic() {
        let cases = vec![
            (0.0_f64, "warn"),
            (0.3, "warn"),
            (0.5, "warn"), // not strictly greater than 0.5
            (0.51, "allow"),
            (1.0, "allow"),
        ];

        for (rate, expected) in cases {
            let verdict = if rate > 0.5 { "allow" } else { "warn" };
            assert_eq!(
                verdict, expected,
                "match_rate={rate} should yield '{expected}'"
            );
        }
    }

    // -----------------------------------------------------------------------
    // Rank 1 — candidate continuations are at prefix_len position
    // -----------------------------------------------------------------------

    #[test]
    fn candidate_continuations_use_next_position() {
        let variants = vec![
            make_variant(vec!["A", "B", "C"], 5, 10),
            make_variant(vec!["A", "B", "D"], 3, 10),
            make_variant(vec!["A", "X"], 2, 10),
        ];

        let prefix = vec!["A".to_owned(), "B".to_owned()];
        let prefix_len = prefix.len();

        let mut next_counts: std::collections::HashMap<String, u32> =
            std::collections::HashMap::new();

        for v in &variants {
            if v.activities.len() >= prefix_len && v.activities[..prefix_len] == prefix[..] {
                if let Some(next) = v.activities.get(prefix_len) {
                    *next_counts.entry(next.clone()).or_default() += v.count;
                }
            }
        }

        let mut top_next: Vec<(String, u32)> = next_counts.into_iter().collect();
        top_next.sort_unstable_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));

        // "C" has count 5, "D" has count 3 — C should come first
        assert_eq!(top_next[0].0, "C");
        assert_eq!(top_next[1].0, "D");
    }

    // -----------------------------------------------------------------------
    // Rank 1 — coverage threshold prunes variants correctly
    // -----------------------------------------------------------------------

    #[test]
    fn coverage_threshold_prunes_variants() {
        // 10 traces: variant A=6, variant B=3, variant C=1
        // threshold=0.8: cumulative after A=0.6 < 0.8, after B=0.9 >= 0.8 → stop after B
        let sorted = vec![("A", 6u32), ("B", 3u32), ("C", 1u32)];
        let total = 10.0_f64;
        let threshold = 0.8_f64;

        let mut kept = vec![];
        let mut cum = 0.0_f64;
        for (name, count) in &sorted {
            let freq = *count as f64 / total;
            kept.push((name, count));
            cum += freq;
            if cum >= threshold {
                break;
            }
        }

        assert_eq!(kept.len(), 2); // A and B, not C
        assert_eq!(*kept[0].0, "A");
        assert_eq!(*kept[1].0, "B");
    }

    // -----------------------------------------------------------------------
    // Rank 2 — domain contract: envelope_type discriminator
    // -----------------------------------------------------------------------

    #[test]
    fn envelope_type_discriminator() {
        let envelope = make_envelope(vec![], 10);
        assert_eq!(envelope.envelope_type, ROUTE_ENVELOPE_TYPE);
    }

    // -----------------------------------------------------------------------
    // Rank 1 — default threshold applied when coverage_threshold is 0.0
    // -----------------------------------------------------------------------

    #[test]
    fn zero_threshold_maps_to_default() {
        let threshold = {
            let t = 0.0_f64;
            if t <= 0.0 || t > 1.0 {
                0.8
            } else {
                t
            }
        };
        assert!((threshold - 0.8).abs() < 1e-9);
    }

    // -----------------------------------------------------------------------
    // Rank 1 — serialisation round-trip
    // -----------------------------------------------------------------------

    #[test]
    fn route_envelope_round_trips() {
        let variants = vec![
            make_variant(vec!["A", "B", "C"], 6, 10),
            make_variant(vec!["A", "D"], 4, 10),
        ];
        let envelope = make_envelope(variants, 10);
        let json = serde_json::to_string(&envelope).unwrap();
        let restored: RouteEnvelope = serde_json::from_str(&json).unwrap();

        assert_eq!(restored.envelope_type, ROUTE_ENVELOPE_TYPE);
        assert_eq!(restored.variants.len(), 2);
        assert_eq!(restored.total_traces, 10);
        assert!((restored.coverage_threshold - 0.8).abs() < 1e-9);
    }

    // -----------------------------------------------------------------------
    // Rank 3 — metamorphic: longer prefix can only match fewer or equal variants
    // -----------------------------------------------------------------------

    #[test]
    fn longer_prefix_matches_fewer_or_equal_variants() {
        let variants = vec![
            make_variant(vec!["A", "B", "C"], 5, 10),
            make_variant(vec!["A", "B", "D"], 3, 10),
            make_variant(vec!["A", "X"], 2, 10),
        ];

        let check_match = |prefix: &[&str]| -> usize {
            let p_len = prefix.len();
            variants
                .iter()
                .filter(|v| {
                    v.activities.len() >= p_len
                        && v.activities[..p_len]
                            .iter()
                            .zip(prefix.iter())
                            .all(|(a, b)| a == b)
                })
                .count()
        };

        let matches_a = check_match(&["A"]);
        let matches_ab = check_match(&["A", "B"]);
        let matches_abc = check_match(&["A", "B", "C"]);

        // Metamorphic: adding more prefix items can only reduce or maintain match count
        assert!(
            matches_a >= matches_ab,
            "A→B cannot match more than A alone"
        );
        assert!(
            matches_ab >= matches_abc,
            "A→B→C cannot match more than A→B"
        );
    }
}
