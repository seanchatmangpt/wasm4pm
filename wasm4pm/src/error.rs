/**
 * Structured error handling for WASM exports
 * All errors returned to JavaScript should follow this format:
 * { code: string, message: string, handle?: string }
 */
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

impl From<Wasm4pmError> for JsValue {
    fn from(e: Wasm4pmError) -> JsValue {
        js_val(&e.to_string())
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
        unsafe { std::mem::zeroed() }
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
