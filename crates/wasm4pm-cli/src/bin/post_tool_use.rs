//! PostToolUse hook: BLAKE3 chain evidence capture + breeds.ttl drift warning.
//!
//! Reads JSON from stdin, appends a chained event to the session JSONL log,
//! and emits additionalContext if breeds.ttl was just modified.
//!
//! Replaces the bash script of the same name — no subprocess calls, no jq forks.

use blake3::Hasher;
use chrono::Utc;
use serde_json::{json, Value};
use std::fs::{self, OpenOptions};
use std::io::{self, BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::path::PathBuf;

const GENESIS: &str = "0000000000000000000000000000000000000000000000000000000000000000";

fn blake3_hex(data: &[u8]) -> String {
    let hash = blake3::hash(data);
    hash.to_hex().to_string()
}

fn blake3_hex2(a: &str, b: &str) -> String {
    let mut h = Hasher::new();
    h.update(a.as_bytes());
    h.update(b.as_bytes());
    h.finalize().to_hex().to_string()
}

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

    let event_json = json!({
        "timestamp": timestamp,
        "tool": tool_name,
        "file_path": if file_path.is_empty() { Value::Null } else { Value::String(file_path.clone()) },
        "command": if command.is_empty() { Value::Null } else { Value::String(command) },
        "exit_code": exit_code,
    });
    let event_str = event_json.to_string();

    let event_hash = blake3_hex(event_str.as_bytes());

    // Read previous chain hash from the last line of the log
    let log_path = run_dir.join("tool-events.jsonl");
    let prev_chain = if log_path.exists() {
        read_last_chain_hash(&log_path).unwrap_or_else(|| GENESIS.to_string())
    } else {
        GENESIS.to_string()
    };

    let chain_hash = blake3_hex2(&prev_chain, &event_hash);

    let entry = json!({
        "timestamp": timestamp,
        "tool": event_json["tool"],
        "file_path": event_json["file_path"],
        "command": event_json["command"],
        "exit_code": exit_code,
        "event_hash": event_hash,
        "chain_hash": chain_hash,
        "hash_algo": "blake3",
    });

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

/// Read the `chain_hash` field from the last non-empty line of a JSONL file.
fn read_last_chain_hash(path: &PathBuf) -> Option<String> {
    let f = fs::File::open(path).ok()?;
    let mut reader = BufReader::new(f);

    // Seek to end, walk back to find the last newline-terminated line
    let file_len = reader.seek(SeekFrom::End(0)).ok()?;
    if file_len == 0 {
        return None;
    }

    // Read the last 512 bytes — enough for any single JSONL entry tail
    let start = file_len.saturating_sub(512);
    reader.seek(SeekFrom::Start(start)).ok()?;

    let mut tail = String::new();
    reader.read_to_string(&mut tail).ok()?;

    let last_line = tail.lines().rev().find(|l| !l.trim().is_empty())?;
    let v: Value = serde_json::from_str(last_line).ok()?;
    v["chain_hash"].as_str().map(|s| s.to_string())
}
