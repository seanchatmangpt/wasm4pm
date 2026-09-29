use super::{CandidatePlan, Sa2aError};
pub fn guard_generation(candidate: &CandidatePlan, current: u64) -> Result<(), Sa2aError> {
    if candidate.generation == current {
        Ok(())
    } else {
        Err(Sa2aError::StaleCandidate)
    }
}
