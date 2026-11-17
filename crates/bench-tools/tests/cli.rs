//! End-to-end CLI tests for the bench-tools binary.
//!
//! Unit tests (in main.rs) cover the decision logic in isolation; these drive the
//! actual binary as a black box against a synthetic Criterion directory, so the
//! full pipeline — argument parsing, filesystem walking, JSON emission, exit
//! codes — is exercised the way CI and developers invoke it.
//!
//! Baselines are NEVER hand-fabricated JSON: every baseline used here is minted
//! through the real `bench-tools receipt` path (a second criterion dir carrying
//! the baseline medians → `receipt --no-baseline --out FILE`), because `regress`
//! verifies the baseline's BLAKE3 `receipt_hash` — a forged baseline is now a
//! refusal, not a comparison partner.

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

/// Mint a REAL signed baseline receipt via the receipt path itself: write the
/// baseline medians into a second criterion dir, run
/// `receipt --criterion-dir <that> --no-baseline --out <file>`, and return the
/// receipt path. This is the only sanctioned way for a test to obtain a baseline.
fn make_baseline(dir: &Path, tag: &str, benches: &[(&str, f64, f64, f64)]) -> PathBuf {
    let crit = dir.join(format!("baseline-criterion-{tag}"));
    for (id, m, lo, hi) in benches {
        write_estimate(&crit, id, *m, *lo, *hi);
    }
    let out = dir.join(format!("baseline-{tag}.json"));
    let res = run(&[
        "receipt",
        "--criterion-dir",
        crit.to_str().unwrap(),
        "--out",
        out.to_str().unwrap(),
        "--no-baseline",
    ]);
    assert!(
        res.status.success(),
        "baseline mint via receipt failed: {}",
        String::from_utf8_lossy(&res.stderr)
    );
    out
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
fn report_escapes_csv_specials_rfc4180() {
    // T8 — a bench id containing a comma/quote must be RFC4180-quoted in the
    // CSV, not silently shifting every later column.
    let dir = scratch("report-csv");
    let crit = dir.join("criterion");
    write_estimate(&crit, "grp/al,pha", 1000.0, 990.0, 1010.0);
    let out = run(&[
        "report",
        "--criterion-dir",
        crit.to_str().unwrap(),
        "--out-dir",
        dir.to_str().unwrap(),
    ]);
    assert!(out.status.success());
    let csv = fs::read_to_string(dir.join("report.csv")).unwrap();
    assert!(
        csv.contains("\"grp/al,pha\",1000"),
        "RFC4180 escaping missing in: {csv}"
    );
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
    // E7: the ledger anchor is part of the hashed body.
    assert!(body.contains("\"ledger_entry_count\""));
    assert!(body.contains("\"ledger_previous_head\""));

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

    // Baseline minted through the REAL receipt path (median 1000, CI upper
    // 1010). Current CI lower 1290 > 1010 → regression.
    let baseline = make_baseline(&dir, "regr", &[("grp/alpha", 1000.0, 990.0, 1010.0)]);
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

    // Overlapping baseline CIs (upper 1400) → the same current run is noise.
    let baseline = make_baseline(&dir, "regr-ol", &[("grp/alpha", 1000.0, 990.0, 1400.0)]);
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
fn regress_rejects_tampered_baseline_hash() {
    // T1 — the baseline is a signed receipt; editing a median after signing
    // must be refused, not gated on.
    let dir = scratch("regress-tampered");
    let crit = dir.join("criterion");
    write_estimate(&crit, "grp/alpha", 1000.0, 990.0, 1010.0);
    let baseline = make_baseline(&dir, "tamper", &[("grp/alpha", 1000.0, 990.0, 1010.0)]);

    let mut v: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&baseline).unwrap()).unwrap();
    v["benchmarks"][0]["median_ns"] = serde_json::json!(100.0); // forger edits history
    fs::write(&baseline, serde_json::to_string_pretty(&v).unwrap()).unwrap();

    let out = run(&[
        "regress",
        "--criterion-dir",
        crit.to_str().unwrap(),
        "--baseline",
        baseline.to_str().unwrap(),
    ]);
    assert_eq!(out.status.code(), Some(1), "tampered baseline → exit 1");
    let err = String::from_utf8_lossy(&out.stderr);
    assert!(err.contains("TAMPERED"), "stderr: {err}");
}

#[test]
fn regress_rejects_baseline_without_receipt_hash() {
    // T10 — a hash-less baseline (hand-fabricated or predating signed
    // receipts) can never be tamper-checked → refuse.
    let dir = scratch("regress-nohash");
    let crit = dir.join("criterion");
    write_estimate(&crit, "grp/alpha", 1000.0, 990.0, 1010.0);
    let baseline = dir.join("baseline.json");
    let base = serde_json::json!({
        "receipt_schema": "Wasm4pmBenchmarkReceipt.v1",
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
    ]);
    assert_eq!(out.status.code(), Some(1), "hash-less baseline → exit 1");
    let err = String::from_utf8_lossy(&out.stderr);
    assert!(err.contains("UNUSABLE BASELINE"), "stderr: {err}");
}

#[test]
fn regress_enforces_min_coverage_default_floor() {
    // T2 — 1 of 3 current benches overlaps the baseline (33% < 50% default
    // floor): the gate must refuse instead of passing on the compared one.
    let dir = scratch("regress-coverage");
    let crit = dir.join("criterion");
    write_estimate(&crit, "grp/alpha", 1000.0, 990.0, 1010.0);
    write_estimate(&crit, "grp/beta", 2000.0, 1990.0, 2010.0);
    write_estimate(&crit, "grp/gamma", 3000.0, 2990.0, 3010.0);
    let baseline = make_baseline(&dir, "cov", &[("grp/alpha", 1000.0, 990.0, 1010.0)]);

    let out = run(&[
        "regress",
        "--criterion-dir",
        crit.to_str().unwrap(),
        "--baseline",
        baseline.to_str().unwrap(),
    ]);
    assert_eq!(out.status.code(), Some(1), "33% coverage < 50% floor → exit 1");
    let err = String::from_utf8_lossy(&out.stderr);
    assert!(err.contains("INSUFFICIENT COVERAGE"), "stderr: {err}");
}

#[test]
fn regress_honors_explicit_min_coverage() {
    // T3 — the same partial comparison with an explicit lower floor passes.
    let dir = scratch("regress-coverage-flag");
    let crit = dir.join("criterion");
    write_estimate(&crit, "grp/alpha", 1000.0, 990.0, 1010.0);
    write_estimate(&crit, "grp/beta", 2000.0, 1990.0, 2010.0);
    write_estimate(&crit, "grp/gamma", 3000.0, 2990.0, 3010.0);
    let baseline = make_baseline(&dir, "covf", &[("grp/alpha", 1000.0, 990.0, 1010.0)]);

    let out = run(&[
        "regress",
        "--criterion-dir",
        crit.to_str().unwrap(),
        "--baseline",
        baseline.to_str().unwrap(),
        "--min-coverage",
        "0.3",
    ]);
    assert!(
        out.status.success(),
        "33% coverage ≥ 0.3 floor → exit 0; stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

#[test]
fn regress_threshold_must_be_finite_in_range() {
    // T4 — `--threshold` that fails to parse previously SILENTLY fell back to
    // 10%: a typo'd gate. Now: exit 2.
    let dir = scratch("regress-threshold");
    let crit = dir.join("criterion");
    write_estimate(&crit, "grp/alpha", 1000.0, 990.0, 1010.0);
    let baseline = make_baseline(&dir, "thr", &[("grp/alpha", 1000.0, 990.0, 1010.0)]);
    for bad in ["0", "-5", "nan", "inf", "2000", "abc"] {
        let out = run(&[
            "regress",
            "--criterion-dir",
            crit.to_str().unwrap(),
            "--baseline",
            baseline.to_str().unwrap(),
            "--threshold",
            bad,
        ]);
        assert_eq!(
            out.status.code(),
            Some(2),
            "--threshold {bad} → exit 2, stderr: {}",
            String::from_utf8_lossy(&out.stderr)
        );
    }
    // Boundary values are accepted (0 excluded, 1000 included).
    let out = run(&[
        "regress",
        "--criterion-dir",
        crit.to_str().unwrap(),
        "--baseline",
        baseline.to_str().unwrap(),
        "--threshold",
        "1000",
    ]);
    assert!(out.status.success(), "threshold 1000 is legal");
}

#[test]
fn regress_excludes_nonpositive_nonfinite_baseline_medians() {
    // T9 — a non-positive baseline median poisons the percentage math; it must
    // be excluded AND counted loudly, not gated on.
    let dir = scratch("regress-badmedian");
    let crit = dir.join("criterion");
    write_estimate(&crit, "grp/alpha", 1000.0, 990.0, 1010.0);
    let baseline = make_baseline(
        &dir,
        "badmed",
        &[
            ("grp/alpha", 1000.0, 990.0, 1010.0),
            ("grp/broken", -50.0, -60.0, -40.0),
        ],
    );
    let out = run(&[
        "regress",
        "--criterion-dir",
        crit.to_str().unwrap(),
        "--baseline",
        baseline.to_str().unwrap(),
    ]);
    assert!(
        out.status.success(),
        "valid overlap passes despite excluded entry; stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let err = String::from_utf8_lossy(&out.stderr);
    assert!(
        err.contains("non-positive or non-finite"),
        "exclusion must be loud, stderr: {err}"
    );
}

#[test]
fn regress_rejects_determinism_suite_baseline() {
    let dir = scratch("regress-wrongschema");
    let crit = dir.join("criterion");
    write_estimate(&crit, "grp/alpha", 1300.0, 1290.0, 1310.0);
    // The exact shape of the misfiled .wasm4pm/benchmarks/regression-*.json files.
    let baseline = dir.join("baseline.json");
    let det = serde_json::json!({
        "schema_version": "1.0",
        "timestamp_unix": 1786130575,
        "total_vectors": 25,
        "overall_status": "PASS",
        "vectors": [{"id": "guard-01", "pass": true}],
    });
    fs::write(&baseline, serde_json::to_string_pretty(&det).unwrap()).unwrap();
    let out = run(&[
        "regress",
        "--criterion-dir",
        crit.to_str().unwrap(),
        "--baseline",
        baseline.to_str().unwrap(),
    ]);
    assert_eq!(
        out.status.code(),
        Some(1),
        "determinism-suite JSON as baseline → exit 1, not a vacuous pass"
    );
    let err = String::from_utf8_lossy(&out.stderr);
    assert!(err.contains("UNUSABLE BASELINE"), "stderr: {err}");
}

#[test]
fn regress_rejects_zero_overlap_baseline() {
    let dir = scratch("regress-nooverlap");
    let crit = dir.join("criterion");
    write_estimate(&crit, "grp/alpha", 1300.0, 1290.0, 1310.0);
    // Valid receipt minted through the real path, but no bench id in common
    // with the current run.
    let baseline = make_baseline(&dir, "noov", &[("other/entirely", 1000.0, 990.0, 1010.0)]);
    let out = run(&[
        "regress",
        "--criterion-dir",
        crit.to_str().unwrap(),
        "--baseline",
        baseline.to_str().unwrap(),
    ]);
    assert_eq!(out.status.code(), Some(1), "0 benches compared → exit 1");
    let err = String::from_utf8_lossy(&out.stderr);
    assert!(err.contains("UNUSABLE BASELINE"), "stderr: {err}");
}

#[test]
fn budget_rejects_empty_override_key() {
    // T6 — an empty override key is a config error (under substring matching it
    // used to silently match EVERY bench): exit 2, not a partial gate.
    let dir = scratch("budget-emptykey");
    let crit = dir.join("criterion");
    write_estimate(&crit, "calibration/anchor", 1000.0, 990.0, 1010.0);
    write_estimate(&crit, "breed_latency/mycin", 10.0, 9.0, 11.0);
    let budgets = dir.join("budgets.json");
    fs::write(
        &budgets,
        serde_json::json!({"default_ratio": 15.0, "overrides": {"": 2.0}}).to_string(),
    )
    .unwrap();
    let out = run(&[
        "budget",
        "--criterion-dir",
        crit.to_str().unwrap(),
        "--budgets",
        budgets.to_str().unwrap(),
    ]);
    assert_eq!(out.status.code(), Some(2), "empty override key → exit 2");
    let err = String::from_utf8_lossy(&out.stderr);
    assert!(err.contains("BUDGETS INVALID"), "stderr: {err}");
}

#[test]
fn budget_path_boundary_override_does_not_capture_sibling_family() {
    // T5 — an override for `breed_latency` must not capture
    // `breed_latency_v2/wat` (substring matching used to). The sibling bench is
    // out of scope and unoverridden → skipped, budget passes for the family.
    let dir = scratch("budget-pathboundary");
    let crit = dir.join("criterion");
    write_estimate(&crit, "calibration/anchor", 1000.0, 990.0, 1010.0);
    // Ratio 100 — would breach a mis-captured 10× override for breed_latency.
    write_estimate(&crit, "breed_latency_v2/wat", 100_000.0, 99_000.0, 101_000.0);
    let budgets = dir.join("budgets.json");
    fs::write(
        &budgets,
        serde_json::json!({"default_ratio": 15.0, "default_ratio_scope": "breed_latency",
                           "overrides": {"breed_latency": 10.0}})
        .to_string(),
    )
    .unwrap();
    let out = run(&[
        "budget",
        "--criterion-dir",
        crit.to_str().unwrap(),
        "--budgets",
        budgets.to_str().unwrap(),
    ]);
    assert!(
        out.status.success(),
        "sibling family must not inherit breed_latency's override; stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

#[test]
fn budget_without_anchor_exits_three() {
    let dir = scratch("budget-noanchor");
    let crit = dir.join("criterion");
    write_estimate(&crit, "grp/alpha", 1000.0, 990.0, 1010.0);
    let budgets = dir.join("budgets.json");
    fs::write(
        &budgets,
        serde_json::json!({"default_ratio": 15.0, "overrides": {}}).to_string(),
    )
    .unwrap();
    let out = run(&[
        "budget",
        "--criterion-dir",
        crit.to_str().unwrap(),
        "--budgets",
        budgets.to_str().unwrap(),
    ]);
    assert_eq!(
        out.status.code(),
        Some(3),
        "no calibration anchor → exit 3 (skip), not a silent pass"
    );
    let err = String::from_utf8_lossy(&out.stderr);
    assert!(err.contains("SKIPPED"), "stderr: {err}");
}

#[test]
fn ledger_runs_against_repo_and_reports_anchor_status() {
    // T7 (integration half) — `ledger` on the real repo must either verify the
    // baseline's ledger anchor or warn once that the baseline predates
    // anchoring; either way a healthy chain exits 0. (The pure anchor rule is
    // unit-tested in main.rs; tests never mutate the repo's ledger/baseline.)
    let out = run(&["ledger"]);
    let err = String::from_utf8_lossy(&out.stderr);
    if out.status.success() {
        assert!(
            err.contains("predates ledger anchoring")
                || !err.contains("LEDGER ANCHOR BROKEN"),
            "successful ledger run must not report a broken anchor; stderr: {err}"
        );
    } else {
        // A missing ledger is a legitimate exit 1 state.
        assert!(
            err.contains("no ledger") || err.contains("INTEGRITY FAILED"),
            "unexpected ledger failure: {err}"
        );
    }
}

#[test]
fn usage_on_no_args_exits_two() {
    let out = run(&[]);
    assert_eq!(out.status.code(), Some(2), "no subcommand → usage exit 2");
}

// --------------------------------------------------------------------------- index

/// Build a synthetic workspace fixture: a crate with two REGISTERED bench
/// targets (one grounded on bench_data, one synthetic) and one auto-discovered
/// `benches/helpers.rs` module WITHOUT `fn main` (the exclusion class).
fn make_index_fixture(dir: &Path, tag: &str) -> PathBuf {
    let crate_dir = dir.join(format!("fixture-{tag}"));
    let benches = crate_dir.join("benches");
    fs::create_dir_all(&benches).unwrap();
    fs::write(
        crate_dir.join("Cargo.toml"),
        "[package]\n\
         name = \"bench-fixture\"\n\
         version = \"0.1.0\"\n\
         edition = \"2021\"\n\n\
         [[bench]]\n\
         name = \"alpha\"\n\
         path = \"benches/alpha.rs\"\n\
         harness = false\n\n\
         [[bench]]\n\
         name = \"beta\"\n\
         path = \"benches/beta.rs\"\n\
         harness = false\n",
    )
    .unwrap();
    fs::write(
        benches.join("alpha.rs"),
        "fn main() {\n\
         \x20   // grounded on real data; metric greps hit the literals below\n\
         \x20   use criterion::{Throughput, black_box};\n\
         \x20   let _x: Option<&str> = Some(\"bench_data/sepsis.xes\");\n\
         }\n",
    )
    .unwrap();
    fs::write(
        benches.join("beta.rs"),
        "fn main() {\n\
         \x20   // synthetic latency-only: neither criterion metric appears\n\
         }\n",
    )
    .unwrap();
    fs::write(
        benches.join("helpers.rs"),
        "// shared module with no entry point — cargo auto-discovers it as an empty bench\n",
    )
    .unwrap();
    crate_dir.join("Cargo.toml")
}

#[test]
fn index_emits_valid_json_matching_registered_bench_count() {
    let dir = scratch("index");
    let manifest = make_index_fixture(&dir, "count");
    let out_dir = dir.join("out");
    let out = run(&[
        "index",
        "--manifest",
        manifest.to_str().unwrap(),
        "--out-dir",
        out_dir.to_str().unwrap(),
    ]);
    assert!(
        out.status.success(),
        "index failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );

    let idx: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(out_dir.join("index.json")).unwrap())
            .expect("index.json is valid JSON");
    assert_eq!(idx["schema"], "wasm4pm.benchmark-index.v1");

    // Excluded: helpers.rs (auto-discovered, no fn main). Included: alpha, beta.
    let benches = idx["benches"].as_array().unwrap();
    assert_eq!(
        benches.len(),
        2,
        "2 registered benches expected (helpers excluded): {benches:?}"
    );
    assert_eq!(idx["bench_count"], 2);
    let names: Vec<&str> = benches
        .iter()
        .map(|b| b["name"].as_str().unwrap())
        .collect();
    assert!(names.contains(&"alpha") && names.contains(&"beta"));
    assert!(!names.contains(&"helpers"), "module-only bench excluded");

    let alpha = benches.iter().find(|b| b["name"] == "alpha").unwrap();
    assert_eq!(alpha["registered"], true);
    // the fixture mentions `criterion::Throughput` / `black_box` literally
    assert_eq!(alpha["uses_throughput"], true);
    assert_eq!(alpha["uses_black_box"], true);
    assert_eq!(alpha["datasets"], serde_json::json!(["bench_data/"]));
    let beta = benches.iter().find(|b| b["name"] == "beta").unwrap();
    assert_eq!(beta["datasets"], serde_json::json!([]));
}

#[test]
fn index_is_deterministic_across_double_run() {
    let dir = scratch("index-det");
    let manifest = make_index_fixture(&dir, "det");
    let out_dir = dir.join("out");
    fs::create_dir_all(&out_dir).unwrap();
    // Pre-seed the coverage doc so the table-regeneration path is exercised.
    fs::write(
        out_dir.join("COVERAGE.md"),
        "<!-- wasm4pm-doc-status: active -->\n\n# Benchmark Coverage\n\n## Per-bench inventory\n\n| Bench | Metric | Real data | Notes |\n|-------|--------|-----------|-------|\n| stale-hand-row | TP | synthetic | hand-written |\n\n## Remaining gaps\n\n1. gap\n",
    )
    .unwrap();
    for _ in 0..2 {
        let out = run(&[
            "index",
            "--manifest",
            manifest.to_str().unwrap(),
            "--out-dir",
            out_dir.to_str().unwrap(),
        ]);
        assert!(out.status.success());
    }
    let idx: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(out_dir.join("index.json")).unwrap()).unwrap();
    // The `benches` array (and its order) must be byte-stable across runs;
    // `generated_at` is wall-clock and legitimately differs.
    let benches = serde_json::to_string_pretty(&idx["benches"]).unwrap();
    assert_eq!(
        benches,
        serde_json::to_string_pretty(&serde_json::json!([
            {"name": "alpha", "crate": "bench-fixture", "registered": true,
             "path": "benches/alpha.rs", "harness": false,
             "uses_throughput": true, "uses_black_box": true,
             "datasets": ["bench_data/"]},
            {"name": "beta", "crate": "bench-fixture", "registered": true,
             "path": "benches/beta.rs", "harness": false,
             "uses_throughput": false, "uses_black_box": false,
             "datasets": []},
        ]))
        .unwrap()
    );
    // The COVERAGE.md inventory table is regenerated under its existing heading.
    let cov = fs::read_to_string(out_dir.join("COVERAGE.md")).unwrap();
    assert!(cov.contains("## Per-bench inventory"));
    assert!(cov.contains("GENERATED by `bench-tools index`"));
}
