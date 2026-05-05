use anyhow::Context;
use colored::*;
use dialoguer::{theme::ColorfulTheme, Input, Select};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Serialize, Deserialize, Debug)]
pub struct ProjectConfig {
    pub name: String,
    pub author: String,
    pub license: String,
    pub profile: String,
}

pub fn run() -> anyhow::Result<()> {
    println!("{}", "Welcome to the wasm4pm (wpm) project wizard!".bold().cyan());
    println!("This will help you set up your process mining project metadata.\n");

    let theme = ColorfulTheme::default();

    let name: String = Input::with_theme(&theme)
        .with_prompt("Project Name")
        .interact_text()?;

    let author: String = Input::with_theme(&theme)
        .with_prompt("Author")
        .interact_text()?;

    let license: String = Input::with_theme(&theme)
        .with_prompt("License")
        .default("MIT".into())
        .interact_text()?;

    let profiles = vec!["mobile", "iot", "edge", "fog", "browser"];
    let profile_idx = Select::with_theme(&theme)
        .with_prompt("Deployment Profile")
        .items(&profiles)
        .default(0)
        .interact()?;

    let profile = profiles[profile_idx].to_string();

    let config = ProjectConfig {
        name,
        author,
        license,
        profile,
    };

    save_config(&config)?;

    println!("\n{}", "Success! Your project is ready.".bold().green());
    println!("{}", "Walkthrough:".bold());
    println!(
        "1. Your configuration is saved in {}",
        ".wasm4pm/config.json".yellow()
    );
    println!(
        "2. You can now use {} to check your system health.",
        "wpm doctor".cyan()
    );
    println!(
        "3. Use {} to manage your process mining tasks.",
        "wpm telco".cyan()
    );

    Ok(())
}

fn save_config(config: &ProjectConfig) -> anyhow::Result<()> {
    let dot_wasm4pm = Path::new(".wasm4pm");
    if !dot_wasm4pm.exists() {
        fs::create_dir_all(dot_wasm4pm).context("Failed to create .wasm4pm directory")?;
    }

    let config_path = dot_wasm4pm.join("config.json");
    let content = serde_json::to_string_pretty(config).context("Failed to serialize config")?;
    fs::write(config_path, content).context("Failed to write config.json")?;

    Ok(())
}
