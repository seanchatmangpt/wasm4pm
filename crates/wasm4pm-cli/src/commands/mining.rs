use anyhow::{Context, Result};
use clap::{Args, Subcommand};
use colored::Colorize;
use std::fs;
use std::io::BufReader;
use std::path::PathBuf;
use wasm4pm::discovery::discover_ocel_dfg_pure;
use wasm4pm::models::OCEL;
use wasm4pm_cli::io::{Io, Table};
use wasm4pm_compat::event_log::EventLog;
use wasm4pm_compat::import::xes::{import_xes, XESImportOptions};
use wasm4pm_compat::models::DFG;

use crate::commands::aco_bridge::discover_aco_real;
use crate::commands::conformance_bridge::check_conformance_real;
use crate::commands::genetic_bridge::discover_genetic_real;
use crate::commands::heuristic_bridge::discover_heuristic_real;
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
        /// Algorithm to use: heuristic, inductive, ocel_dfg, ilp, genetic,
        /// aco, pso, ocdfg. heuristic/ocel_dfg print a DFG; inductive prints
        /// a process tree; ilp prints a Petri net + fitness/precision;
        /// genetic/aco/pso print an evolved DFG + fitness; ocdfg prints one
        /// DFG per object type (OCEL input only).
        #[arg(long, default_value = "heuristic")]
        algo: String,
        /// Activity key to use (e.g. "concept:name")
        #[arg(short = 'k', long, default_value = "concept:name")]
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

            if algo == "heuristic" {
                let dfg = discover_heuristic_real(&log, activity_key)
                    .context("Heuristic discovery failed")?;
                print_native_dfg(&dfg);
            } else if algo == "inductive" {
                let tree = discover_inductive(&log, activity_key)
                    .context("Inductive Miner discovery failed")?;
                println!(
                    "\n{}",
                    "Discovered Process Tree (Inductive Miner)"
                        .bold()
                        .bright_cyan()
                );
                println!("{tree:#?}");
            } else if algo == "ilp" {
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
            } else if algo == "genetic" {
                let (dfg, fitness) = discover_genetic_real(&log, activity_key)
                    .context("Genetic algorithm discovery failed")?;
                print_native_dfg(&dfg);
                println!("\nFinal fitness: {fitness:.4}");
            } else if algo == "aco" {
                let (dfg, fitness) = discover_aco_real(&log, activity_key)
                    .context("ACO discovery failed")?;
                print_native_dfg(&dfg);
                println!("\nFinal fitness: {fitness:.4}");
            } else if algo == "pso" {
                let (dfg, fitness) = discover_pso_real(&log, activity_key)
                    .context("PSO discovery failed")?;
                print_native_dfg(&dfg);
                println!("\nFinal fitness: {fitness:.4}");
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
/// `print_dfg` below handles instead.
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

