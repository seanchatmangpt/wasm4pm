#[derive(Debug,Clone,PartialEq,Eq)]
pub enum Sa2aError { MissingSubject, SubjectMismatch, EffectMismatch, StaleCandidate, AttemptBudgetExhausted, ProviderUnavailable, UnknownOutcome, InvalidWire(String), AuthorityPresent }
