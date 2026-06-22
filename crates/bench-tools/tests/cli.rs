//! End-to-end CLI tests for the bench-tools binary.
//!
//! Unit tests (in main.rs) cover the decision logic in isolation; these drive the
//! actual binary as a black box against a synthetic Criterion directory, so the
//! full pipeline — argument parsing, filesystem walking, JSON emission, exit
//! codes — is exercised the way CI and developers invoke it.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const BIN: &str = env!("CARGO_BIN_EXE_bench-tools");

/// A unique scratch directory per test (no tempfile dependency).
fn scratch(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("benchtools-it-{}-{}", std::process::id(), tag));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

/// Write a Criterion `new/estimates.json` for one benchmark id.
fn write_estimate(criterion_dir: &Path, bench_id: &str, median: f64, ci_lo: f64, ci_hi: f64) {
    let new_dir = criterion_dir.join(bench_id).join("new");
    fs::create_dir_all(&new_dir).unwrap();
    let json = format!(
        r#"{{"median":{{"point_estimate":{median},"confidence_interval":{{"lower_bound":{ci_lo},"upper_bound":{ci_hi}}}}},"std_dev":{{"point_estimate":1.0}}}}"#
    );
    fs::write(new_dir.join("estimates.json"), json).unwrap();
}

fn run(args: &[&str]) -> std::process::Output {
    Command::new(BIN)
        .args(args)
        .output()
        .expect("spawn bench-tools")
}

#[test]
fn report_emits_markdown_and_csv() {
    let dir = scratch("report");
    let crit = dir.join("criterion");
    write_estimate(&crit, "grp/alpha", 1000.0, 990.0, 1010.0);
    write_estimate(&crit, "grp/beta", 2000.0, 1980.0, 2020.0);

    let out = run(&[
        "report",
        "--criterion-dir",
        crit.to_str().unwrap(),
        "--out-dir",
        dir.to_str().unwrap(),
    ]);
    assert!(out.status.success(), "report should exit 0");

    let md = fs::read_to_string(dir.join("REPORT.md")).unwrap();
    assert!(md.contains("grp/alpha"));
    assert!(md.contains("grp/beta"));
    let csv = fs::read_to_string(dir.join("report.csv")).unwrap();
    assert!(csv.starts_with("bench,median_ns"));
    assert!(csv.contains("grp/alpha,1000"));
}

#[test]
fn report_on_empty_dir_exits_nonzero() {
    let dir = scratch("report-empty");
    let crit = dir.join("criterion");
    fs::create_dir_all(&crit).unwrap();
    let out = run(&[
        "report",
        "--criterion-dir",
        crit.to_str().unwrap(),
        "--out-dir",
        dir.to_str().unwrap(),
    ]);
    assert_eq!(out.status.code(), Some(1), "empty criterion dir → exit 1");
}

#[test]
fn receipt_then_verify_roundtrip_and_tamper() {
    let dir = scratch("receipt");
    let crit = dir.join("criterion");
    write_estimate(&crit, "grp/alpha", 1000.0, 990.0, 1010.0);
    let receipt = dir.join("r.json");

    // Emit a receipt to an explicit file, without touching the repo baseline.
    let out = run(&[
        "receipt",
        "--criterion-dir",
        crit.to_str().unwrap(),
        "--out",
        receipt.to_str().unwrap(),
        "--no-baseline",
    ]);
    assert!(out.status.success(), "receipt should exit 0");
    let body = fs::read_to_string(&receipt).unwrap();
    assert!(body.contains("\"receipt_hash\""));
    assert!(body.contains("Wasm4pmBenchmarkReceipt.v1"));

    // A fresh receipt verifies (dirty allowed since tests run in a working tree).
    let out = run(&[
        "verify",
        "--receipt",
        receipt.to_str().unwrap(),
        "--allow-dirty",
    ]);
    assert!(out.status.success(), "fresh receipt should verify");

    // Tamper a median without updating the hash → verify must fail.
    let v: serde_json::Value = serde_json::from_str(&body).unwrap();
    let mut tampered = v.clone();
    tampered["benchmarks"][0]["median_ns"] = serde_json::json!(999_999.0);
    fs::write(&receipt, serde_json::to_string_pretty(&tampered).unwrap()).unwrap();
    let out = run(&[
        "verify",
        "--receipt",
        receipt.to_str().unwrap(),
        "--allow-dirty",
    ]);
    assert_eq!(out.status.code(), Some(1), "tampered receipt → exit 1");
    assert!(String::from_utf8_lossy(&out.stderr).contains("TAMPERED"));
}

#[test]
fn regress_flags_a_real_regression_and_passes_noise() {
    let dir = scratch("regress");
    let crit = dir.join("criterion");
    // Current: 1300ns, CI [1290,1310] — disjoint from baseline CI, +30%.
    write_estimate(&crit, "grp/alpha", 1300.0, 1290.0, 1310.0);
    let baseline = dir.join("baseline.json");

    // Baseline median 1000, CI upper 1010. Current CI lower 1290 > 1010 → regression.
    let base = serde_json::json!({
        "benchmarks": [{"bench": "grp/alpha", "median_ns": 1000.0,
                        "ci_lower_ns": 990.0, "ci_upper_ns": 1010.0}]
    });
    fs::write(&baseline, serde_json::to_string_pretty(&base).unwrap()).unwrap();

    let out = run(&[
        "regress",
        "--criterion-dir",
        crit.to_str().unwrap(),
        "--baseline",
        baseline.to_str().unwrap(),
        "--threshold",
        "10",
    ]);
    assert_eq!(
        out.status.code(),
        Some(1),
        "disjoint +30% → regression (exit 1)"
    );

    // Now make the baseline CIs overlap the current measurement → no regression.
    let base_overlap = serde_json::json!({
        "benchmarks": [{"bench": "grp/alpha", "median_ns": 1000.0,
                        "ci_lower_ns": 990.0, "ci_upper_ns": 1400.0}]
    });
    fs::write(
        &baseline,
        serde_json::to_string_pretty(&base_overlap).unwrap(),
    )
    .unwrap();
    let out = run(&[
        "regress",
        "--criterion-dir",
        crit.to_str().unwrap(),
        "--baseline",
        baseline.to_str().unwrap(),
        "--threshold",
        "10",
    ]);
    assert!(
        out.status.success(),
        "overlapping CIs → not a regression (exit 0)"
    );
}

#[test]
fn usage_on_no_args_exits_two() {
    let out = run(&[]);
    assert_eq!(out.status.code(), Some(2), "no subcommand → usage exit 2");
}
