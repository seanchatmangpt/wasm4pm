use anyhow::Result;
use clap::{Args, Subcommand};
use colored::*;
use wasm4pm_cli::io::{Io, Table};
use wasm4pm::SPC_HISTORY;

#[derive(Args, Debug)]
pub struct SpcArgs {
    #[command(subcommand)]
    pub command: SpcCommands,
}

#[derive(Subcommand, Debug)]
pub enum SpcCommands {
    /// Show current SPC status and rule violations.
    Status,
    /// View the ring buffer history of process metrics.
    History {
        /// Number of historical cycles to show
        #[arg(short, long, default_value_t = 10)]
        limit: usize,
    },
}

pub fn run(args: &SpcArgs) -> Result<()> {
    let io = Io::new(false);
    match &args.command {
        SpcCommands::Status => show_status(&io),
        SpcCommands::History { limit } => show_history(*limit, &io),
    }
}

fn show_status(io: &Io) -> Result<()> {
    SPC_HISTORY.with(|history_cell| {
        let history = history_cell.borrow();

        io.header("SPC System Status");
        println!("{:<25} {}", "Cycle Count:".bold(), history.cycle_count);
        println!("{:<25} {}", "History Length:".bold(), history.history.len());
        println!(
            "{:<25} {}",
            "Sufficient Data:".bold(),
            if history.has_sufficient_data() {
                "YES".green()
            } else {
                "NO (Need 9 cycles)".yellow()
            }
        );

        if let Some(last) = history.history.iter().last() {
            println!("\n{}", "Last Cycle Metrics:".bold().underline());
            println!("{:<25} {:.4}", "Event Rate Mean:".bold(), last.event_rate);
            println!(
                "{:<25} {:.4}",
                "Trace Duration Avg:".bold(),
                last.trace_duration_avg
            );
            println!(
                "{:<25} {:.4}",
                "Activity Freq:".bold(),
                last.activity_frequency
            );
            println!("{:<25} {}", "Health State:".bold(), last.health_state);
        }

        Ok(())
    })
}

fn show_history(limit: usize, io: &Io) -> Result<()> {
    SPC_HISTORY.with(|history_cell| {
        let history = history_cell.borrow();

        let mut table = Table::new(vec![
            "Cycle",
            "Timestamp",
            "Event Rate",
            "Duration",
            "Health",
        ]);

        let start_idx = history.history.len().saturating_sub(limit);
        for (i, snapshot) in history.history.iter().skip(start_idx).enumerate() {
            table.add_row(vec![
                (start_idx + i + 1).to_string(),
                snapshot.timestamp.clone(),
                format!("{:.2}", snapshot.event_rate),
                format!("{:.2}", snapshot.trace_duration_avg),
                snapshot.health_state.to_string(),
            ]);
        }

        io.header(format!("SPC Metric History (Last {} cycles)", limit));
        table.print();

        Ok(())
    })
}
