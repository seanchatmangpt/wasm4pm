
mod commands;

use clap::{CommandFactory, Parser, Subcommand};
use wasm4pm_cli::errors::Report;
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "wpm")]
#[command(
    author,
    version,
    about = "wasm4pm: High-performance process mining CLI",
    long_about = "wasm4pm (wpm) is a high-performance command-line interface for process mining, focusing on nanosecond-latency event routing and analysis. It is part of the Vision 2030 architecture for real-time process intelligence."
)]
#[command(propagate_version = true)]
struct Cli {
    /// Show verbose output
    #[arg(short, long, global = true)]
    verbose: bool,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Check the health of the system and dependencies.
    Doctor,
    /// Start the interactive project setup wizard.
    Wizard,
    /// Telco routing and nanosecond architecture management.
    Telco(commands::telco::TelcoArgs),
    /// Process mining operations (discover, conformance).
    Mining(commands::mining::MiningArgs),
    /// Manage CLI configuration.
    #[command(subcommand)]
    Config(commands::config::ConfigArgs),
    /// Run AutoProcess: Perception → Decision → Protection → Optimization.
    Autoprocess {
        /// Path to XES event log file
        input: PathBuf,
        /// Attribute key for activity names
        #[arg(short, long, default_value = "concept:name")]
        activity_key: String,
        /// AutoProcess configuration as a JSON object
        #[arg(long)]
        config: Option<String>,
        /// Output format (human, json)
        #[arg(short, long, default_value = "human")]
        format: String,
    },
    /// Manage autonomous RL agents.
    Agent(commands::agent::AgentArgs),
    /// Statistical Process Control (SPC) status and history.
    Spc(commands::spc::SpcArgs),
    /// Run a Vision 2030 conformance audit on an event log.
    Audit {
        /// Path to XES event log file
        input: PathBuf,
        /// Attribute key for activity names
        #[arg(short, long, default_value = "concept:name")]
        activity_key: String,
    },
    /// Generate markdown documentation for the CLI.
    Man,
    /// Forensics toolkit for receipt verification and adversarial audits.
    Receipt(commands::receipt::ReceiptArgs),
}

fn main() {
    if let Err(e) = try_main() {
        e.die();
    }
}

fn try_main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    match &cli.command {
        Commands::Doctor => commands::doctor::run(cli.verbose)?,
        Commands::Wizard => commands::wizard::run()?,
        Commands::Telco(args) => commands::telco::run(args)?,
        Commands::Mining(args) => commands::mining::run(args, cli.verbose)?,
        Commands::Config(args) => commands::config::run(args)?,
        Commands::Autoprocess {
            input,
            activity_key,
            config,
            format,
        } => {
            commands::autoprocess::run(
                input.clone(),
                activity_key.clone(),
                config.clone(),
                format.clone(),
            )?;
        }
        Commands::Agent(args) => commands::agent::run(args)?,
        Commands::Spc(args) => commands::spc::run(args)?,
        Commands::Audit {
            input,
            activity_key,
        } => {
            commands::audit::run(input.clone(), activity_key.clone())?;
        }
        Commands::Man => {
            generate_markdown()?;
        }
        Commands::Receipt(args) => {
            commands::receipt::run(args)?;
        }
    }

    Ok(())
}

fn generate_markdown() -> anyhow::Result<()> {
    let cmd = Cli::command();

    println!("# {} - Command Line Reference\n", cmd.get_name());
    if let Some(about) = cmd.get_about() {
        println!("{}\n", about);
    }

    if let Some(long_about) = cmd.get_long_about() {
        println!("{}\n", long_about);
    }

    println!("## Global Options\n");
    for arg in cmd.get_arguments() {
        if arg.is_global_set() {
            println!(
                "- `{}`: {}",
                arg.get_id(),
                arg.get_help().map(|h| h.to_string()).unwrap_or_default()
            );
        }
    }
    println!();

    println!("## Commands\n");
    for sub in cmd.get_subcommands() {
        println!("### `{}`\n", sub.get_name());
        if let Some(about) = sub.get_about() {
            println!("{}\n", about);
        }

        if sub.get_arguments().count() > 0 {
            println!("#### Arguments\n");
            for arg in sub.get_arguments() {
                let short = arg
                    .get_short()
                    .map(|s| format!("-{}", s))
                    .unwrap_or_default();
                let long = arg
                    .get_long()
                    .map(|l| format!("--{}", l))
                    .unwrap_or_default();
                let help = arg.get_help().map(|h| h.to_string()).unwrap_or_default();
                println!("- `{} {}`: {}\n", short, long, help);
            }
        }

        if sub.has_subcommands() {
            for subsub in sub.get_subcommands() {
                println!("#### `{}` Subcommand\n", subsub.get_name());
                if let Some(about) = subsub.get_about() {
                    println!("{}\n", about);
                }

                if subsub.get_arguments().count() > 0 {
                    for arg in subsub.get_arguments() {
                        let short = arg
                            .get_short()
                            .map(|s| format!("-{}", s))
                            .unwrap_or_default();
                        let long = arg
                            .get_long()
                            .map(|l| format!("--{}", l))
                            .unwrap_or_default();
                        let help = arg.get_help().map(|h| h.to_string()).unwrap_or_default();
                        println!("- `{} {}`: {}\n", short, long, help);
                    }
                }
            }
        }
    }

    Ok(())
}
