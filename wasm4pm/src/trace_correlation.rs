//! Trace Correlation Proof — Prove CLI→WASM Causality via OTEL Trace IDs
//!
//! Rank-1 Oracle: Identical trace_id + parent_span_id reference = causal proof
//! When CLI parent calls WASM child, both must share trace_id.
//!
//! Pattern:
//! CLI span: trace_abc, span_001, name=wasm4pm.command.run
//! WASM span: trace_abc, span_002, parent_span_id=span_001, name=wasm.discover_dfg
//!
//! Correlation proves: WASM execution causally depends on CLI invocation

use std::collections::HashMap;

/// Trace correlation event
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TraceCorrelation {
    pub parent_trace_id: String,
    pub parent_span_id: String,
    pub child_trace_id: String,
    pub child_parent_span_id: String, // Child's declared parent
    pub matched: bool,
    pub latency_ms: u32,
    pub timestamp_correlation_error_ms: u32, // Latency between spans
}

impl TraceCorrelation {
    /// Check if correlation is valid
    pub fn is_valid(&self) -> bool {
        self.matched
            && self.parent_trace_id == self.child_trace_id
            && self.parent_span_id == self.child_parent_span_id
            && self.latency_ms < 1000 // Reasonable latency for synchronous call
    }
}

/// Correlate CLI and WASM spans
pub fn correlate_traces(
    parent_trace_id: &str,
    parent_span_id: &str,
    child_trace_id: &str,
    child_parent_span_id: &str,
    latency_ms: u32,
) -> TraceCorrelation {
    let matched = parent_trace_id == child_trace_id && parent_span_id == child_parent_span_id;

    TraceCorrelation {
        parent_trace_id: parent_trace_id.to_string(),
        parent_span_id: parent_span_id.to_string(),
        child_trace_id: child_trace_id.to_string(),
        child_parent_span_id: child_parent_span_id.to_string(),
        matched,
        latency_ms,
        timestamp_correlation_error_ms: if matched { latency_ms } else { 0 },
    }
}

/// Correlation proof span (emitted for audit)
#[derive(Debug, Clone)]
pub struct CorrelationProofSpan {
    pub parent_trace_id: String,
    pub parent_span_id: String,
    pub child_trace_id: String,
    pub child_parent_span_id: String,
    pub match_result: bool,
    pub latency_ms: u32,
    pub timestamp_correlation_error_ms: u32,
    pub service_name: String,
    pub status: String, // "ok" if matched, else "error"
}

impl CorrelationProofSpan {
    pub fn from_correlation(correlation: &TraceCorrelation) -> Self {
        CorrelationProofSpan {
            parent_trace_id: correlation.parent_trace_id.clone(),
            parent_span_id: correlation.parent_span_id.clone(),
            child_trace_id: correlation.child_trace_id.clone(),
            child_parent_span_id: correlation.child_parent_span_id.clone(),
            match_result: correlation.matched,
            latency_ms: correlation.latency_ms,
            timestamp_correlation_error_ms: correlation.timestamp_correlation_error_ms,
            service_name: "wpm".to_string(),
            status: if correlation.is_valid() {
                "ok".to_string()
            } else {
                "error".to_string()
            },
        }
    }

    /// Convert to OTEL span attributes
    pub fn to_otel_attributes(&self) -> HashMap<String, String> {
        let mut attrs = HashMap::new();
        attrs.insert("parent_trace_id".to_string(), self.parent_trace_id.clone());
        attrs.insert("parent_span_id".to_string(), self.parent_span_id.clone());
        attrs.insert("child_trace_id".to_string(), self.child_trace_id.clone());
        attrs.insert(
            "child_parent_span_id".to_string(),
            self.child_parent_span_id.clone(),
        );
        attrs.insert("match".to_string(), self.match_result.to_string());
        attrs.insert("latency_ms".to_string(), self.latency_ms.to_string());
        attrs.insert(
            "timestamp_correlation_error_ms".to_string(),
            self.timestamp_correlation_error_ms.to_string(),
        );
        attrs.insert("service_name".to_string(), self.service_name.clone());
        attrs.insert("status".to_string(), self.status.clone());
        attrs
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_correlate_matching_traces() {
        let correlation = correlate_traces("abc123", "span_001", "abc123", "span_001", 5);

        assert!(correlation.matched);
        assert!(correlation.is_valid());
    }

    #[test]
    fn test_correlate_mismatched_trace_ids() {
        let correlation = correlate_traces("abc123", "span_001", "xyz789", "span_001", 5);

        assert!(!correlation.matched);
        assert!(!correlation.is_valid());
    }

    #[test]
    fn test_correlate_mismatched_parent_span_ids() {
        let correlation = correlate_traces("abc123", "span_001", "abc123", "span_002", 5);

        assert!(!correlation.matched);
        assert!(!correlation.is_valid());
    }

    #[test]
    fn test_correlate_excessive_latency() {
        let correlation = correlate_traces("abc123", "span_001", "abc123", "span_001", 5000);

        assert!(correlation.matched);
        assert!(!correlation.is_valid(), "Latency >1000ms should fail");
    }

    #[test]
    fn test_correlation_proof_span_from_valid_correlation() {
        let correlation = correlate_traces("abc123", "span_001", "abc123", "span_001", 5);
        let proof = CorrelationProofSpan::from_correlation(&correlation);

        assert_eq!(proof.status, "ok");
        assert!(proof.match_result);
    }

    #[test]
    fn test_correlation_proof_span_from_invalid_correlation() {
        let correlation = correlate_traces("abc123", "span_001", "xyz789", "span_001", 5);
        let proof = CorrelationProofSpan::from_correlation(&correlation);

        assert_eq!(proof.status, "error");
        assert!(!proof.match_result);
    }

    #[test]
    fn test_correlation_proof_span_to_otel_attributes() {
        let correlation = correlate_traces("abc123", "span_001", "abc123", "span_001", 5);
        let proof = CorrelationProofSpan::from_correlation(&correlation);
        let attrs = proof.to_otel_attributes();

        assert_eq!(attrs.get("parent_trace_id").unwrap(), "abc123");
        assert_eq!(attrs.get("parent_span_id").unwrap(), "span_001");
        assert_eq!(attrs.get("child_trace_id").unwrap(), "abc123");
        assert_eq!(attrs.get("match").unwrap(), "true");
        assert_eq!(attrs.get("latency_ms").unwrap(), "5");
    }

    #[test]
    fn test_correlation_timestamp_error_valid() {
        let correlation = correlate_traces("abc123", "span_001", "abc123", "span_001", 10);

        // Valid match should have timestamp error == latency
        assert_eq!(correlation.timestamp_correlation_error_ms, 10);
    }

    #[test]
    fn test_correlation_timestamp_error_invalid() {
        let correlation = correlate_traces("abc123", "span_001", "xyz789", "span_001", 10);

        // Invalid match should have zero timestamp error
        assert_eq!(correlation.timestamp_correlation_error_ms, 0);
    }
}
