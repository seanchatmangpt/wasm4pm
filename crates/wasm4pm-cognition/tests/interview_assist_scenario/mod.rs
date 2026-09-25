#![allow(dead_code)]

use crate::interview_assist_support::{domain_pack, request};
use serde_json::Value;
use wasm4pm_cognition::interview_assist::{
    run_interview_assist_json, run_interview_assist_request, InterviewAssistConfirmation,
    InterviewAssistConfirmationChoice, InterviewAssistRequest, InterviewAssistResponse,
    InterviewAssistState,
};

/// Declarative test driver for the InterviewAssist consumer boundary.
///
/// Tests describe the scenario. This type owns protocol sequencing, persisted
/// state carry-forward, event replacement, confirmation construction, and
/// typed execution.
#[derive(Debug, Clone)]
pub struct InterviewAssistScenario {
    request: InterviewAssistRequest,
}

impl Default for InterviewAssistScenario {
    fn default() -> Self {
        Self::new()
    }
}

impl InterviewAssistScenario {
    #[must_use]
    pub fn new() -> Self {
        Self { request: request() }
    }

    #[must_use]
    pub fn continuing_from(response: &InterviewAssistResponse) -> Self {
        let state = response.success_state().clone();
        let mut scenario = Self::new();
        scenario.bind_state(state);
        scenario
    }

    #[must_use]
    pub fn session(mut self, session_id: impl Into<String>) -> Self {
        self.request.session_id = session_id.into();
        self
    }

    #[must_use]
    pub fn transcript(mut self, event_id: impl Into<String>, text: impl Into<String>) -> Self {
        let event = self.request.event.as_mut().expect("scenario event");
        event.id = event_id.into();
        event.text = text.into();
        self
    }

    #[must_use]
    pub fn without_event(mut self) -> Self {
        self.request.event = None;
        self
    }

    #[must_use]
    pub fn confirm(
        mut self,
        track_id: impl Into<String>,
        choice: InterviewAssistConfirmationChoice,
    ) -> Self {
        self.request.confirmation = Some(InterviewAssistConfirmation {
            track_id: track_id.into(),
            choice,
        });
        self
    }

    #[must_use]
    pub fn confirm_prompt(
        self,
        response: &InterviewAssistResponse,
        choice: InterviewAssistConfirmationChoice,
    ) -> Self {
        self.confirm(response.prompt_track(), choice)
    }

    #[must_use]
    pub fn stale_revision(mut self, offset: u64) -> Self {
        self.request.state.revision = self.request.state.revision.saturating_add(offset);
        self
    }

    #[must_use]
    pub fn mutate(mut self, mutation: impl FnOnce(&mut InterviewAssistRequest)) -> Self {
        mutation(&mut self.request);
        self
    }

    #[must_use]
    pub fn request(&self) -> &InterviewAssistRequest {
        &self.request
    }

    #[must_use]
    pub fn into_request(self) -> InterviewAssistRequest {
        self.request
    }

    #[must_use]
    pub fn json(mut self, mutation: impl FnOnce(&mut Value)) -> Vec<u8> {
        let mut value = serde_json::to_value(&mut self.request).expect("request JSON");
        mutation(&mut value);
        serde_json::to_vec(&value).expect("request bytes")
    }

    #[must_use]
    pub fn run(self) -> InterviewAssistResponse {
        run_interview_assist_request(domain_pack(), self.request)
    }

    #[must_use]
    pub fn run_json(bytes: &[u8]) -> InterviewAssistResponse {
        run_interview_assist_json(domain_pack(), bytes)
    }

    fn bind_state(&mut self, state: InterviewAssistState) {
        self.request.state.revision = state.revision;
        self.request.state.phase = state.cognition.phase.clone();
        self.request.state.confirmed_track = state.cognition.committed_track.clone();
        self.request.previous_state = Some(state);
    }
}

pub trait InterviewAssistResponseExt {
    fn assert_success(&self) -> &Self;
    fn assert_refusal(&self, code: &str) -> &Self;
    fn success_state(&self) -> &InterviewAssistState;
    fn prompt_track(&self) -> &str;
    fn refusal_code(&self) -> Option<&str>;
}

impl InterviewAssistResponseExt for InterviewAssistResponse {
    fn assert_success(&self) -> &Self {
        assert!(
            self.result.is_some(),
            "expected success, got {:?}",
            self.refusal
        );
        assert!(self.refusal.is_none());
        self
    }

    fn assert_refusal(&self, code: &str) -> &Self {
        assert_eq!(self.refusal_code(), Some(code));
        assert!(self.result.is_none());
        self
    }

    fn success_state(&self) -> &InterviewAssistState {
        &self.result.as_ref().expect("successful response").state
    }

    fn prompt_track(&self) -> &str {
        &self
            .confirmation
            .as_ref()
            .expect("confirmation prompt")
            .track_id
    }

    fn refusal_code(&self) -> Option<&str> {
        self.refusal.as_ref().map(|refusal| refusal.code.as_str())
    }
}

#[must_use]
pub fn first_response() -> InterviewAssistResponse {
    InterviewAssistScenario::new().run()
}
