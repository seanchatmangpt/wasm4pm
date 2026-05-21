use anyhow::{anyhow, Result};
use clap::{Args, Subcommand};
use colored::*;
use serde_json::json;
use std::fs::File;
use std::path::PathBuf;
use wasm4pm::receipt::{
    DiagnosticAudience, FindingSeverity, OCELReceiptLinter, ReceiptDoctor, ReceiptDoctorState,
    SyntheticMarkerScanner, VerificationState,
};

#[derive(Args)]
pub struct ReceiptArgs {
    #[command(subcommand)]
    pub subcommand: ReceiptSubcommands,
}

#[derive(Subcommand)]
pub enum ReceiptSubcommands {
    /// Audit a receipt file using the Receipt Doctor.
    Doctor(DoctorArgs),
    /// Verify a receipt file (performs hash validation and preflight checks).
    Verify(VerifyArgs),
    /// Lint the embedded OCEL paths in a receipt.
    LintOcel(LintOcelArgs),
    /// Scan a receipt for synthetic or placeholder evidence markers.
    ScanSynthetic(ScanSyntheticArgs),
    /// Canonicalize the embedded OCEL log and compute its hashes.
    CanonicalizeOcel(CanonicalizeOcelArgs),
    /// Compare two path files (expected vs observed).
    DiffPath(DiffPathArgs),
    /// Run truthforge adversarial scenarios against fake receipts.
    Truthforge(TruthforgeArgs),
}

#[derive(Args)]
pub struct DoctorArgs {
    /// Path to the receipt JSON file
    pub file: PathBuf,
    /// Strict mode (fails if any warnings exist)
    #[arg(short, long)]
    pub strict: bool,
    /// Output format (human, json)
    #[arg(short, long, default_value = "human")]
    pub format: String,
    /// Diagnostic audience (producer, operator, ci)
    #[arg(short, long, default_value = "producer")]
    pub audience: String,
}

#[derive(Args)]
pub struct VerifyArgs {
    /// Path to the receipt JSON file
    pub file: PathBuf,
}

#[derive(Args)]
pub struct LintOcelArgs {
    /// Path to the receipt JSON file
    pub file: PathBuf,
}

#[derive(Args)]
pub struct ScanSyntheticArgs {
    /// Path to the receipt JSON file
    pub file: PathBuf,
}

#[derive(Args)]
pub struct CanonicalizeOcelArgs {
    /// Path to the receipt JSON file
    pub file: PathBuf,
}

#[derive(Args)]
pub struct DiffPathArgs {
    /// Expected path/OCEL/receipt file
    #[arg(long)]
    pub expected: PathBuf,
    /// Observed path/OCEL/receipt file
    #[arg(long)]
    pub observed: PathBuf,
}

#[derive(Args)]
pub struct TruthforgeArgs {}

pub fn run(args: &ReceiptArgs) -> Result<()> {
    match &args.subcommand {
        ReceiptSubcommands::Doctor(sub_args) => doctor(sub_args),
        ReceiptSubcommands::Verify(sub_args) => verify(sub_args),
        ReceiptSubcommands::LintOcel(sub_args) => lint_ocel(sub_args),
        ReceiptSubcommands::ScanSynthetic(sub_args) => scan_synthetic(sub_args),
        ReceiptSubcommands::CanonicalizeOcel(sub_args) => canonicalize_ocel(sub_args),
        ReceiptSubcommands::DiffPath(sub_args) => diff_path(sub_args),
        ReceiptSubcommands::Truthforge(sub_args) => truthforge(sub_args),
    }
}

fn doctor(args: &DoctorArgs) -> Result<()> {
    let file = File::open(&args.file)
        .map_err(|e| anyhow!("Failed to open receipt file '{}': {}", args.file.display(), e))?;
    let receipt: serde_json::Value = serde_json::from_reader(file)
        .map_err(|e| anyhow!("Failed to parse receipt JSON: {}", e))?;

    let audience = match args.audience.to_lowercase().as_str() {
        "producer" => DiagnosticAudience::ProducerSafe,
        "operator" => DiagnosticAudience::OperatorPrivate,
        "ci" => DiagnosticAudience::CiForensics,
        other => return Err(anyhow!("Invalid audience: '{}'. Choose from producer, operator, ci", other)),
    };

    let report = ReceiptDoctor::verify_with_audience(&receipt, audience);

    // If strict mode is enabled, evaluate if there are warnings or deny findings
    let has_findings = if args.strict {
        let doctor_report = ReceiptDoctor::audit(&receipt);
        !doctor_report.findings.is_empty()
    } else {
        report.state == VerificationState::Refused
    };

    if args.format.to_lowercase() == "json" {
        match audience {
            DiagnosticAudience::ProducerSafe => {
                println!("{}", serde_json::to_string_pretty(&report.producer_safe)?);
            }
            _ => {
                println!("{}", serde_json::to_string_pretty(&report.operator_private)?);
            }
        }
    } else {
        println!("\n{}", "=== RECEIPT DOCTOR AUDIT REPORT ===".bold().cyan());
        println!("{:<25} {}", "Audience Profile:", args.audience.yellow());
        match report.state {
            VerificationState::Admitted => {
                println!("{:<25} {}", "Admission Status:", "ADMITTED".green().bold());
            }
            VerificationState::Refused => {
                println!("{:<25} {}", "Admission Status:", "REFUSED".red().bold());
            }
        }

        if audience == DiagnosticAudience::ProducerSafe {
            println!("{:<25} {:?}", "Refusal Class:", report.producer_safe.refusal_class);
            println!("{:<25} {:?}", "Allowed Next Action:", report.producer_safe.allowed_next_action);
            println!("{:<25} {}", "Retry Allowed:", report.producer_safe.retry_allowed);
        } else {
            println!("{:<25} {}", "Denied Paths Count:", report.operator_private.denied_paths.len());
            println!("{:<25} {}", "Doctor Report Hash:", report.operator_private.doctor_report_hash);
            
            if !report.operator_private.findings.is_empty() {
                println!("\n{}", "Adversarial Findings:".bold().yellow());
                for finding in &report.operator_private.findings {
                    let sev_str = match finding.severity {
                        FindingSeverity::Deny => "DENY".red().bold(),
                        FindingSeverity::Warning => "WARN".yellow().bold(),
                    };
                    println!(
                        "  [{}] Code: {:?}\n       Path: {}\n       Message: {}",
                        sev_str, finding.code, finding.json_path, finding.message
                    );
                }
            }
        }
        println!("{}", "===================================".bold().cyan());
    }

    if has_findings {
        return Err(anyhow!("Receipt Doctor refused admission for the provided receipt."));
    }

    Ok(())
}

fn verify(args: &VerifyArgs) -> Result<()> {
    let file = File::open(&args.file)?;
    let receipt: serde_json::Value = serde_json::from_reader(file)?;
    let report = ReceiptDoctor::audit(&receipt);

    println!("\n{}", "=== wpm receipt verify ===".bold().cyan());
    if report.admitted {
        println!("  [{}] Receipt hashes and preflight checks match.", "PASS".green());
        println!("{}", "==========================".bold().cyan());
        Ok(())
    } else {
        println!("  [{}] Receipt has adversarial/verification failures.", "FAIL".red());
        for finding in &report.findings {
            if matches!(finding.severity, FindingSeverity::Deny) {
                println!("    - {:?}: {} ({})", finding.code, finding.message, finding.json_path);
            }
        }
        println!("{}", "==========================".bold().cyan());
        Err(anyhow!("Receipt verification failed."))
    }
}

fn lint_ocel(args: &LintOcelArgs) -> Result<()> {
    let file = File::open(&args.file)?;
    let receipt: serde_json::Value = serde_json::from_reader(file)?;
    let findings = OCELReceiptLinter::lint(&receipt);

    println!("\n{}", "=== wpm receipt lint-ocel ===".bold().cyan());
    if findings.is_empty() {
        println!("  [{}] OCEL paths are structurally valid.", "PASS".green());
        println!("{}", "=============================".bold().cyan());
        Ok(())
    } else {
        println!("  [{}] Found structural OCEL lint issues.", "FAIL".red());
        for finding in &findings {
            println!("    - {} ({})", finding.message, finding.json_path);
        }
        println!("{}", "=============================".bold().cyan());
        Err(anyhow!("OCEL lint failed."))
    }
}

fn scan_synthetic(args: &ScanSyntheticArgs) -> Result<()> {
    let file = File::open(&args.file)?;
    let receipt: serde_json::Value = serde_json::from_reader(file)?;
    
    let mut refusal_state_present = false;
    if let Some(algorithms) = receipt.get("algorithms").and_then(|v| v.as_array()) {
        for algo in algorithms {
            if let Some(alignment) = algo.get("alignment") {
                if !alignment.get("refusal_state").unwrap_or(&serde_json::Value::Null).is_null() {
                    refusal_state_present = true;
                }
            }
        }
    }

    let findings = SyntheticMarkerScanner::scan(&receipt, refusal_state_present);

    println!("\n{}", "=== wpm receipt scan-synthetic ===".bold().cyan());
    let denies = findings.iter().filter(|f| matches!(f.severity, FindingSeverity::Deny)).count();
    let warns = findings.iter().filter(|f| matches!(f.severity, FindingSeverity::Warning)).count();

    if denies == 0 && warns == 0 {
        println!("  [{}] No forbidden synthetic markers detected.", "PASS".green());
        println!("{}", "==================================".bold().cyan());
        Ok(())
    } else {
        println!("  [{}] Detected synthetic markers. Deny: {}, Warning: {}", "FAIL".red(), denies, warns);
        for finding in &findings {
            let sev = match finding.severity {
                FindingSeverity::Deny => "DENY".red(),
                FindingSeverity::Warning => "WARN".yellow(),
            };
            println!("    - [{}] {} ({})", sev, finding.message, finding.json_path);
        }
        println!("{}", "==================================".bold().cyan());
        if denies > 0 {
            Err(anyhow!("Synthetic markers check failed."))
        } else {
            Ok(())
        }
    }
}

fn canonicalize_ocel(args: &CanonicalizeOcelArgs) -> Result<()> {
    let file = File::open(&args.file)?;
    let receipt: serde_json::Value = serde_json::from_reader(file)?;

    println!("\n{}", "=== wpm receipt canonicalize-ocel ===".bold().cyan());
    let mut found = false;

    if let Some(algorithms) = receipt.get("algorithms").and_then(|v| v.as_array()) {
        for (idx, algo) in algorithms.iter().enumerate() {
            if let Some(ocel) = algo.get("observed_path").and_then(|op| op.get("ocel")) {
                found = true;
                let serialized = serde_json::to_string(ocel)?;
                println!("Algorithm [{}] observed_path.ocel minified canonical JSON:", idx);
                println!("{}", serialized);
                
                let blake3_computed = wasm4pm::receipt::compute_blake3_hash(&serialized);
                let sha256_computed = wasm4pm::receipt::compute_sha256_hash(&serialized);

                println!("  BLAKE3: {}", blake3_computed);
                println!("  SHA256: {}\n", sha256_computed);
            }
        }
    }

    if !found {
        println!("No observed_path.ocel logs found in the receipt.");
    }
    println!("{}", "=====================================".bold().cyan());
    Ok(())
}

fn diff_path(args: &DiffPathArgs) -> Result<()> {
    let expected_file = File::open(&args.expected)
        .map_err(|e| anyhow!("Failed to open expected file '{}': {}", args.expected.display(), e))?;
    let observed_file = File::open(&args.observed)
        .map_err(|e| anyhow!("Failed to open observed file '{}': {}", args.observed.display(), e))?;

    let expected_val: serde_json::Value = serde_json::from_reader(expected_file)?;
    let observed_val: serde_json::Value = serde_json::from_reader(observed_file)?;

    fn get_event_activities(v: &serde_json::Value) -> Vec<String> {
        // Try receipt format first
        if let Some(algos) = v.get("algorithms").and_then(|a| a.as_array()) {
            if let Some(first) = algos.first() {
                if let Some(ocel) = first.get("observed_path").and_then(|o| o.get("ocel")).or_else(|| first.get("expected_path").and_then(|e| e.get("ocel"))) {
                    if let Some(events) = ocel.get("events").and_then(|e| e.as_array()) {
                        return events.iter().filter_map(|e| e.get("activity").and_then(|a| a.as_str()).map(|s| s.to_string())).collect();
                    }
                }
            }
        }
        // Try direct OCEL format
        if let Some(events) = v.get("events").and_then(|e| e.as_array()) {
            return events.iter().filter_map(|e| e.get("activity").and_then(|a| a.as_str()).map(|s| s.to_string())).collect();
        }
        // Try array of events
        if let Some(arr) = v.as_array() {
            return arr.iter().filter_map(|e| e.get("activity").and_then(|a| a.as_str()).map(|s| s.to_string())).collect();
        }
        Vec::new()
    }

    let expected_seq = get_event_activities(&expected_val);
    let observed_seq = get_event_activities(&observed_val);

    println!("\n{}", "=== wpm receipt diff-path ===".bold().cyan());
    println!("{:<25} {:?}", "Expected Path Sequence:", expected_seq);
    println!("{:<25} {:?}", "Observed Path Sequence:", observed_seq);

    let mut matches = true;
    if expected_seq.len() != observed_seq.len() {
        matches = false;
        println!("\n{}", "Path length mismatch!".bold().red());
        println!("  Expected: {} events, Observed: {} events", expected_seq.len(), observed_seq.len());
    } else {
        for (i, (e, o)) in expected_seq.iter().zip(observed_seq.iter()).enumerate() {
            if e != o {
                matches = false;
                println!("\n{}", format!("Path deviation at step {}!", i).bold().red());
                println!("  Expected: {}", e);
                println!("  Observed: {}", o);
            }
        }
    }

    if matches {
        println!("\n{}", "Observed path aligns perfectly with expected path.".green());
        println!("{}", "=============================".bold().cyan());
        Ok(())
    } else {
        println!("{}", "=============================".bold().cyan());
        Err(anyhow!("Path sequences deviate! Alignment failed."))
    }
}

fn truthforge(_args: &TruthforgeArgs) -> Result<()> {
    println!("\n{}", "=== WASM4PM TRUTHFORGE ADVERSARIAL TESTING ===".bold().magenta());

    let mut passes = 0;
    let mut failures = 0;

    // Test 1: Refuses placeholder hashes
    let placeholder_hash_receipt = json!({
        "receipt_type": "Wasm4pmExecutionReceipt",
        "receipt_schema": "Wasm4pmExecutionReceipt.v1",
        "package": "wasm4pm",
        "version": "26.5.21",
        "commit": "2f65dc9dd706203462ef92bc4815f24bec61159f",
        "hash_algorithm": "BLAKE3",
        "input": {
            "event_log_hash": "3adbffc69f88c3c0c454262de8ee79e791993139acff50ffe7d2ad09950c19bb",
            "event_log_format": "xes",
            "activity_key": "concept:name"
        },
        "algorithms": [
            {
                "id": "dfg",
                "registry_present": true,
                "dispatched": true,
                "result_hash": "hash_placeholder",
                "duration_ms": 29.45,
                "expected_path": {
                    "route_id": "route1",
                    "expected_ocel_hash": "1cb17f11",
                    "required_events": ["wpm.input.import.started"]
                },
                "observed_path": {
                    "ocel": {
                        "schema": "schema1",
                        "events": [
                            {
                                "id": "evt1",
                                "activity": "wpm.input.import.started",
                                "timestamp": "2026-05-21T19:42:52.248Z",
                                "objects": []
                            }
                        ],
                        "objects": [
                            { "id": "log1", "type": "Log" }
                        ]
                    },
                    "observed_ocel_hash": "1cb17f11",
                    "observed_result_hash": "hash_placeholder"
                }
            }
        ],
        "receipt_hash": "placeholder_receipt_hash"
    });

    let r1 = ReceiptDoctor::audit(&placeholder_hash_receipt);
    if r1.state == ReceiptDoctorState::Refused {
        println!("  [{}] refuses_placeholder_hashes", "PASS".green());
        passes += 1;
    } else {
        println!("  [{}] refuses_placeholder_hashes", "FAIL".red());
        failures += 1;
    }

    // Test 2: Refuses default role & purpose
    let default_role_receipt = json!({
        "receipt_type": "Wasm4pmExecutionReceipt",
        "receipt_schema": "Wasm4pmExecutionReceipt.v1",
        "package": "wasm4pm",
        "version": "26.5.21",
        "commit": "2f65dc9dd706203462ef92bc4815f24bec61159f",
        "hash_algorithm": "BLAKE3",
        "input": {
            "event_log_hash": "3adbffc69f88c3c0c454262de8ee79e791993139acff50ffe7d2ad09950c19bb",
            "event_log_format": "xes",
            "activity_key": "concept:name"
        },
        "algorithms": [
            {
                "id": "dfg",
                "registry_present": true,
                "dispatched": true,
                "result_hash": "343a0b9e",
                "duration_ms": 29.45,
                "expected_path": {
                    "route_id": "route1",
                    "expected_ocel_hash": "1cb17f11",
                    "required_events": ["wpm.input.import.started"]
                },
                "observed_path": {
                    "ocel": {
                        "schema": "schema1",
                        "events": [
                            {
                                "id": "evt1",
                                "activity": "wpm.input.import.started",
                                "timestamp": "2026-05-21T19:42:52.248Z",
                                "objects": []
                            }
                        ],
                        "objects": [
                            { "id": "log1", "type": "Log" }
                        ]
                    },
                    "observed_ocel_hash": "1cb17f11",
                    "observed_result_hash": "343a0b9e",
                    "role8": "default_role",
                    "purpose8": "default_purpose"
                }
            }
        ]
    });

    let r2 = ReceiptDoctor::audit(&default_role_receipt);
    if r2.state == ReceiptDoctorState::Refused {
        println!("  [{}] refuses_default_role_and_purpose", "PASS".green());
        passes += 1;
    } else {
        println!("  [{}] refuses_default_role_and_purpose", "FAIL".red());
        failures += 1;
    }

    // Test 3: Refuses expected/observed clone
    let clone_receipt = json!({
        "receipt_type": "Wasm4pmExecutionReceipt",
        "receipt_schema": "Wasm4pmExecutionReceipt.v1",
        "package": "wasm4pm",
        "version": "26.5.21",
        "commit": "2f65dc9dd706203462ef92bc4815f24bec61159f",
        "hash_algorithm": "BLAKE3",
        "input": {
            "event_log_hash": "3adbffc69f88c3c0c454262de8ee79e791993139acff50ffe7d2ad09950c19bb",
            "event_log_format": "xes",
            "activity_key": "concept:name"
        },
        "algorithms": [
            {
                "id": "dfg",
                "registry_present": true,
                "dispatched": true,
                "result_hash": "343a0b9e",
                "duration_ms": 29.45,
                "expected_path": {
                    "route_id": "route1",
                    "expected_ocel_hash": "1cb17f1183c046e0447aaafcccc75c67741fbd346662fbe330ff9b5332d820e8",
                    "required_events": ["wpm.input.import.started"]
                },
                "observed_path": {
                    "ocel": {
                        "schema": "schema1",
                        "events": [
                            {
                                "id": "evt1",
                                "activity": "wpm.input.import.started",
                                "timestamp": "2026-05-21T19:42:52.248Z",
                                "objects": []
                            }
                        ],
                        "objects": [
                            { "id": "log1", "type": "Log" }
                        ]
                    },
                    "observed_ocel_hash": "1cb17f1183c046e0447aaafcccc75c67741fbd346662fbe330ff9b5332d820e8",
                    "observed_result_hash": "343a0b9e"
                }
            }
        ]
    });

    let r3 = ReceiptDoctor::audit(&clone_receipt);
    if r3.state == ReceiptDoctorState::Refused {
        println!("  [{}] refuses_expected_observed_clone", "PASS".green());
        passes += 1;
    } else {
        println!("  [{}] refuses_expected_observed_clone", "FAIL".red());
        failures += 1;
    }

    // Test 4: Refuses stdout-only or exit-code-only evidence
    let stdout_only_receipt = json!({
        "receipt_type": "Wasm4pmExecutionReceipt",
        "receipt_schema": "Wasm4pmExecutionReceipt.v1",
        "package": "wasm4pm",
        "version": "26.5.21",
        "commit": "2f65dc9dd706203462ef92bc4815f24bec61159f",
        "hash_algorithm": "BLAKE3",
        "input": {
            "event_log_hash": "3adbffc69f88c3c0c454262de8ee79e791993139acff50ffe7d2ad09950c19bb"
        },
        "algorithms": [
            {
                "id": "dfg",
                "registry_present": true,
                "dispatched": true,
                "expected_path": {
                    "route_id": "route1",
                    "expected_ocel_hash": "1cb17f11"
                },
                "observed_path": {
                    "ocel": {
                        "events": [],
                        "objects": []
                    },
                    "stdout": "task completed",
                    "exit_code": 0
                }
            }
        ]
    });

    let r4 = ReceiptDoctor::audit(&stdout_only_receipt);
    if r4.state == ReceiptDoctorState::Refused {
        println!("  [{}] refuses_stdout_only_evidence", "PASS".green());
        passes += 1;
    } else {
        println!("  [{}] refuses_stdout_only_evidence", "FAIL".red());
        failures += 1;
    }

    println!("\nTruthforge Summary: {} passed, {} failed.", passes, failures);
    println!("{}", "=================================================".bold().magenta());

    if failures > 0 {
        Err(anyhow!("Truthforge adversarial check suite failed!"))
    } else {
        Ok(())
    }
}
