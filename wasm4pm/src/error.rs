/**
 * Structured error handling for WASM exports
 * All errors returned to JavaScript should follow this format:
 * { code: string, message: string, handle?: string }
 */

use wasm_bindgen::prelude::*;

/// Creates a structured error object for JavaScript
/// Returns JSON string: {"code":"CODE","message":"message text"}
pub fn wasm_err(code: &str, message: impl std::fmt::Display) -> JsValue {
    let json = format!(
        r#"{{"code":"{}","message":"{}"}}"#,
        code,
        message.to_string().replace('"', "\\\"")
    );
    JsValue::from_str(&json)
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
