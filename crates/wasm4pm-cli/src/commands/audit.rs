use anyhow::{Context, Result};
use colored::Colorize;
use wasm4pm_cli::io::{Io, Table};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use wasm4pm::simd_token_replay;
use wasm4pm::state::delete_object;
use wasm4pm::xes_format::load_eventlog_from_xes;

pub fn run(input: PathBuf, activity_key: String) -> Result<()> {
    let io = Io::new(false);

    // 1. Load XES
    let xes_content = fs::read_to_string(&input)
        .with_context(|| format!("Failed to read event log: {:?}", input))?;

    // 2. Load into wasm4pm state
    let log_handle = load_eventlog_from_xes(&xes_content)
        .map_err(|_| anyhow::anyhow!("Failed to load event log into WASM state"))?;

    // 3. Run SIMD Token Replay Conformance Audit
    io.info("Running SIMD-accelerated token replay audit...");
    let result_json = simd_token_replay(&log_handle, &activity_key);

    let result: Value =
        serde_json::from_str(&result_json).context("Failed to parse audit results")?;

    // 4. Print Report
    print_audit_report(&result, &io);

    // 5. Cleanup
    let _ = delete_object(&log_handle);

    Ok(())
}

fn print_audit_report(result: &Value, io: &Io) {
    let fitness = result["fitness"].as_f64().unwrap_or(0.0);
    let precision = result["precision"].as_f64().unwrap_or(0.0);

    io.header("Vision 2030 Conformance Audit Report");

    let verdict = if fitness >= 0.95 {
        "TRUTHFUL".green().bold()
    } else if fitness >= 0.70 {
        "VARIANCE".yellow().bold()
    } else {
        "DECEPTIVE".red().bold()
    };

    println!("\n{:<25} {}", "Audit Verdict:".bold(), verdict);
    println!("{:<25} {:.4}", "Fitness Score:".bold(), fitness);
    println!("{:<25} {:.4}", "Precision Score:".bold(), precision);

    if let Some(traces) = result["trace_results"].as_array() {
        println!("\n{:<25} {}", "Total Traces Audited:".bold(), traces.len());

        let fitting_count = traces
            .iter()
            .filter(|t| t["fitness"].as_f64().unwrap_or(0.0) >= 1.0)
            .count();
        println!("{:<25} {}", "Fitting Traces:".bold(), fitting_count);
        println!(
            "{:<25} {}",
            "Deviating Traces:".bold(),
            traces.len() - fitting_count
        );

        if traces.len() - fitting_count > 0 {
            println!("\n{}", "Sample Deviations:".bold().underline());
            let mut table = Table::new(vec!["Trace ID", "Fitness", "Problems"]);
            for trace in traces
                .iter()
                .filter(|t| t["fitness"].as_f64().unwrap_or(0.0) < 1.0)
                .take(5)
            {
                let problems = format!(
                    "M: {}, R: {}",
                    trace["missing_tokens"], trace["remaining_tokens"]
                );
                table.add_row(vec![
                    trace["trace_id"].as_str().unwrap_or("unknown").to_string(),
                    format!("{:.2}", trace["fitness"].as_f64().unwrap_or(0.0)),
                    problems,
                ]);
            }
            table.print();
        }
    }

    println!("\n{}", "Doctrine: If the code says it worked but the event log cannot prove a lawful process happened, then it did not work.".dimmed());
}
