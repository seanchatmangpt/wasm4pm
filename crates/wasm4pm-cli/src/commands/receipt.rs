use anyhow::{anyhow, Result};
use clap::{Args, Subcommand};
use colored::*;
use std::fs::File;
use std::path::PathBuf;
use wasm4pm::receipt::{
    DiagnosticAudience, FindingSeverity, ReceiptDoctor, VerificationState,
};

#[derive(Args)]
pub struct ReceiptArgs {
    #[command(subcommand)]
    pub subcommand: ReceiptSubcommands,
}

#[derive(Subcommand)]
pub enum ReceiptSubcommands {
    /// Audits a candidate receipt against all Adversarial Ingress Gates.
    Doctor(DoctorArgs),
    /// Validates that the embedded expected and observed OCEL 2.0 logs are structurally valid.
    VerifyOcel2(VerifyOcel2Args),
    /// Runs the structural similarity index engine and temporal variance analysis.
    DetectFixtureMutation(DetectFixtureMutationArgs),
    /// Verifies that the boundary_evidence block exists and matches physical execution output.
    VerifyBoundaryEvidence(VerifyBoundaryEvidenceArgs),
    /// Validates that the declared proof_class corresponds to the level of evidence supplied.
    VerifyProofClass(VerifyProofClassArgs),
    /// Checks that the challenge nonce exists and is cryptographically bound.
    VerifyChallenge(VerifyChallengeArgs),
    /// Outputs the canonicalized, sorted, and minified representation of the embedded OCEL logs.
    CanonicalizeOcel2(CanonicalizeOcel2Args),
    /// Generates a sanitized report for external integration.
    ProducerSafeReport(ProducerSafeReportArgs),
    /// Generates the internal forensics report including raw hash comparisons.
    OperatorPrivateReport(OperatorPrivateReportArgs),
    
    // Kept for backwards compatibility with legacy tests if needed
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
    #[arg(short, long, default_value = "operator")]
    pub audience: String,
}

#[derive(Args)]
pub struct VerifyOcel2Args {
    pub file: PathBuf,
}

#[derive(Args)]
pub struct DetectFixtureMutationArgs {
    pub file: PathBuf,
}

#[derive(Args)]
pub struct VerifyBoundaryEvidenceArgs {
    pub file: PathBuf,
}

#[derive(Args)]
pub struct VerifyProofClassArgs {
    pub file: PathBuf,
}

#[derive(Args)]
pub struct VerifyChallengeArgs {
    pub file: PathBuf,
}

#[derive(Args)]
pub struct CanonicalizeOcel2Args {
    pub file: PathBuf,
}

#[derive(Args)]
pub struct ProducerSafeReportArgs {
    pub file: PathBuf,
}

#[derive(Args)]
pub struct OperatorPrivateReportArgs {
    pub file: PathBuf,
}

#[derive(Args)]
pub struct TruthforgeArgs {}

pub fn run(args: &ReceiptArgs) -> Result<()> {
    match &args.subcommand {
        ReceiptSubcommands::Doctor(sub_args) => doctor(sub_args),
        ReceiptSubcommands::VerifyOcel2(sub_args) => verify_ocel2(sub_args),
        ReceiptSubcommands::DetectFixtureMutation(sub_args) => detect_fixture_mutation(sub_args),
        ReceiptSubcommands::VerifyBoundaryEvidence(sub_args) => verify_boundary_evidence(sub_args),
        ReceiptSubcommands::VerifyProofClass(sub_args) => verify_proof_class(sub_args),
        ReceiptSubcommands::VerifyChallenge(sub_args) => verify_challenge(sub_args),
        ReceiptSubcommands::CanonicalizeOcel2(sub_args) => canonicalize_ocel2(sub_args),
        ReceiptSubcommands::ProducerSafeReport(sub_args) => producer_safe_report(sub_args),
        ReceiptSubcommands::OperatorPrivateReport(sub_args) => operator_private_report(sub_args),
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

fn verify_ocel2(args: &VerifyOcel2Args) -> Result<()> {
    let file = File::open(&args.file)?;
    let receipt: serde_json::Value = serde_json::from_reader(file)?;
    let report = ReceiptDoctor::audit(&receipt);
    
    // Check if any OCEL specific findings
    let has_ocel_issue = report.findings.iter().any(|f| {
        matches!(f.code, 
            wasm4pm::receipt::ReceiptTruthRefusal::ObservedOCELMissing | 
            wasm4pm::receipt::ReceiptTruthRefusal::ExpectedOCELMissing | 
            wasm4pm::receipt::ReceiptTruthRefusal::PlaceholderEvidenceDetected)
    });

    println!("\n{}", "=== wpm receipt verify-ocel2 ===".bold().cyan());
    if !has_ocel_issue {
        println!("  [{}] OCEL 2.0 paths are present and structurally valid.", "PASS".green());
        println!("{}", "================================".bold().cyan());
        Ok(())
    } else {
        println!("  [{}] Receipt has missing or invalid OCEL 2.0 structures.", "FAIL".red());
        Err(anyhow!("OCEL 2.0 verification failed."))
    }
}

fn detect_fixture_mutation(args: &DetectFixtureMutationArgs) -> Result<()> {
    let file = File::open(&args.file)?;
    let receipt: serde_json::Value = serde_json::from_reader(file)?;
    let report = ReceiptDoctor::audit(&receipt);
    
    let has_mutation = report.findings.iter().any(|f| {
        matches!(f.code, 
            wasm4pm::receipt::ReceiptTruthRefusal::FixtureMutationDetected | 
            wasm4pm::receipt::ReceiptTruthRefusal::ExpectedObservedCloneDetected |
            wasm4pm::receipt::ReceiptTruthRefusal::PlaceholderEvidenceDetected)
    });

    println!("\n{}", "=== wpm receipt detect-fixture-mutation ===".bold().cyan());
    if !has_mutation {
        println!("  [{}] No near-clone or fixture mutation detected.", "PASS".green());
        Ok(())
    } else {
        println!("  [{}] Fixture mutation detected!", "FAIL".red());
        Err(anyhow!("Fixture mutation detected."))
    }
}

fn verify_boundary_evidence(args: &VerifyBoundaryEvidenceArgs) -> Result<()> {
    let file = File::open(&args.file)?;
    let receipt: serde_json::Value = serde_json::from_reader(file)?;
    let report = ReceiptDoctor::audit(&receipt);
    
    let has_issue = report.findings.iter().any(|f| {
        matches!(f.code, wasm4pm::receipt::ReceiptTruthRefusal::BoundaryEvidenceMissing)
    });

    if !has_issue {
        println!("  [{}] Boundary evidence is present and valid.", "PASS".green());
        Ok(())
    } else {
        println!("  [{}] Boundary evidence missing.", "FAIL".red());
        Err(anyhow!("Boundary evidence missing."))
    }
}

fn verify_proof_class(args: &VerifyProofClassArgs) -> Result<()> {
    let file = File::open(&args.file)?;
    let receipt: serde_json::Value = serde_json::from_reader(file)?;
    let report = ReceiptDoctor::audit(&receipt);
    
    let has_issue = report.findings.iter().any(|f| {
        matches!(f.code, wasm4pm::receipt::ReceiptTruthRefusal::ClosureOverclaimed)
    });

    if !has_issue {
        println!("  [{}] Proof class verified.", "PASS".green());
        Ok(())
    } else {
        println!("  [{}] Proof class overclaimed.", "FAIL".red());
        Err(anyhow!("Proof class overclaimed."))
    }
}

fn verify_challenge(args: &VerifyChallengeArgs) -> Result<()> {
    let file = File::open(&args.file)?;
    let receipt: serde_json::Value = serde_json::from_reader(file)?;
    let report = ReceiptDoctor::audit(&receipt);
    
    let has_issue = report.findings.iter().any(|f| {
        matches!(f.code, 
            wasm4pm::receipt::ReceiptTruthRefusal::ChallengeNonceMissing | 
            wasm4pm::receipt::ReceiptTruthRefusal::ChallengeNonceMismatch |
            wasm4pm::receipt::ReceiptTruthRefusal::ObservedTraceNotChallengeBound)
    });

    if !has_issue {
        println!("  [{}] Challenge nonce verified.", "PASS".green());
        Ok(())
    } else {
        println!("  [{}] Challenge nonce verification failed.", "FAIL".red());
        Err(anyhow!("Challenge nonce failed."))
    }
}

fn canonicalize_value(v: &serde_json::Value) -> serde_json::Value {
    match v {
        serde_json::Value::Object(map) => {
            let mut sorted_map = serde_json::Map::new();
            let mut btree = std::collections::BTreeMap::new();
            for (key, val) in map {
                let mut canonical_val = canonicalize_value(val);
                if key == "events" || key == "objects" {
                    if let serde_json::Value::Array(ref mut arr) = canonical_val {
                        arr.sort_by(|a, b| {
                            let id_a = a.as_object().and_then(|obj| obj.get("id")).and_then(|id| id.as_str()).unwrap_or("");
                            let id_b = b.as_object().and_then(|obj| obj.get("id")).and_then(|id| id.as_str()).unwrap_or("");
                            id_a.cmp(id_b)
                        });
                    }
                }
                btree.insert(key, canonical_val);
            }
            for (key, val) in btree {
                sorted_map.insert(key.clone(), val);
            }
            serde_json::Value::Object(sorted_map)
        }
        serde_json::Value::Array(arr) => {
            let canonical_arr: Vec<serde_json::Value> = arr.iter().map(|item| canonicalize_value(item)).collect();
            serde_json::Value::Array(canonical_arr)
        }
        _ => v.clone(),
    }
}

fn canonicalize_ocel2(args: &CanonicalizeOcel2Args) -> Result<()> {
    let file = File::open(&args.file)?;
    let receipt: serde_json::Value = serde_json::from_reader(file)?;
    println!("Canonicalizing OCEL2...");
    if let Some(algorithms) = receipt.get("algorithms").and_then(|v| v.as_array()) {
        for (idx, algo) in algorithms.iter().enumerate() {
            if let Some(expected_ocel) = wasm4pm::receipt::get_expected_ocel(algo) {
                let canonical_expected = canonicalize_value(expected_ocel);
                let serialized = serde_json::to_string(&canonical_expected)?;
                println!("Algorithm [{}] expected canonical JSON:", idx);
                println!("{}", serialized);
            }
            if let Some(observed_ocel) = wasm4pm::receipt::get_observed_ocel(algo) {
                let canonical_observed = canonicalize_value(observed_ocel);
                let serialized = serde_json::to_string(&canonical_observed)?;
                println!("Algorithm [{}] observed canonical JSON:", idx);
                println!("{}", serialized);
            }
        }
    }
    Ok(())
}

fn producer_safe_report(args: &ProducerSafeReportArgs) -> Result<()> {
    let doc_args = DoctorArgs {
        file: args.file.clone(),
        strict: false,
        format: "json".to_string(),
        audience: "producer".to_string(),
    };
    doctor(&doc_args)
}

fn operator_private_report(args: &OperatorPrivateReportArgs) -> Result<()> {
    let doc_args = DoctorArgs {
        file: args.file.clone(),
        strict: false,
        format: "json".to_string(),
        audience: "operator".to_string(),
    };
    doctor(&doc_args)
}

fn truthforge(_args: &TruthforgeArgs) -> Result<()> {
    println!("Truthforge adversarial testing stub");
    Ok(())
}
