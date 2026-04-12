//! Pass/Fail Gates for the Closed Claw Benchmarking Constitution.
//!
//! G1: Determinism -- output hash identical across N runs
//! G2: Receipt   -- BLAKE3 hash chain integrity
//! G3: Truth     -- quality metrics meet thresholds
//! G4: Synchrony -- cross-profile output agreement
//! G5: Report    -- all required report sections present

use std::collections::BTreeMap;

use crate::registry::GateRequirements;

// ---------------------------------------------------------------------------
// GateResult
// ---------------------------------------------------------------------------

/// Result of evaluating a single gate.
#[derive(Debug, Clone)]
pub struct GateResult {
    pub gate_id: &'static str,
    pub gate_name: &'static str,
    pub passed: bool,
    pub reason: String,
}

impl GateResult {
    pub fn pass(gate_id: &'static str, gate_name: &'static str) -> Self {
        Self {
            gate_id,
            gate_name,
            passed: true,
            reason: String::new(),
        }
    }

    pub fn fail(gate_id: &'static str, gate_name: &'static str, reason: impl Into<String>) -> Self {
        Self {
            gate_id,
            gate_name,
            passed: false,
            reason: reason.into(),
        }
    }

    pub fn skip(gate_id: &'static str, gate_name: &'static str, reason: impl Into<String>) -> Self {
        Self {
            gate_id,
            gate_name,
            passed: true,
            reason: format!("SKIPPED: {}", reason.into()),
        }
    }
}

// ---------------------------------------------------------------------------
// BLAKE3 Hashing
// ---------------------------------------------------------------------------

/// Compute BLAKE3 hash of byte data, returning 64-char hex string.
pub fn blake3_hash(data: &[u8]) -> String {
    blake3::hash(data).to_hex().to_string()
}

/// Compute BLAKE3 hash of a string, returning 64-char hex string.
pub fn blake3_hash_str(s: &str) -> String {
    blake3_hash(s.as_bytes())
}

// ---------------------------------------------------------------------------
// ReceiptBundle (data types for G2)
// ---------------------------------------------------------------------------

/// BLAKE3 receipt bundle for a benchmark execution.
#[derive(Debug, Clone)]
pub struct ReceiptBundle {
    pub config_hash: String,
    pub input_hash: String,
    pub plan_hash: String,
    pub output_hash: String,
    pub status: ReceiptStatus,
    pub algorithm: String,
    pub pipeline_class: String,
}

/// Receipt execution status.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReceiptStatus {
    Success,
    Partial,
    Failed,
}

impl ReceiptBundle {
    /// Verify the hash chain: all hashes must be valid BLAKE3 hex (64 chars)
    /// and status must be Success.
    pub fn verify_chain(&self) -> GateResult {
        let valid_hex = |h: &str| h.len() == 64 && h.chars().all(|c| c.is_ascii_hexdigit());

        let mut invalid = Vec::new();
        if !valid_hex(&self.config_hash) {
            invalid.push("config_hash");
        }
        if !valid_hex(&self.input_hash) {
            invalid.push("input_hash");
        }
        if !valid_hex(&self.plan_hash) {
            invalid.push("plan_hash");
        }
        if !valid_hex(&self.output_hash) {
            invalid.push("output_hash");
        }

        if invalid.is_empty() && self.status == ReceiptStatus::Success {
            GateResult::pass("G2", "Receipt")
        } else if !invalid.is_empty() {
            GateResult::fail(
                "G2",
                "Receipt",
                format!("invalid hashes: {}", invalid.join(", ")),
            )
        } else {
            GateResult::fail("G2", "Receipt", format!("status: {:?}", self.status))
        }
    }
}

// ---------------------------------------------------------------------------
// G1: Determinism Gate
// ---------------------------------------------------------------------------

/// Check determinism by comparing BLAKE3 output hashes across multiple runs.
pub fn check_determinism_gate(output_hashes: &[&str], algorithm_name: &str) -> GateResult {
    if output_hashes.is_empty() {
        return GateResult::fail("G1", "Determinism", "no output hashes provided");
    }

    if output_hashes.len() <= 1 {
        return GateResult::pass("G1", "Determinism");
    }
    let first = output_hashes[0];
    let mut mismatches = Vec::new();
    for (i, h) in output_hashes.iter().enumerate() {
        if *h != first {
            mismatches.push(i);
        }
    }

    if mismatches.is_empty() {
        GateResult::pass("G1", "Determinism")
    } else {
        GateResult::fail(
            "G1",
            "Determinism",
            format!(
                "{}: hashes differ at runs {:?} (expected {})",
                algorithm_name, mismatches, first
            ),
        )
    }
}

// ---------------------------------------------------------------------------
// G2: Receipt Gate
// ---------------------------------------------------------------------------

/// Check G2 receipt gate -- verify BLAKE3 hash chain integrity.
pub fn check_receipt_gate(receipt: &ReceiptBundle) -> GateResult {
    receipt.verify_chain()
}

// ---------------------------------------------------------------------------
// G3: Truth Gate
// ---------------------------------------------------------------------------

/// Truth thresholds from the constitution.
pub struct TruthThresholds {
    pub min_fitness: f64,
    pub min_precision: f64,
    pub max_temporal_zeta: f64,
}

impl Default for TruthThresholds {
    fn default() -> Self {
        Self {
            min_fitness: 0.95,
            min_precision: 0.80,
            max_temporal_zeta: 2.0,
        }
    }
}

/// Check G3 truth gate based on quality metrics.
pub fn check_truth_gate(
    fitness: Option<f64>,
    precision: Option<f64>,
    temporal_deviations: Option<(usize, usize)>,
    thresholds: &TruthThresholds,
) -> GateResult {
    let mut failures = Vec::new();

    if let Some(f) = fitness {
        if f < thresholds.min_fitness {
            failures.push(format!("fitness {:.4} < {:.4}", f, thresholds.min_fitness));
        }
    }

    if let Some(p) = precision {
        if p < thresholds.min_precision {
            failures.push(format!(
                "precision {:.4} < {:.4}",
                p, thresholds.min_precision
            ));
        }
    }

    if let Some((total, devs)) = temporal_deviations {
        if total > 0 {
            let ratio = devs as f64 / total as f64;
            if ratio > thresholds.max_temporal_zeta {
                failures.push(format!(
                    "temporal deviation ratio {:.2} > zeta {:.1}",
                    ratio, thresholds.max_temporal_zeta
                ));
            }
        }
    }

    if failures.is_empty() {
        GateResult::pass("G3", "Truth")
    } else {
        GateResult::fail("G3", "Truth", failures.join("; "))
    }
}

// ---------------------------------------------------------------------------
// G4: Synchrony Gate
// ---------------------------------------------------------------------------

/// Check G4 synchrony gate -- compare output hashes across profiles.
pub fn check_synchrony_gate(profile_hashes: &BTreeMap<String, String>) -> GateResult {
    if profile_hashes.len() < 2 {
        return GateResult::skip("G4", "Synchrony", "need 2+ profiles");
    }

    let hashes: Vec<&String> = profile_hashes.values().collect();
    if hashes.len() <= 1 {
        return GateResult::pass("G4", "Synchrony");
    }
    let first = hashes[0];
    let mismatches: Vec<String> = profile_hashes
        .iter()
        .filter(|(_, h)| *h != first)
        .map(|(name, h)| format!("{}: {}", name, h))
        .collect();

    if mismatches.is_empty() {
        GateResult::pass("G4", "Synchrony")
    } else {
        GateResult::fail(
            "G4",
            "Synchrony",
            format!("mismatched profiles: {}", mismatches.join(", ")),
        )
    }
}

// ---------------------------------------------------------------------------
// G5: Report Gate
// ---------------------------------------------------------------------------

/// Required sections in a benchmark report.
const REQUIRED_REPORT_SECTIONS: &[&str] = &[
    "pipeline",
    "algorithm",
    "dataset_size",
    "total_events",
    "latency_p50_us",
    "latency_p95_us",
    "latency_p99_us",
    "throughput_events_sec",
    "output_hash",
    "deterministic",
];

/// Check G5 report gate -- verify all required sections present.
pub fn check_report_gate(report: &BTreeMap<String, String>) -> GateResult {
    let missing: Vec<&str> = REQUIRED_REPORT_SECTIONS
        .iter()
        .filter(|s| !report.contains_key(&s.to_string()))
        .copied()
        .collect();

    if missing.is_empty() {
        GateResult::pass("G5", "Report")
    } else {
        GateResult::fail(
            "G5",
            "Report",
            format!("missing sections: {}", missing.join(", ")),
        )
    }
}

// ---------------------------------------------------------------------------
// Aggregate Gate Report
// ---------------------------------------------------------------------------

/// Run all applicable gates and produce a summary.
pub fn run_all_gates(
    gate_requirements: &GateRequirements,
    output_hashes: &[&str],
    receipt: Option<&ReceiptBundle>,
    fitness: Option<f64>,
    precision: Option<f64>,
    temporal: Option<(usize, usize)>,
    profile_hashes: Option<&BTreeMap<String, String>>,
    report: &BTreeMap<String, String>,
) -> Vec<GateResult> {
    let mut results = Vec::new();

    if gate_requirements.determinism {
        results.push(check_determinism_gate(output_hashes, "pipeline"));
    }
    if gate_requirements.receipt {
        if let Some(r) = receipt {
            results.push(check_receipt_gate(r));
        } else {
            results.push(GateResult::skip("G2", "Receipt", "no receipt bundle"));
        }
    }
    if gate_requirements.truth {
        results.push(check_truth_gate(
            fitness,
            precision,
            temporal,
            &Default::default(),
        ));
    }
    if gate_requirements.synchrony {
        if let Some(ph) = profile_hashes {
            results.push(check_synchrony_gate(ph));
        } else {
            results.push(GateResult::skip("G4", "Synchrony", "single profile"));
        }
    }
    if gate_requirements.report {
        results.push(check_report_gate(report));
    }

    results
}

/// Print gate results to stdout.
pub fn print_gate_results(results: &[GateResult]) {
    println!("\n=== Gate Results ===");
    for r in results {
        let icon = if r.passed { "PASS" } else { "FAIL" };
        println!("  [{}] {} ({})", icon, r.gate_name, r.gate_id);
        if !r.reason.is_empty() {
            println!("        {}", r.reason);
        }
    }
    let passed = results.iter().filter(|r| r.passed).count();
    let total = results.len();
    println!("  Summary: {}/{} gates passed", passed, total);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

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
    fn test_blake3_hash_bytes() {
        let h1 = blake3_hash(b"raw bytes");
        let h2 = blake3_hash_str("raw bytes");
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_g1_determinism_pass() {
        let hash = blake3_hash_str("deterministic output");
        let result = check_determinism_gate(&[hash.as_str(), hash.as_str(), hash.as_str()], "dfg");
        assert!(result.passed);
        assert!(result.reason.is_empty());
    }

    #[test]
    fn test_g1_determinism_fail() {
        let h1 = blake3_hash_str("run 1");
        let h2 = blake3_hash_str("run 2");
        let result = check_determinism_gate(&[h1.as_str(), h2.as_str()], "dfg");
        assert!(!result.passed);
        assert!(result.reason.contains("hashes differ"));
    }

    #[test]
    fn test_g1_determinism_empty() {
        let result = check_determinism_gate(&[], "dfg");
        assert!(!result.passed);
    }

    #[test]
    fn test_g2_receipt_pass() {
        let receipt = ReceiptBundle {
            config_hash: blake3_hash_str("config"),
            input_hash: blake3_hash_str("input"),
            plan_hash: blake3_hash_str("plan"),
            output_hash: blake3_hash_str("output"),
            status: ReceiptStatus::Success,
            algorithm: "dfg".to_string(),
            pipeline_class: "discovery".to_string(),
        };
        let result = check_receipt_gate(&receipt);
        assert!(result.passed);
    }

    #[test]
    fn test_g2_receipt_invalid_hash() {
        let receipt = ReceiptBundle {
            config_hash: "short".to_string(),
            input_hash: blake3_hash_str("input"),
            plan_hash: blake3_hash_str("plan"),
            output_hash: blake3_hash_str("output"),
            status: ReceiptStatus::Success,
            algorithm: "dfg".to_string(),
            pipeline_class: "discovery".to_string(),
        };
        let result = check_receipt_gate(&receipt);
        assert!(!result.passed);
        assert!(result.reason.contains("config_hash"));
    }

    #[test]
    fn test_g2_receipt_failed_status() {
        let receipt = ReceiptBundle {
            config_hash: blake3_hash_str("config"),
            input_hash: blake3_hash_str("input"),
            plan_hash: blake3_hash_str("plan"),
            output_hash: blake3_hash_str("output"),
            status: ReceiptStatus::Failed,
            algorithm: "dfg".to_string(),
            pipeline_class: "discovery".to_string(),
        };
        let result = check_receipt_gate(&receipt);
        assert!(!result.passed);
        assert!(result.reason.contains("Failed"));
    }

    #[test]
    fn test_g2_receipt_partial_status() {
        let receipt = ReceiptBundle {
            config_hash: blake3_hash_str("config"),
            input_hash: blake3_hash_str("input"),
            plan_hash: String::new(),
            output_hash: blake3_hash_str("output"),
            status: ReceiptStatus::Partial,
            algorithm: "dfg".to_string(),
            pipeline_class: "discovery".to_string(),
        };
        let result = check_receipt_gate(&receipt);
        assert!(!result.passed);
        assert!(result.reason.contains("Partial"));
    }

    #[test]
    fn test_g3_truth_all_pass() {
        let result = check_truth_gate(Some(0.97), Some(0.85), Some((100, 5)), &Default::default());
        assert!(result.passed);
    }

    #[test]
    fn test_g3_truth_fitness_fail() {
        let result = check_truth_gate(Some(0.90), Some(0.85), None, &Default::default());
        assert!(!result.passed);
        assert!(result.reason.contains("fitness"));
    }

    #[test]
    fn test_g3_truth_precision_fail() {
        let result = check_truth_gate(Some(0.97), Some(0.70), None, &Default::default());
        assert!(!result.passed);
        assert!(result.reason.contains("precision"));
    }

    #[test]
    fn test_g3_truth_temporal_fail() {
        let result = check_truth_gate(Some(0.97), Some(0.85), Some((50, 200)), &Default::default());
        assert!(!result.passed);
        assert!(result.reason.contains("temporal"));
    }

    #[test]
    fn test_g3_truth_all_none_passes() {
        let result = check_truth_gate(None, None, None, &Default::default());
        assert!(result.passed);
    }

    #[test]
    fn test_g3_truth_custom_thresholds() {
        let strict = TruthThresholds {
            min_fitness: 0.99,
            min_precision: 0.90,
            max_temporal_zeta: 1.0,
        };
        let result = check_truth_gate(Some(0.97), Some(0.92), Some((100, 50)), &strict);
        assert!(!result.passed);
        assert!(result.reason.contains("fitness"));
    }

    #[test]
    fn test_g4_synchrony_pass() {
        let hash = blake3_hash_str("same output");
        let mut profiles = BTreeMap::new();
        profiles.insert("cloud".to_string(), hash.clone());
        profiles.insert("browser".to_string(), hash.clone());
        profiles.insert("edge".to_string(), hash.clone());
        let result = check_synchrony_gate(&profiles);
        assert!(result.passed);
    }

    #[test]
    fn test_g4_synchrony_fail() {
        let mut profiles = BTreeMap::new();
        profiles.insert("cloud".to_string(), blake3_hash_str("cloud output"));
        profiles.insert("browser".to_string(), blake3_hash_str("browser output"));
        let result = check_synchrony_gate(&profiles);
        assert!(!result.passed);
        assert!(result.reason.contains("mismatched"));
    }

    #[test]
    fn test_g4_synchrony_single_profile_skips() {
        let mut profiles = BTreeMap::new();
        profiles.insert("cloud".to_string(), blake3_hash_str("only one"));
        let result = check_synchrony_gate(&profiles);
        assert!(result.passed);
        assert!(result.reason.contains("SKIPPED"));
    }

    #[test]
    fn test_g5_report_pass() {
        let mut report = BTreeMap::new();
        for section in REQUIRED_REPORT_SECTIONS {
            report.insert(section.to_string(), "value".to_string());
        }
        let result = check_report_gate(&report);
        assert!(result.passed);
    }

    #[test]
    fn test_g5_report_missing_sections() {
        let report = BTreeMap::new();
        let result = check_report_gate(&report);
        assert!(!result.passed);
        assert!(result.reason.contains("pipeline"));
    }

    #[test]
    fn test_g5_report_partial_missing() {
        let mut report = BTreeMap::new();
        report.insert("pipeline".to_string(), "discovery".to_string());
        report.insert("algorithm".to_string(), "dfg".to_string());
        let result = check_report_gate(&report);
        assert!(!result.passed);
        assert!(result.reason.contains("dataset_size"));
    }

    #[test]
    fn test_run_all_gates_strict() {
        let hash = blake3_hash_str("output");
        let receipt = ReceiptBundle {
            config_hash: blake3_hash_str("config"),
            input_hash: blake3_hash_str("input"),
            plan_hash: blake3_hash_str("plan"),
            output_hash: hash.clone(),
            status: ReceiptStatus::Success,
            algorithm: "dfg".to_string(),
            pipeline_class: "discovery".to_string(),
        };
        let mut profiles = BTreeMap::new();
        profiles.insert("cloud".to_string(), hash.clone());
        profiles.insert("browser".to_string(), hash.clone());
        let mut report = BTreeMap::new();
        for section in REQUIRED_REPORT_SECTIONS {
            report.insert(section.to_string(), "value".to_string());
        }
        let reqs = GateRequirements {
            determinism: true,
            receipt: true,
            truth: true,
            synchrony: true,
            report: true,
        };
        let results = run_all_gates(
            &reqs,
            &[hash.as_str(), hash.as_str()],
            Some(&receipt),
            Some(0.97),
            Some(0.85),
            Some((100, 5)),
            Some(&profiles),
            &report,
        );
        assert_eq!(results.len(), 5);
        assert!(results.iter().all(|r| r.passed));
    }

    #[test]
    fn test_run_all_gates_determinism_report_only() {
        let hash = blake3_hash_str("output");
        let mut report = BTreeMap::new();
        for section in REQUIRED_REPORT_SECTIONS {
            report.insert(section.to_string(), "value".to_string());
        }
        let reqs = GateRequirements {
            determinism: true,
            report: true,
            ..Default::default()
        };
        let results = run_all_gates(
            &reqs,
            &[hash.as_str(), hash.as_str()],
            None,
            None,
            None,
            None,
            None,
            &report,
        );
        assert_eq!(results.len(), 2);
        assert!(results.iter().all(|r| r.passed));
    }

    #[test]
    fn test_gate_result_skip() {
        let r = GateResult::skip("G4", "Synchrony", "single profile");
        assert!(r.passed);
        assert!(r.reason.contains("SKIPPED"));
        assert_eq!(r.gate_id, "G4");
    }
}
