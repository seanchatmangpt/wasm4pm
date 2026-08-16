use anyhow::{Context, Result};
use clap::{Args, Subcommand};
use colored::Colorize;
use std::collections::BTreeMap;
use std::fs;
use std::io::BufReader;
use std::path::PathBuf;
use wasm4pm::advanced_algorithms::discover_heuristic_miner_from_log;
use wasm4pm::conformance::token_replay_pure;
use wasm4pm::discovery::discover_ocel_dfg_pure;
use wasm4pm::etconformance_precision::compute_precision;
use wasm4pm::generalization::compute_quality;
use wasm4pm::ilp_discovery::{compute_simplicity, discover_ilp_petri_net_from_log};
use wasm4pm::models::PetriNet;
use wasm4pm::models::OCEL;
use wasm4pm::pnml_io::{from_pnml, to_pnml};
use wasm4pm::prediction_drift::{
    detect_drift_ks_native, detect_drift_native, DriftReport, KsDriftReport,
};
use wasm4pm::prediction_remaining_time::{
    build_remaining_time_model_native, predict_case_duration_native, DurationPrediction,
};
use wasm4pm_cli::io::{Io, Table};
use wasm4pm_compat::event_log::EventLog;
use wasm4pm_compat::import::xes::{import_xes, XESImportOptions};
use wasm4pm_compat::models::DFG;

use crate::commands::aco_bridge::discover_aco_real;
use crate::commands::conformance_bridge::check_conformance_real;
use crate::commands::genetic_bridge::discover_genetic_real;
use crate::commands::ilp_bridge::discover_ilp_real;
use crate::commands::inductive_bridge::discover_inductive;
use crate::commands::ocdfg_bridge::discover_ocdfg;
use crate::commands::ocel_envelope::parse_ocel_tolerant;
use crate::commands::pso_bridge::discover_pso_real;
use crate::commands::social_network_bridge::compute_social_network;

#[derive(Args, Debug)]
pub struct MiningArgs {
    #[command(subcommand)]
    pub command: MiningCommands,
}

#[derive(Subcommand, Debug)]
pub enum MiningCommands {
    /// Discover a process model from an event log.
    Discover {
        /// Path to the event log file (.xes or .json)
        input: PathBuf,
        /// Algorithm to use: "ilp-petri-net" (native Petri net miner, feeds
        /// `conformance` directly), "heuristic" (plain DFG via the Heuristic
        /// Miner, Weijters & van der Aalst 2003), "inductive" (process tree),
        /// "ocel_dfg"/"ocdfg" (OCEL input only), "ilp" (bridge-based ILP
        /// region discovery + fitness/precision), or "genetic"/"aco"/"pso"
        /// (evolved DFG + fitness).
        #[arg(long, default_value = "heuristic")]
        algo: String,
        /// Activity key to use (e.g. "concept:name")
        #[arg(short = 'k', long, default_value = "concept:name")]
        activity_key: String,
        /// Dependency threshold for the heuristic miner (edges below this are filtered
        /// out). Conventional default per Weijters et al. is 0.5. Ignored by all
        /// algorithms other than "heuristic".
        #[arg(long, default_value_t = 0.5)]
        dependency_threshold: f64,
        /// Write the discovered model to this file (.json for a DFG, .pnml for a Petri
        /// net). Only honored by the "heuristic" and "ilp-petri-net" algorithms.
        #[arg(short = 'o', long)]
        output: Option<PathBuf>,
    },
    /// Check conformance of an event log against a model.
    Conformance {
        /// Path to the event log file
        log: PathBuf,
        /// Path to the model file (.pnml — produced by `discover --algo ilp-petri-net`
        /// — or .json — a DFG produced by `discover --algo heuristic -o ...`)
        model: PathBuf,
        /// Activity key to use
        #[arg(short, long, default_value = "concept:name")]
        activity_key: String,
    },
    /// Detect concept drift. Two real, distinct methods -- see `--method`.
    Drift {
        /// Path to the event log file
        log: PathBuf,
        /// Activity key to use
        #[arg(short = 'k', long, default_value = "concept:name")]
        activity_key: String,
        /// Number of traces per comparison window
        #[arg(long, default_value_t = 5)]
        window_size: usize,
        /// Detection method: `jaccard-tv` (default) or `ks-test` (added
        /// 2026-08-12 -- Bose et al. 2011's actual Section 3 method).
        #[arg(long, default_value = "jaccard-tv")]
        method: String,
        /// Significance level for `--method ks-test`.
        #[arg(long, default_value_t = 0.05)]
        alpha: f64,
    },
    /// Predict remaining case duration for a given activity prefix (bucketed
    /// mean/median + Weibull survival model, van der Aalst/Schonenberg/Song 2011
    /// and Rogge-Solti/Weske 2013).
    PredictDuration {
        /// Path to the (completed-trace) event log to train the model on
        log: PathBuf,
        /// Comma-separated activity prefix of the running case, e.g. "A,B"
        #[arg(long)]
        prefix: String,
        /// Activity key to use
        #[arg(short = 'k', long, default_value = "concept:name")]
        activity_key: String,
        /// Event attribute key carrying each event's timestamp
        #[arg(long, default_value = "time:timestamp")]
        timestamp_key: String,
    },
    /// Compute handover-of-work social network centrality metrics.
    SocialNetwork {
        /// Path to the event log file (.xes or .json)
        input: PathBuf,
        /// Attribute key identifying the resource/originator of each event
        #[arg(short, long, default_value = "org:resource")]
        resource_key: String,
    },
}

pub fn run(args: &MiningArgs, verbose: bool) -> Result<()> {
    let io = Io::new(verbose);
    match &args.command {
        MiningCommands::Discover {
            input,
            algo,
            activity_key,
            dependency_threshold,
            output,
        } => {
            io.info(format!(
                "Discovering model from {:?} using {}...",
                input, algo
            ));

            if algo == "ocel_dfg" {
                let ocel = load_ocel(input)?;
                let dfg = discover_ocel_dfg_pure(&ocel);
                print_native_dfg(&dfg);
                return Ok(());
            }

            if algo == "ocdfg" {
                let ocel = load_ocel(input)?;
                let ocdfg = discover_ocdfg(&ocel).context("OC-DFG discovery failed")?;
                println!(
                    "\n{}",
                    "Discovered per-object-type DFGs (OC-DFG)"
                        .bold()
                        .bright_cyan()
                );
                for (object_type, dfg) in &ocdfg.dfgs {
                    println!("\n{}", object_type.clone().underline());
                    print_native_dfg(dfg);
                }
                return Ok(());
            }

            let log = load_log(input)?;

            match algo.as_str() {
                "ilp-petri-net" => {
                    // Corrected 2026-08-12: fixed a real fitness/precision
                    // metric-swap defect at this call site; no simplicity
                    // was ever computed here despite compute_simplicity
                    // existing in the same crate.
                    let wasm4pm_log: wasm4pm::models::EventLog = log.into();
                    let (net, fitness, precision) =
                        discover_ilp_petri_net_from_log(&wasm4pm_log, activity_key);
                    let simplicity =
                        compute_simplicity(net.places.len(), net.transitions.len(), net.arcs.len());
                    print_petri_net(&net, simplicity, fitness, precision, &io)?;
                    if let Some(path) = output {
                        fs::write(path, to_pnml(&net))
                            .with_context(|| format!("Failed to write Petri net to {:?}", path))?;
                        io.info(format!("Wrote Petri net (PNML) to {:?}", path));
                    }
                }
                "heuristic" => {
                    // Calls the native, configurable-threshold implementation
                    // directly (rather than `heuristic_bridge::discover_heuristic_real`,
                    // which hardcodes `DEFAULT_DEPENDENCY_THRESHOLD`) so
                    // `--dependency-threshold` stays load-bearing.
                    let wasm4pm_log: wasm4pm::models::EventLog = log.into();
                    let dfg = discover_heuristic_miner_from_log(
                        &wasm4pm_log,
                        activity_key,
                        *dependency_threshold,
                    );
                    print_native_dfg(&dfg);
                    if let Some(path) = output {
                        let json = serde_json::to_string_pretty(&dfg)
                            .context("Failed to serialize DFG to JSON")?;
                        fs::write(path, json)
                            .with_context(|| format!("Failed to write DFG to {:?}", path))?;
                        io.info(format!("Wrote DFG (JSON) to {:?}", path));
                    }
                }
                "inductive" => {
                    let tree = discover_inductive(&log, activity_key)
                        .context("Inductive Miner discovery failed")?;
                    println!(
                        "\n{}",
                        "Discovered Process Tree (Inductive Miner)"
                            .bold()
                            .bright_cyan()
                    );
                    println!("{tree:#?}");
                }
                "ilp" => {
                    let result = discover_ilp_real(&log, activity_key)
                        .context("ILP-inspired discovery failed")?;
                    println!(
                        "\n{}",
                        "Discovered Petri Net (ILP-inspired region discovery)"
                            .bold()
                            .bright_cyan()
                    );
                    println!("{:#?}", result.petri_net);
                    println!(
                        "\nFitness: {:.4}  Precision: {:.4}",
                        result.fitness, result.precision
                    );
                }
                "genetic" => {
                    let (dfg, fitness) = discover_genetic_real(&log, activity_key)
                        .context("Genetic algorithm discovery failed")?;
                    print_native_dfg(&dfg);
                    println!("\nFinal fitness: {fitness:.4}");
                }
                "aco" => {
                    let (dfg, fitness) = discover_aco_real(&log, activity_key)
                        .context("ACO discovery failed")?;
                    print_native_dfg(&dfg);
                    println!("\nFinal fitness: {fitness:.4}");
                }
                "pso" => {
                    let (dfg, fitness) = discover_pso_real(&log, activity_key)
                        .context("PSO discovery failed")?;
                    print_native_dfg(&dfg);
                    println!("\nFinal fitness: {fitness:.4}");
                }
                other => anyhow::bail!(
                    "Algorithm '{}' not supported by this CLI build. Use one of: \
                     'ilp-petri-net', 'heuristic', 'inductive', 'ocel_dfg', 'ocdfg', \
                     'ilp', 'genetic', 'aco', 'pso'.",
                    other
                ),
            }
        }
        MiningCommands::Conformance {
            log,
            model,
            activity_key,
        } => {
            io.info(format!(
                "Checking conformance of {:?} against {:?}...",
                log, model
            ));

            let ext = model.extension().and_then(|s| s.to_str()).unwrap_or("");
            match ext {
                "pnml" => {
                    let log: wasm4pm::models::EventLog = load_log(log)?.into();
                    let petri_net = load_petri_net_model(model)?;

                    let result = token_replay_pure(&log, &petri_net, activity_key);

                    // `_final_marking` is unused by `compute_precision` itself (see its own
                    // doc comment: states are keyed by activity-sequence prefix, not marking),
                    // so an empty placeholder is correct here, not a shortcut.
                    let empty_final_marking: BTreeMap<String, usize> = BTreeMap::new();
                    let precision = compute_precision(
                        &petri_net,
                        &petri_net.initial_marking,
                        &empty_final_marking,
                        &log,
                        activity_key,
                    );

                    // Third of the four van der Aalst / Buijs et al. (2012) quality dimensions
                    // wired into this CLI (fitness, precision, generalization -- simplicity is
                    // reported by `discover`, not `conformance`, since it's a property of the
                    // model alone). Deliberately the one canonical, documented implementation
                    // (`wasm4pm::generalization`) -- two other generalization-shaped functions
                    // exist elsewhere in this workspace (`simd_token_replay::overall_generalization`,
                    // `conformance_authority::ConformanceVerdicts.generalization`) and are
                    // intentionally left unwired here to avoid reporting three disagreeing
                    // "generalization" numbers from one command.
                    let quality = compute_quality(&petri_net, &log, activity_key)
                        .map_err(|e| anyhow::anyhow!("Failed to compute generalization: {:?}", e))?;

                    let mut table = Table::new(vec!["Metric", "Value"]);
                    table.add_row(vec![
                        "Average fitness".to_string(),
                        format!("{:.4}", result.avg_fitness),
                    ]);
                    table.add_row(vec![
                        "Precision".to_string(),
                        format!("{:.4}", precision.precision),
                    ]);
                    table.add_row(vec![
                        "Generalization".to_string(),
                        format!("{:.4}", quality.generalization),
                    ]);
                    table.add_row(vec![
                        "Conforming cases".to_string(),
                        format!("{} / {}", result.conforming_cases, result.total_cases),
                    ]);
                    table.print();

                    let deviating: Vec<_> = result
                        .case_fitness
                        .iter()
                        .filter(|c| !c.is_conforming)
                        .collect();
                    if !deviating.is_empty() {
                        println!("\n{}", "Deviations".bold().bright_yellow());
                        let mut dev_table =
                            Table::new(vec!["Case", "Fitness", "Missing", "Remaining"]);
                        for case in &deviating {
                            dev_table.add_row(vec![
                                case.case_id.clone(),
                                format!("{:.4}", case.trace_fitness),
                                case.tokens_missing.to_string(),
                                case.tokens_remaining.to_string(),
                            ]);
                            for dev in &case.deviations {
                                io.info(format!(
                                    "  case {} event #{} activity={} type={}",
                                    case.case_id, dev.event_index, dev.activity, dev.deviation_type
                                ));
                            }
                        }
                        dev_table.print();
                    }
                }
                "json" => {
                    let log = load_log(log)?;
                    let dfg = load_dfg_model(model)?;

                    let (fitness, precision) = check_conformance_real(&log, &dfg, activity_key)
                        .context("Token replay conformance check failed")?;

                    let mut table = Table::new(vec!["Metric", "Value"]);
                    table.add_row(vec!["Fitness".to_string(), format!("{fitness:.4}")]);
                    table.add_row(vec![
                        "Precision".to_string(),
                        precision
                            .map(|v| format!("{v:.4}"))
                            .unwrap_or_else(|| "N/A".to_string()),
                    ]);
                    table.print();
                }
                other => anyhow::bail!(
                    "Unsupported model format '{}'. Supported: .pnml (Petri net, from \
                     `discover --algo ilp-petri-net -o model.pnml`) or .json (DFG, from \
                     `discover --algo heuristic -o model.json`)",
                    other
                ),
            }
        }
        MiningCommands::Drift {
            log,
            activity_key,
            window_size,
            method,
            alpha,
        } => {
            io.info(format!(
                "Detecting concept drift in {:?} (window_size={}, method={})...",
                log, window_size, method
            ));
            let wasm4pm_log: wasm4pm::models::EventLog = load_log(log)?.into();

            match method.as_str() {
                "ks-test" => {
                    let report =
                        detect_drift_ks_native(&wasm4pm_log, activity_key, *window_size, *alpha);
                    print_ks_drift_result(&report)?;
                }
                "jaccard-tv" => {
                    let report = detect_drift_native(&wasm4pm_log, activity_key, *window_size);
                    print_drift_result(&report)?;
                }
                other => anyhow::bail!(
                    "Unknown drift method '{}'. Use 'jaccard-tv' (default) or 'ks-test'.",
                    other
                ),
            }
        }
        MiningCommands::PredictDuration {
            log,
            prefix,
            activity_key,
            timestamp_key,
        } => {
            io.info(format!(
                "Predicting remaining duration for prefix {:?} in {:?}...",
                prefix, log
            ));
            let wasm4pm_log: wasm4pm::models::EventLog = load_log(log)?.into();
            let prefix_activities: Vec<String> =
                prefix.split(',').map(|s| s.trim().to_string()).collect();
            anyhow::ensure!(
                !prefix_activities.is_empty() && prefix_activities.iter().any(|a| !a.is_empty()),
                "--prefix must contain at least one activity name"
            );

            // Same underlying constraint as `Drift` above:
            // `wasm4pm::prediction_remaining_time::{build_remaining_time_model,
            // predict_case_duration}` are `#[wasm_bindgen]`-only with a `JsValue`-wrapped
            // `Ok` payload, unreadable natively via `.as_string()`. Calls the real,
            // tested native functions (the full bucketed+Weibull model) directly instead.
            let model =
                build_remaining_time_model_native(&wasm4pm_log, activity_key, timestamp_key)
                    .map_err(|e| anyhow::anyhow!(e))?;
            let prediction = predict_case_duration_native(&model, &prefix_activities)
                .map_err(|e| anyhow::anyhow!(e))?;
            print_prediction_result(&prediction)?;
        }
        MiningCommands::SocialNetwork {
            input,
            resource_key,
        } => {
            io.info(format!(
                "Computing social network from {:?} (resource key {:?})...",
                input, resource_key
            ));
            let log = load_log(input)?;
            let metrics = compute_social_network(&log, resource_key)
                .context("Social network computation failed")?;

            println!(
                "\n{}",
                "Handover-of-Work Social Network Centrality"
                    .bold()
                    .bright_cyan()
            );
            let mut table = Table::new(vec!["Resource", "Degree", "Betweenness", "Closeness"]);
            let mut resources: Vec<&String> = metrics.degree.keys().collect();
            resources.sort();
            for resource in resources {
                table.add_row(vec![
                    resource.clone(),
                    format!("{:.4}", metrics.degree.get(resource).copied().unwrap_or(0.0)),
                    format!(
                        "{:.4}",
                        metrics.betweenness.get(resource).copied().unwrap_or(0.0)
                    ),
                    format!(
                        "{:.4}",
                        metrics.closeness.get(resource).copied().unwrap_or(0.0)
                    ),
                ]);
            }
            table.print();
        }
    }
    Ok(())
}

/// Load a real OCEL 1.0/2.0 JSON log. Tries the native shape first
/// (`wasm4pm::models::OCEL`'s own serde aliases handle both 1.0 and 2.0 field
/// names at the root), then falls back to unwrapping common receipt/envelope
/// wrappers and `ocel:`-prefixed export keys via
/// [`crate::commands::ocel_envelope::parse_ocel_tolerant`] — the input format
/// `EventLog`'s own JSON deserializer rejects OCEL entirely, since it expects
/// wasm4pm's native XES-JSON shape instead.
fn load_ocel(path: &PathBuf) -> Result<OCEL> {
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
    if ext != "json" {
        anyhow::bail!("OCEL input must be a .json file, got '{}'", ext);
    }
    let content = fs::read_to_string(path)
        .with_context(|| format!("Failed to read log file: {:?}", path))?;
    parse_ocel_tolerant(&content)
}

/// Print a `wasm4pm::models::DFG` (native `from`/`to` edge shape) —
/// distinct from `wasm4pm_compat`'s `DFG` (`source`/`target`), which
/// `load_dfg_model`'s `.json` conformance path handles instead.
fn print_native_dfg(dfg: &wasm4pm::models::DFG) {
    let mut table = Table::new(vec!["Source", "Target", "Frequency"]);
    for edge in &dfg.edges {
        table.add_row(vec![
            edge.from.clone(),
            edge.to.clone(),
            edge.frequency.to_string(),
        ]);
    }
    println!(
        "\n{}",
        "Discovered Directly-Follows Graph (DFG)"
            .bold()
            .bright_cyan()
    );
    table.print();
}

fn load_log(path: &PathBuf) -> Result<EventLog> {
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
    match ext {
        "json" => {
            let content = fs::read_to_string(path)
                .with_context(|| format!("Failed to read log file: {:?}", path))?;
            serde_json::from_str(&content).context("Failed to parse JSON event log")
        }
        "xes" => {
            let file = fs::File::open(path)
                .with_context(|| format!("Failed to open XES file: {:?}", path))?;
            let reader = BufReader::new(file);
            import_xes(reader, XESImportOptions::default())
                .map_err(|e| anyhow::anyhow!("Failed to parse XES: {:?}", e))
        }
        other => anyhow::bail!("Unsupported log format '{}'. Supported: .xes, .json", other),
    }
}

/// Load a Petri net model (`.pnml`) for use with `conformance`.
fn load_petri_net_model(path: &PathBuf) -> Result<PetriNet> {
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
    match ext {
        "pnml" => {
            let content = fs::read_to_string(path)
                .with_context(|| format!("Failed to read model file: {:?}", path))?;
            from_pnml(&content)
                .map_err(|e| anyhow::anyhow!("Failed to parse PNML from {:?}: {}", path, e))
        }
        other => anyhow::bail!(
            "Unsupported model format '{}'. Supported: .pnml (Petri net, from \
             `discover --algo ilp-petri-net -o model.pnml`)",
            other
        ),
    }
}

/// Load a process model (DFG) from a file, for use with `conformance` against
/// a `discover --algo heuristic -o model.json` output.
fn load_dfg_model(path: &PathBuf) -> Result<DFG> {
    let content = fs::read_to_string(path)
        .with_context(|| format!("Failed to read model file: {:?}", path))?;
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
    match ext {
        "json" => serde_json::from_str(&content)
            .with_context(|| format!("Failed to deserialize DFG from {:?}", path)),
        other => anyhow::bail!(
            "Unsupported model format '{}'. Supported: .json (DFG)",
            other
        ),
    }
}

fn print_petri_net(
    net: &PetriNet,
    simplicity: f64,
    fitness: f64,
    precision: f64,
    _io: &Io,
) -> Result<()> {
    println!(
        "\n{}",
        "Discovered Petri net (ILP miner)".bold().bright_cyan()
    );
    let mut table = Table::new(vec!["Metric", "Value"]);
    table.add_row(vec!["Places".to_string(), net.places.len().to_string()]);
    table.add_row(vec![
        "Transitions".to_string(),
        net.transitions.len().to_string(),
    ]);
    table.add_row(vec!["Arcs".to_string(), net.arcs.len().to_string()]);
    table.add_row(vec!["Simplicity".to_string(), format!("{:.4}", simplicity)]);
    table.add_row(vec![
        "Fitness (self)".to_string(),
        format!("{:.4}", fitness),
    ]);
    table.add_row(vec![
        "Precision (self)".to_string(),
        format!("{:.4}", precision),
    ]);
    table.print();
    Ok(())
}

fn print_drift_result(report: &DriftReport) -> Result<()> {
    println!("\n{}", "Concept drift detection".bold().bright_cyan());
    let mut table = Table::new(vec!["Metric", "Value"]);
    table.add_row(vec![
        "Window size".to_string(),
        report.window_size.to_string(),
    ]);
    table.add_row(vec![
        "Drifts detected".to_string(),
        report.drifts_detected.to_string(),
    ]);
    table.print();

    if !report.drifts.is_empty() {
        println!("\n{}", "Drift points".bold().bright_yellow());
        let mut drift_table = Table::new(vec!["Position", "Distance", "TV Distance", "Method"]);
        for drift in &report.drifts {
            drift_table.add_row(vec![
                drift.position.to_string(),
                format!("{:.4}", drift.distance),
                format!("{:.4}", drift.tv_distance),
                drift.method.to_string(),
            ]);
        }
        drift_table.print();
    }
    Ok(())
}

/// Real print path for the KS-test drift method, added 2026-08-12.
fn print_ks_drift_result(report: &KsDriftReport) -> Result<()> {
    println!(
        "\n{}",
        "Concept drift detection (J-measure + KS-test)"
            .bold()
            .bright_cyan()
    );
    let mut table = Table::new(vec!["Metric", "Value"]);
    table.add_row(vec![
        "Window size".to_string(),
        report.window_size.to_string(),
    ]);
    table.add_row(vec!["Alpha".to_string(), format!("{:.4}", report.alpha)]);
    table.add_row(vec![
        "Drifts detected".to_string(),
        report.drifts_detected.to_string(),
    ]);
    table.print();

    if !report.drifts.is_empty() {
        println!("\n{}", "Drift points".bold().bright_yellow());
        let mut drift_table = Table::new(vec!["Position", "KS Statistic", "Critical Value"]);
        for drift in &report.drifts {
            drift_table.add_row(vec![
                drift.position.to_string(),
                format!("{:.4}", drift.ks_statistic),
                format!("{:.4}", drift.critical_value),
            ]);
        }
        drift_table.print();
    }
    Ok(())
}

fn print_prediction_result(prediction: &DurationPrediction) -> Result<()> {
    println!("\n{}", "Remaining-time prediction".bold().bright_cyan());
    let mut table = Table::new(vec!["Metric", "Value"]);
    table.add_row(vec![
        "Remaining (ms)".to_string(),
        format!("{:.2}", prediction.remaining_ms),
    ]);
    table.add_row(vec![
        "Confidence".to_string(),
        format!("{:.4}", prediction.confidence),
    ]);
    table.add_row(vec!["Method".to_string(), prediction.method.clone()]);
    table.print();
    Ok(())
}
