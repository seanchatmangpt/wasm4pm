/**
 * Structured error handling for WASM exports and native execution
 * All errors returned to JavaScript should follow this format:
 * { code: string, message: string, handle?: string }
 */
use wasm_bindgen::prelude::*;
use std::fmt;

/// Custom Error type for wasm4pm
#[derive(Debug, Clone)]
pub struct Error {
    pub code: String,
    pub message: String,
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}]: {}", self.code, self.message)
    }
}

impl std::error::Error for Error {}

/// Result alias using our custom Error
pub type Result<T> = std::result::Result<T, Error>;

impl From<Error> for JsValue {
    fn from(err: Error) -> Self {
        #[cfg(target_arch = "wasm32")]
        {
            wasm_err(&err.code, err.message)
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            let _ = err;
            JsValue::null()
        }
    }
}

/// Native-safe JsValue from string.
/// On wasm32, this is a wrapper around JsValue::from_str.
/// On other targets, it returns a placeholder to avoid panics.
#[inline]
pub fn js_val(s: &str) -> JsValue {
    #[cfg(target_arch = "wasm32")]
    {
        JsValue::from_str(s)
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        // On non-wasm targets, we should avoid creating JsValue if possible.
        // If we must return one (e.g. for API compatibility), we use a safe default.
        // wasm-bindgen's JsValue is basically an index into a table.
        // NULL/Undefined are usually 0/1.
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

/// Helper to create our Error type
pub fn err(code: &str, message: impl std::fmt::Display) -> Error {
    Error {
        code: code.to_string(),
        message: message.to_string(),
    }
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
        $crate::error::err(
            $crate::error::codes::INVALID_HANDLE,
            format!("Invalid handle: {}", $handle),
        )
    };
}

#[macro_export]
macro_rules! invalid_input {
    ($msg:expr) => {
        $crate::error::err($crate::error::codes::INVALID_INPUT, $msg)
    };
}

#[macro_export]
macro_rules! parse_error {
    ($msg:expr) => {
        $crate::error::err($crate::error::codes::PARSE_ERROR, $msg)
    };
}

#[macro_export]
macro_rules! internal_error {
    ($msg:expr) => {
        $crate::error::err($crate::error::codes::INTERNAL_ERROR, $msg)
    };
}
