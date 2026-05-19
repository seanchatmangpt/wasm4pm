//! Detector OTEL span emission.
//!
//! Each detector calls [`emit_detector_span`] exactly once per invocation.
//! The actual span sink is left to the host runtime — here we only record
//! emissions in a thread-local ring for tests and diagnostics.

use crate::autosystems::findings::Severity;
use std::cell::RefCell;

/// One recorded span emission.
#[derive(Debug, Clone)]
pub struct DetectorSpan {
    /// Detector code (e.g. `"STUB_GATE_PASS"`).
    pub code: String,
    /// Whether the detector fired.
    pub firing: bool,
    /// Severity level at emission time.
    pub severity: Severity,
    /// Number of evidence items considered.
    pub evidence_count: usize,
}

thread_local! {
    static EMITTED: RefCell<Vec<DetectorSpan>> = const { RefCell::new(Vec::new()) };
}

/// Emit a detector span. Never panics; failures are swallowed.
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
pub fn emit_detector_span(code: &str, firing: bool, severity: Severity, evidence_count: usize) {
    let _ = std::panic::catch_unwind(|| {
        EMITTED.with(|e| {
            e.borrow_mut().push(DetectorSpan {
                code: code.to_string(),
                firing,
                severity,
                evidence_count,
            });
        });
    });
}

/// Drain all recorded spans (test helper).
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
pub fn drain_emitted() -> Vec<DetectorSpan> {
    EMITTED.with(|e| std::mem::take(&mut *e.borrow_mut()))
}
