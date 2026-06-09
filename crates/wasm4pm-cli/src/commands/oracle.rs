use anyhow::Result;
use clap::Subcommand;

#[derive(Subcommand, Debug)]
pub enum OracleCommands {
    /// one-shot: classify all cases, print OracleReport, exit non-zero on AndonPull
    Check {
        /// The OCEL tape to verify
        tape: String,
        /// The law to verify against
        #[clap(long)]
        law: String,
        /// Output format (human or json)
        #[clap(short, long, default_value = "human")]
        format: String,
    },
    /// tail the tape; emit one EarlyStop JSON object per line per first-DEAD case
    Watch {
        /// The OCEL tape to watch
        tape: String,
        /// The law to verify against
        #[clap(long)]
        law: String,
    },
}

pub fn handle_oracle_command(command: &OracleCommands) -> Result<()> {
    match command {
        OracleCommands::Check { tape, law, format } => {
            // wasm4pm-algos removed; prefix conformance oracle not yet re-implemented
            anyhow::bail!(
                "Oracle check not available: prefix_conformance removed (tape={tape}, law={law}, format={format})"
            );
        }
        OracleCommands::Watch { tape, law } => {
            println!("Watching tape {} against law {}", tape, law);
        }
    }
    Ok(())
}
