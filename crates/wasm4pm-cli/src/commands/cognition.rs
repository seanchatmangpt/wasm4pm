//! `wpm cognition` — run and list the 55 registered cognitive breeds.
//!
//! Dispatches through the real `wasm4pm_cognition::breeds::dispatch_breed`
//! function: preconditions, run, postconditions, and OCEL conformance execute
//! before a successful operation receipt and OTEL span are admitted.

use crate::commands::evidence::emit_evidence;
use anyhow::{Context, Result};
use clap::Subcommand;
use serde_json::Value;
use std::path::PathBuf;
use wasm4pm_cognition::breeds::{dispatch_breed, BreedId, BreedInput};

#[derive(Subcommand, Debug)]
pub enum CognitionCommands {
    /// List all legally-admitted cognitive breeds (`BreedId::ALL`).
    List,
    /// Run one breed by name against a JSON `BreedInput` or paper-fixture envelope.
    Run {
        /// Breed name, e.g. "mycin" or "ltl_monitor" (case-insensitive).
        breed: String,
        /// Path to JSON carrying either BreedInput or `{ "input": BreedInput }`.
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

fn emit_error(operation: &str, input: &[u8], error: &str) -> Result<()> {
    emit_evidence(operation, input, error.as_bytes(), "error")?;
    Ok(())
}

fn run_breed_cmd(breed: &str, input_path: &PathBuf, format: &str) -> Result<()> {
    let normalized = breed.to_lowercase();
    let operation = format!("cognition.run.{normalized}");

    let id = match BreedId::ALL
        .iter()
        .copied()
        .find(|id| id.to_string() == normalized)
    {
        Some(id) => id,
        None => {
            let message = format!(
                "unknown or unadmitted breed '{}': not found in BreedId::ALL",
                breed
            );
            emit_error(&operation, breed.as_bytes(), &message)?;
            return Err(anyhow::anyhow!(message));
        }
    };

    let raw = match std::fs::read(input_path) {
        Ok(raw) => raw,
        Err(error) => {
            let message = format!("failed to read input file {}: {error}", input_path.display());
            emit_error(&operation, input_path.to_string_lossy().as_bytes(), &message)?;
            return Err(anyhow::anyhow!(message));
        }
    };

    let document: Value = match serde_json::from_slice(&raw) {
        Ok(document) => document,
        Err(error) => {
            let message = format!("failed to parse {} as JSON: {error}", input_path.display());
            emit_error(&operation, &raw, &message)?;
            return Err(anyhow::anyhow!(message));
        }
    };
    let input_value = document.get("input").unwrap_or(&document);
    let input: BreedInput = match serde_json::from_value(input_value.clone()) {
        Ok(input) => input,
        Err(error) => {
            let message = format!(
                "failed to parse {} input payload as BreedInput: {error}",
                input_path.display()
            );
            emit_error(&operation, &raw, &message)?;
            return Err(anyhow::anyhow!(message));
        }
    };

    let output = match dispatch_breed(&id.to_string(), &input) {
        Ok(output) => output,
        Err(error) => {
            let message = format!("breed '{}' failed: {}", id, error);
            emit_error(&operation, &raw, &message)?;
            return Err(anyhow::anyhow!(message));
        }
    };

    let output_bytes = serde_json::to_vec(&output).context("serialize BreedOutput for receipt")?;
    emit_evidence(&operation, &raw, &output_bytes, "ok")?;

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
