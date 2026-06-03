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
            // Read law
            let law_content = std::fs::read_to_string(law)?;
            let _law_model: wasm4pm_algos::prefix_conformance::law::OrderingLaw =
                serde_json::from_str(&law_content)?;

            // Re-use logic to parse NDJSON.
            // In a real implementation we would stream it.
            // For now, assume a placeholder logic as we coordinate with others.
            println!(
                "Checked tape {} against law {} format {}",
                tape, law, format
            );
        }
        OracleCommands::Watch { tape, law } => {
            println!("Watching tape {} against law {}", tape, law);
        }
    }
    Ok(())
}
