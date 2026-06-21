use anyhow::{Context, Result};
use colored::Colorize;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use wasm4pm::simd_token_replay;
use wasm4pm::state::delete_object;
use wasm4pm::xes_format::load_eventlog_from_xes;
use wasm4pm_cli::io::{Io, Table};

pub fn run(input: PathBuf, activity_key: String) -> Result<()> {
    let io = Io::new(false);

    // 0. Format detection — bail early with actionable message for OCEL files
    let ext = input
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let is_ocel = (ext == "json" && (input.to_string_lossy().contains(".ocel") || input.to_string_lossy().contains("vision_trace")))
        || ext == "jsonocel"
        || ext == "ocel";

    if is_ocel {
        // OCEL format detected — graduate to wasm4pm engine for full support.
        // The wasm4pm WASM layer supports OCEL 2.0 via feature-ocel, but the
        // Rust CLI audit path uses SIMD token replay which requires a flattened
        // XES-like trace structure. Emit a clear actionable message.
        anyhow::bail!(
            "OCEL 2.0 format detected ({:?}).\n\
             The wpm audit command currently supports XES event logs (IEEE 1849).\n\
             To audit an OCEL log, flatten it first:\n\n\
             \twpm run --algorithm dfg --format json {:?}\n\n\
             or use the TypeScript CLI: wpm conformance {:?}",
            input,
            input,
            input
        );
    }

    // 1. Load XES
    let xes_content = fs::read_to_string(&input).with_context(|| {
        format!(
            "Failed to read XES event log ({:?}). Supported formats: .xes",
            input
        )
    })?;

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
    // Verdict schema: wpm-verdict-v1.json — reads overall_fitness (NOT fitness), trace[].missing (NOT missing_tokens)
    // simd_token_replay emits "overall_fitness" and "overall_precision" at the top level.
    // Per-trace objects use "missing" and "remaining" (not "missing_tokens" /
    // "remaining_tokens"). There is no "trace_id" field; traces are indexed by
    // position in the "trace_results" array.
    let fitness = result["overall_fitness"].as_f64().unwrap_or(0.0);
    let precision = result["overall_precision"].as_f64();

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
    match precision {
        Some(p) => println!("{:<25} {:.4}", "Precision Score:".bold(), p),
        None => println!(
            "{:<25} {}",
            "Precision Score:".bold(),
            "UNSUPPORTED".dimmed()
        ),
    };

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
            for (idx, trace) in traces
                .iter()
                .enumerate()
                .filter(|(_, t)| t["fitness"].as_f64().unwrap_or(0.0) < 1.0)
                .take(5)
            {
                // Per-trace JSON: "missing" and "remaining" (not "missing_tokens" /
                // "remaining_tokens"). Use positional index as trace identifier since
                // simd_token_replay does not emit a "trace_id" field.
                let missing = trace["missing"].as_u64().unwrap_or(0);
                let remaining = trace["remaining"].as_u64().unwrap_or(0);
                let problems = format!("M: {}, R: {}", missing, remaining);
                table.add_row(vec![
                    format!("trace-{}", idx),
                    format!("{:.2}", trace["fitness"].as_f64().unwrap_or(0.0)),
                    problems,
                ]);
            }
            table.print();
        }
    }

    println!("\n{}", "Doctrine: If the code says it worked but the event log cannot prove a lawful process happened, then it did not work.".dimmed());
}
