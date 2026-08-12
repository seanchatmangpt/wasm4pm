use anyhow::{Context, Result};
use clap::{Args, Subcommand};
use colored::Colorize;
use std::fs;
use std::io::BufReader;
use std::path::PathBuf;
use std::collections::BTreeMap;
use wasm4pm::advanced_algorithms::discover_heuristic_miner_from_log;
use wasm4pm::conformance::token_replay_pure;
use wasm4pm::etconformance_precision::compute_precision;
use wasm4pm::generalization::compute_quality;
use wasm4pm::ilp_discovery::{compute_simplicity, discover_ilp_petri_net_from_log};
use wasm4pm::pnml_io::{from_pnml, to_pnml};
use wasm4pm::models::PetriNet;
use wasm4pm::prediction_drift::{detect_drift_ks_native, detect_drift_native, DriftReport, KsDriftReport};
use wasm4pm::prediction_remaining_time::{
    build_remaining_time_model_native, predict_case_duration_native, DurationPrediction,
};
use wasm4pm_cli::io::{Io, Table};
use wasm4pm_compat::event_log::EventLog;
use wasm4pm_compat::import::xes::{import_xes, XESImportOptions};
use wasm4pm::models::DFG;

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
        /// Algorithm to use: "ilp-petri-net" (Petri net, feeds `conformance`) or
        /// "heuristic" (plain DFG via the Heuristic Miner, Weijters & van der Aalst 2003)
        #[arg(long, default_value = "ilp-petri-net")]
        algo: String,
        /// Activity key to use (e.g. "concept:name")
        #[arg(short = 'k', long, default_value = "concept:name")]
        activity_key: String,
        /// Dependency threshold for the heuristic miner (edges below this are filtered
        /// out). Conventional default per Weijters et al. is 0.5. Ignored by ilp-petri-net.
        #[arg(long, default_value_t = 0.5)]
        dependency_threshold: f64,
        /// Write the discovered model to this file (.json for a DFG, .pnml for a Petri net)
        #[arg(short = 'o', long)]
        output: Option<PathBuf>,
    },
    /// Check conformance of an event log against a model.
    Conformance {
        /// Path to the event log file
        log: PathBuf,
        /// Path to the model file (.pnml — produced by `discover --algo ilp-petri-net`)
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

            let log = load_log(input)?;
            let wasm4pm_log: wasm4pm::models::EventLog = log.into();

            match algo.as_str() {
                "ilp-petri-net" => {
                    // Corrected 2026-08-12: fixed a real fitness/precision
                    // metric-swap defect at this call site; no simplicity
                    // was ever computed here despite compute_simplicity
                    // existing in the same crate.
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
                    let dfg = discover_heuristic_miner_from_log(
                        &wasm4pm_log,
                        activity_key,
                        *dependency_threshold,
                    );
                    print_dfg(&dfg, &io)?;
                    if let Some(path) = output {
                        let json = serde_json::to_string_pretty(&dfg)
                            .context("Failed to serialize DFG to JSON")?;
                        fs::write(path, json)
                            .with_context(|| format!("Failed to write DFG to {:?}", path))?;
                        io.info(format!("Wrote DFG (JSON) to {:?}", path));
                    }
                }
                other => anyhow::bail!(
                    "Algorithm '{}' not supported by this CLI build. Use 'ilp-petri-net' \
                     (feeds `conformance` directly) or 'heuristic' (plain DFG).",
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
                let mut dev_table = Table::new(vec!["Case", "Fitness", "Missing", "Remaining"]);
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
            let model = build_remaining_time_model_native(&wasm4pm_log, activity_key, timestamp_key)
                .map_err(|e| anyhow::anyhow!(e))?;
            let prediction = predict_case_duration_native(&model, &prefix_activities)
                .map_err(|e| anyhow::anyhow!(e))?;
            print_prediction_result(&prediction)?;
        }
    }
    Ok(())
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

fn print_petri_net(net: &PetriNet, simplicity: f64, fitness: f64, precision: f64, _io: &Io) -> Result<()> {
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
    table.add_row(vec!["Fitness (self)".to_string(), format!("{:.4}", fitness)]);
    table.add_row(vec!["Precision (self)".to_string(), format!("{:.4}", precision)]);
    table.print();
    Ok(())
}

fn print_drift_result(report: &DriftReport) -> Result<()> {
    println!("\n{}", "Concept drift detection".bold().bright_cyan());
    let mut table = Table::new(vec!["Metric", "Value"]);
    table.add_row(vec!["Window size".to_string(), report.window_size.to_string()]);
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
    println!("\n{}", "Concept drift detection (J-measure + KS-test)".bold().bright_cyan());
    let mut table = Table::new(vec!["Metric", "Value"]);
    table.add_row(vec!["Window size".to_string(), report.window_size.to_string()]);
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

fn print_dfg(dfg: &DFG, _io: &Io) -> Result<()> {
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
    Ok(())
}
