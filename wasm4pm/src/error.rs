//! Structured error handling for WASM exports.
//!
//! All errors returned to JavaScript follow a machine-readable JSON schema:
//! `{"code":"PARSE_ERROR","message":"...","remediation":"..."}`.
//!
//! [`Wasm4pmError`] is the canonical typed error enum. Call [`Wasm4pmError::code`]
//! to get a stable string key for JS `switch` dispatch, and [`Wasm4pmError::remediation`]
//! for optional fix guidance to show to callers.
//!
//! Error codes: `PARSE_ERROR`, `VALIDATION_ERROR`, `BINARY_FORMAT_ERROR`,
//! `ALGORITHM_ERROR`, `HANDLE_NOT_FOUND`.

use wasm_bindgen::prelude::*;

/// Typed error enum for wasm4pm public APIs.
///
/// All `Result<T, String>` public functions should convert to this type at
/// the public boundary using `.map_err(Wasm4pmError::Parse)` etc.
/// Internal helper functions may continue to use `String` and convert at
/// the last mile.
#[derive(Debug, thiserror::Error)]
pub enum Wasm4pmError {
    /// Input could not be parsed (XES, OCEL, POWL text format, etc.).
    #[error("parse error: {0}")]
    Parse(String),
    /// Structural validation failed (partial order, Petri net soundness, etc.).
    #[error("validation error: {0}")]
    Validation(String),
    /// Binary `.pm4bin` format error (magic mismatch, truncated data, etc.).
    #[error("binary format error: {0}")]
    BinaryFormat(String),
    /// An algorithm failed for a named reason.
    #[error("algorithm error in '{algorithm}': {reason}")]
    Algorithm { algorithm: String, reason: String },
    /// A stored-object handle was not found or has the wrong type.
    #[error("handle not found: {0}")]
    HandleNotFound(String),
}

impl Wasm4pmError {
    /// Machine-readable error code for JS switch/dispatch.
    ///
    /// # Examples
    ///
    /// ```
    /// use wasm4pm::error::Wasm4pmError;
    ///
    /// assert_eq!(Wasm4pmError::Parse("bad XES".into()).code(), "PARSE_ERROR");
    /// assert_eq!(
    ///     Wasm4pmError::Algorithm {
    ///         algorithm: "alpha++".into(),
    ///         reason: "empty log".into(),
    ///     }.code(),
    ///     "ALGORITHM_ERROR"
    /// );
    /// ```
    pub fn code(&self) -> &'static str {
        match self {
            Self::Parse(_) => "PARSE_ERROR",
            Self::Validation(_) => "VALIDATION_ERROR",
            Self::BinaryFormat(_) => "BINARY_FORMAT_ERROR",
            Self::Algorithm { .. } => "ALGORITHM_ERROR",
            Self::HandleNotFound(_) => "HANDLE_NOT_FOUND",
        }
    }

    /// Human-readable remediation hint for JS callers, or `None` for self-explanatory errors.
    ///
    /// # Examples
    ///
    /// ```
    /// use wasm4pm::error::Wasm4pmError;
    ///
    /// // Parse errors include fix guidance
    /// assert!(Wasm4pmError::Parse("x".into()).remediation().is_some());
    ///
    /// // Algorithm errors do not (the reason field already explains it)
    /// assert!(Wasm4pmError::Algorithm {
    ///     algorithm: "heuristic".into(),
    ///     reason: "threshold too low".into(),
    /// }.remediation().is_none());
    /// ```
    pub fn remediation(&self) -> Option<&'static str> {
        match self {
            Self::HandleNotFound(_) => Some(
                "Create a fresh handle via load_eventlog_from_xes() or \
                 load_eventlog_from_binary() and pass it here.",
            ),
            Self::Parse(_) => Some(
                "Verify the input is valid syntax. \
                 For POWL: see parse_powl_model_string docs. \
                 For XES: validate against the XES schema.",
            ),
            Self::BinaryFormat(_) => Some(
                "Re-export the event log to binary format via export_eventlog_to_binary() \
                 and retry.",
            ),
            Self::Validation(_) | Self::Algorithm { .. } => None,
        }
    }
}

impl From<Wasm4pmError> for JsValue {
    /// Converts to a structured JSON object `{code, message, remediation?}`.
    /// Callers can switch on `code` for typed error handling in JS/TS.
    fn from(e: Wasm4pmError) -> JsValue {
        let msg = e.to_string().replace('"', "\\\"");
        let json = match e.remediation() {
            Some(r) => format!(
                r#"{{"code":"{}","message":"{}","remediation":"{}"}}"#,
                e.code(),
                msg,
                r
            ),
            None => format!(r#"{{"code":"{}","message":"{}"}}"#, e.code(), msg),
        };
        js_val(&json)
    }
}

/// Native-safe JsValue from string.
/// On wasm32, this is a wrapper around JsValue::from_str.
/// On other targets, it returns a zeroed JsValue to avoid panics.
#[inline]
pub fn js_val(s: &str) -> JsValue {
    #[cfg(target_arch = "wasm32")]
    {
        JsValue::from_str(s)
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = s;
        JsValue::null()
    }
}

/// Creates a structured error object for JavaScript
/// Returns JSON string: {"code":"CODE","message":"message text"}
pub fn wasm_err(code: &str, message: impl std::fmt::Display) -> JsValue {
    let json = format!(
        r#"{{"code":"{}","message":"{}"}}"#,
        code,
        message.to_string().replace('"', "\\\"")
    );
    js_val(&json)
}

/// Error codes for common failure scenarios
pub mod codes {
    pub const INVALID_HANDLE: &str = "INVALID_HANDLE";
    pub const INVALID_INPUT: &str = "INVALID_INPUT";
    pub const INVALID_XES: &str = "INVALID_XES";
    pub const INVALID_JSON: &str = "INVALID_JSON";
    pub const PARSE_ERROR: &str = "PARSE_ERROR";
    pub const NOT_IMPLEMENTED: &str = "NOT_IMPLEMENTED";
    pub const INTERNAL_ERROR: &str = "INTERNAL_ERROR";
}

/// Helper macros for common error patterns
#[macro_export]
macro_rules! invalid_handle {
    ($handle:expr) => {
        $crate::error::wasm_err(
            $crate::error::codes::INVALID_HANDLE,
            format!("Invalid handle: {}", $handle),
        )
    };
}

#[macro_export]
macro_rules! invalid_input {
    ($msg:expr) => {
        $crate::error::wasm_err($crate::error::codes::INVALID_INPUT, $msg)
    };
}

#[macro_export]
macro_rules! parse_error {
    ($msg:expr) => {
        $crate::error::wasm_err($crate::error::codes::PARSE_ERROR, $msg)
    };
}

#[macro_export]
macro_rules! internal_error {
    ($msg:expr) => {
        $crate::error::wasm_err($crate::error::codes::INTERNAL_ERROR, $msg)
    };
}
