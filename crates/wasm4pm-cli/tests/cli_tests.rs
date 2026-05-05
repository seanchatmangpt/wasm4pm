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
