use anyhow::{Context, Result};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use wasm4pm::autonomic_execute_cycle;
use wasm4pm::state::delete_object;
use wasm4pm::xes_format::load_eventlog_from_xes;
use wasm4pm_cli::io::Io;

pub fn run(
    input: PathBuf,
    activity_key: String,
    config: Option<String>,
    format: String,
) -> Result<()> {
    let io = Io::new(false);

    // 1. Load XES file
    let xes_content = fs::read_to_string(&input)
        .with_context(|| format!("Failed to read event log: {:?}", input))?;

    // 2. Load into wasm4pm state
    let log_handle = load_eventlog_from_xes(&xes_content)
        .map_err(|_| anyhow::anyhow!("Failed to load event log into WASM state"))?;

    // 3. Run autonomic cycle
    let config_json = config.unwrap_or_else(|| "{}".to_string());
    let result_json = autonomic_execute_cycle(&log_handle, &activity_key, &config_json)
        .map_err(|_| anyhow::anyhow!("Autonomic cycle execution failed"))?;

    let result: Value =
        serde_json::from_str(&result_json).context("Failed to parse autonomic cycle results")?;

    // 4. Output results
    if format == "json" {
        println!("{}", serde_json::to_string_pretty(&result)?);
    } else {
        print_human_results(&result, &io);
    }

    // 5. Cleanup
    let _ = delete_object(&log_handle);

    Ok(())
}

fn print_human_results(result: &Value, io: &Io) {
    let cycle = &result["cycle_result"];
    let perception = &cycle["perception"];
    let decision = &cycle["decision"];
    let protection = &cycle["protection"];
    let optimization = &cycle["optimization"];
    let timing = &result["timing"];

    io.header("AutoProcess Results");

    println!("\n  Perception:");
    println!("    Events: {}", perception["event_count"]);
    println!("    Traces: {}", perception["trace_count"]);
    println!("    Activities: {}", perception["unique_activities"]);
    println!(
        "    Health: {} (score {})",
        perception["health_state"], perception["health_score"]
    );

    println!("\n  Decision:");
    println!(
        "    Guard: {}",
        if decision["guard_result"].as_bool().unwrap_or(false) {
            "PASS"
        } else {
            "FAIL"
        }
    );
    println!(
        "    Pattern: {} ({} ticks)",
        decision["pattern_result"], decision["pattern_ticks"]
    );

    println!("\n  Protection:");
    println!("    Circuit: {}", protection["circuit_state"]);
    println!("    Allowed: {}", protection["circuit_allowed"]);
    let causes = protection["special_causes"].as_array();
    println!(
        "    Special Causes: {}",
        causes.map(|c| c.len()).unwrap_or(0)
    );

    println!("\n  Optimization:");
    println!("    Action: {}", optimization["rl_action"]);
    println!("    Agent: {}", optimization["rl_agent"]);
    println!(
        "    Reward: {:.4}",
        optimization["reward"].as_f64().unwrap_or(0.0)
    );

    println!("\n  Timing:");
    println!(
        "    Total: {} ns",
        timing["total_us"].as_u64().unwrap_or(0) * 1000
    );

    println!(
        "\n  Result: {}",
        if cycle["success"].as_bool().unwrap_or(false) {
            "Cycle completed successfully"
        } else {
            "Cycle failed or was blocked"
        }
    );
}
