//! Receipt bundle generation for Closed Claw benchmarks.
//!
//! Constructs BLAKE3 hash chain receipts proving config -> input -> plan -> output.
//! The ReceiptBuilder accepts either pre-hashed values or raw content (auto-hashed).

use super::gates::{blake3_hash, blake3_hash_str, ReceiptBundle, ReceiptStatus};

/// Builder for a BLAKE3 receipt bundle.
pub struct ReceiptBuilder {
    algorithm: String,
    pipeline_class: String,
    config_hash: Option<String>,
    input_hash: Option<String>,
    plan_hash: Option<String>,
    output_hash: Option<String>,
    status: ReceiptStatus,
}

impl ReceiptBuilder {
    /// Start a new receipt for the given algorithm and pipeline class.
    pub fn new(algorithm: &str, pipeline_class: &str) -> Self {
        Self {
            algorithm: algorithm.to_string(),
            pipeline_class: pipeline_class.to_string(),
            config_hash: None,
            input_hash: None,
            plan_hash: None,
            output_hash: None,
            status: ReceiptStatus::Success,
        }
    }

    /// Set config hash (accepts pre-hashed 64-char hex or raw content).
    /// If the value is 64 hex chars, used as-is. Otherwise, auto-hashed.
    pub fn config(mut self, value: &str) -> Self {
        self.config_hash = Some(if is_blake3_hex(value) {
            value.to_string()
        } else {
            blake3_hash_str(value)
        });
        self
    }

    /// Set input hash (same auto-detection logic as config).
    pub fn input(mut self, value: &str) -> Self {
        self.input_hash = Some(if is_blake3_hex(value) {
            value.to_string()
        } else {
            blake3_hash_str(value)
        });
        self
    }

    /// Set plan hash (same auto-detection logic as config).
    pub fn plan(mut self, value: &str) -> Self {
        self.plan_hash = Some(if is_blake3_hex(value) {
            value.to_string()
        } else {
            blake3_hash_str(value)
        });
        self
    }

    /// Set output hash (same auto-detection logic as config).
    pub fn output(mut self, value: &str) -> Self {
        self.output_hash = Some(if is_blake3_hex(value) {
            value.to_string()
        } else {
            blake3_hash_str(value)
        });
        self
    }

    /// Set config hash from raw bytes (always hashes).
    pub fn config_bytes(mut self, data: &[u8]) -> Self {
        self.config_hash = Some(blake3_hash(data));
        self
    }

    /// Set input hash from raw bytes (always hashes).
    pub fn input_bytes(mut self, data: &[u8]) -> Self {
        self.input_hash = Some(blake3_hash(data));
        self
    }

    /// Set plan hash from raw bytes (always hashes).
    pub fn plan_bytes(mut self, data: &[u8]) -> Self {
        self.plan_hash = Some(blake3_hash(data));
        self
    }

    /// Set output hash from raw bytes (always hashes).
    pub fn output_bytes(mut self, data: &[u8]) -> Self {
        self.output_hash = Some(blake3_hash(data));
        self
    }

    /// Override the receipt status (default: auto-detected from completeness).
    pub fn status(mut self, status: ReceiptStatus) -> Self {
        self.status = status;
        self
    }

    /// Hash a value using BLAKE3 (convenience method).
    pub fn hash_value(value: &str) -> String {
        blake3_hash_str(value)
    }

    /// Build the receipt bundle.
    /// If all four hashes are present and status is Success, the receipt is valid.
    /// Missing hashes produce a Partial receipt (unless status was explicitly set).
    pub fn build(self) -> ReceiptBundle {
        let has_all = self.config_hash.is_some()
            && self.input_hash.is_some()
            && self.plan_hash.is_some()
            && self.output_hash.is_some();

        // Auto-detect partial status unless explicitly overridden to Success/Failed
        let final_status = match self.status {
            ReceiptStatus::Success if !has_all => ReceiptStatus::Partial,
            other => other,
        };

        ReceiptBundle {
            config_hash: self.config_hash.unwrap_or_default(),
            input_hash: self.input_hash.unwrap_or_default(),
            plan_hash: self.plan_hash.unwrap_or_default(),
            output_hash: self.output_hash.unwrap_or_default(),
            status: final_status,
            algorithm: self.algorithm,
            pipeline_class: self.pipeline_class,
        }
    }
}

/// Check if a string looks like a BLAKE3 hex hash (64 hex chars).
fn is_blake3_hex(s: &str) -> bool {
    s.len() == 64 && s.chars().all(|c| c.is_ascii_hexdigit())
}

/// Serialize a receipt bundle to a JSON-compatible string for hashing.
pub fn receipt_to_hashable_json(bundle: &ReceiptBundle) -> String {
    format!(
        r#"{{"config":"{}","input":"{}","plan":"{}","output":"{}","status":"{:?}","algo":"{}","class":"{}"}}"#,
        bundle.config_hash,
        bundle.input_hash,
        bundle.plan_hash,
        bundle.output_hash,
        bundle.status,
        bundle.algorithm,
        bundle.pipeline_class,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gates::check_receipt_gate;

    #[test]
    fn test_receipt_builder_creates_valid_chain() {
        let receipt = ReceiptBuilder::new("dfg", "Discovery Core")
            .config("num_cases=1000")
            .input("event_log_1000_cases")
            .plan("discover_dfg")
            .output("dfg_nodes:4_edges:3")
            .build();

        assert_eq!(receipt.algorithm, "dfg");
        assert_eq!(receipt.pipeline_class, "Discovery Core");
        assert_eq!(receipt.config_hash.len(), 64);
        assert_eq!(receipt.input_hash.len(), 64);
        assert_eq!(receipt.output_hash.len(), 64);
        assert_eq!(receipt.status, ReceiptStatus::Success);

        let result = check_receipt_gate(&receipt);
        assert!(result.passed);
    }

    #[test]
    fn test_blake3_hash_is_deterministic() {
        let h1 = blake3_hash_str("hello world");
        let h2 = blake3_hash_str("hello world");
        let h3 = blake3_hash_str("different");
        assert_eq!(h1, h2);
        assert_ne!(h1, h3);
        assert_eq!(h1.len(), 64);
    }

    #[test]
    fn test_receipt_builder_auto_hashes_raw_content() {
        let receipt = ReceiptBuilder::new("dfg", "Discovery Core")
            .config("test")
            .input("test")
            .plan("test")
            .output("test")
            .build();

        // Raw content should be auto-hashed to 64-char hex
        assert_eq!(receipt.config_hash.len(), 64);
        assert_eq!(receipt.status, ReceiptStatus::Success);
        let result = check_receipt_gate(&receipt);
        assert!(result.passed);
    }

    #[test]
    fn test_receipt_builder_accepts_pre_hashed() {
        let pre_hashed = blake3_hash_str("some content");
        let receipt = ReceiptBuilder::new("dfg", "Discovery Core")
            .config(&pre_hashed)
            .input(&pre_hashed)
            .plan(&pre_hashed)
            .output(&pre_hashed)
            .build();

        // Pre-hashed value should be used as-is
        assert_eq!(receipt.config_hash, pre_hashed);
        let result = check_receipt_gate(&receipt);
        assert!(result.passed);
    }

    #[test]
    fn test_receipt_builder_partial_when_missing() {
        let receipt = ReceiptBuilder::new("dfg", "Discovery Core")
            .config("cfg")
            .input("inp")
            .build();

        assert_eq!(receipt.status, ReceiptStatus::Partial);
        let result = check_receipt_gate(&receipt);
        assert!(!result.passed);
    }

    #[test]
    fn test_receipt_builder_explicit_failed_status() {
        let receipt = ReceiptBuilder::new("dfg", "Discovery Core")
            .config("cfg")
            .input("inp")
            .plan("pln")
            .output("out")
            .status(ReceiptStatus::Failed)
            .build();

        assert_eq!(receipt.status, ReceiptStatus::Failed);
        let result = check_receipt_gate(&receipt);
        assert!(!result.passed);
    }

    #[test]
    fn test_receipt_builder_bytes_hashing() {
        let receipt = ReceiptBuilder::new("dfg", "Discovery Core")
            .config_bytes(b"raw config bytes")
            .input_bytes(b"raw input bytes")
            .plan_bytes(b"raw plan bytes")
            .output_bytes(b"raw output bytes")
            .build();

        assert_eq!(receipt.config_hash.len(), 64);
        assert_eq!(receipt.status, ReceiptStatus::Success);
        let result = check_receipt_gate(&receipt);
        assert!(result.passed);
    }

    #[test]
    fn test_receipt_to_hashable_json() {
        let receipt = ReceiptBuilder::new("dfg", "Discovery Core")
            .config("cfg")
            .input("inp")
            .plan("pln")
            .output("out")
            .build();

        let json = receipt_to_hashable_json(&receipt);
        assert!(json.contains(r#""algo":"dfg""#));
        assert!(json.contains(r#""class":"Discovery Core""#));
        assert!(json.contains(r#""status":"Success""#));
    }

    #[test]
    fn test_hash_value_convenience() {
        let h1 = ReceiptBuilder::hash_value("test");
        let h2 = blake3_hash_str("test");
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_is_blake3_hex() {
        assert!(is_blake3_hex(&blake3_hash_str("test")));
        assert!(!is_blake3_hex("short"));
        assert!(!is_blake3_hex("not_hex_at_all!!!"));
    }
}
