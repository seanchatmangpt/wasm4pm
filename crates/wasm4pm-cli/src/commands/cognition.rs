//! `wpm cognition` — run and list the 55 registered cognitive breeds.
//!
//! Dispatches through the real `wasm4pm_cognition::breeds::dispatch_breed`
//! function: the same public entry point exercised by
//! `crates/wasm4pm-cognition/tests/ocel_conformance.rs`. Preconditions,
//! `run()`, postconditions, and OCEL-conformance derivation all execute for
//! real; nothing here is mocked or stubbed.
//!
//! Every `cognition run` emits an unconditional, fail-closed
//! `wasm4pm.command-receipt.v2` receipt (no `--no-receipt` escape hatch),
//! mirroring the TypeScript `CommandReceipt` shape in
//! `apps/wasm4pm/src/receipts/_shared.ts`.

use anyhow::{Context, Result};
use clap::Subcommand;
use serde_json::{Map, Value};
use std::path::Path;
use std::path::PathBuf;
use wasm4pm_cognition::breeds::{dispatch_breed, BreedId, BreedInput};

/// BLAKE3 derive_key domains. One domain per hash purpose; never reuse a
/// domain across different hash kinds (domain separation).
mod receipt_domains {
    pub const INPUT_HASH: &str = "wasm4pm.cognition.input_hash.v2";
    pub const OUTPUT_HASH: &str = "wasm4pm.cognition.output_hash.v2";
    pub const RECEIPT_SELF: &str = "wasm4pm.command-receipt.v2.self";
}

/// Recursive key-sorted canonical JSON stringifier (mirrors
/// `canonicalJson` in `apps/wasm4pm/src/receipts/_shared.ts`).
///
/// The workspace enables `serde_json`'s `preserve_order` feature, so
/// `serde_json::Map` preserves insertion order and any serialized `Value`
/// is only canonical if keys are sorted here. This function is the single
/// choke point for every byte that feeds a hash.
fn canonical_json(value: &Value) -> String {
    fn canon(value: &Value, out: &mut String) {
        match value {
            Value::Null => out.push_str("null"),
            Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
            Value::Number(n) => out.push_str(&n.to_string()),
            Value::String(s) => {
                // serde_json string escaping is canonical per JSON spec.
                out.push_str(&serde_json::to_string(s).unwrap_or_else(|_| "\"\"".to_string()));
            }
            Value::Array(items) => {
                out.push('[');
                for (i, item) in items.iter().enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    canon(item, out);
                }
                out.push(']');
            }
            // preserve_order Map: sort keys manually.
            Value::Object(map) => {
                let mut keys: Vec<&String> = map.keys().collect();
                keys.sort();
                out.push('{');
                for (i, key) in keys.iter().enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    out.push_str(&serde_json::to_string(key).unwrap_or_else(|_| "\"\"".to_string()));
                    out.push(':');
                    canon(&map[*key], out);
                }
                out.push('}');
            }
        }
    }
    let mut out = String::new();
    canon(value, &mut out);
    out
}

/// Domain-separated BLAKE3 derive_key hex hash of `bytes`.
fn derive_hash(domain: &str, bytes: &[u8]) -> String {
    blake3::Hash::from_bytes(blake3::derive_key(domain, bytes))
        .to_hex()
        .to_string()
}

/// 32-hex-char run id derived from (timestamp, input_hash, output_hash).
fn derive_run_id(timestamp: &str, input_hash: &str, output_hash: &str) -> String {
    let material = format!("{}|{}|{}", timestamp, input_hash, output_hash);
    let full = blake3::hash(material.as_bytes());
    full.to_hex()[..32].to_string()
}

/// Atomic write: create parent dirs, write a `.tmp` sibling, fsync, rename.
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)
            .with_context(|| format!("failed to create receipt dir: {}", dir.display()))?;
    }
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    {
        use std::io::Write;
        let mut f = std::fs::File::create(&tmp)
            .with_context(|| format!("failed to create tmp receipt: {}", tmp.to_string_lossy()))?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    std::fs::rename(&tmp, path)
        .with_context(|| format!("failed to persist receipt: {}", path.display()))?;
    // Best-effort directory fsync so the rename itself is durable.
    if let Some(dir) = path.parent() {
        if let Ok(d) = std::fs::File::open(dir) {
            let _ = d.sync_all();
        }
    }
    Ok(())
}

/// One-time JSON tracing subscriber on stderr (service.name=wpm). The span's
/// `status` field is recorded ok|error at command exit. No OTEL SDK.
fn init_receipt_tracing() {
    use std::sync::Once;
    static INIT: Once = Once::new();
    INIT.call_once(|| {
        let filter =
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                tracing_subscriber::EnvFilter::new("info")
            });
        let _ = tracing_subscriber::fmt()
            .json()
            .with_writer(std::io::stderr)
            .with_env_filter(filter)
            .try_init();
    });
}

/// Build the receipt body (without `receipt_hash`) as an insertion-ordered map.
fn receipt_body(
    run_id: &str,
    command: &str,
    input_hash: &str,
    output_hash: &str,
    status: &str,
    timestamp: &str,
    summary: Value,
) -> Map<String, Value> {
    let mut m = Map::new();
    m.insert("schema".into(), Value::String("wasm4pm.command-receipt.v2".into()));
    m.insert("run_id".into(), Value::String(run_id.into()));
    m.insert("command".into(), Value::String(command.into()));
    m.insert("phase".into(), Value::String("outcome".into()));
    m.insert("input_hash".into(), Value::String(input_hash.into()));
    m.insert("output_hash".into(), Value::String(output_hash.into()));
    m.insert("status".into(), Value::String(status.into()));
    m.insert("timestamp".into(), Value::String(timestamp.into()));
    m.insert("summary".into(), summary);
    m
}

/// Compute the self-hash over the canonical bytes of the receipt minus
/// `receipt_hash`, then return the full receipt map.
fn seal_receipt(mut body: Map<String, Value>) -> (Map<String, Value>, String) {
    let canonical = canonical_json(&Value::Object(body.clone()));
    let receipt_hash = derive_hash(receipt_domains::RECEIPT_SELF, canonical.as_bytes());
    body.insert("receipt_hash".into(), Value::String(receipt_hash.clone()));
    (body, receipt_hash)
}

/// Persist the sealed receipt to `.wasm4pm/receipts/<run_id>.json` and
/// `latest.json` (identical bytes). Returns the receipt file path.
fn persist_receipt(receipt: &Map<String, Value>) -> Result<PathBuf> {
    let run_id = receipt
        .get("run_id")
        .and_then(Value::as_str)
        .context("receipt missing run_id")?;
    let json = serde_json::to_string_pretty(&Value::Object(receipt.clone()))
        .context("failed to serialize receipt")?;
    let bytes = format!("{}\n", json).into_bytes();
    let dir = Path::new(".wasm4pm").join("receipts");
    let target = dir.join(format!("{}.json", run_id));
    atomic_write(&target, &bytes)?;
    atomic_write(&dir.join("latest.json"), &bytes)?;
    Ok(target)
}

/// Emit the receipt for a cognition run (success or error) and log one JSON
/// tracing span. Receipt persistence is unconditional and fail-closed.
fn emit_receipt(
    input_bytes: &[u8],
    output_json: &Value,
    status: &str,
    breed: &str,
    format: &str,
    input_path: &Path,
    duration_ms: u128,
) -> Result<()> {
    let timestamp = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    let input_hash = derive_hash(receipt_domains::INPUT_HASH, input_bytes);
    let output_hash = derive_hash(receipt_domains::OUTPUT_HASH, canonical_json(output_json).as_bytes());
    let run_id = derive_run_id(&timestamp, &input_hash, &output_hash);

    let mut summary = Map::new();
    summary.insert("breed".into(), Value::String(breed.into()));
    summary.insert("format".into(), Value::String(format.into()));
    summary.insert(
        "input_path".into(),
        Value::String(input_path.display().to_string()),
    );
    summary.insert(
        "duration_ms".into(),
        Value::Number(serde_json::Number::from(duration_ms as u64)),
    );

    let body = receipt_body(
        &run_id,
        "cognition run",
        &input_hash,
        &output_hash,
        status,
        &timestamp,
        Value::Object(summary),
    );
    let (receipt, receipt_hash) = seal_receipt(body);
    let path = persist_receipt(&receipt)?;

    tracing::info!(
        target: "wasm4pm::receipt",
        service_name = "wpm",
        command = "cognition run",
        status = %status,
        run_id = %run_id,
        receipt_path = %path.display(),
        receipt_hash = %receipt_hash,
        "command receipt emitted"
    );
    Ok(())
}

#[derive(Subcommand, Debug)]
pub enum CognitionCommands {
    /// List all 55 legally-admitted cognitive breeds (BreedId::ALL).
    List,
    /// Run one breed by name against a JSON `BreedInput` fixture.
    Run {
        /// Breed name, e.g. "mycin" or "ltl_monitor" (case-insensitive).
        breed: String,
        /// Path to a JSON file deserializing into `BreedInput`.
        input: PathBuf,
        /// Output format: "json" (pretty BreedOutput) or "debug" ({:#?}).
        #[clap(short, long, default_value = "json")]
        format: String,
    },
}

pub fn handle_cognition_command(command: &CognitionCommands) -> Result<()> {
    match command {
        CognitionCommands::List => run_list(),
        CognitionCommands::Run {
            breed,
            input,
            format,
        } => run_breed_cmd(breed, input, format),
    }
}

fn run_list() -> Result<()> {
    println!(
        "{} legally-admitted cognitive breeds:\n",
        BreedId::ALL.len()
    );
    for id in BreedId::ALL {
        println!("  {}", id);
    }
    Ok(())
}

fn run_breed_cmd(breed: &str, input_path: &PathBuf, format: &str) -> Result<()> {
    init_receipt_tracing();
    let span = tracing::info_span!(
        "wasm4pm.command.cognition.run",
        service_name = "wpm",
        status = tracing::field::Empty,
    );
    let t0 = std::time::Instant::now();
    let outcome = {
        let _entered = span.enter();
        run_breed_cmd_inner(breed, input_path, format)
    };
    let duration_ms = t0.elapsed().as_millis();

    let (status, output_json, input_bytes) = match &outcome {
        Ok((output_json, input_bytes)) => ("ok", output_json.clone(), input_bytes.clone()),
        Err(err) => (
            "error",
            serde_json::json!({ "error": format!("{}", err) }),
            Vec::new(),
        ),
    };
    span.record("status", status);

    // Unconditional, fail-closed receipt. If the receipt itself cannot be
    // persisted, surface that error (success is only reported when its
    // receipt is on disk).
    emit_receipt(
        &input_bytes,
        &output_json,
        status,
        breed,
        format,
        input_path,
        duration_ms,
    )?;

    outcome.map(|_| ())
}

/// Inner execution: returns (output JSON, raw input bytes) on success.
type RunOutcome = (Value, Vec<u8>);

fn run_breed_cmd_inner(breed: &str, input_path: &Path, format: &str) -> Result<RunOutcome> {
    // Case-insensitive match against the registered breed id strings.
    let normalized = breed.to_lowercase();
    let id = BreedId::ALL
        .iter()
        .copied()
        .find(|id| id.to_string() == normalized)
        .with_context(|| {
            format!(
                "unknown or unadmitted breed '{}': not found in BreedId::ALL (run `wpm cognition list`)",
                breed
            )
        })?;

    let raw = std::fs::read(input_path)
        .with_context(|| format!("failed to read input file: {}", input_path.display()))?;
    let raw_text = String::from_utf8(raw.clone())
        .with_context(|| format!("input file is not valid UTF-8: {}", input_path.display()))?;
    let input: BreedInput = serde_json::from_str(&raw_text).with_context(|| {
        format!(
            "failed to parse {} as BreedInput JSON",
            input_path.display()
        )
    })?;

    let output = dispatch_breed(&id.to_string(), &input)
        .map_err(|e| anyhow::anyhow!("breed '{}' failed: {}", id, e))?;

    let output_json = match format {
        "debug" => {
            println!("{:#?}", output);
            serde_json::to_value(&output).context("failed to convert BreedOutput to JSON")?
        }
        _ => {
            let pretty = serde_json::to_string_pretty(&output)
                .context("failed to serialize BreedOutput as JSON")?;
            println!("{}", pretty);
            serde_json::to_value(&output).context("failed to convert BreedOutput to JSON")?
        }
    };

    Ok((output_json, raw))
}
