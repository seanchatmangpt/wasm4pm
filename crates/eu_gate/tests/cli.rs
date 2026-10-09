//! End-to-end CLI tests: the real `eyerun_wasi` binary over real files,
//! asserting on real stdout state (Chicago school — no mocks, no stubs).

use std::io::Write;
use std::process::Command;

fn bin_path() -> std::path::PathBuf {
    // cargo build --tests places the release-independent dev binary here.
    let target = std::env::var("CARGO_TARGET_DIR").unwrap_or_else(|_| "target".into());
    std::path::PathBuf::from(target).join("debug").join("eyerun_wasi")
}

fn write_tmp(name: &str, contents: &[u8]) -> std::path::PathBuf {
    // Unique per call: tests run in parallel and must not share files.
    let dir = std::env::temp_dir().join("eu_gate_cli_tests");
    std::fs::create_dir_all(&dir).unwrap();
    let unique = format!(
        "{}_{}_{}",
        name,
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    let p = dir.join(unique);
    let mut f = std::fs::File::create(&p).unwrap();
    f.write_all(contents).unwrap();
    p
}

fn run_gate(rules: &[u8], candidate: &[u8]) -> (String, std::process::ExitStatus) {
    // Ensure the binary exists (cargo test builds it via the bin target).
    let out = Command::new(env!("CARGO"))
        .args(["build", "--bin", "eyerun_wasi"])
        .output()
        .expect("cargo build failed");
    assert!(out.status.success(), "cargo build --bin failed: {:?}", out);

    let rules = write_tmp("rules", rules);
    let cand = write_tmp("candidate", candidate);
    let output = Command::new(bin_path())
        .args([rules, cand])
        .output()
        .expect("failed to spawn eyerun_wasi");
    (
        String::from_utf8(output.stdout).unwrap(),
        output.status,
    )
}

#[test]
fn cli_admits_wellformed_candidate() {
    let (stdout, status) = run_gate(
        br#"{"rules":[{"type":"required","field":"id"}]}"#,
        br#"{"id":"x"}"#,
    );
    assert!(status.success());
    assert_eq!(stdout.trim(), r#"{"verdict":"ADMITTED"}"#);
}

#[test]
fn cli_refuses_with_typed_code() {
    let (stdout, status) = run_gate(
        br#"{"rules":[{"type":"forbidden_field","field":"backdoor"}]}"#,
        br#"{"backdoor":1}"#,
    );
    assert!(status.success());
    assert_eq!(
        stdout.trim(),
        r#"{"verdict":"REFUSED","code":"REFUSED_FORBIDDEN_FIELD"}"#
    );
}

#[test]
fn cli_refuses_malformed_json_fail_closed() {
    let (stdout, status) = run_gate(br#"{"rules":[]}"#, br#"{{{"#);
    assert!(status.success());
    assert_eq!(
        stdout.trim(),
        r#"{"verdict":"REFUSED","code":"REFUSED_INFRASTRUCTURE_FAULT"}"#
    );
}

#[test]
fn cli_missing_file_is_infrastructure_fault() {
    // Ensure binary exists first.
    let _ = run_gate(br#"{"rules":[]}"#, br#"{}"#);
    let output = Command::new(bin_path())
        .args([
            std::path::Path::new("/nonexistent/rules.json"),
            std::path::Path::new("/nonexistent/candidate.json"),
        ])
        .output()
        .unwrap();
    assert!(output.status.success());
    assert_eq!(
        String::from_utf8(output.stdout).unwrap().trim(),
        r#"{"verdict":"REFUSED","code":"REFUSED_INFRASTRUCTURE_FAULT"}"#
    );
}

#[test]
fn cli_wrong_argc_is_infrastructure_fault() {
    let _ = run_gate(br#"{"rules":[]}"#, br#"{}"#);
    let output = Command::new(bin_path()).output().unwrap();
    assert!(output.status.success());
    assert_eq!(
        String::from_utf8(output.stdout).unwrap().trim(),
        r#"{"verdict":"REFUSED","code":"REFUSED_INFRASTRUCTURE_FAULT"}"#
    );
}
