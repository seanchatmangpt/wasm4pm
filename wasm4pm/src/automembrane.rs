//! # AutoMembrane — Pre-Control Membrane for Process Mining
//!
//! AutoMembrane is the foundational "pre-control membrane" layer of the wasm4pm
//! Vision 2030 architecture. It intercepts process motions (requests to act on
//! process objects) and issues structured verdicts before any downstream algorithm
//! executes, enforcing evidence requirements and custody rules at the boundary.
//!
//! ## Conceptual model (Van der Aalst framing)
//!
//! In conformance checking, a normative model constrains which traces are admissible.
//! AutoMembrane extends this idea to the *request plane*: before a case is admitted
//! into a process, the membrane evaluates the requesting actor, the objects being
//! acted upon, the claimed evidence chain, and the route context across five
//! independent layers. The layers are composed into a single `VerdictReceipt` that
//! records every layer decision and the decisive layer.
//!
//! ## Layer architecture
//!
//! | Layer | Guards |
//! |-------|--------|
//! | `actor` | Actor identity completeness |
//! | `object` | Object scope completeness |
//! | `route` | Route context validity |
//! | `automl` | Reserved for ML-scored risk |
//! | `custody` | Evidence chain for high-stakes actions |
//!
//! ## WASM exports
//!
//! | Function | Purpose |
//! |----------|---------|
//! | `classify_motion` | Full membrane classification of a `RequestMotion` JSON |
//! | `get_verdict_explanation` | Human-readable breakdown of a `VerdictReceipt` JSON |
//! | `build_motion_from_log_trace` | Construct a `RequestMotion` from a stored event log trace |

#![cfg(feature = "miniml")]

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::error::{codes, wasm_err};
use crate::models::AttributeValue;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js_str;

// OTEL instrumentation
use std::time::Instant;

// ---------------------------------------------------------------------------
// Core domain types
// ---------------------------------------------------------------------------

/// A motion represents a request by an actor to perform an action on one or
/// more process objects. It is the unit of evaluation for the AutoMembrane.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RequestMotion {
    /// Unique identifier for this request (used in receipt + snapshot hash).
    pub request_id: String,
    /// Identity of the requesting actor.
    pub actor: String,
    /// Declared role of the actor (optional — absence triggers lower-confidence scoring).
    pub role: Option<String>,
    /// System that originated the request (e.g. "erp", "crm", "bpm-engine").
    pub origin_system: Option<String>,
    /// System that will receive the action (e.g. "payment-service").
    pub target_system: Option<String>,
    /// Object identifiers the action applies to (case IDs, artifact IDs, etc.).
    pub object_ids: Vec<String>,
    /// Declared types of the objects (e.g. "case", "artifact", "receipt").
    pub object_types: Vec<String>,
    /// The action being requested (e.g. "approve_payment", "release_artifact").
    pub requested_action: String,
    /// Evidence artefacts the actor claims to possess (document IDs, receipt hashes, etc.).
    pub claimed_evidence: Vec<String>,
    /// Wall-clock time of the request in milliseconds since Unix epoch.
    pub timestamp_ms: Option<f64>,
    /// Route or path context (e.g. "fast-track", "standard", "emergency").
    pub route_context: Option<String>,
    /// Deployment profile hint (e.g. "browser", "edge", "fog").
    pub deployment_profile: Option<String>,
}

/// Verdict issued by a single membrane layer or by the composition function.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Verdict {
    /// Admit the motion without restriction.
    Allow,
    /// Admit but generate a custody receipt for audit.
    AllowWithReceipt,
    /// Admit with an advisory warning recorded in the receipt.
    Warn,
    /// Block until the actor supplies the listed missing evidence.
    RequireEvidence,
    /// Escalate to a human or higher-authority system for decision.
    Escalate,
    /// Isolate the motion for forensic review; do not admit or discard.
    Quarantine,
    /// Reject the motion.
    Deny,
    /// Halt the entire process line (jidoka stop); used for critical integrity failures.
    StopLine,
}

impl std::fmt::Display for Verdict {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Verdict::Allow => "allow",
            Verdict::AllowWithReceipt => "allow_with_receipt",
            Verdict::Warn => "warn",
            Verdict::RequireEvidence => "require_evidence",
            Verdict::Escalate => "escalate",
            Verdict::Quarantine => "quarantine",
            Verdict::Deny => "deny",
            Verdict::StopLine => "stop_line",
        };
        write!(f, "{s}")
    }
}

/// Verdict and metadata produced by a single membrane layer.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LayerVerdict {
    /// Layer identifier: "actor", "object", "route", "automl", "custody".
    pub layer: String,
    pub verdict: Verdict,
    /// Confidence in the verdict, in [0.0, 1.0].
    pub confidence: f64,
    /// Human-readable rationale.
    pub reason: String,
    /// Evidence artefacts that were found and used.
    pub evidence_used: Vec<String>,
    /// Evidence artefacts that were expected but absent.
    pub missing_evidence: Vec<String>,
}

/// The complete output of a membrane classification: one verdict per layer plus
/// the composed final verdict.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VerdictReceipt {
    /// Echo of the originating request ID.
    pub request_id: String,
    /// Composed final verdict (strictest across layers).
    pub final_verdict: Verdict,
    /// Name of the layer that determined the final verdict, or "none"/"composite".
    pub decisive_layer: String,
    /// Individual layer verdicts in evaluation order.
    pub layer_verdicts: Vec<LayerVerdict>,
    /// Union of all `missing_evidence` fields across layers.
    pub missing_evidence: Vec<String>,
    /// Model identifier for receipt provenance.
    pub model_version: String,
    /// Lightweight state snapshot identifier (FNV-1a over request_id + timestamp).
    pub state_snapshot: String,
    /// Wall-clock time at classification, in milliseconds since Unix epoch.
    pub timestamp_ms: f64,
    /// `true` if `final_verdict` admits the motion downstream.
    pub downstream_admitted: bool,
    /// Terse natural-language summary.
    pub explanation: String,
}

// ---------------------------------------------------------------------------
// Verdict composition
// ---------------------------------------------------------------------------

/// Compose a slice of layer verdicts into a single final verdict and the name
/// of the decisive layer.
///
/// Precedence (highest to lowest):
/// 1. `StopLine`    — any layer
/// 2. `Deny`        — first layer
/// 3. `RequireEvidence` — first layer
/// 4. `Quarantine`  — first layer
/// 5. `Escalate`    — first layer
/// 6. `Warn`        — composite
/// 7. `AllowWithReceipt` — composite
/// 8. `Allow`       — none (all passed)
pub fn compose_verdicts(layer_verdicts: &[LayerVerdict]) -> (Verdict, String) {
    // Rule 1: StopLine — highest priority, any occurrence
    for lv in layer_verdicts {
        if lv.verdict == Verdict::StopLine {
            return (Verdict::StopLine, lv.layer.clone());
        }
    }

    // Rule 2: Deny — first occurrence
    for lv in layer_verdicts {
        if lv.verdict == Verdict::Deny {
            return (Verdict::Deny, lv.layer.clone());
        }
    }

    // Rule 3: RequireEvidence — first occurrence
    for lv in layer_verdicts {
        if lv.verdict == Verdict::RequireEvidence {
            return (Verdict::RequireEvidence, lv.layer.clone());
        }
    }

    // Rule 4: Quarantine — first occurrence
    for lv in layer_verdicts {
        if lv.verdict == Verdict::Quarantine {
            return (Verdict::Quarantine, lv.layer.clone());
        }
    }

    // Rule 5: Escalate — first occurrence
    for lv in layer_verdicts {
        if lv.verdict == Verdict::Escalate {
            return (Verdict::Escalate, lv.layer.clone());
        }
    }

    // Rule 6: Warn — composite
    if layer_verdicts.iter().any(|lv| lv.verdict == Verdict::Warn) {
        return (Verdict::Warn, "composite".to_string());
    }

    // Rule 7: AllowWithReceipt — composite
    if layer_verdicts
        .iter()
        .any(|lv| lv.verdict == Verdict::AllowWithReceipt)
    {
        return (Verdict::AllowWithReceipt, "composite".to_string());
    }

    // Rule 8: All Allow
    (Verdict::Allow, "none".to_string())
}

// ---------------------------------------------------------------------------
// State snapshot hash (FNV-1a)
// ---------------------------------------------------------------------------

/// Produce a 16-character hex state snapshot token from the request ID and
/// timestamp. Uses FNV-1a (64-bit) — no external dependencies, WASM-safe.
fn snapshot_hash(request_id: &str, timestamp_ms: f64) -> String {
    let mut hash: u64 = 14695981039346656037;
    for b in request_id.bytes() {
        hash ^= b as u64;
        hash = hash.wrapping_mul(1099511628211);
    }
    let ts_bits = timestamp_ms.to_bits();
    hash ^= ts_bits;
    hash = hash.wrapping_mul(1099511628211);
    format!("{:016x}", hash)
}

// ---------------------------------------------------------------------------
// Layer evaluation helpers
// ---------------------------------------------------------------------------

/// Optional envelope handles for the six membrane layers.
///
/// Any `None` field causes that layer to fall back to the stateless heuristic
/// evaluator. Populate handles obtained from `build_actor_envelope`,
/// `build_route_envelope`, `build_automl_envelope`, and `build_time_envelope`.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
pub struct EnvelopeHandles {
    pub actor: Option<String>,
    pub object: Option<String>,
    pub route: Option<String>,
    pub automl: Option<String>,
    pub time: Option<String>,
}

/// Evaluate the actor layer.
/// Checks that the actor identity is non-empty. Actual behavioural scoring
/// is delegated to envelope agents — this layer only checks completeness.
fn evaluate_actor_layer(motion: &RequestMotion) -> LayerVerdict {
    if motion.actor.trim().is_empty() {
        LayerVerdict {
            layer: "actor".to_string(),
            verdict: Verdict::RequireEvidence,
            confidence: 1.0,
            reason: "Actor identity is absent — cannot evaluate behavioural history".to_string(),
            evidence_used: vec![],
            missing_evidence: vec!["actor_identity".to_string()],
        }
    } else {
        LayerVerdict {
            layer: "actor".to_string(),
            verdict: Verdict::Allow,
            confidence: 0.5,
            reason: format!(
                "Actor '{}' is present; deep scoring deferred to envelope agents",
                motion.actor
            ),
            evidence_used: vec!["actor_identity".to_string()],
            missing_evidence: vec![],
        }
    }
}

/// Evaluate the object layer.
/// Checks that at least one object ID is provided when an action is requested.
fn evaluate_object_layer(motion: &RequestMotion) -> LayerVerdict {
    if motion.object_ids.is_empty() {
        LayerVerdict {
            layer: "object".to_string(),
            verdict: Verdict::Warn,
            confidence: 0.8,
            reason: "No object IDs supplied — action scope is undefined".to_string(),
            evidence_used: vec![],
            missing_evidence: vec!["object_scope".to_string()],
        }
    } else {
        LayerVerdict {
            layer: "object".to_string(),
            verdict: Verdict::Allow,
            confidence: 0.5,
            reason: format!(
                "{} object(s) in scope; type checking deferred to object registry",
                motion.object_ids.len()
            ),
            evidence_used: motion.object_ids.clone(),
            missing_evidence: vec![],
        }
    }
}

/// Evaluate the route layer.
/// Currently a pass-through; route policy is enforced by the routing plane.
fn evaluate_route_layer(motion: &RequestMotion) -> LayerVerdict {
    let context = motion
        .route_context
        .as_deref()
        .unwrap_or("(unspecified)")
        .to_string();
    LayerVerdict {
        layer: "route".to_string(),
        verdict: Verdict::Allow,
        confidence: 0.5,
        reason: format!("Route context: {context}; deep route policy deferred to routing plane"),
        evidence_used: if motion.route_context.is_some() {
            vec!["route_context".to_string()]
        } else {
            vec![]
        },
        missing_evidence: vec![],
    }
}

/// Evaluate the automl layer.
/// Reserved for ML-scored risk assessment by the MiniML engine.
///
/// # CAUTION — layer was NOT actually evaluated
/// This function returns `Verdict::Allow` only because `Verdict::Deferred` does not
/// yet exist in the enum (adding it would require updating ~72 match arms). The
/// confidence is set to `0.1` (not `0.3`) to clearly signal that no real assessment
/// was performed. Callers MUST NOT treat this as a genuine Allow — the layer was
/// bypassed entirely.
fn evaluate_automl_layer(_motion: &RequestMotion) -> LayerVerdict {
    LayerVerdict {
        layer: "automl".to_string(),
        verdict: Verdict::Allow,
        confidence: 0.1,
        reason: "BYPASSED: AutoML model not yet loaded — this layer was not evaluated; \
                 do not interpret as a genuine allow decision"
            .to_string(),
        evidence_used: vec![],
        missing_evidence: vec![],
    }
}

/// High-stakes action keywords that require a non-empty evidence chain.
const HIGH_STAKES_KEYWORDS: &[&str] = &["approve", "release", "transfer"];

/// Evaluate the custody layer.
/// For high-stakes actions (approve / release / transfer), the actor must
/// supply at least one claimed evidence artefact. Absence triggers
/// `RequireEvidence`.
pub fn evaluate_custody_layer(motion: &RequestMotion) -> LayerVerdict {
    let action_lower = motion.requested_action.to_lowercase();
    let is_high_stakes = HIGH_STAKES_KEYWORDS
        .iter()
        .any(|kw| action_lower.contains(kw));

    let verdict = if is_high_stakes && motion.claimed_evidence.is_empty() {
        LayerVerdict {
            layer: "custody".to_string(),
            verdict: Verdict::RequireEvidence,
            confidence: 1.0,
            reason: format!(
                "Action '{}' requires a custody chain but no evidence artefacts were provided",
                motion.requested_action
            ),
            evidence_used: vec![],
            missing_evidence: vec!["approval_chain".to_string()],
        }
    } else {
        LayerVerdict {
            layer: "custody".to_string(),
            verdict: Verdict::Allow,
            confidence: if is_high_stakes { 0.9 } else { 0.5 },
            reason: if is_high_stakes {
                format!(
                    "Custody chain present ({} artefact(s)) for high-stakes action '{}'",
                    motion.claimed_evidence.len(),
                    motion.requested_action
                )
            } else {
                format!(
                    "Action '{}' is not high-stakes; custody check skipped",
                    motion.requested_action
                )
            },
            evidence_used: motion.claimed_evidence.clone(),
            missing_evidence: vec![],
        }
    };

    // OTEL: Emit custody layer evaluation span for high-stakes actions
    // GAP-2: Enhanced custody diagnostics with evidence analysis
    if is_high_stakes {
        let evidence_count = motion.claimed_evidence.len();
        let missing_count = verdict.missing_evidence.len();
        let decision_quality = if evidence_count == 0 && missing_count > 0 {
            "insufficient_evidence"
        } else if evidence_count > 0 {
            "sufficient_evidence"
        } else {
            "neutral"
        };

        tracing::info_span!(
            "autonomic.membrane_custody_evaluation",
            request_id = motion.request_id.as_str(),
            actor = motion.actor.as_str(),
            action = motion.requested_action.as_str(),
            is_high_stakes = is_high_stakes,
            evidence_provided = evidence_count as u32,
            evidence_missing = missing_count as u32,
            evidence_quality = decision_quality,
            verdict = verdict.verdict.to_string().as_str(),
            confidence = verdict.confidence,
            decision_rationale = verdict.reason.as_str(),
            service_name = "wpm",
            status = if matches!(verdict.verdict, Verdict::RequireEvidence) {
                "error"
            } else {
                "ok"
            },
        );
    }

    verdict
}

// ---------------------------------------------------------------------------
// Downstream admission predicate
// ---------------------------------------------------------------------------

fn is_downstream_admitted(verdict: &Verdict) -> bool {
    matches!(
        verdict,
        Verdict::Allow | Verdict::AllowWithReceipt | Verdict::Warn
    )
}

// ---------------------------------------------------------------------------
// Explanation rendering
// ---------------------------------------------------------------------------

fn render_explanation(receipt: &VerdictReceipt) -> String {
    let mut lines: Vec<String> = Vec::new();

    lines.push(format!(
        "Verdict: {}",
        receipt.final_verdict.to_string().to_uppercase()
    ));
    lines.push(format!("Decisive layer: {}", receipt.decisive_layer));
    lines.push(String::new());
    lines.push("Layer breakdown:".to_string());

    for lv in &receipt.layer_verdicts {
        let confidence_pct = (lv.confidence * 100.0).round() as u32;
        lines.push(format!(
            "  {:<10} → {:<20} (confidence: {:.2}) {}",
            lv.layer,
            lv.verdict.to_string(),
            lv.confidence,
            lv.reason
        ));
        if !lv.missing_evidence.is_empty() {
            lines.push(format!(
                "             missing: {}",
                lv.missing_evidence.join(", ")
            ));
        }
        let _ = confidence_pct; // used implicitly via confidence display
    }

    if !receipt.missing_evidence.is_empty() {
        lines.push(String::new());
        lines.push(format!(
            "Missing evidence: {}",
            receipt.missing_evidence.join(", ")
        ));
    }

    lines.push(String::new());
    lines.push(format!("Model: {}", receipt.model_version));

    lines.join("\n")
}

// ---------------------------------------------------------------------------
// Envelope-aware layer evaluation helpers
// ---------------------------------------------------------------------------

/// Evaluate the actor layer, using a trained `ActorEnvelope` when a handle is
/// supplied. Falls back to the stateless `evaluate_actor_layer` on any error.
fn evaluate_actor_layer_with_envelope(
    motion: &RequestMotion,
    handle: Option<&str>,
) -> LayerVerdict {
    let h = match handle {
        Some(h) => h,
        None => return evaluate_actor_layer(motion),
    };

    let state = get_or_init_state();
    let result = state.with_object(h, |obj| {
        let json_str = match obj {
            Some(StoredObject::JsonString(s)) => s,
            _ => {
                return Err(crate::error::wasm_err(
                    crate::error::codes::INVALID_HANDLE,
                    "not a json string",
                ))
            }
        };
        let envelope: crate::actor_envelope::ActorEnvelope = serde_json::from_str(json_str)
            .map_err(|e| {
                // GAP-1: Emit error span for envelope deserialization failure
                tracing::warn!(
                    envelope_type = "actor",
                    error_type = "deserialization_failed",
                    error_message = e.to_string(),
                    handle = h,
                    service_name = "wpm",
                    status = "error",
                    "Actor envelope deserialization failed; falling back to stateless layer"
                );
                crate::error::wasm_err(crate::error::codes::INTERNAL_ERROR, e.to_string())
            })?;
        Ok(crate::actor_envelope::score_actor_motion_from_envelope(
            &envelope, motion,
        ))
    });

    match result {
        Ok(verdict) => verdict,
        Err(e) => {
            tracing::warn!(
                envelope_type = "actor",
                error_code = format!("{:?}", &e),
                service_name = "wpm",
                status = "error",
                "Actor envelope evaluation failed; falling back to stateless evaluation"
            );
            evaluate_actor_layer(motion)
        }
    }
}

/// Evaluate the route layer, using a trained `RouteEnvelope` when a handle is
/// supplied. Falls back to the stateless `evaluate_route_layer` on any error.
fn evaluate_route_layer_with_envelope(
    motion: &RequestMotion,
    handle: Option<&str>,
) -> LayerVerdict {
    let h = match handle {
        Some(h) => h,
        None => return evaluate_route_layer(motion),
    };

    let state = get_or_init_state();
    let result = state.with_object(h, |obj| {
        let json_str = match obj {
            Some(StoredObject::JsonString(s)) => s,
            _ => {
                return Err(crate::error::wasm_err(
                    crate::error::codes::INVALID_HANDLE,
                    "not a json string",
                ))
            }
        };
        let envelope: crate::route_envelope::RouteEnvelope = serde_json::from_str(json_str)
            .map_err(|e| {
                // GAP-1: Emit error span for envelope deserialization failure
                tracing::warn!(
                    envelope_type = "route",
                    error_type = "deserialization_failed",
                    error_message = e.to_string(),
                    handle = h,
                    service_name = "wpm",
                    status = "error",
                    "Route envelope deserialization failed; falling back to stateless layer"
                );
                crate::error::wasm_err(crate::error::codes::INTERNAL_ERROR, e.to_string())
            })?;
        Ok(crate::route_envelope::score_route_motion_from_envelope(
            &envelope, motion,
        ))
    });

    match result {
        Ok(verdict) => verdict,
        Err(e) => {
            tracing::warn!(
                envelope_type = "route",
                error_code = format!("{:?}", &e),
                service_name = "wpm",
                status = "error",
                "Route envelope evaluation failed; falling back to stateless evaluation"
            );
            evaluate_route_layer(motion)
        }
    }
}

/// Evaluate the automl layer, using a trained `AutomlEnvelopeModel` when a
/// handle is supplied. Falls back to the stateless `evaluate_automl_layer` on
/// any error.
fn evaluate_automl_layer_with_envelope(
    motion: &RequestMotion,
    handle: Option<&str>,
) -> LayerVerdict {
    let h = match handle {
        Some(h) => h,
        None => return evaluate_automl_layer(motion),
    };

    let state = get_or_init_state();
    let result = state.with_object(h, |obj| {
        let json_str = match obj {
            Some(StoredObject::JsonString(s)) => s,
            _ => {
                return Err(crate::error::wasm_err(
                    crate::error::codes::INVALID_HANDLE,
                    "not a json string",
                ))
            }
        };
        let model: crate::automl_envelope::AutomlEnvelopeModel = serde_json::from_str(json_str)
            .map_err(|e| {
                // GAP-1: Emit error span for envelope deserialization failure
                tracing::warn!(
                    envelope_type = "automl",
                    error_type = "deserialization_failed",
                    error_message = e.to_string(),
                    handle = h,
                    service_name = "wpm",
                    status = "error",
                    "AutoML envelope deserialization failed; falling back to stateless layer"
                );
                crate::error::wasm_err(crate::error::codes::INTERNAL_ERROR, e.to_string())
            })?;
        Ok(crate::automl_envelope::score_motion_automl_from_envelope(
            &model, motion,
        ))
    });

    match result {
        Ok(verdict) => verdict,
        Err(e) => {
            tracing::warn!(
                envelope_type = "automl",
                error_code = format!("{:?}", &e),
                service_name = "wpm",
                status = "error",
                "AutoML envelope evaluation failed; falling back to stateless evaluation"
            );
            evaluate_automl_layer(motion)
        }
    }
}

/// Evaluate the time layer, using a trained `TimeEnvelope` when a handle is
/// supplied. Returns a neutral Allow verdict when no handle is configured.
fn evaluate_time_layer_with_envelope(motion: &RequestMotion, handle: Option<&str>) -> LayerVerdict {
    let h = match handle {
        Some(h) => h,
        None => {
            return LayerVerdict {
                layer: "time".to_string(),
                verdict: Verdict::Allow,
                confidence: 0.5,
                reason: "No time envelope configured".to_string(),
                evidence_used: vec![],
                missing_evidence: vec![],
            };
        }
    };

    let state = get_or_init_state();
    let result = state.with_object(h, |obj| {
        let json_str = match obj {
            Some(StoredObject::JsonString(s)) => s,
            _ => {
                return Err(crate::error::wasm_err(
                    crate::error::codes::INVALID_HANDLE,
                    "not a json string",
                ))
            }
        };
        let envelope: crate::time_envelope::TimeEnvelope =
            serde_json::from_str(json_str).map_err(|e| {
                crate::error::wasm_err(crate::error::codes::INTERNAL_ERROR, e.to_string())
            })?;
        Ok(crate::time_envelope::score_time_motion_from_envelope(
            &envelope,
            motion.timestamp_ms,
        ))
    });

    match result {
        Ok(verdict) => verdict,
        Err(_) => LayerVerdict {
            layer: "time".to_string(),
            verdict: Verdict::Allow,
            confidence: 0.5,
            reason: "Time envelope lookup failed; check skipped".to_string(),
            evidence_used: vec![],
            missing_evidence: vec![],
        },
    }
}

// ---------------------------------------------------------------------------
// Internal (crate-visible) classification entry point
// ---------------------------------------------------------------------------

/// Classify a `RequestMotion` through all five membrane layers and return a
/// `VerdictReceipt`. This is the non-WASM version used by `benchmark_runner`
/// and any other crate-internal caller that already holds a `RequestMotion`
/// struct reference.
pub fn classify_motion_internal(motion: &RequestMotion) -> VerdictReceipt {
    let t0 = Instant::now();
    let timestamp_ms = motion.timestamp_ms.unwrap_or(0.0);

    let layer_verdicts = vec![
        evaluate_actor_layer(motion),
        evaluate_object_layer(motion),
        evaluate_route_layer(motion),
        evaluate_automl_layer(motion),
        evaluate_custody_layer(motion),
    ];

    let (final_verdict, decisive_layer) = compose_verdicts(&layer_verdicts);

    let missing_evidence: Vec<String> = layer_verdicts
        .iter()
        .flat_map(|lv| lv.missing_evidence.iter().cloned())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    let downstream_admitted = is_downstream_admitted(&final_verdict);
    let state_snapshot = snapshot_hash(&motion.request_id, timestamp_ms);

    let mut receipt = VerdictReceipt {
        request_id: motion.request_id.clone(),
        final_verdict: final_verdict.clone(),
        decisive_layer: decisive_layer.clone(),
        layer_verdicts,
        missing_evidence,
        model_version: "automembrane-v1".to_string(),
        state_snapshot,
        timestamp_ms,
        downstream_admitted,
        explanation: String::new(),
    };

    receipt.explanation = render_explanation(&receipt);

    // OTEL: Emit membrane classification span
    let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
    tracing::info_span!(
        "autonomic.membrane_classify_motion",
        request_id = motion.request_id.as_str(),
        actor = motion.actor.as_str(),
        action = motion.requested_action.as_str(),
        final_verdict = final_verdict.to_string().as_str(),
        decisive_layer = decisive_layer.as_str(),
        confidence = receipt
            .layer_verdicts
            .iter()
            .map(|lv| lv.confidence)
            .sum::<f64>()
            / receipt.layer_verdicts.len() as f64,
        layer_count = receipt.layer_verdicts.len() as u32,
        downstream_admitted = downstream_admitted,
        has_missing_evidence = !receipt.missing_evidence.is_empty(),
        duration_ms = elapsed_ms,
        service_name = "wpm",
        status = if matches!(
            final_verdict,
            Verdict::Allow | Verdict::AllowWithReceipt | Verdict::Warn
        ) {
            "ok"
        } else {
            "error"
        },
    );

    receipt
}

/// Classify a `RequestMotion` through all six membrane layers, using trained
/// envelope handles where provided. Falls back to stateless heuristics for
/// any layer whose handle is `None`.
///
/// The six layers in evaluation order:
/// 1. actor — identity check / actor envelope
/// 2. object — object scope completeness (stateless)
/// 3. route — route variant check / route envelope
/// 4. automl — ML risk score / automl envelope
/// 5. custody — evidence chain for high-stakes actions (stateless)
/// 6. time — temporal freshness / time envelope
pub fn classify_motion_internal_with_envelopes(
    motion: &RequestMotion,
    envelopes: &EnvelopeHandles,
) -> VerdictReceipt {
    let t0 = Instant::now();
    let timestamp_ms = motion.timestamp_ms.unwrap_or(0.0);

    let layer_verdicts = vec![
        evaluate_actor_layer_with_envelope(motion, envelopes.actor.as_deref()),
        evaluate_object_layer(motion),
        evaluate_route_layer_with_envelope(motion, envelopes.route.as_deref()),
        evaluate_automl_layer_with_envelope(motion, envelopes.automl.as_deref()),
        evaluate_custody_layer(motion),
        evaluate_time_layer_with_envelope(motion, envelopes.time.as_deref()),
    ];

    let (final_verdict, decisive_layer) = compose_verdicts(&layer_verdicts);

    let missing_evidence: Vec<String> = layer_verdicts
        .iter()
        .flat_map(|lv| lv.missing_evidence.iter().cloned())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    let downstream_admitted = is_downstream_admitted(&final_verdict);
    let state_snapshot = snapshot_hash(&motion.request_id, timestamp_ms);

    // Count envelope layers that were actually used
    let envelopes_used = [
        envelopes.actor.is_some(),
        envelopes.route.is_some(),
        envelopes.automl.is_some(),
        envelopes.time.is_some(),
    ]
    .iter()
    .filter(|&&x| x)
    .count();

    let mut receipt = VerdictReceipt {
        request_id: motion.request_id.clone(),
        final_verdict: final_verdict.clone(),
        decisive_layer: decisive_layer.clone(),
        layer_verdicts,
        missing_evidence,
        model_version: "automembrane-v2-envelopes".to_string(),
        state_snapshot,
        timestamp_ms,
        downstream_admitted,
        explanation: String::new(),
    };

    receipt.explanation = render_explanation(&receipt);

    // OTEL: Emit envelope-based membrane classification span
    let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
    tracing::info_span!(
        "autonomic.membrane_classify_with_envelopes",
        request_id = motion.request_id.as_str(),
        actor = motion.actor.as_str(),
        action = motion.requested_action.as_str(),
        final_verdict = final_verdict.to_string().as_str(),
        decisive_layer = decisive_layer.as_str(),
        confidence = receipt
            .layer_verdicts
            .iter()
            .map(|lv| lv.confidence)
            .sum::<f64>()
            / receipt.layer_verdicts.len() as f64,
        layer_count = receipt.layer_verdicts.len() as u32,
        envelopes_used = envelopes_used as u32,
        downstream_admitted = downstream_admitted,
        has_missing_evidence = !receipt.missing_evidence.is_empty(),
        duration_ms = elapsed_ms,
        service_name = "wpm",
        status = if matches!(
            final_verdict,
            Verdict::Allow | Verdict::AllowWithReceipt | Verdict::Warn
        ) {
            "ok"
        } else {
            "error"
        },
    );

    receipt
}

// ---------------------------------------------------------------------------
// WASM exports
// ---------------------------------------------------------------------------

/// Classify a `RequestMotion` JSON string through all five membrane layers and
/// return a `VerdictReceipt` JSON string.
///
/// ## Arguments
/// - `motion_json` — JSON serialisation of a `RequestMotion`.
///
/// ## Returns
/// JSON string (`VerdictReceipt`). JS callers must call `JSON.parse()`.
///
/// ## Errors
/// Returns a structured error JSON if `motion_json` is not valid JSON or does
/// not conform to the `RequestMotion` schema.
#[wasm_bindgen]
pub fn classify_motion(motion_json: &str) -> Result<JsValue, JsValue> {
    let t0 = Instant::now();
    let motion: RequestMotion = serde_json::from_str(motion_json).map_err(|e| {
        let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
        tracing::warn!(
            event = "wasm_motion_parse_error",
            error = format!("classify_motion: invalid RequestMotion JSON: {e}").as_str(),
            duration_ms = elapsed_ms,
            service_name = "wpm",
            status = "error",
            "WASM motion JSON parsing failed"
        );
        wasm_err(
            codes::INVALID_JSON,
            format!("classify_motion: invalid RequestMotion JSON: {e}"),
        )
    })?;

    // Resolve timestamp: prefer value embedded in motion, fall back to wall clock on WASM.
    let ts_resolved = motion.timestamp_ms.unwrap_or_else(|| {
        #[cfg(target_arch = "wasm32")]
        {
            js_sys::Date::now()
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            0.0
        }
    });

    // Inject the resolved timestamp so classify_motion_internal sees it.
    let mut motion_with_ts = motion.clone();
    motion_with_ts.timestamp_ms = Some(ts_resolved);

    let receipt = classify_motion_internal(&motion_with_ts);
    let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;

    // OTEL: Emit WASM entry point span
    tracing::info_span!(
        "autonomic.wasm_classify_motion",
        request_id = receipt.request_id.as_str(),
        actor = motion_with_ts.actor.as_str(),
        final_verdict = receipt.final_verdict.to_string().as_str(),
        downstream_admitted = receipt.downstream_admitted,
        duration_ms = elapsed_ms,
        service_name = "wpm",
        status = if receipt.downstream_admitted {
            "ok"
        } else {
            "error"
        },
    );

    to_js_str(&receipt)
}

/// Render a human-readable explanation of a `VerdictReceipt`.
///
/// ## Arguments
/// - `verdict_json` — JSON serialisation of a `VerdictReceipt` (as returned by
///   `classify_motion`).
///
/// ## Returns
/// A plain-text string. JS callers receive a JSON-encoded string (via
/// `to_js_str`) and should call `JSON.parse()` then use the result directly.
#[wasm_bindgen]
pub fn get_verdict_explanation(verdict_json: &str) -> Result<JsValue, JsValue> {
    let receipt: VerdictReceipt = serde_json::from_str(verdict_json).map_err(|e| {
        wasm_err(
            codes::INVALID_JSON,
            format!("get_verdict_explanation: invalid VerdictReceipt JSON: {e}"),
        )
    })?;

    let explanation = render_explanation(&receipt);
    // Return as a JSON-encoded string so JS can JSON.parse() → plain string
    to_js_str(&explanation)
}

/// Build a `RequestMotion` from the last event of a stored event log trace.
///
/// This function bridges the discovery/conformance plane and the membrane plane:
/// given a log handle and a trace index, it constructs a motion that represents
/// the most recent activity in the trace, extracting actor, action, timestamp,
/// and object scope from event attributes.
///
/// ## Arguments
/// - `log_handle`   — Handle returned by `load_eventlog_from_xes` / `load_eventlog_from_json`.
/// - `trace_index`  — Zero-based index into the log's trace list.
/// - `activity_key` — Attribute key for the activity name (XES: `concept:name`).
/// - `actor_key`    — Attribute key for the actor/resource (XES: `org:resource`).
///
/// ## Returns
/// JSON string (`RequestMotion`). JS callers must call `JSON.parse()`.
#[wasm_bindgen]
pub fn build_motion_from_log_trace(
    log_handle: &str,
    trace_index: usize,
    activity_key: &str,
    actor_key: &str,
) -> Result<JsValue, JsValue> {
    let t0 = Instant::now();
    get_or_init_state().with_object(log_handle, |obj| {
        let log = match obj {
            Some(StoredObject::EventLog(log)) => log,
            Some(_) => {
                let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
                tracing::warn!(
                    event = "membrane_motion_build_invalid_handle",
                    log_handle = log_handle,
                    trace_index = trace_index as u32,
                    error = "Object is not an EventLog",
                    duration_ms = elapsed_ms,
                    service_name = "wpm",
                    status = "error",
                );
                return Err(wasm_err(
                    codes::INVALID_INPUT,
                    format!("Object at '{log_handle}' is not an EventLog"),
                ));
            }
            None => {
                let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
                tracing::warn!(
                    event = "membrane_motion_build_missing_log",
                    log_handle = log_handle,
                    duration_ms = elapsed_ms,
                    service_name = "wpm",
                    status = "error",
                );
                return Err(wasm_err(
                    codes::INVALID_HANDLE,
                    format!("No object at handle '{log_handle}'"),
                ));
            }
        };

        let trace = log.traces.get(trace_index).ok_or_else(|| {
            let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
            tracing::warn!(
                event = "membrane_motion_build_trace_index_oor",
                log_handle = log_handle,
                trace_index = trace_index as u32,
                total_traces = log.traces.len() as u32,
                duration_ms = elapsed_ms,
                service_name = "wpm",
                status = "error",
            );
            wasm_err(
                codes::INVALID_INPUT,
                format!(
                    "Trace index {trace_index} is out of range (log has {} traces)",
                    log.traces.len()
                ),
            )
        })?;

        // Use the last event as the "current motion" in the running case
        let last_event = trace.events.last().ok_or_else(|| {
            let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
            tracing::warn!(
                event = "membrane_motion_build_empty_trace",
                log_handle = log_handle,
                trace_index = trace_index as u32,
                duration_ms = elapsed_ms,
                service_name = "wpm",
                status = "error",
            );
            wasm_err(
                codes::INVALID_INPUT,
                format!("Trace at index {trace_index} contains no events"),
            )
        })?;

        // Extract actor
        let actor = last_event
            .attributes
            .get(actor_key)
            .and_then(|av| av.as_string())
            .unwrap_or("")
            .to_string();

        // Extract requested action (activity name)
        let requested_action = last_event
            .attributes
            .get(activity_key)
            .and_then(|av| av.as_string())
            .unwrap_or("")
            .to_string();

        // Extract timestamp
        let timestamp_ms = last_event
            .attributes
            .get("time:timestamp")
            .and_then(|av| match av {
                AttributeValue::Date(s) => crate::models::parse_timestamp_ms(s).map(|ms| ms as f64),
                AttributeValue::Float(f) => Some(*f),
                AttributeValue::Int(i) => Some(*i as f64),
                _ => None,
            });

        // Extract object IDs from case-level trace attributes that look like IDs.
        // Heuristic: string attributes whose key contains "id", "case", or "object".
        let object_ids: Vec<String> = trace
            .attributes
            .iter()
            .filter(|(k, v)| {
                let k_lower = k.to_lowercase();
                (k_lower.contains("id") || k_lower.contains("case") || k_lower.contains("object"))
                    && matches!(v, AttributeValue::String(_))
            })
            .filter_map(|(_, v)| v.as_string().map(str::to_string))
            .collect();

        let request_id = format!("{log_handle}-{trace_index}");

        let motion = RequestMotion {
            request_id: request_id.clone(),
            actor: actor.clone(),
            role: None,
            origin_system: None,
            target_system: None,
            object_ids: object_ids.clone(),
            object_types: vec![],
            requested_action: requested_action.clone(),
            claimed_evidence: vec![],
            timestamp_ms,
            route_context: None,
            deployment_profile: None,
        };

        let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;

        // OTEL: Emit motion building span
        tracing::info_span!(
            "autonomic.membrane_build_motion_from_trace",
            log_handle = log_handle,
            trace_index = trace_index as u32,
            request_id = request_id.as_str(),
            actor = actor.as_str(),
            action = requested_action.as_str(),
            object_count = object_ids.len() as u32,
            duration_ms = elapsed_ms,
            service_name = "wpm",
            status = "ok",
        );

        to_js_str(&motion)
    })
}

/// Classify a `RequestMotion` through all six membrane layers using optional
/// trained envelope handles.
///
/// ## Arguments
/// - `motion_json`          — JSON serialisation of a `RequestMotion`.
/// - `envelope_handles_json`— JSON serialisation of an `EnvelopeHandles`; any
///                            `null` field causes that layer to use the
///                            stateless fallback evaluator.
///
/// ## Returns
/// JSON string (`VerdictReceipt`). JS callers must call `JSON.parse()`.
///
/// ## Errors
/// Returns a structured error JSON if either argument is invalid JSON.
#[wasm_bindgen]
pub fn classify_motion_with_envelopes(
    motion_json: &str,
    envelope_handles_json: &str,
) -> Result<JsValue, JsValue> {
    let t0 = Instant::now();
    let motion: RequestMotion = serde_json::from_str(motion_json).map_err(|e| {
        let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
        tracing::warn!(
            event = "wasm_motion_parse_error_with_envelopes",
            error =
                format!("classify_motion_with_envelopes: invalid RequestMotion JSON: {e}").as_str(),
            duration_ms = elapsed_ms,
            service_name = "wpm",
            status = "error",
        );
        wasm_err(
            codes::INVALID_JSON,
            format!("classify_motion_with_envelopes: invalid RequestMotion JSON: {e}"),
        )
    })?;

    let envelopes: EnvelopeHandles = serde_json::from_str(envelope_handles_json).map_err(|e| {
        let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
        tracing::warn!(
            event = "wasm_envelope_parse_error",
            error = format!("classify_motion_with_envelopes: invalid EnvelopeHandles JSON: {e}")
                .as_str(),
            duration_ms = elapsed_ms,
            service_name = "wpm",
            status = "error",
        );
        wasm_err(
            codes::INVALID_JSON,
            format!("classify_motion_with_envelopes: invalid EnvelopeHandles JSON: {e}"),
        )
    })?;

    // Resolve timestamp: prefer value embedded in motion, fall back to wall clock on WASM.
    let ts_resolved = motion.timestamp_ms.unwrap_or_else(|| {
        #[cfg(target_arch = "wasm32")]
        {
            js_sys::Date::now()
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            0.0
        }
    });

    let mut motion_with_ts = motion.clone();
    motion_with_ts.timestamp_ms = Some(ts_resolved);

    let receipt = classify_motion_internal_with_envelopes(&motion_with_ts, &envelopes);
    let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;

    // OTEL: Emit WASM entry point span with envelopes
    tracing::info_span!(
        "autonomic.wasm_classify_with_envelopes",
        request_id = receipt.request_id.as_str(),
        actor = motion_with_ts.actor.as_str(),
        final_verdict = receipt.final_verdict.to_string().as_str(),
        downstream_admitted = receipt.downstream_admitted,
        layer_count = receipt.layer_verdicts.len() as u32,
        duration_ms = elapsed_ms,
        service_name = "wpm",
        status = if receipt.downstream_admitted {
            "ok"
        } else {
            "error"
        },
    );

    to_js_str(&receipt)
}

// ---------------------------------------------------------------------------
// Tests (native target only — WASM boundary functions need Node.js)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_motion(
        actor: &str,
        action: &str,
        evidence: Vec<&str>,
        objects: Vec<&str>,
    ) -> RequestMotion {
        RequestMotion {
            request_id: "test-req-001".to_string(),
            actor: actor.to_string(),
            role: None,
            origin_system: None,
            target_system: None,
            object_ids: objects.into_iter().map(str::to_string).collect(),
            object_types: vec![],
            requested_action: action.to_string(),
            claimed_evidence: evidence.into_iter().map(str::to_string).collect(),
            timestamp_ms: Some(1_700_000_000_000.0),
            route_context: None,
            deployment_profile: None,
        }
    }

    // -----------------------------------------------------------------------
    // Verdict composition — Rank 1 (mathematical) oracle tests
    // These derive from the stated composition rules, not from the implementation.
    // -----------------------------------------------------------------------

    #[test]
    fn compose_all_allow_returns_allow() {
        let layers = vec![
            LayerVerdict {
                layer: "actor".to_string(),
                verdict: Verdict::Allow,
                confidence: 0.9,
                reason: String::new(),
                evidence_used: vec![],
                missing_evidence: vec![],
            },
            LayerVerdict {
                layer: "object".to_string(),
                verdict: Verdict::Allow,
                confidence: 0.8,
                reason: String::new(),
                evidence_used: vec![],
                missing_evidence: vec![],
            },
        ];
        let (v, decisive) = compose_verdicts(&layers);
        assert_eq!(v, Verdict::Allow);
        assert_eq!(decisive, "none");
    }

    #[test]
    fn compose_stopline_beats_deny() {
        let layers = vec![
            LayerVerdict {
                layer: "actor".to_string(),
                verdict: Verdict::Deny,
                confidence: 1.0,
                reason: String::new(),
                evidence_used: vec![],
                missing_evidence: vec![],
            },
            LayerVerdict {
                layer: "custody".to_string(),
                verdict: Verdict::StopLine,
                confidence: 1.0,
                reason: String::new(),
                evidence_used: vec![],
                missing_evidence: vec![],
            },
        ];
        let (v, decisive) = compose_verdicts(&layers);
        assert_eq!(v, Verdict::StopLine);
        assert_eq!(decisive, "custody");
    }

    #[test]
    fn compose_deny_beats_require_evidence() {
        let layers = vec![
            LayerVerdict {
                layer: "route".to_string(),
                verdict: Verdict::RequireEvidence,
                confidence: 1.0,
                reason: String::new(),
                evidence_used: vec![],
                missing_evidence: vec!["doc_a".to_string()],
            },
            LayerVerdict {
                layer: "actor".to_string(),
                verdict: Verdict::Deny,
                confidence: 1.0,
                reason: String::new(),
                evidence_used: vec![],
                missing_evidence: vec![],
            },
        ];
        let (v, decisive) = compose_verdicts(&layers);
        assert_eq!(v, Verdict::Deny);
        assert_eq!(decisive, "actor");
    }

    #[test]
    fn compose_warn_is_composite() {
        let layers = vec![
            LayerVerdict {
                layer: "actor".to_string(),
                verdict: Verdict::Allow,
                confidence: 0.9,
                reason: String::new(),
                evidence_used: vec![],
                missing_evidence: vec![],
            },
            LayerVerdict {
                layer: "object".to_string(),
                verdict: Verdict::Warn,
                confidence: 0.6,
                reason: String::new(),
                evidence_used: vec![],
                missing_evidence: vec![],
            },
        ];
        let (v, decisive) = compose_verdicts(&layers);
        assert_eq!(v, Verdict::Warn);
        assert_eq!(decisive, "composite");
    }

    #[test]
    fn compose_allow_with_receipt_is_composite() {
        let layers = vec![
            LayerVerdict {
                layer: "actor".to_string(),
                verdict: Verdict::Allow,
                confidence: 0.9,
                reason: String::new(),
                evidence_used: vec![],
                missing_evidence: vec![],
            },
            LayerVerdict {
                layer: "custody".to_string(),
                verdict: Verdict::AllowWithReceipt,
                confidence: 0.8,
                reason: String::new(),
                evidence_used: vec![],
                missing_evidence: vec![],
            },
        ];
        let (v, decisive) = compose_verdicts(&layers);
        assert_eq!(v, Verdict::AllowWithReceipt);
        assert_eq!(decisive, "composite");
    }

    // -----------------------------------------------------------------------
    // Layer evaluation — domain contract (Rank 2) tests
    // -----------------------------------------------------------------------

    #[test]
    fn empty_actor_requires_evidence() {
        let motion = make_motion("", "view_case", vec![], vec!["case-1"]);
        let lv = evaluate_actor_layer(&motion);
        assert_eq!(lv.verdict, Verdict::RequireEvidence);
        assert!(lv.missing_evidence.contains(&"actor_identity".to_string()));
        assert_eq!(lv.confidence, 1.0);
    }

    #[test]
    fn present_actor_allows_with_low_confidence() {
        let motion = make_motion("user-42", "view_case", vec![], vec!["case-1"]);
        let lv = evaluate_actor_layer(&motion);
        assert_eq!(lv.verdict, Verdict::Allow);
        assert_eq!(lv.confidence, 0.5);
    }

    #[test]
    fn empty_objects_warns() {
        let motion = make_motion("user-1", "approve_payment", vec!["doc-1"], vec![]);
        let lv = evaluate_object_layer(&motion);
        assert_eq!(lv.verdict, Verdict::Warn);
    }

    #[test]
    fn approve_without_evidence_requires_custody_chain() {
        let motion = make_motion("user-1", "approve_payment", vec![], vec!["case-99"]);
        let lv = evaluate_custody_layer(&motion);
        assert_eq!(lv.verdict, Verdict::RequireEvidence);
        assert!(lv.missing_evidence.contains(&"approval_chain".to_string()));
    }

    #[test]
    fn release_without_evidence_requires_custody_chain() {
        let motion = make_motion("user-1", "release_artifact", vec![], vec!["art-7"]);
        let lv = evaluate_custody_layer(&motion);
        assert_eq!(lv.verdict, Verdict::RequireEvidence);
    }

    #[test]
    fn transfer_with_evidence_passes_custody() {
        let motion = make_motion(
            "user-1",
            "transfer_funds",
            vec!["receipt-abc123"],
            vec!["account-1"],
        );
        let lv = evaluate_custody_layer(&motion);
        assert_eq!(lv.verdict, Verdict::Allow);
        assert!(lv.confidence > 0.5);
    }

    #[test]
    fn non_high_stakes_action_always_passes_custody() {
        let motion = make_motion("user-1", "view_report", vec![], vec!["report-9"]);
        let lv = evaluate_custody_layer(&motion);
        assert_eq!(lv.verdict, Verdict::Allow);
    }

    // -----------------------------------------------------------------------
    // Snapshot hash — determinism (Rank 1) test
    // -----------------------------------------------------------------------

    #[test]
    fn snapshot_hash_is_deterministic() {
        let h1 = snapshot_hash("req-001", 1_700_000_000_000.0);
        let h2 = snapshot_hash("req-001", 1_700_000_000_000.0);
        assert_eq!(h1, h2);
        assert_eq!(h1.len(), 16);
    }

    #[test]
    fn snapshot_hash_differs_for_different_inputs() {
        let h1 = snapshot_hash("req-001", 1_700_000_000_000.0);
        let h2 = snapshot_hash("req-002", 1_700_000_000_000.0);
        assert_ne!(h1, h2);
    }

    // -----------------------------------------------------------------------
    // Downstream admission predicate (Rank 1)
    // -----------------------------------------------------------------------

    #[test]
    fn allow_is_admitted() {
        assert!(is_downstream_admitted(&Verdict::Allow));
    }

    #[test]
    fn allow_with_receipt_is_admitted() {
        assert!(is_downstream_admitted(&Verdict::AllowWithReceipt));
    }

    #[test]
    fn warn_is_admitted() {
        assert!(is_downstream_admitted(&Verdict::Warn));
    }

    #[test]
    fn deny_is_not_admitted() {
        assert!(!is_downstream_admitted(&Verdict::Deny));
    }

    #[test]
    fn stop_line_is_not_admitted() {
        assert!(!is_downstream_admitted(&Verdict::StopLine));
    }

    #[test]
    fn require_evidence_is_not_admitted() {
        assert!(!is_downstream_admitted(&Verdict::RequireEvidence));
    }

    // -----------------------------------------------------------------------
    // Full pipeline — JSON round-trip (native serde, no WASM boundary)
    // -----------------------------------------------------------------------

    #[test]
    fn classify_motion_full_pipeline_approve_no_evidence() {
        let motion = make_motion("alice", "approve_payment", vec![], vec!["case-7"]);
        let motion_json = serde_json::to_string(&motion).unwrap();

        // Replicate classify_motion logic without WASM boundary
        let parsed: RequestMotion = serde_json::from_str(&motion_json).unwrap();
        let layers = vec![
            evaluate_actor_layer(&parsed),
            evaluate_object_layer(&parsed),
            evaluate_route_layer(&parsed),
            evaluate_automl_layer(&parsed),
            evaluate_custody_layer(&parsed),
        ];
        let (final_verdict, decisive_layer) = compose_verdicts(&layers);

        // Custody layer triggers RequireEvidence; that beats Warn from no-object
        assert_eq!(final_verdict, Verdict::RequireEvidence);
        assert_eq!(decisive_layer, "custody");
        assert!(!is_downstream_admitted(&final_verdict));
    }

    #[test]
    fn classify_motion_full_pipeline_view_with_objects() {
        let motion = make_motion("bob", "view_dashboard", vec![], vec!["case-1", "case-2"]);
        let layers = vec![
            evaluate_actor_layer(&motion),
            evaluate_object_layer(&motion),
            evaluate_route_layer(&motion),
            evaluate_automl_layer(&motion),
            evaluate_custody_layer(&motion),
        ];
        let (final_verdict, _) = compose_verdicts(&layers);
        assert_eq!(final_verdict, Verdict::Allow);
        assert!(is_downstream_admitted(&final_verdict));
    }

    #[test]
    fn verdict_receipt_serializes_and_deserializes() {
        let motion = make_motion(
            "carol",
            "transfer_funds",
            vec!["receipt-xyz"],
            vec!["acc-1"],
        );
        let layers = vec![
            evaluate_actor_layer(&motion),
            evaluate_object_layer(&motion),
            evaluate_custody_layer(&motion),
        ];
        let (final_verdict, decisive_layer) = compose_verdicts(&layers);
        let receipt = VerdictReceipt {
            request_id: motion.request_id.clone(),
            final_verdict,
            decisive_layer,
            layer_verdicts: layers,
            missing_evidence: vec![],
            model_version: "automembrane-v1".to_string(),
            state_snapshot: snapshot_hash(&motion.request_id, 0.0),
            timestamp_ms: 0.0,
            downstream_admitted: true,
            explanation: "test".to_string(),
        };

        let json = serde_json::to_string(&receipt).unwrap();
        let restored: VerdictReceipt = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.request_id, "test-req-001");
        assert_eq!(restored.model_version, "automembrane-v1");
    }

    #[test]
    fn verdict_serde_roundtrip_all_variants() {
        let variants = vec![
            Verdict::Allow,
            Verdict::AllowWithReceipt,
            Verdict::Warn,
            Verdict::RequireEvidence,
            Verdict::Escalate,
            Verdict::Quarantine,
            Verdict::Deny,
            Verdict::StopLine,
        ];
        for v in variants {
            let json = serde_json::to_string(&v).unwrap();
            let restored: Verdict = serde_json::from_str(&json).unwrap();
            assert_eq!(v, restored, "round-trip failed for {:?}", v);
        }
    }
}
