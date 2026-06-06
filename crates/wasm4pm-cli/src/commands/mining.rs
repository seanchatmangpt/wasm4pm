use anyhow::{Context, Result};
use clap::{Args, Subcommand};
use colored::Colorize;
use std::fs;
use std::io::BufReader;
use std::path::PathBuf;
use wasm4pm_algos::{conformance, heuristic};
use wasm4pm_cli::io::{Io, Table};
use wasm4pm_compat::legacy_event_log::EventLog;
use wasm4pm_compat::legacy_import::xes::{import_xes, XESImportOptions};
use wasm4pm_compat::legacy_models::DFG;

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
        /// Algorithm to use (heuristic, inductive)
        #[arg(short, long, default_value = "heuristic")]
        algo: String,
        /// Activity key to use (e.g. "concept:name")
        #[arg(short, long, default_value = "concept:name")]
        activity_key: String,
    },
    /// Check conformance of an event log against a model.
    Conformance {
        /// Path to the event log file
        log: PathBuf,
        /// Path to the model file (.dfg or .pnml)
        model: PathBuf,
        /// Activity key to use
        #[arg(short, long, default_value = "concept:name")]
        activity_key: String,
    },
}

pub fn run(args: &MiningArgs, verbose: bool) -> Result<()> {
    let io = Io::new(verbose);
    match &args.command {
        MiningCommands::Discover {
            input,
            algo,
            activity_key,
        } => {
            io.info(format!(
                "Discovering model from {:?} using {}...",
                input, algo
            ));

            let log = load_log(input)?;

            if algo == "heuristic" {
                let dfg = heuristic::discover_heuristic(&log, activity_key)
                    .context("Heuristic discovery failed")?;
                print_dfg(&dfg, &io)?;
            } else {
                anyhow::bail!("Algorithm '{}' not yet supported in CLI", algo);
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
            let log = load_log(log)?;
            let dfg = load_dfg_model(model)?;

            let result = conformance::check_conformance_token_replay(&log, &dfg, activity_key)
                .context("Token replay conformance check failed")?;

            let mut table = Table::new(vec!["Metric", "Value"]);
            table.add_row(vec![
                "Fitness".to_string(),
                format!("{:.4}", result.fitness),
            ]);
            table.add_row(vec![
                "Precision".to_string(),
                result
                    .precision
                    .map(|v| format!("{:.4}", v))
                    .unwrap_or_else(|| "N/A".to_string()),
            ]);
            table.print();
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

/// Load a process model (DFG) from a file.
/// Supports:
/// - `.json` — JSON-serialized DFG (wasm4pm native format)
/// - `.dfg.json` — same as .json
fn load_dfg_model(path: &PathBuf) -> Result<DFG> {
    let content = fs::read_to_string(path)
        .with_context(|| format!("Failed to read model file: {:?}", path))?;
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
    match ext {
        "json" => serde_json::from_str(&content)
            .with_context(|| format!("Failed to deserialize DFG from {:?}", path)),
        "pnml" => {
            anyhow::bail!("PNML model loading not yet supported in this CLI. Use a JSON DFG model.")
        }
        other => anyhow::bail!(
            "Unsupported model format '{}'. Supported: .json (DFG)",
            other
        ),
    }
}

fn print_dfg(dfg: &DFG, _io: &Io) -> Result<()> {
    let mut table = Table::new(vec!["Source", "Target", "Frequency"]);
    for edge in &dfg.edges {
        table.add_row(vec![
            edge.source.clone(),
            edge.target.clone(),
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
