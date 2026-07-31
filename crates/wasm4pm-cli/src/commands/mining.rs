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
use crate::commands::evidence::emit_evidence;
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
        /// aco, pso, ocdfg.
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

fn operation_name(args: &MiningArgs) -> String {
    match &args.command {
        MiningCommands::Discover { algo, .. } => format!("mining.discover.{algo}"),
        MiningCommands::Conformance { .. } => "mining.conformance".to_string(),
        MiningCommands::SocialNetwork { .. } => "mining.social_network".to_string(),
    }
}

fn evidence_input(args: &MiningArgs) -> Vec<u8> {
    match &args.command {
        MiningCommands::Discover { input, .. } | MiningCommands::SocialNetwork { input, .. } => {
            fs::read(input).unwrap_or_else(|_| input.to_string_lossy().as_bytes().to_vec())
        }
        MiningCommands::Conformance { log, model, .. } => {
            let mut bytes = fs::read(log)
                .unwrap_or_else(|_| log.to_string_lossy().as_bytes().to_vec());
            bytes.push(0);
            bytes.extend(
                fs::read(model).unwrap_or_else(|_| model.to_string_lossy().as_bytes().to_vec()),
            );
            bytes
        }
    }
}

pub fn run(args: &MiningArgs, verbose: bool) -> Result<()> {
    let operation = operation_name(args);
    let input_bytes = evidence_input(args);

    match run_inner(args, verbose) {
        Ok(output_bytes) => {
            emit_evidence(&operation, &input_bytes, &output_bytes, "ok")?;
            Ok(())
        }
        Err(error) => {
            let error_text = format!("{error:#}");
            emit_evidence(&operation, &input_bytes, error_text.as_bytes(), "error")
                .context("failed to emit mining error evidence")?;
            Err(error)
        }
    }
}

fn run_inner(args: &MiningArgs, verbose: bool) -> Result<Vec<u8>> {
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
                return Ok(format!("{dfg:#?}").into_bytes());
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
                return Ok(format!("{ocdfg:#?}").into_bytes());
            }

            let log = load_log(input)?;

            if algo == "heuristic" {
                let dfg = discover_heuristic_real(&log, activity_key)
                    .context("Heuristic discovery failed")?;
                print_native_dfg(&dfg);
                Ok(format!("{dfg:#?}").into_bytes())
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
                Ok(format!("{tree:#?}").into_bytes())
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
                Ok(format!(
                    "petri_net={:#?}\nfitness={:.8}\nprecision={:.8}",
                    result.petri_net, result.fitness, result.precision
                )
                .into_bytes())
            } else if algo == "genetic" {
                let (dfg, fitness) = discover_genetic_real(&log, activity_key)
                    .context("Genetic algorithm discovery failed")?;
                print_native_dfg(&dfg);
                println!("\nFinal fitness: {fitness:.4}");
                Ok(format!("dfg={dfg:#?}\nfitness={fitness:.8}").into_bytes())
            } else if algo == "aco" {
                let (dfg, fitness) = discover_aco_real(&log, activity_key)
                    .context("ACO discovery failed")?;
                print_native_dfg(&dfg);
                println!("\nFinal fitness: {fitness:.4}");
                Ok(format!("dfg={dfg:#?}\nfitness={fitness:.8}").into_bytes())
            } else if algo == "pso" {
                let (dfg, fitness) = discover_pso_real(&log, activity_key)
                    .context("PSO discovery failed")?;
                print_native_dfg(&dfg);
                println!("\nFinal fitness: {fitness:.4}");
                Ok(format!("dfg={dfg:#?}\nfitness={fitness:.8}").into_bytes())
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
                    .map(|value| format!("{value:.4}"))
                    .unwrap_or_else(|| "N/A".to_string()),
            ]);
            table.print();
            Ok(format!("fitness={fitness:.8}\nprecision={precision:?}").into_bytes())
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

            let mut evidence_resources: Vec<_> = metrics.degree.keys().cloned().collect();
            evidence_resources.sort();
            let mut evidence = String::new();
            for resource in evidence_resources {
                evidence.push_str(&format!(
                    "{resource}:degree={:.8},betweenness={:.8},closeness={:.8}\n",
                    metrics.degree.get(&resource).copied().unwrap_or(0.0),
                    metrics.betweenness.get(&resource).copied().unwrap_or(0.0),
                    metrics.closeness.get(&resource).copied().unwrap_or(0.0),
                ));
            }
            Ok(evidence.into_bytes())
        }
    }
}

/// Load a real OCEL 1.0/2.0 JSON log.
fn load_ocel(path: &PathBuf) -> Result<OCEL> {
    let extension = path.extension().and_then(|value| value.to_str()).unwrap_or("");
    if extension != "json" {
        anyhow::bail!("OCEL input must be a .json file, got '{}'", extension);
    }
    let content = fs::read_to_string(path)
        .with_context(|| format!("Failed to read log file: {:?}", path))?;
    parse_ocel_tolerant(&content)
}

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
    let extension = path.extension().and_then(|value| value.to_str()).unwrap_or("");
    match extension {
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
                .map_err(|error| anyhow::anyhow!("Failed to parse XES: {:?}", error))
        }
        other => anyhow::bail!("Unsupported log format '{}'. Supported: .xes, .json", other),
    }
}

fn load_dfg_model(path: &PathBuf) -> Result<DFG> {
    let content = fs::read_to_string(path)
        .with_context(|| format!("Failed to read model file: {:?}", path))?;
    let extension = path.extension().and_then(|value| value.to_str()).unwrap_or("");
    match extension {
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
