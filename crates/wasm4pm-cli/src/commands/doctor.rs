use colored::*;
use wasm4pm_cli::io::Io;
use std::path::Path;
use std::process::Command;

pub fn run(verbose: bool) -> anyhow::Result<()> {
    let io = Io::new(verbose);

    io.header("Running wpm doctor...");
    io.info("Checking system health in verbose mode...");

    let mut all_pass = true;

    // 1. Check for 'rustc' version
    match Command::new("rustc").arg("--version").output() {
        Ok(output) => {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            println!("  [{}] rustc: {}", "PASS".green(), version);
        }
        Err(_) => {
            println!("  [{}] rustc: Not found", "FAIL".red());
            all_pass = false;
        }
    }

    // 2. Check for 'wasm-pack' installation
    match Command::new("wasm-pack").arg("--version").output() {
        Ok(output) => {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            println!("  [{}] wasm-pack: {}", "PASS".green(), version);
        }
        Err(_) => {
            println!("  [{}] wasm-pack: Not found", "FAIL".red());
            all_pass = false;
        }
    }

    // 3. Verify directory structure (existence of 'Cargo.toml', 'src/')
    if Path::new("Cargo.toml").exists() {
        println!("  [{}] Cargo.toml found", "PASS".green());
    } else {
        println!("  [{}] Cargo.toml not found", "FAIL".red());
        all_pass = false;
    }

    if Path::new("src").is_dir() {
        println!("  [{}] src/ directory found", "PASS".green());
    } else {
        println!("  [{}] src/ directory not found", "FAIL".red());
        all_pass = false;
    }

    // 4. Check for presence of '.wasm4pm' directory
    if Path::new(".wasm4pm").is_dir() {
        println!("  [{}] .wasm4pm directory found", "PASS".green());
    } else {
        println!("  [{}] .wasm4pm directory not found", "WARN".yellow());
    }

    println!("\nSummary:");
    if all_pass {
        println!(
            "{}",
            "All checks passed! Your environment is healthy."
                .green()
                .bold()
        );
    } else {
        println!(
            "{}",
            "Some checks failed. Please address the issues above."
                .red()
                .bold()
        );
    }

    Ok(())
}
