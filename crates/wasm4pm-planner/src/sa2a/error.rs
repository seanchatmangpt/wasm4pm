#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Sa2aError {
    MissingSubject,
    SubjectMismatch,
    EffectMismatch,
    StaleCandidate,
    AttemptBudgetExhausted,
    ProviderUnavailable,
    ProviderRefused(String),
    UnknownOutcome,
    InvalidWire(String),
    AuthorityPresent,
}
