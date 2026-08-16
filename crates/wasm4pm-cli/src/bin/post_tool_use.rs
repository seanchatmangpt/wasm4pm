//! PostToolUse hook: BLAKE3 chain evidence capture + breeds.ttl drift warning.
//!
//! Reads JSON from stdin, appends a chained event to the session JSONL log,
//! and emits additionalContext if breeds.ttl was just modified.
//!
//! Replaces the bash script of the same name — no subprocess calls, no jq forks.
//!
//! Chain hashing delegates to affidavit's `ChainAssembler` — the hand-rolled
//! `blake3_hex`/`blake3_hex2` functions are replaced by affidavit's canonical
//! append-only BLAKE3 chain (genesis-seeded, deterministic, tamper-evident).

use affidavit::chain::ChainAssembler;
use affidavit::types::{Blake3Hash, ObjectRef, OperationEvent};
use chrono::Utc;
use serde_json::{json, Value};
use std::fs::{self, OpenOptions};
use std::io::{self, Read, Write};
use std::path::PathBuf;

fn main() {
    let project_dir = match std::env::var("CLAUDE_PROJECT_DIR") {
        Ok(d) => PathBuf::from(d),
        Err(_) => return,
    };

    let mut raw = String::new();
    if io::stdin().read_to_string(&mut raw).is_err() {
        return;
    }

    let input: Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return,
    };

    let tool_name = match input["tool_name"].as_str() {
        Some(s) if !s.is_empty() => s.to_string(),
        _ => return,
    };

    let file_path = input["tool_input"]["file_path"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let command: String = input["tool_input"]["command"]
        .as_str()
        .unwrap_or("")
        .chars()
        .take(200)
        .collect();
    let exit_code = input["tool_result"]["exit_code"].as_i64();

    let timestamp = Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let date_dir = Utc::now().format("%Y%m%d").to_string();
    let run_dir = project_dir
        .join("wasm4pm/target/agent-runs")
        .join(&date_dir);

    if fs::create_dir_all(&run_dir).is_err() {
        return;
    }

    // Build the canonical event payload and compute its BLAKE3 commitment
    // via affidavit's Blake3Hash::from_bytes — the same primitive used inside ChainAssembler.
    let event_json = json!({
        "timestamp": timestamp,
        "tool": tool_name,
        "file_path": if file_path.is_empty() { Value::Null } else { Value::String(file_path.clone()) },
        "command": if command.is_empty() { Value::Null } else { Value::String(command) },
        "exit_code": exit_code,
    });
    let event_str = event_json.to_string();

    // Derive a deterministic sequence number from the log length so events
    // remain orderable even if the log is resumed across runs.
    let log_path = run_dir.join("tool-events.jsonl");
    let seq = count_log_lines(&log_path);

    // Construct the affidavit OperationEvent.
    // payload_commitment = Blake3Hash of the canonical event bytes.
    let op_event = OperationEvent {
        id: format!("post_tool_use:{seq}"),
        seq,
        event_type: format!("tool_use.{}", event_json["tool"].as_str().unwrap_or("unknown")),
        objects: vec![ObjectRef {
            id: file_path.clone(),
            obj_type: "file".to_string(),
            qualifier: if file_path.is_empty() {
                None
            } else {
                Some("target".to_string())
            },
        }],
        payload_commitment: Blake3Hash::from_bytes(event_str.as_bytes()),
    };

    // Load prior events from working receipt and rebuild the assembler so the
    // chain is continuous across hook invocations within one agent session.
    let working_path = run_dir.join("working-receipt.json");
    let mut assembler = load_working_assembler(&working_path);

    // Fold the new event into the chain.
    if assembler.append(op_event).is_err() {
        return;
    }

    // The rolling chain hash after folding in this event.
    let chain_hash = assembler.events()
        .last()
        .map(|_| affidavit::chain::recompute_chain(assembler.events()))
        .and_then(|r| r.ok())
        .map(|h| h.to_string())
        .unwrap_or_else(|| "0".repeat(64));

    // event_hash = payload_commitment hex (what the event commits to)
    let event_hash = Blake3Hash::from_bytes(event_str.as_bytes()).to_string();

    let entry = json!({
        "timestamp": timestamp,
        "tool": event_json["tool"],
        "file_path": event_json["file_path"],
        "command": event_json["command"],
        "exit_code": exit_code,
        "event_hash": event_hash,
        "chain_hash": chain_hash,
        "hash_algo": "blake3/affidavit",
    });

    // Persist the updated event list to the working receipt file so the next
    // invocation can resume the chain without loss.
    save_working_assembler(&working_path, assembler.events());

    // Append to JSONL
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&log_path) {
        let _ = writeln!(f, "{}", entry);
    }

    // Write CHAIN_HEAD
    let _ = fs::write(run_dir.join("CHAIN_HEAD"), &chain_hash);

    // Warn when breeds.ttl is edited so generated surfaces get reconciled
    if file_path.contains("breeds.ttl") || file_path.contains("ggen/ontology") {
        let ctx = json!({
            "hookSpecificOutput": {
                "hookEventName": "PostToolUse",
                "additionalContext": "breeds.ttl was just modified. Generated surfaces will drift. Run `just ggen-gate` before stopping to reconcile: registration.rs, registry.json, breed-ids.ts, paper_pointers_generated.rs, universal_anticheat_generated.rs."
            }
        });
        println!("{}", ctx);
    }
}

/// Count non-empty lines in the JSONL log to derive the next sequence number.
fn count_log_lines(path: &PathBuf) -> u64 {
    fs::read_to_string(path)
        .unwrap_or_default()
        .lines()
        .filter(|l| !l.trim().is_empty())
        .count() as u64
}

/// Load a `ChainAssembler` from the persisted working receipt JSON, or return
/// a fresh genesis-seeded assembler when no working receipt exists yet.
fn load_working_assembler(path: &PathBuf) -> ChainAssembler {
    if !path.exists() {
        return ChainAssembler::new();
    }
    let bytes = match fs::read(path) {
        Ok(b) => b,
        Err(_) => return ChainAssembler::new(),
    };
    let events: Vec<OperationEvent> = match serde_json::from_slice(&bytes) {
        Ok(v) => v,
        Err(_) => return ChainAssembler::new(),
    };
    ChainAssembler::from_events(events).unwrap_or_else(|_| ChainAssembler::new())
}

/// Persist the current event list to the working receipt JSON file so the
/// chain can be resumed on the next hook invocation.
fn save_working_assembler(path: &PathBuf, events: &[OperationEvent]) {
    if let Ok(bytes) = serde_json::to_vec(events) {
        let _ = fs::write(path, bytes);
    }
}
