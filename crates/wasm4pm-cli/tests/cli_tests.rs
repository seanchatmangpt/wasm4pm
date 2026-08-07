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
