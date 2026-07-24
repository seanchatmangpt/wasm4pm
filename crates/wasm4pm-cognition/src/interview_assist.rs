//! InterviewAssist consumer protocol over the receipted cognition-session kernel.
//!
//! This module owns only boundary validation and deterministic projection. The
//! cognition transition, replay, resource bounds, and receipt construction stay
//! inside [`crate::session::run_session_turn`].

use crate::session::{
    run_session_turn, Confirmation, DomainPack, Observation, SessionError, SessionProjection,
    SessionReceipt, SessionState, SessionTurnInput,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeSet;

/// Current InterviewAssist wire-protocol version.
pub const INTERVIEW_ASSIST_PROTOCOL_VERSION: u64 = 1;

/// Maximum accepted InterviewAssist request size.
pub const INTERVIEW_ASSIST_MAX_INPUT_BYTES: usize = 64 * 1024;

/// Consumer request for one InterviewAssist cognition turn.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct InterviewAssistRequest {
    /// Wire-protocol version.
    pub protocol_version: u64,
    /// Caller-assigned idempotency and correlation identifier.
    pub request_id: String,
    /// Stable identity of the interview session.
    pub session_id: String,
    /// Consumer operating mode.
    pub mode: InterviewAssistMode,
    /// New interview event.
    #[serde(default)]
    pub event: Option<InterviewAssistEvent>,
    /// Expected state identity and revision.
    pub state: InterviewAssistStateRef,
    /// Persisted state returned by a prior successful response.
    #[serde(default)]
    pub previous_state: Option<InterviewAssistState>,
    /// Optional confirmation of the pending cognition track.
    #[serde(default)]
    pub confirmation: Option<InterviewAssistConfirmation>,
    /// Bounded consumer projection options.
    #[serde(default)]
    pub options: InterviewAssistOptions,
}

/// InterviewAssist operating mode.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum InterviewAssistMode {
    /// Candidate practice mode.
    Practice,
    /// Live interview-assistance mode.
    Live,
}

/// One admitted external event.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct InterviewAssistEvent {
    /// Caller-assigned event identifier.
    pub id: String,
    /// Event type.
    pub kind: InterviewAssistEventKind,
    /// Event text.
    pub text: String,
    /// Speaker or source label.
    #[serde(default = "default_event_source")]
    pub source: String,
    /// Evidence identifiers explicitly retracted by this event.
    #[serde(default)]
    pub retract_evidence_ids: Vec<String>,
}

fn default_event_source() -> String {
    "interviewer".to_string()
}

/// Supported InterviewAssist event kinds.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum InterviewAssistEventKind {
    /// Transcript text admitted as a cognition observation.
    Transcript,
}

/// Expected identity of the input state.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct InterviewAssistStateRef {
    /// Consumer-facing phase.
    pub phase: String,
    /// Monotonic state revision expected by the caller.
    pub revision: u64,
    /// Track the caller believes is confirmed.
    #[serde(default)]
    pub confirmed_track: Option<String>,
}

/// Persistable state returned by the InterviewAssist boundary.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct InterviewAssistState {
    /// Session identity bound to this state.
    pub session_id: String,
    /// Monotonic consumer revision.
    pub revision: u64,
    /// Canonical cognition state.
    pub cognition: SessionState,
}

/// Consumer confirmation choice.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct InterviewAssistConfirmation {
    /// Track being confirmed or rejected.
    pub track_id: String,
    /// Confirmation choice.
    pub choice: InterviewAssistConfirmationChoice,
}

/// Supported confirmation choices.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum InterviewAssistConfirmationChoice {
    /// Confirm the proposed track.
    Yes,
    /// Reject the proposed track.
    No,
    /// Abstain without mutating canonical state.
    NotSure,
}

/// Projection options accepted from the consumer.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct InterviewAssistOptions {
    /// Maximum candidates returned to the consumer.
    pub maximum_candidates: usize,
    /// Consumer display threshold. It does not override kernel admission law.
    pub confirmation_threshold: f32,
}

impl Default for InterviewAssistOptions {
    fn default() -> Self {
        Self {
            maximum_candidates: 3,
            confirmation_threshold: 0.85,
        }
    }
}

/// Deterministic InterviewAssist response.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct InterviewAssistResponse {
    /// Wire-protocol version.
    pub protocol_version: u64,
    /// Echoed request identifier when available.
    pub request_id: String,
    /// Echoed session identifier when available.
    pub session_id: String,
    /// Executed boundary verb.
    pub verb: String,
    /// Cognition implementation breed.
    pub breed: String,
    /// Summary of the admitted question or event.
    #[serde(default)]
    pub observed_question: Option<ObservedQuestion>,
    /// Stable, sorted semantic constraints detected in active evidence.
    pub detected_constraints: Vec<String>,
    /// Ranked candidate tracks.
    pub candidates: Vec<InterviewAssistCandidate>,
    /// Current consumer-facing cognition state.
    #[serde(default)]
    pub cognition_state: Option<InterviewAssistCognitionState>,
    /// Confirmation interaction when human confirmation is required.
    #[serde(default)]
    pub confirmation: Option<InterviewAssistConfirmationPrompt>,
    /// Successful result; mutually exclusive with `refusal`.
    #[serde(default)]
    pub result: Option<InterviewAssistSuccess>,
    /// Typed refusal; mutually exclusive with `result`.
    #[serde(default)]
    pub refusal: Option<InterviewAssistRefusal>,
    /// Kernel receipt on success.
    #[serde(default)]
    pub receipt: Option<SessionReceipt>,
}

/// Human-readable observed-question projection.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ObservedQuestion {
    /// Stable source event identifier.
    pub event_id: String,
    /// Normalized non-empty summary.
    pub summary: String,
}

/// One ranked consumer candidate.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct InterviewAssistCandidate {
    /// Stable track identifier.
    pub id: String,
    /// Human-readable label.
    pub label: String,
    /// Confidence in `[0, 1]`.
    pub confidence: f32,
    /// Supporting evidence identifiers.
    pub evidence_ids: Vec<String>,
    /// Whether the track was explicitly eliminated.
    pub eliminated: bool,
}

/// Consumer-facing state projection.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct InterviewAssistCognitionState {
    /// Current phase identifier.
    pub phase: String,
    /// Human-readable phase label.
    pub phase_label: String,
    /// Monotonic revision.
    pub revision: u64,
    /// Confirmed track, when one exists.
    #[serde(default)]
    pub confirmed_track: Option<String>,
    /// Whether all declared phases are complete.
    pub complete: bool,
}

/// Human confirmation prompt.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct InterviewAssistConfirmationPrompt {
    /// Track awaiting confirmation.
    pub track_id: String,
    /// Human-readable question.
    pub question: String,
    /// Stable available choices.
    pub choices: Vec<InterviewAssistConfirmationChoice>,
}

/// Successful result payload.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct InterviewAssistSuccess {
    /// Persistable identity-bound next state.
    pub state: InterviewAssistState,
    /// Native deterministic kernel projection.
    pub projection: SessionProjection,
    /// Native OCEL 2.0 turn log.
    pub ocel_log: Value,
}

/// Typed consumer refusal.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct InterviewAssistRefusal {
    /// Stable machine-readable refusal code.
    pub code: String,
    /// Human-readable refusal explanation.
    pub message: String,
    /// Stable recovery action when retry is possible.
    #[serde(default)]
    pub recovery_action: Option<String>,
}

/// Runs one typed InterviewAssist request through the cognition kernel.
#[must_use]
pub fn run_interview_assist_request(
    domain_pack: DomainPack,
    request: InterviewAssistRequest,
) -> InterviewAssistResponse {
    let identity = ResponseIdentity::from_request(&request);
    match validate_request(&request) {
        Ok(()) => run_validated_request(domain_pack, request, identity),
        Err(refusal) => identity.refusal(refusal),
    }
}

/// Parses and runs one bounded JSON request.
#[must_use]
pub fn run_interview_assist_json(domain_pack: DomainPack, input: &[u8]) -> InterviewAssistResponse {
    if input.len() > INTERVIEW_ASSIST_MAX_INPUT_BYTES {
        return ResponseIdentity::default().refusal(InterviewAssistRefusal {
            code: "INPUT_TOO_LARGE".to_string(),
            message: "InterviewAssist request exceeds the hard byte cap".to_string(),
            recovery_action: Some("reduce_request_size".to_string()),
        });
    }

    match serde_json::from_slice::<InterviewAssistRequest>(input) {
        Ok(request) => run_interview_assist_request(domain_pack, request),
        Err(error) => {
            let value = serde_json::from_slice::<Value>(input).ok();
            let identity = ResponseIdentity::from_partial(value.as_ref());
            identity.refusal(InterviewAssistRefusal {
                code: classify_parse_error(value.as_ref()),
                message: format!("malformed InterviewAssist request: {error}"),
                recovery_action: Some("correct_request_schema".to_string()),
            })
        }
    }
}

fn validate_request(request: &InterviewAssistRequest) -> Result<(), InterviewAssistRefusal> {
    if request.protocol_version != INTERVIEW_ASSIST_PROTOCOL_VERSION {
        return Err(refusal(
            "UNSUPPORTED_PROTOCOL_VERSION",
            "unsupported InterviewAssist protocol version",
            "use_supported_protocol_version",
        ));
    }
    if request.request_id.trim().is_empty() {
        return Err(refusal(
            "MISSING_REQUEST_ID",
            "request_id must be non-empty",
            "supply_request_id",
        ));
    }
    if request.session_id.trim().is_empty() {
        return Err(refusal(
            "MISSING_SESSION_ID",
            "session_id must be non-empty",
            "supply_session_id",
        ));
    }
    if request.event.is_none() && request.confirmation.is_none() {
        return Err(refusal(
            "MISSING_EVENT",
            "an event or confirmation is required",
            "supply_event_or_confirmation",
        ));
    }
    if request.options.maximum_candidates == 0 {
        return Err(refusal(
            "INVALID_OPTIONS",
            "maximum_candidates must be greater than zero",
            "correct_options",
        ));
    }
    if !request.options.confirmation_threshold.is_finite()
        || !(0.0..=1.0).contains(&request.options.confirmation_threshold)
    {
        return Err(refusal(
            "INVALID_OPTIONS",
            "confirmation_threshold must be finite and between zero and one",
            "correct_options",
        ));
    }

    match &request.previous_state {
        Some(previous) => {
            if previous.session_id != request.session_id {
                return Err(refusal(
                    "SESSION_ID_MISMATCH",
                    "previous state belongs to another session",
                    "supply_matching_session_state",
                ));
            }
            if previous.revision != request.state.revision
                || previous.cognition.turn != request.state.revision
            {
                return Err(refusal(
                    "STALE_STATE_REVISION",
                    "request revision does not match canonical state",
                    "reload_latest_state",
                ));
            }
            if previous.cognition.committed_track != request.state.confirmed_track {
                return Err(refusal(
                    "STATE_TRACK_MISMATCH",
                    "confirmed track does not match canonical state",
                    "reload_latest_state",
                ));
            }
        }
        None if request.state.revision != 0 => {
            return Err(refusal(
                "MISSING_PREVIOUS_STATE",
                "non-zero revision requires previous_state",
                "supply_previous_state",
            ));
        }
        None => {}
    }

    Ok(())
}

fn run_validated_request(
    domain_pack: DomainPack,
    request: InterviewAssistRequest,
    identity: ResponseIdentity,
) -> InterviewAssistResponse {
    if request
        .confirmation
        .as_ref()
        .is_some_and(|confirmation| confirmation.choice == InterviewAssistConfirmationChoice::NotSure)
    {
        return identity.refusal(refusal(
            "CONFIRMATION_ABSTAINED",
            "confirmation was explicitly deferred",
            "request_clarifying_evidence",
        ));
    }

    let observation = request.event.as_ref().map(|event| Observation {
        id: event.id.clone(),
        source: event.source.clone(),
        text: event.text.clone(),
        retract_evidence_ids: event.retract_evidence_ids.clone(),
    });
    let confirmation = request.confirmation.as_ref().map(|confirmation| Confirmation {
        track_id: confirmation.track_id.clone(),
        accepted: confirmation.choice == InterviewAssistConfirmationChoice::Yes,
    });
    let previous_state = request.previous_state.as_ref().map(|state| state.cognition.clone());

    match run_session_turn(&SessionTurnInput {
        domain_pack,
        previous_state,
        observation,
        confirmation,
    }) {
        Ok(output) => {
            let observed_question = request.event.as_ref().map(|event| ObservedQuestion {
                event_id: event.id.clone(),
                summary: event.text.trim().to_string(),
            });
            let mut constraints = BTreeSet::new();
            for evidence in output.state.evidence.iter().filter(|evidence| evidence.active) {
                constraints.insert(evidence.proposition.clone());
            }
            let candidates = output
                .projection
                .hypotheses
                .iter()
                .take(request.options.maximum_candidates)
                .map(|candidate| InterviewAssistCandidate {
                    id: candidate.id.clone(),
                    label: candidate.label.clone(),
                    confidence: candidate.score.clamp(0.0, 1.0),
                    evidence_ids: candidate.evidence_ids.clone(),
                    eliminated: candidate.eliminated,
                })
                .collect();
            let confirmation_prompt = output
                .projection
                .pending_confirmation
                .as_ref()
                .map(|track_id| InterviewAssistConfirmationPrompt {
                    track_id: track_id.clone(),
                    question: format!("Should InterviewAssist commit to the {track_id} track?"),
                    choices: vec![
                        InterviewAssistConfirmationChoice::Yes,
                        InterviewAssistConfirmationChoice::No,
                        InterviewAssistConfirmationChoice::NotSure,
                    ],
                });
            let cognition_state = InterviewAssistCognitionState {
                phase: output.projection.phase.clone(),
                phase_label: output.projection.phase_label.clone(),
                revision: output.state.turn,
                confirmed_track: output.state.committed_track.clone(),
                complete: output.projection.complete,
            };
            let state = InterviewAssistState {
                session_id: request.session_id.clone(),
                revision: output.state.turn,
                cognition: output.state.clone(),
            };
            InterviewAssistResponse {
                protocol_version: INTERVIEW_ASSIST_PROTOCOL_VERSION,
                request_id: request.request_id,
                session_id: request.session_id,
                verb: "run".to_string(),
                breed: "receipted_compound_session".to_string(),
                observed_question,
                detected_constraints: constraints.into_iter().collect(),
                candidates,
                cognition_state: Some(cognition_state),
                confirmation: confirmation_prompt,
                result: Some(InterviewAssistSuccess {
                    state,
                    projection: output.projection,
                    ocel_log: output.ocel_log,
                }),
                refusal: None,
                receipt: Some(output.receipt),
            }
        }
        Err(error) => identity.refusal(map_session_error(error)),
    }
}

fn map_session_error(error: SessionError) -> InterviewAssistRefusal {
    let code = match &error {
        SessionError::MalformedInput { .. } => "MALFORMED_INPUT",
        SessionError::InputTooLarge => "INPUT_TOO_LARGE",
        SessionError::EmptyTurn => "MISSING_EVENT",
        SessionError::EmptyObservation => "EMPTY_TRANSCRIPT",
        SessionError::InvalidDomain { .. } => "INVALID_DOMAIN",
        SessionError::StateHashMismatch => "STATE_HASH_MISMATCH",
        SessionError::InvalidState { .. } => "INVALID_STATE",
        SessionError::DomainPackMismatch => "DOMAIN_PACK_MISMATCH",
        SessionError::ObservationTooLarge => "OBSERVATION_TOO_LARGE",
        SessionError::ResourceCap { .. } => "RESOURCE_CAP",
        SessionError::ObservationIdConflict { .. } => "OBSERVATION_ID_CONFLICT",
        SessionError::UnknownEvidence { .. } => "UNKNOWN_EVIDENCE",
        SessionError::UnknownTrack { .. } => "UNKNOWN_TRACK",
        SessionError::ConfirmationNotPending { .. } => "CONFIRMATION_NOT_PENDING",
        SessionError::ConfirmationNotEligible { .. } => "CONFIRMATION_NOT_ELIGIBLE",
        SessionError::Serialization { .. } => "SERIALIZATION_FAILURE",
    };
    InterviewAssistRefusal {
        code: code.to_string(),
        message: error.to_string(),
        recovery_action: recovery_for(code).map(str::to_string),
    }
}

fn recovery_for(code: &str) -> Option<&'static str> {
    match code {
        "EMPTY_TRANSCRIPT" => Some("supply_non_empty_transcript"),
        "OBSERVATION_TOO_LARGE" | "INPUT_TOO_LARGE" => Some("reduce_request_size"),
        "STATE_HASH_MISMATCH" | "INVALID_STATE" | "DOMAIN_PACK_MISMATCH" => {
            Some("reload_latest_state")
        }
        "UNKNOWN_TRACK" | "CONFIRMATION_NOT_PENDING" | "CONFIRMATION_NOT_ELIGIBLE" => {
            Some("use_pending_confirmation_track")
        }
        "RESOURCE_CAP" => Some("start_new_session"),
        "OBSERVATION_ID_CONFLICT" => Some("use_unique_event_id"),
        "UNKNOWN_EVIDENCE" => Some("retract_known_evidence"),
        "INVALID_DOMAIN" => Some("repair_domain_pack"),
        "MALFORMED_INPUT" => Some("correct_request_schema"),
        _ => None,
    }
}

fn refusal(code: &str, message: &str, recovery_action: &str) -> InterviewAssistRefusal {
    InterviewAssistRefusal {
        code: code.to_string(),
        message: message.to_string(),
        recovery_action: Some(recovery_action.to_string()),
    }
}

fn classify_parse_error(value: Option<&Value>) -> String {
    let Some(object) = value.and_then(Value::as_object) else {
        return "MALFORMED_INPUT".to_string();
    };
    if !object.contains_key("request_id") {
        "MISSING_REQUEST_ID".to_string()
    } else if !object.contains_key("session_id") {
        "MISSING_SESSION_ID".to_string()
    } else if !object.contains_key("event") && !object.contains_key("confirmation") {
        "MISSING_EVENT".to_string()
    } else if object
        .get("event")
        .and_then(Value::as_object)
        .and_then(|event| event.get("kind"))
        .is_some()
    {
        "UNSUPPORTED_EVENT_KIND".to_string()
    } else {
        "MALFORMED_INPUT".to_string()
    }
}

#[derive(Debug, Clone, Default)]
struct ResponseIdentity {
    request_id: String,
    session_id: String,
}

impl ResponseIdentity {
    fn from_request(request: &InterviewAssistRequest) -> Self {
        Self {
            request_id: request.request_id.clone(),
            session_id: request.session_id.clone(),
        }
    }

    fn from_partial(value: Option<&Value>) -> Self {
        Self {
            request_id: value
                .and_then(|value| value.get("request_id"))
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            session_id: value
                .and_then(|value| value.get("session_id"))
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
        }
    }

    fn refusal(self, refusal: InterviewAssistRefusal) -> InterviewAssistResponse {
        InterviewAssistResponse {
            protocol_version: INTERVIEW_ASSIST_PROTOCOL_VERSION,
            request_id: self.request_id,
            session_id: self.session_id,
            verb: "run".to_string(),
            breed: "receipted_compound_session".to_string(),
            observed_question: None,
            detected_constraints: Vec::new(),
            candidates: Vec::new(),
            cognition_state: None,
            confirmation: None,
            result: None,
            refusal: Some(refusal),
            receipt: None,
        }
    }
}
