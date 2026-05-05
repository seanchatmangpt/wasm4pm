use anyhow::Result;
use clap::Subcommand;
use wasm4pm_cli::config::Config;

#[derive(Subcommand, Debug)]
pub enum ConfigArgs {
    /// Get a configuration value
    Get {
        /// The key to retrieve
        key: String,
    },
    /// Set a configuration value
    Set {
        /// The key to set
        key: String,
        /// The value to set
        value: String,
    },
}

pub fn run(args: &ConfigArgs) -> Result<()> {
    let mut config = Config::load()?;

    match args {
        ConfigArgs::Get { key } => {
            if let Some(value) = config.get(key) {
                println!("{}", value);
            } else {
                eprintln!("Key '{}' not found in configuration", key);
                std::process::exit(1);
            }
        }
        ConfigArgs::Set { key, value } => {
            config.set(key.clone(), value.clone());
            config.save()?;
            println!("Set {} = {}", key, value);
        }
    }

    Ok(())
}
