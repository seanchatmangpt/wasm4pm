//! TPS Metrics CLI Tool
//!
//! Collects and analyzes Toyota Production System metrics for software development.
//!
//! # Commands
//!
//! - `tps-metrics all` — Run all TPS analyses
//! - `tps-metrics takt` — Takt time analysis
//! - `tps-metrics lead` — Lead time analysis
//! - `tps-metrics mura` — Unevenness detection
//! - `tps-metrics value-stream` — Value stream mapping
//! - `tps-metrics andon` — Real-time status dashboard

use anyhow::Result;
use clap::{Parser, Subcommand};
use colored::*;

mod andon;
mod lead_time;
mod mura;
mod takt_time;
mod value_stream;

#[derive(Parser)]
#[command(name = "tps-metrics")]
#[command(about = "Toyota Production System metrics collection and analysis", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Command,

    /// Number of days to analyze (default: 30)
    #[arg(short, long, default_value = "30", global = true)]
    days: usize,

    /// Repository path (default: current directory)
    #[arg(short, long, default_value = ".")]
    repo: String,
}

#[derive(Subcommand)]
enum Command {
    /// Run all TPS analyses
    All {
        /// Generate JSON output
        #[arg(long)]
        json: bool,
    },

    /// Takt time (production rhythm) analysis
    Takt {
        /// Generate JSON output
        #[arg(long)]
        json: bool,
    },

    /// Lead time (commit to merge) analysis
    Lead {
        /// Generate JSON output
        #[arg(long)]
        json: bool,
    },

    /// Mura (unevenness) detection
    Mura {
        /// Generate JSON output
        #[arg(long)]
        json: bool,
    },

    /// Value stream mapping
    ValueStream {
        /// Generate JSON output
        #[arg(long)]
        json: bool,
    },

    /// Andon (real-time status) dashboard
    Andon {
        /// Generate JSON output
        #[arg(long)]
        json: bool,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Command::All { json } => {
            run_all(&cli.repo, cli.days, json)?;
        }
        Command::Takt { json } => {
            run_takt_time(&cli.repo, cli.days, json)?;
        }
        Command::Lead { json } => {
            run_lead_time(&cli.repo, cli.days, json)?;
        }
        Command::Mura { json } => {
            run_mura(&cli.repo, cli.days, json)?;
        }
        Command::ValueStream { json } => {
            run_value_stream(&cli.repo, cli.days, json)?;
        }
        Command::Andon { json } => {
            run_andon(&cli.repo, json)?;
        }
    }

    Ok(())
}

/// Run all TPS analyses
fn run_all(repo_path: &str, days: usize, json: bool) -> Result<()> {
    println!("\n{}", "=== TPS METRICS ANALYSIS ===".bold());
    println!("Repository: {}", repo_path);
    println!("Period: Last {} days\n", days);

    if json {
        let all_metrics = serde_json::json!({
            "takt_time": takt_time::analyze_takt_time(repo_path, days)?,
            "lead_time": lead_time::analyze_lead_time(repo_path, days)?,
            "mura": mura::analyze_mura(repo_path, days)?,
            "value_stream": value_stream::analyze_value_stream(repo_path, days)?,
            "andon": andon::analyze_andon(repo_path)?,
        });

        println!("{}", serde_json::to_string_pretty(&all_metrics)?);
    } else {
        // Run each analysis and print reports
        let takt_metrics = takt_time::analyze_takt_time(repo_path, days)?;
        println!("{}", takt_time::generate_report(&takt_metrics));

        let lead_metrics = lead_time::analyze_lead_time(repo_path, days)?;
        println!("{}", lead_time::generate_report(&lead_metrics));

        let mura_metrics = mura::analyze_mura(repo_path, days)?;
        println!("{}", mura::generate_report(&mura_metrics));

        let vs_metrics = value_stream::analyze_value_stream(repo_path, days)?;
        println!("{}", value_stream::generate_report(&vs_metrics));

        let andon_metrics = andon::analyze_andon(repo_path)?;
        println!("{}", andon::generate_report(&andon_metrics));

        // Overall summary
        print_overall_summary(
            &takt_metrics,
            &lead_metrics,
            &mura_metrics,
            &vs_metrics,
            &andon_metrics,
        );
    }

    Ok(())
}

/// Print overall summary across all metrics
fn print_overall_summary(
    takt: &takt_time::TaktTimeMetrics,
    lead: &lead_time::LeadTimeMetrics,
    mura: &mura::MuraMetrics,
    vs: &value_stream::ValueStreamMetrics,
    andon: &andon::AndonMetrics,
) {
    use colored::*;

    println!("\n{}", "=== OVERALL TPS HEALTH ===\n".bold());

    // Calculate overall score
    let mut passing_metrics = 0;
    let mut total_metrics = 0;

    // Takt time checks
    total_metrics += 1;
    if takt.commits_per_day >= 3.0 {
        passing_metrics += 1;
    }

    total_metrics += 1;
    if takt.consistency_score >= 0.8 {
        passing_metrics += 1;
    }

    total_metrics += 1;
    if takt.drought_days == 0 {
        passing_metrics += 1;
    }

    // Lead time checks
    total_metrics += 1;
    if lead.average_hours < 24.0 {
        passing_metrics += 1;
    }

    total_metrics += 1;
    if lead.slow_merge_percent < 10.0 {
        passing_metrics += 1;
    }

    // Mura checks
    total_metrics += 1;
    if mura.daily_variance < 2.0 {
        passing_metrics += 1;
    }

    total_metrics += 1;
    if mura.burst_score < 0.3 {
        passing_metrics += 1;
    }

    // Value stream checks
    total_metrics += 1;
    if vs.value_added_ratio >= 0.3 {
        passing_metrics += 1;
    }

    // Andon checks
    total_metrics += 1;
    if andon.health_score >= 70 {
        passing_metrics += 1;
    }

    total_metrics += 1;
    if andon.compiler_warnings == 0 {
        passing_metrics += 1;
    }

    let health_percent = (passing_metrics as f64 / total_metrics as f64) * 100.0;

    println!(
        "Overall TPS Health: {:.0}% ({}/{} metrics passing)\n",
        health_percent, passing_metrics, total_metrics
    );

    let status = if health_percent >= 80.0 {
        "🟢 Excellent".green()
    } else if health_percent >= 60.0 {
        "🟡 Good".yellow()
    } else {
        "🔴 Needs Improvement".red()
    };
    println!("Status: {}\n", status);

    // Priority recommendations
    println!("{}", "Priority Improvements:\n".bold());

    if takt.commits_per_day < 3.0 {
        println!("  1. Increase commit frequency to ≥3/day (takt time)\n");
    }

    if lead.average_hours >= 24.0 {
        println!("  2. Reduce lead time to <24h (review backlog)\n");
    }

    if mura.burst_score >= 0.6 {
        println!("  3. Smooth out commit bursts (mura/unevenness)\n");
    }

    if vs.value_added_ratio < 0.3 {
        println!("  4. Improve value-added ratio (reduce wait time)\n");
    }

    if andon.health_score < 70 {
        println!("  5. Address failing components (andon/dashboard)\n");
    }
}

/// Run takt time analysis
fn run_takt_time(repo_path: &str, days: usize, json: bool) -> Result<()> {
    let metrics = takt_time::analyze_takt_time(repo_path, days)?;

    if json {
        println!("{}", serde_json::to_string_pretty(&metrics)?);
    } else {
        println!("{}", takt_time::generate_report(&metrics));
    }

    Ok(())
}

/// Run lead time analysis
fn run_lead_time(repo_path: &str, days: usize, json: bool) -> Result<()> {
    let metrics = lead_time::analyze_lead_time(repo_path, days)?;

    if json {
        println!("{}", serde_json::to_string_pretty(&metrics)?);
    } else {
        println!("{}", lead_time::generate_report(&metrics));
    }

    Ok(())
}

/// Run mura analysis
fn run_mura(repo_path: &str, days: usize, json: bool) -> Result<()> {
    let metrics = mura::analyze_mura(repo_path, days)?;

    if json {
        println!("{}", serde_json::to_string_pretty(&metrics)?);
    } else {
        println!("{}", mura::generate_report(&metrics));
    }

    Ok(())
}

/// Run value stream analysis
fn run_value_stream(repo_path: &str, days: usize, json: bool) -> Result<()> {
    let metrics = value_stream::analyze_value_stream(repo_path, days)?;

    if json {
        println!("{}", serde_json::to_string_pretty(&metrics)?);
    } else {
        println!("{}", value_stream::generate_report(&metrics));
    }

    Ok(())
}

/// Run andon status analysis
fn run_andon(repo_path: &str, json: bool) -> Result<()> {
    let metrics = andon::analyze_andon(repo_path)?;

    if json {
        println!("{}", serde_json::to_string_pretty(&metrics)?);
    } else {
        println!("{}", andon::generate_report(&metrics));
    }

    Ok(())
}
