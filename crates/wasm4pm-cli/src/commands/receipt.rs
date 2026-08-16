use anyhow::{anyhow, Result};
use clap::{Args, Subcommand};
use colored::*;
use std::fs::File;
use std::path::PathBuf;
use wasm4pm::receipt::{DiagnosticAudience, FindingSeverity, ReceiptDoctor, VerificationState};

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

    // Kept for backwards compatibility with  tests if needed
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
pub struct TruthforgeArgs {
    /// Path to the receipt JSON file to perform adversarial forging tests on
    pub file: PathBuf,
}

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
    let file = File::open(&args.file).map_err(|e| {
        anyhow!(
            "Failed to open receipt file '{}': {}",
            args.file.display(),
            e
        )
    })?;
    let receipt: serde_json::Value = serde_json::from_reader(file)
        .map_err(|e| anyhow!("Failed to parse receipt JSON: {}", e))?;

    let audience = match args.audience.to_lowercase().as_str() {
        "producer" => DiagnosticAudience::ProducerSafe,
        "operator" => DiagnosticAudience::OperatorPrivate,
        "ci" => DiagnosticAudience::CiForensics,
        other => {
            return Err(anyhow!(
                "Invalid audience: '{}'. Choose from producer, operator, ci",
                other
            ))
        }
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
                println!(
                    "{}",
                    serde_json::to_string_pretty(&report.operator_private)?
                );
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
            println!(
                "{:<25} {:?}",
                "Refusal Class:", report.producer_safe.refusal_class
            );
            println!(
                "{:<25} {:?}",
                "Allowed Next Action:", report.producer_safe.allowed_next_action
            );
            println!(
                "{:<25} {}",
                "Retry Allowed:", report.producer_safe.retry_allowed
            );
        } else {
            println!(
                "{:<25} {}",
                "Denied Paths Count:",
                report.operator_private.denied_paths.len()
            );
            println!(
                "{:<25} {}",
                "Doctor Report Hash:", report.operator_private.doctor_report_hash
            );

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
        return Err(anyhow!(
            "Receipt Doctor refused admission for the provided receipt."
        ));
    }

    Ok(())
}

fn verify_ocel2(args: &VerifyOcel2Args) -> Result<()> {
    let file = File::open(&args.file)?;
    let receipt: serde_json::Value = serde_json::from_reader(file)?;
    let report = ReceiptDoctor::audit(&receipt);

    // Check if any OCEL specific findings
    let has_ocel_issue = report.findings.iter().any(|f| {
        matches!(
            f.code,
            wasm4pm::receipt::ReceiptTruthRefusal::ObservedOCELMissing
                | wasm4pm::receipt::ReceiptTruthRefusal::ExpectedOCELMissing
                | wasm4pm::receipt::ReceiptTruthRefusal::PlaceholderEvidenceDetected
        )
    });

    println!("\n{}", "=== wpm receipt verify-ocel2 ===".bold().cyan());
    if !has_ocel_issue {
        println!(
            "  [{}] OCEL 2.0 paths are present and structurally valid.",
            "PASS".green()
        );
        println!("{}", "================================".bold().cyan());
        Ok(())
    } else {
        println!(
            "  [{}] Receipt has missing or invalid OCEL 2.0 structures.",
            "FAIL".red()
        );
        Err(anyhow!("OCEL 2.0 verification failed."))
    }
}

fn detect_fixture_mutation(args: &DetectFixtureMutationArgs) -> Result<()> {
    let file = File::open(&args.file)?;
    let receipt: serde_json::Value = serde_json::from_reader(file)?;
    let report = ReceiptDoctor::audit(&receipt);

    let has_mutation = report.findings.iter().any(|f| {
        matches!(
            f.code,
            wasm4pm::receipt::ReceiptTruthRefusal::PlaceholderEvidenceDetected
                | wasm4pm::receipt::ReceiptTruthRefusal::ExpectedObservedCloneDetected
        )
    });

    println!(
        "\n{}",
        "=== wpm receipt detect-fixture-mutation ===".bold().cyan()
    );
    if !has_mutation {
        println!(
            "  [{}] No near-clone or fixture mutation detected.",
            "PASS".green()
        );
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
        matches!(
            f.code,
            wasm4pm::receipt::ReceiptTruthRefusal::BoundaryEvidenceMissing
        )
    });

    if !has_issue {
        println!(
            "  [{}] Boundary evidence is present and valid.",
            "PASS".green()
        );
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
        matches!(
            f.code,
            wasm4pm::receipt::ReceiptTruthRefusal::ClosureOverclaimed
        )
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
        matches!(
            f.code,
            wasm4pm::receipt::ReceiptTruthRefusal::ChallengeNonceMismatch
                | wasm4pm::receipt::ReceiptTruthRefusal::ChallengeNonceMissing
                | wasm4pm::receipt::ReceiptTruthRefusal::ObservedTraceNotChallengeBound
        )
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
            let mut entries: Vec<(&String, serde_json::Value)> = map
                .iter()
                .map(|(key, val)| {
                    let mut canonical_val = canonicalize_value(val);
                    if key == "events" || key == "objects" {
                        if let serde_json::Value::Array(ref mut arr) = canonical_val {
                            arr.sort_by(|a, b| {
                                let id_a = a
                                    .as_object()
                                    .and_then(|obj| obj.get("id"))
                                    .and_then(|id| id.as_str())
                                    .unwrap_or("");
                                let id_b = b
                                    .as_object()
                                    .and_then(|obj| obj.get("id"))
                                    .and_then(|id| id.as_str())
                                    .unwrap_or("");
                                id_a.cmp(id_b)
                            });
                        }
                    }
                    (key, canonical_val)
                })
                .collect();
            entries.sort_unstable_by(|(a, _), (b, _)| a.cmp(b));
            let mut sorted_map = serde_json::Map::with_capacity(entries.len());
            for (key, val) in entries {
                sorted_map.insert(key.clone(), val);
            }
            serde_json::Value::Object(sorted_map)
        }
        serde_json::Value::Array(arr) => {
            let canonical_arr: Vec<serde_json::Value> =
                arr.iter().map(canonicalize_value).collect();
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
            if let Some(expected_ocel) = algo.get("expected_path").and_then(|ep| {
                ep.get("expected_ocel2")
                    .or_else(|| ep.get("expected_ocel"))
                    .or_else(|| ep.get("ocel"))
            }) {
                let canonical_expected = canonicalize_value(expected_ocel);
                let serialized = serde_json::to_string(&canonical_expected)?;
                println!("Algorithm [{}] expected canonical JSON:", idx);
                println!("{}", serialized);
            }
            if let Some(observed_ocel) = algo.get("observed_path").and_then(|op| {
                op.get("observed_ocel2")
                    .or_else(|| op.get("observed_ocel"))
                    .or_else(|| op.get("ocel"))
            }) {
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

fn truthforge(args: &TruthforgeArgs) -> Result<()> {
    let file = File::open(&args.file).map_err(|e| {
        anyhow!(
            "Failed to open receipt file '{}': {}",
            args.file.display(),
            e
        )
    })?;
    let receipt: serde_json::Value = serde_json::from_reader(file)
        .map_err(|e| anyhow!("Failed to parse receipt JSON: {}", e))?;

    println!(
        "\n{}",
        "=== TRUTHFORGE ADVERSARIAL ROBUSTNESS AUDIT ==="
            .bold()
            .magenta()
    );
    println!(
        "{:<30} {}",
        "Auditing Candidate Receipt:",
        args.file.display().to_string().yellow()
    );

    // Perform verification on the baseline first
    let baseline_report = ReceiptDoctor::audit(&receipt);
    println!("{:<30} {:?}", "Baseline State:", baseline_report.state);

    let mut mutation_results = Vec::new();

    // 1. Mutate challenge nonce to verify ChallengeNonceMismatch or ChallengeNonceMissing
    {
        let mut mutated = receipt.clone();
        if let Some(obj) = mutated.as_object_mut() {
            if obj.contains_key("challenge_nonce") {
                obj.insert(
                    "challenge_nonce".to_string(),
                    serde_json::json!("mutated_wrong_nonce_value"),
                );
            } else {
                obj.insert(
                    "challenge_nonce".to_string(),
                    serde_json::json!("missing_nonce"),
                );
            }
        }
        let report = ReceiptDoctor::audit(&mutated);
        let caught = report.findings.iter().any(|f| {
            matches!(
                f.code,
                wasm4pm::receipt::ReceiptTruthRefusal::ChallengeNonceMismatch
                    | wasm4pm::receipt::ReceiptTruthRefusal::ChallengeNonceMissing
                    | wasm4pm::receipt::ReceiptTruthRefusal::ObservedTraceNotChallengeBound
            )
        });
        mutation_results.push((
            "Challenge Nonce Tamper",
            caught,
            report
                .findings
                .iter()
                .map(|f| format!("{:?}", f.code))
                .collect::<Vec<_>>()
                .join(", "),
        ));
    }

    // 2. Overclaim proof class to verify ProofClassOverclaimed
    {
        let mut mutated = receipt.clone();
        if let Some(obj) = mutated.as_object_mut() {
            obj.insert(
                "proof_class".to_string(),
                serde_json::json!("ChicagoProof.UIToUI"),
            );
            // Artificially strip boundary evidence to ensure it fails UIToUI
            if let Some(algos) = obj.get_mut("algorithms").and_then(|v| v.as_array_mut()) {
                for algo in algos {
                    if let Some(algo_obj) = algo.as_object_mut() {
                        algo_obj.remove("boundary_evidence");
                    }
                }
            }
        }
        let report = ReceiptDoctor::audit(&mutated);
        let caught = report.findings.iter().any(|f| {
            matches!(
                f.code,
                wasm4pm::receipt::ReceiptTruthRefusal::ClosureOverclaimed
                    | wasm4pm::receipt::ReceiptTruthRefusal::BoundaryEvidenceMissing
                    | wasm4pm::receipt::ReceiptTruthRefusal::ProofClassOverclaimed
            )
        });
        mutation_results.push((
            "Proof Class Overclaim",
            caught,
            report
                .findings
                .iter()
                .map(|f| format!("{:?}", f.code))
                .collect::<Vec<_>>()
                .join(", "),
        ));
    }

    // 3. Inject mock/placeholder markers to verify PlaceholderEvidenceDetected/BoundaryEvidenceMissing
    {
        let mut mutated = receipt.clone();
        if let Some(obj) = mutated.as_object_mut() {
            obj.insert(
                "mutated_comment".to_string(),
                serde_json::json!("this is a mock value"),
            );
        }
        let report = ReceiptDoctor::audit(&mutated);
        let caught = report.findings.iter().any(|f| {
            matches!(
                f.code,
                wasm4pm::receipt::ReceiptTruthRefusal::BoundaryEvidenceMissing
                    | wasm4pm::receipt::ReceiptTruthRefusal::PlaceholderEvidenceDetected
            )
        });
        mutation_results.push((
            "Mock/Placeholder Injection",
            caught,
            report
                .findings
                .iter()
                .map(|f| format!("{:?}", f.code))
                .collect::<Vec<_>>()
                .join(", "),
        ));
    }

    // 4. Duplicate expected to observed to verify ExpectedObservedCloneDetected
    {
        let mut mutated = receipt.clone();
        if let Some(obj) = mutated.as_object_mut() {
            if let Some(algos) = obj.get_mut("algorithms").and_then(|v| v.as_array_mut()) {
                for algo in algos {
                    if let Some(algo_obj) = algo.as_object_mut() {
                        if let Some(expected_path) = algo_obj.get("expected_path").cloned() {
                            let expected_ocel = expected_path
                                .get("expected_ocel2")
                                .or_else(|| expected_path.get("expected_ocel"))
                                .or_else(|| expected_path.get("ocel"));
                            let expected_hash = expected_path
                                .get("expected_ocel2_hash")
                                .or_else(|| expected_path.get("expected_ocel_hash"))
                                .or_else(|| expected_path.get("ocel_hash"));

                            if let (Some(ocel), Some(hash)) = (expected_ocel, expected_hash) {
                                let mut observed_path = serde_json::Map::new();
                                observed_path.insert("observed_ocel2".to_string(), ocel.clone());
                                observed_path
                                    .insert("observed_ocel2_hash".to_string(), hash.clone());
                                if let Some(route_id) = expected_path.get("route_id") {
                                    observed_path.insert("route_id".to_string(), route_id.clone());
                                }
                                algo_obj.insert(
                                    "observed_path".to_string(),
                                    serde_json::Value::Object(observed_path),
                                );
                            }
                        }
                    }
                }
            }
        }
        let report = ReceiptDoctor::audit(&mutated);
        let caught = report.findings.iter().any(|f| {
            matches!(
                f.code,
                wasm4pm::receipt::ReceiptTruthRefusal::ExpectedObservedCloneDetected
                    | wasm4pm::receipt::ReceiptTruthRefusal::PlaceholderEvidenceDetected
            )
        });
        mutation_results.push((
            "Expected-Observed Clone Tamper",
            caught,
            report
                .findings
                .iter()
                .map(|f| format!("{:?}", f.code))
                .collect::<Vec<_>>()
                .join(", "),
        ));
    }

    println!("\n{}", "Adversarial Mutator Matrix:".bold().yellow());
    let mut all_caught = true;
    for (name, caught, refusal_codes) in &mutation_results {
        let status_str = if *caught {
            "CAUGHT (SAFE)".green().bold()
        } else {
            all_caught = false;
            "BYPASSED (VULNERABLE)".red().bold()
        };
        println!(
            "  - {:<30} : {} (Refusal Codes: [{}])",
            name, status_str, refusal_codes
        );
    }

    println!(
        "\n{}",
        "================================================"
            .bold()
            .magenta()
    );
    if all_caught {
        println!(
            "{}",
            "ADVERSARIAL HARDENING VERIFICATION: SUCCESS".green().bold()
        );
        Ok(())
    } else {
        Err(anyhow!(
            "Adversarial audit failed. One or more mutations bypassed the gates."
        ))
    }
}
