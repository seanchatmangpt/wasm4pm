use super::Sa2aError;
pub fn refuse_do<T>(_candidate: T) -> Result<(), Sa2aError> {
    Err(Sa2aError::AuthorityPresent)
}
