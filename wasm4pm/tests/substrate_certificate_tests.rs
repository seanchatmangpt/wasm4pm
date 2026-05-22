//! Substrate certificate tests for wasm4pm v26.5.21.
//!
//! These tests validate the JSON artifacts produced by `make substrate-cert`.
//! If the files do not exist, tests skip gracefully with a clear message.
//! Run `make substrate-cert` first to generate the artifacts.

use std::path::Path;

const SUBSTRATE_CERT_PATH: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/target/wasm4pm-v26.5.21/substrate-certificate.json"
);

const CAPABILITY_MATRIX_PATH: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/target/wasm4pm-v26.5.21/capability-matrix.json"
);

fn load_json_or_skip(path: &str) -> Option<serde_json::Value> {
    if !Path::new(path).exists() {
        println!("SKIP: {} not found — run 'make substrate-cert' first", path);
        return None;
    }
    let content = std::fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("Failed to read {}: {}", path, e));
    Some(serde_json::from_str(&content)
        .unwrap_or_else(|e| panic!("Invalid JSON in {}: {}", path, e)))
}

// ── Substrate Certificate Tests ───────────────────────────────────────────────

#[test]
fn test_substrate_certificate_file_exists() {
    if !Path::new(SUBSTRATE_CERT_PATH).exists() {
        println!("SKIP: {} not found — run 'make substrate-cert'", SUBSTRATE_CERT_PATH);
        return;
    }
    assert!(Path::new(SUBSTRATE_CERT_PATH).is_file());
}

#[test]
fn test_substrate_certificate_has_release_field() {
    let Some(cert) = load_json_or_skip(SUBSTRATE_CERT_PATH) else { return };
    let release = cert["release"].as_str().expect("release must be a string");
    assert!(release.starts_with("26."), "release must start with '26.' got: {}", release);
}

#[test]
fn test_substrate_certificate_has_generated_at() {
    let Some(cert) = load_json_or_skip(SUBSTRATE_CERT_PATH) else { return };
    let ts = cert["generated_at"].as_str().expect("generated_at must be a string");
    assert!(ts.contains('T'), "generated_at must be ISO8601 format, got: {}", ts);
}

#[test]
fn test_substrate_certificate_has_real_data_tests_object() {
    let Some(cert) = load_json_or_skip(SUBSTRATE_CERT_PATH) else { return };
    assert!(cert["real_data_tests"].is_object(), "real_data_tests must be an object");
    assert!(cert["real_data_tests"]["passed"].is_number());
    assert!(cert["real_data_tests"]["failed"].is_number());
    assert!(cert["real_data_tests"]["files"].is_number());
}

#[test]
fn test_real_data_tests_failed_is_zero() {
    let Some(cert) = load_json_or_skip(SUBSTRATE_CERT_PATH) else { return };
    let failed = cert["real_data_tests"]["failed"].as_u64().unwrap_or(1);
    assert_eq!(failed, 0, "real_data_tests.failed must be 0, got: {}", failed);
}

#[test]
fn test_real_data_tests_files_gte_ten() {
    let Some(cert) = load_json_or_skip(SUBSTRATE_CERT_PATH) else { return };
    let files = cert["real_data_tests"]["files"].as_u64().unwrap_or(0);
    assert!(files >= 10, "real_data_tests.files must be >= 10, got: {}", files);
}

#[test]
fn test_substrate_certificate_has_fake_stub_audit() {
    let Some(cert) = load_json_or_skip(SUBSTRATE_CERT_PATH) else { return };
    assert!(cert["fake_stub_audit"].is_object(), "fake_stub_audit must be an object");
    assert!(cert["fake_stub_audit"]["s1_fake"].is_number());
    assert!(cert["fake_stub_audit"]["s2_placeholder"].is_number());
    assert!(cert["fake_stub_audit"]["production_blockers"].is_number());
}

#[test]
fn test_certificate_value_is_valid() {
    let Some(cert) = load_json_or_skip(SUBSTRATE_CERT_PATH) else { return };
    let valid_values = ["Accepted", "RefusedUntilBlockersResolved", "AcceptedWithExperimentalExclusions"];
    let value = cert["certificate_value"].as_str().expect("certificate_value must be a string");
    assert!(
        valid_values.contains(&value),
        "certificate_value must be one of {:?}, got: {}",
        valid_values,
        value
    );
}

#[test]
fn test_certificate_s1_fake_is_zero() {
    let Some(cert) = load_json_or_skip(SUBSTRATE_CERT_PATH) else { return };
    let s1_fake = cert["fake_stub_audit"]["s1_fake"].as_u64().unwrap_or(1);
    assert_eq!(s1_fake, 0,
        "s1_fake must be 0 for a production-ready certificate. Got: {}. \
         Fix all CRITICAL fake/stub patterns before releasing.", s1_fake);
}

// ── Capability Matrix Tests ───────────────────────────────────────────────────

#[test]
fn test_capability_matrix_file_exists() {
    if !Path::new(CAPABILITY_MATRIX_PATH).exists() {
        println!("SKIP: {} not found — run 'make substrate-cert'", CAPABILITY_MATRIX_PATH);
        return;
    }
    assert!(Path::new(CAPABILITY_MATRIX_PATH).is_file());
}

#[test]
fn test_capability_matrix_has_capabilities_array() {
    let Some(matrix) = load_json_or_skip(CAPABILITY_MATRIX_PATH) else { return };
    assert!(matrix["capabilities"].is_array(), "capabilities must be an array");
    let caps = matrix["capabilities"].as_array().unwrap();
    assert!(!caps.is_empty(), "capabilities array must not be empty");
}

#[test]
fn test_capability_matrix_entries_have_required_fields() {
    let Some(matrix) = load_json_or_skip(CAPABILITY_MATRIX_PATH) else { return };
    let caps = matrix["capabilities"].as_array().unwrap();
    for (i, cap) in caps.iter().enumerate() {
        assert!(cap["capability"].is_string(), "capabilities[{}].capability must be a string", i);
        assert!(cap["module"].is_string(), "capabilities[{}].module must be a string", i);
        assert!(cap["production_status"].is_string(), "capabilities[{}].production_status must be a string", i);
        assert!(cap["real_data_tested"].is_boolean(), "capabilities[{}].real_data_tested must be a bool", i);
        assert!(cap["mcpp_critical"].is_boolean(), "capabilities[{}].mcpp_critical must be a bool", i);
    }
}

#[test]
fn test_capability_matrix_has_streaming_module_entry() {
    let Some(matrix) = load_json_or_skip(CAPABILITY_MATRIX_PATH) else { return };
    let caps = matrix["capabilities"].as_array().unwrap();
    let has_streaming = caps.iter().any(|c| {
        c["module"].as_str().map(|m| m.contains("streaming")).unwrap_or(false)
    });
    assert!(has_streaming, "capability matrix must contain at least one streaming module entry");
}
