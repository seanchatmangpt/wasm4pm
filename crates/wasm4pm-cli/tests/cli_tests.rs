use assert_cmd::Command;
use predicates::prelude::*;
use std::fs;
use tempfile::tempdir;

#[test]
fn test_version() {
    let mut cmd = Command::cargo_bin("wpm").unwrap();
    cmd.arg("--version")
        .assert()
        .success()
        .stdout(predicate::str::contains("wpm"));
}

#[test]
fn test_doctor() {
    let mut cmd = Command::cargo_bin("wpm").unwrap();
    cmd.arg("doctor")
        .assert()
        .success()
        .stdout(predicate::str::contains("Running wpm doctor..."));
}

#[test]
fn test_telco_status() {
    let mut cmd = Command::cargo_bin("wpm").unwrap();
    cmd.arg("telco")
        .arg("status")
        .assert()
        .success()
        .stdout(predicate::str::contains(
            "--- WASM4PM TELCO ROUTER STATUS ---",
        ))
        .stdout(predicate::str::contains("Operational State:"));
}

#[test]
#[ignore] // dialoguer needs a TTY, difficult to test with assert_cmd
fn test_wizard() {
    let temp_dir = tempdir().unwrap();
    let mut cmd = Command::cargo_bin("wpm").unwrap();

    cmd.current_dir(temp_dir.path())
        .arg("wizard")
        .write_stdin("MyTestProject\nTester\n\n\n")
        .assert()
        .success()
        .stdout(predicate::str::contains("Success! Your project is ready."));

    let config_path = temp_dir.path().join(".wasm4pm").join("config.json");
    assert!(config_path.exists());

    let content = fs::read_to_string(config_path).expect("Failed to read config.json");
    assert!(content.contains("\"name\": \"MyTestProject\""));
}

#[test]
fn test_verbose_flag() {
    let mut cmd = Command::cargo_bin("wpm").unwrap();
    cmd.arg("--verbose")
        .arg("doctor")
        .assert()
        .success()
        .stdout(predicate::str::contains(
            "Checking system health in verbose mode...",
        ))
        .stdout(predicate::str::contains("Running wpm doctor..."));
}

/// Real fixture: `data/small-example.xes` (a hand-built small XES log already
/// used elsewhere in the repo for end-to-end algorithm validation).
fn small_example_xes() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../data/small-example.xes")
}

#[test]
fn test_mining_discover_heuristic() {
    let mut cmd = Command::cargo_bin("wpm").unwrap();
    cmd.arg("mining")
        .arg("discover")
        .arg(small_example_xes())
        .arg("--algo")
        .arg("heuristic")
        .assert()
        .success()
        .stdout(predicate::str::contains("Directly-Follows Graph"))
        .stdout(predicate::str::contains("Register client"));
}

#[test]
fn test_mining_discover_ilp_and_conformance_end_to_end() {
    let temp_dir = tempdir().unwrap();
    let model_path = temp_dir.path().join("model.pnml");

    // Discover a real Petri net via the ILP miner.
    let mut discover = Command::cargo_bin("wpm").unwrap();
    discover
        .arg("mining")
        .arg("discover")
        .arg(small_example_xes())
        .arg("--algo")
        .arg("ilp-petri-net")
        .arg("-o")
        .arg(&model_path)
        .assert()
        .success()
        .stdout(predicate::str::contains("Discovered Petri net"));

    assert!(model_path.exists(), "discover did not write a PNML model");
    let pnml = fs::read_to_string(&model_path).unwrap();
    assert!(pnml.contains("<pnml"), "output is not PNML: {pnml}");

    // Check real token-replay conformance of the same log against that model.
    let mut conformance = Command::cargo_bin("wpm").unwrap();
    let output = conformance
        .arg("mining")
        .arg("conformance")
        .arg(small_example_xes())
        .arg(&model_path)
        .assert()
        .success()
        .stdout(predicate::str::contains("Average fitness"))
        .get_output()
        .stdout
        .clone();
    let stdout = String::from_utf8(output).unwrap();

    // Extract the fitness value and assert it's a real number in [0, 1].
    let fitness_line = stdout
        .lines()
        .find(|l| l.contains("Average fitness"))
        .expect("fitness line present");
    let fitness: f64 = fitness_line
        .split_whitespace()
        .find_map(|tok| tok.trim_matches(|c: char| !c.is_ascii_digit() && c != '.').parse().ok())
        .expect("parseable fitness value");
    assert!(
        (0.0..=1.0).contains(&fitness),
        "fitness {fitness} out of [0,1]"
    );

    // Third quality dimension, checked the same way (real number, not a stub/absent row):
    // `wasm4pm::generalization::compute_quality` (Buijs et al. 2012), wired into this same
    // `conformance` command's table.
    let generalization_line = stdout
        .lines()
        .find(|l| l.contains("Generalization"))
        .expect("generalization row present in conformance output");
    let generalization: f64 = generalization_line
        .split_whitespace()
        .find_map(|tok| tok.trim_matches(|c: char| !c.is_ascii_digit() && c != '.').parse().ok())
        .expect("parseable generalization value");
    assert!(
        (0.0..=1.0).contains(&generalization),
        "generalization {generalization} out of [0,1]"
    );
}

/// A minimal `wasm4pm-compat::event_log::EventLog` JSON document with `n` traces,
/// each with the given (name, timestamp_ms) event sequence.
fn event_log_json(traces: &[Vec<(&str, i64)>]) -> String {
    let trace_jsons: Vec<String> = traces
        .iter()
        .map(|events| {
            let event_jsons: Vec<String> = events
                .iter()
                .map(|(name, ts)| {
                    format!(
                        r#"{{"attributes":[
                            {{"key":"concept:name","value":{{"type":"String","content":"{name}"}}}},
                            {{"key":"time:timestamp","value":{{"type":"Int","content":{ts}}}}}
                        ]}}"#
                    )
                })
                .collect();
            format!(
                r#"{{"attributes":[],"events":[{}]}}"#,
                event_jsons.join(",")
            )
        })
        .collect();
    format!(
        r#"{{"attributes":[],"traces":[{}],"extensions":null,"classifiers":null,"global_trace_attrs":null,"global_event_attrs":null}}"#,
        trace_jsons.join(",")
    )
}

#[test]
fn test_mining_drift_detects_real_vocabulary_shift() {
    let temp_dir = tempdir().unwrap();
    let log_path = temp_dir.path().join("drift_log.json");

    // 4 traces of X->Y->Z, then 4 traces of a fully disjoint P->Q->R --
    // window_size=1 gives non-overlapping single-trace windows, so the
    // vocabulary-shift boundary (trace 3 -> trace 4) must fire real
    // jaccard=1.0 / tv=1.0 drift.
    let mut traces: Vec<Vec<(&str, i64)>> = Vec::new();
    for _ in 0..4 {
        traces.push(vec![("X", 0), ("Y", 1), ("Z", 2)]);
    }
    for _ in 0..4 {
        traces.push(vec![("P", 0), ("Q", 1), ("R", 2)]);
    }
    fs::write(&log_path, event_log_json(&traces)).unwrap();

    let mut cmd = Command::cargo_bin("wpm").unwrap();
    let output = cmd
        .arg("mining")
        .arg("drift")
        .arg(&log_path)
        .arg("--window-size")
        .arg("1")
        .assert()
        .success()
        .stdout(predicate::str::contains("Drifts detected"))
        .get_output()
        .stdout
        .clone();
    let stdout = String::from_utf8(output).unwrap();

    assert!(
        stdout.contains("Drift points"),
        "expected at least one real drift point, got:\n{stdout}"
    );
    let distance_line = stdout
        .lines()
        .find(|l| l.trim_start().starts_with('4'))
        .expect("drift row for position 4 present");
    assert!(
        distance_line.contains("1.0000"),
        "expected jaccard/tv distance of 1.0000 for a fully disjoint vocabulary shift: {distance_line}"
    );
}

#[test]
fn test_mining_drift_ks_method_detects_a_real_regime_shift() {
    let temp_dir = tempdir().unwrap();
    let log_path = temp_dir.path().join("ks_drift_log.json");

    let mut traces: Vec<Vec<(&str, i64)>> = Vec::new();
    for _ in 0..8 {
        traces.push(vec![("A", 0), ("B", 1), ("C", 2)]);
    }
    for _ in 0..8 {
        traces.push(vec![
            ("X1", 0),
            ("X2", 1),
            ("X3", 2),
            ("X4", 3),
            ("X5", 4),
            ("X6", 5),
        ]);
    }
    fs::write(&log_path, event_log_json(&traces)).unwrap();

    let mut cmd = Command::cargo_bin("wpm").unwrap();
    let output = cmd
        .arg("mining")
        .arg("drift")
        .arg(&log_path)
        .arg("--method")
        .arg("ks-test")
        .arg("--window-size")
        .arg("8")
        .assert()
        .success()
        .stdout(predicate::str::contains("J-measure + KS-test"))
        .get_output()
        .stdout
        .clone();
    let stdout = String::from_utf8(output).unwrap();

    assert!(
        stdout.contains("Drift points"),
        "expected at least one real KS-flagged drift point, got:\n{stdout}"
    );
}

#[test]
fn test_mining_drift_unknown_method_is_refused() {
    let temp_dir = tempdir().unwrap();
    let log_path = temp_dir.path().join("drift_log_bad_method.json");
    fs::write(&log_path, event_log_json(&[vec![("A", 0), ("B", 1)]])).unwrap();

    let mut cmd = Command::cargo_bin("wpm").unwrap();
    cmd.arg("mining")
        .arg("drift")
        .arg(&log_path)
        .arg("--method")
        .arg("not-a-real-method")
        .assert()
        .failure()
        .stderr(predicate::str::contains("Unknown drift method"));
}

#[test]
fn test_mining_predict_duration_real_bucket_estimate() {
    let temp_dir = tempdir().unwrap();
    let log_path = temp_dir.path().join("duration_log.json");

    // Every trace: A(t=0) -> B(t=1000) -> C(t=3000). The gap from B to the
    // trace end is always exactly 2000ms, so the bucket estimate for prefix
    // "A,B" must be exactly 2000.00, not merely "some positive number".
    let mut traces: Vec<Vec<(&str, i64)>> = Vec::new();
    for i in 0..6 {
        let base = i * 100_000;
        traces.push(vec![("A", base), ("B", base + 1_000), ("C", base + 3_000)]);
    }
    fs::write(&log_path, event_log_json(&traces)).unwrap();

    let mut cmd = Command::cargo_bin("wpm").unwrap();
    let output = cmd
        .arg("mining")
        .arg("predict-duration")
        .arg(&log_path)
        .arg("--prefix")
        .arg("A,B")
        .assert()
        .success()
        .stdout(predicate::str::contains("Remaining-time prediction"))
        .get_output()
        .stdout
        .clone();
    let stdout = String::from_utf8(output).unwrap();

    assert!(
        stdout.contains("2000.00"),
        "expected a real predicted remaining time of exactly 2000.00ms: {stdout}"
    );
    // "bucket(B|2)" -- the `|` separator matches
    // wasm4pm::prediction_remaining_time::bucket_key's real format now that
    // this command calls the upstream native function directly, not the
    // CLI's former workaround reimplementation (which used a "," separator).
    assert!(
        stdout.contains("bucket(B|2)"),
        "expected the exact-bucket method to fire (not a fallback): {stdout}"
    );
}

#[test]
fn test_invalid_subcommand() {
    let mut cmd = Command::cargo_bin("wpm").unwrap();
    cmd.arg("invalid-command")
        .assert()
        .failure()
        .stderr(predicate::str::contains(
            "error: unrecognized subcommand 'invalid-command'",
        ));
}

const LAW_FIXTURE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../fixtures/real/ggen-oracle-law/living-loop-6link.law.json"
);

fn oracle_fixture(name: &str) -> String {
    format!(
        "{}/tests/fixtures/oracle/{name}",
        env!("CARGO_MANIFEST_DIR")
    )
}

#[test]
fn test_oracle_check_admits_lawful_tape() {
    let mut cmd = Command::cargo_bin("wpm").unwrap();
    cmd.arg("oracle")
        .arg("check")
        .arg(oracle_fixture("lawful-6link.ocel.jsonl"))
        .arg("--law")
        .arg(LAW_FIXTURE)
        .arg("--format")
        .arg("json")
        .assert()
        .success()
        .stdout(predicate::str::contains("\"Admitted\""));
}

#[test]
fn test_oracle_check_andon_pulls_on_receipt_before_gate() {
    let mut cmd = Command::cargo_bin("wpm").unwrap();
    cmd.arg("oracle")
        .arg("check")
        .arg(oracle_fixture("receipt-before-gate.ocel.jsonl"))
        .arg("--law")
        .arg(LAW_FIXTURE)
        .arg("--format")
        .arg("json")
        .assert()
        .failure()
        .stdout(predicate::str::contains("\"AndonPull\""))
        .stdout(predicate::str::contains("ReceiptBeforeGate"));
}

#[test]
fn test_oracle_watch_prints_early_stop_and_fails_on_dead_case() {
    let mut cmd = Command::cargo_bin("wpm").unwrap();
    cmd.arg("oracle")
        .arg("watch")
        .arg(oracle_fixture("receipt-before-gate.ocel.jsonl"))
        .arg("--law")
        .arg(LAW_FIXTURE)
        .assert()
        .failure()
        .stdout(predicate::str::contains("\"kind\":\"EarlyStop\""))
        .stdout(predicate::str::contains("\"ReceiptBeforeGate\""));
}

#[test]
fn test_oracle_watch_succeeds_on_lawful_tape() {
    let mut cmd = Command::cargo_bin("wpm").unwrap();
    cmd.arg("oracle")
        .arg("watch")
        .arg(oracle_fixture("lawful-6link.ocel.jsonl"))
        .arg("--law")
        .arg(LAW_FIXTURE)
        .assert()
        .success();
}
