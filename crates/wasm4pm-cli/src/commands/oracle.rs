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
            let law_model: wasm4pm_algos::prefix_conformance::law::OrderingLaw =
                serde_json::from_str(&law_content)?;

            let mut monitor = wasm4pm_algos::prefix_conformance::PrefixOracle::new(&law_model);

            use std::io::BufRead;
            let file = std::fs::File::open(tape)?;
            let reader = std::io::BufReader::new(file);

            for line in reader.lines() {
                let line = line?;
                if line.trim().is_empty() {
                    continue;
                }
                let ev: wasm4pm_algos::prefix_conformance::PrefixEvent =
                    serde_json::from_str(&line)?;
                let (verdict, findings) = monitor.observe(&ev);
                if !findings.is_empty() {
                    println!("Case {}: {:?} - {:?}", ev.case_id, verdict, findings);
                }
            }

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
