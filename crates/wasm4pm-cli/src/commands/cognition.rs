//! `wpm cognition` — run and list the 55 registered cognitive breeds.
//!
//! Dispatches through the real `wasm4pm_cognition::breeds::dispatch_breed`
//! function: the same public entry point exercised by
//! `crates/wasm4pm-cognition/tests/ocel_conformance.rs`. Preconditions,
//! `run()`, postconditions, and OCEL-conformance derivation all execute for
//! real; nothing here is mocked or stubbed.

use anyhow::{Context, Result};
use clap::Subcommand;
use std::path::PathBuf;
use wasm4pm_cognition::breeds::{dispatch_breed, BreedId, BreedInput};

#[derive(Subcommand, Debug)]
pub enum CognitionCommands {
    /// List all 55 legally-admitted cognitive breeds (BreedId::ALL).
    List,
    /// Run one breed by name against a JSON `BreedInput` fixture.
    Run {
        /// Breed name, e.g. "mycin" or "ltl_monitor" (case-insensitive).
        breed: String,
        /// Path to a JSON file deserializing into `BreedInput`.
        input: PathBuf,
        /// Output format: "json" (pretty BreedOutput) or "debug" ({:#?}).
        #[clap(short, long, default_value = "json")]
        format: String,
    },
}

pub fn handle_cognition_command(command: &CognitionCommands) -> Result<()> {
    match command {
        CognitionCommands::List => run_list(),
        CognitionCommands::Run {
            breed,
            input,
            format,
        } => run_breed_cmd(breed, input, format),
    }
}

fn run_list() -> Result<()> {
    println!("{} legally-admitted cognitive breeds:\n", BreedId::ALL.len());
    for id in BreedId::ALL {
        println!("  {}", id);
    }
    Ok(())
}

fn run_breed_cmd(breed: &str, input_path: &PathBuf, format: &str) -> Result<()> {
    // Case-insensitive match against the registered breed id strings.
    let normalized = breed.to_lowercase();
    let id = BreedId::ALL
        .iter()
        .copied()
        .find(|id| id.to_string() == normalized)
        .with_context(|| {
            format!(
                "unknown or unadmitted breed '{}': not found in BreedId::ALL (run `wpm cognition list`)",
                breed
            )
        })?;

    let raw = std::fs::read_to_string(input_path)
        .with_context(|| format!("failed to read input file: {}", input_path.display()))?;
    let input: BreedInput = serde_json::from_str(&raw)
        .with_context(|| format!("failed to parse {} as BreedInput JSON", input_path.display()))?;

    let output = dispatch_breed(&id.to_string(), &input)
        .map_err(|e| anyhow::anyhow!("breed '{}' failed: {}", id, e))?;

    match format {
        "debug" => println!("{:#?}", output),
        _ => {
            let pretty = serde_json::to_string_pretty(&output)
                .context("failed to serialize BreedOutput as JSON")?;
            println!("{}", pretty);
        }
    }

    Ok(())
}
