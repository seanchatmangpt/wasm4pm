use std::fmt;

/// Internal error type for miniml operations
#[derive(Debug, Clone)]
pub struct MlError {
    pub message: String,
}

impl std::error::Error for MlError {}

impl MlError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for MlError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

