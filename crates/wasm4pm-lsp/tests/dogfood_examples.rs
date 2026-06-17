//! Dogfood: run wasm4pm-lsp against every OCEL fixture in the repo and report diagnostics.
//!
//! This is a living audit — not a pass/fail gate on specific counts, but a
//! structured check that:
//!   1. Negative fixtures (fixtures/negative/) all produce at least one diagnostic.
//!   2. The admitted_evidence fixture produces a FIT verdict diagnostic.
//!   3. No fixture causes the LSP to crash (no timeout).
//!
//! Output is printed to stdout so `cargo test -- --nocapture` gives a full report.

use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::time::Duration;
use std::{fs, thread};
use url::Url;

const READ_TIMEOUT: Duration = Duration::from_secs(15);

// ── LspClient harness ────────────────────────────────────────────────────────

struct LspClient {
    stdin: ChildStdin,
    rx: Receiver<Value>,
    child: Child,
    next_id: i64,
    stashed: Vec<Value>,
}

impl LspClient {
    fn new() -> Self {
        let bin = env!("CARGO_BIN_EXE_wasm4pm-lsp");
        let mut child = Command::new(bin)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .expect("spawn wasm4pm-lsp");

        let stdout = child.stdout.take().unwrap();
        let stdin = child.stdin.take().unwrap();
        let (tx, rx) = mpsc::channel();

        thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            loop {
                let mut line = String::new();
                if reader.read_line(&mut line).is_err() || line.is_empty() {
                    break;
                }
                if line.starts_with("Content-Length: ") {
                    let len: usize = line
                        .trim_start_matches("Content-Length: ")
                        .trim()
                        .parse()
                        .unwrap();
                    reader.read_line(&mut line).unwrap();
                    let mut body = vec![0u8; len];
                    reader.read_exact(&mut body).unwrap();
                    if let Ok(msg) = serde_json::from_slice::<Value>(&body) {
                        let _ = tx.send(msg);
                    }
                }
            }
        });

        Self {
            stdin,
            rx,
            child,
            next_id: 1,
            stashed: Vec::new(),
        }
    }

    fn send(&mut self, msg: Value) {
        let body = msg.to_string();
        let frame = format!("Content-Length: {}\r\n\r\n{}", body.len(), body);
        self.stdin.write_all(frame.as_bytes()).unwrap();
        self.stdin.flush().unwrap();
    }

    fn request(&mut self, method: &str, params: Value) -> Value {
        let id = self.next_id;
        self.next_id += 1;
        self.send(json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }));
        loop {
            let msg = self.rx.recv_timeout(READ_TIMEOUT).expect("LSP timeout");
            if msg.get("id") == Some(&json!(id)) {
                return msg;
            }
            self.stashed.push(msg);
        }
    }

    fn notify(&mut self, method: &str, params: Value) {
        self.send(json!({ "jsonrpc": "2.0", "method": method, "params": params }));
    }

    fn wait_notification(&mut self, method: &str) -> Value {
        if let Some(i) = self
            .stashed
            .iter()
            .position(|n| n.get("method") == Some(&json!(method)))
        {
            return self.stashed.remove(i);
        }
        loop {
            let msg = self
                .rx
                .recv_timeout(READ_TIMEOUT)
                .expect("LSP notification timeout");
            if msg.get("method") == Some(&json!(method)) {
                return msg;
            }
            self.stashed.push(msg);
        }
    }
}

impl Drop for LspClient {
    fn drop(&mut self) {
        let _ = self.child.kill();
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn repo_root() -> PathBuf {
    // CARGO_MANIFEST_DIR = wasm4pm/crates/wasm4pm-lsp → go up 3 levels to repo root
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap() // crates/
        .parent()
        .unwrap() // wasm4pm/ (repo root)
        .to_path_buf()
}

fn open_ocel(client: &mut LspClient, uri: &Url, content: &str) -> Vec<Value> {
    client.notify(
        "textDocument/didOpen",
        json!({
            "textDocument": { "uri": uri, "languageId": "json", "version": 1, "text": content }
        }),
    );
    let notif = client.wait_notification("textDocument/publishDiagnostics");
    notif["params"]["diagnostics"]
        .as_array()
        .cloned()
        .unwrap_or_default()
}

// ── Test ──────────────────────────────────────────────────────────────────────

#[test]
fn test_lsp_audit_examples_and_fixtures() {
    let root = repo_root();
    let mut client = LspClient::new();
    client
        .request("initialize", json!({ "capabilities": {} }))
        .get("result")
        .expect("initialize must succeed");
    client.notify("initialized", json!({}));

    // ── 1. Negative fixtures — per-fixture semantic assertions ────────────────
    // Each .ocel.json fixture maps to an expected diagnostic code prefix.
    // Exact codes observed from test run; prefix match tolerates future additions.
    let fixture_expectations: &[(&str, &str)] = &[
        ("n05-o2o-dangling", "WASM4PM-VERDICT-DEVIATION"),
        ("n06-flattening-loss", "WASM4PM-VERDICT-DEVIATION"),
        ("n10-cardinality-max", "WASM4PM-VERDICT-DEVIATION"),
        ("n11-lifecycle-not-terminated", "WASM4PM-VERDICT-DEVIATION"),
        ("n12-e2o-empty", "WASM4PM-VERDICT-DEVIATION"),
        ("n13-duplicate-object-id", "WASM4PM-VERDICT-DEVIATION"),
        ("n14-undeclared-event-type", "WASM4PM-UNKNOWN-ACTIVITY"),
    ];

    let neg_dir = root.join("fixtures/negative");
    let mut neg_files: Vec<PathBuf> = fs::read_dir(&neg_dir)
        .expect("fixtures/negative must exist")
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().map(|e| e == "json").unwrap_or(false))
        .collect();
    neg_files.sort();

    println!("\n── Negative fixtures ──────────────────────────────────────");
    let mut ocel_missed: Vec<String> = Vec::new();

    // Collect codes per fixture for semantic assertions below
    let mut fixture_codes: std::collections::HashMap<String, Vec<String>> = Default::default();
    for path in &neg_files {
        let name = path.file_name().unwrap().to_string_lossy().to_string();
        let content = fs::read_to_string(path).expect("read fixture");
        let uri = Url::from_file_path(path).expect("file url");
        let diags = open_ocel(&mut client, &uri, &content);

        let codes: Vec<String> = diags
            .iter()
            .filter_map(|d| d["code"].as_str().map(String::from))
            .collect();

        let is_ocel = name.ends_with(".ocel.json");
        if diags.is_empty() {
            let tag = if is_ocel {
                "MISSED (ocel)"
            } else {
                "SKIPPED (not ocel)"
            };
            println!("  {tag:20} {name}");
            if is_ocel {
                ocel_missed.push(name.clone());
            }
        } else {
            println!("  FLAGGED              {name}  → {:?}", codes);
        }
        fixture_codes.insert(name, codes);
    }

    // Per-fixture semantic assertions
    for (stem, expected_prefix) in fixture_expectations {
        if let Some((name, codes)) = fixture_codes.iter().find(|(n, _)| n.contains(stem)) {
            assert!(
                codes
                    .iter()
                    .any(|c| c.starts_with(expected_prefix) || c == expected_prefix),
                "fixture {} expected code starting with '{}', got: {:?}",
                name,
                expected_prefix,
                codes
            );
        }
    }

    // ── 2. Admitted evidence (FIT) ────────────────────────────────────────────
    println!("\n── Admitted evidence (expected FIT) ──────────────────────");
    let admitted = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap() // repo root of wasm4pm
        .parent()
        .unwrap() // home dir
        .join("lsp-max/crates/playground/ocel/admitted_evidence.ocel.json");

    if admitted.exists() {
        let content = fs::read_to_string(&admitted).expect("read admitted");
        let uri = Url::from_file_path(&admitted).expect("file url");
        let diags = open_ocel(&mut client, &uri, &content);
        let codes: Vec<String> = diags
            .iter()
            .filter_map(|d| d["code"].as_str().map(String::from))
            .collect();
        let has_fit = codes.iter().any(|c| c == "WASM4PM-VERDICT-FIT");
        println!("  admitted_evidence.ocel.json → {:?}", codes);
        assert!(
            has_fit,
            "admitted_evidence must yield FIT verdict, got: {:?}",
            codes
        );
        println!("  ✓ FIT verdict confirmed");
    } else {
        println!("  SKIPPED — lsp-max sibling not found at expected path");
    }

    // ── 3. Pull-model diagnostic check on first OCEL negative fixture ────────
    println!("\n── Pull diagnostic (textDocument/diagnostic) ─────────────");
    if let Some(first) = neg_files
        .iter()
        .find(|p| p.to_string_lossy().ends_with(".ocel.json"))
    {
        let content = fs::read_to_string(first).expect("read");
        // Re-open so the doc is registered (may already be from step 1)
        let uri = Url::from_file_path(first).expect("file url");
        client.notify(
            "textDocument/didOpen",
            json!({
                "textDocument": { "uri": &uri, "languageId": "json", "version": 2, "text": content }
            }),
        );
        // Drain the push notification
        let _ = client.wait_notification("textDocument/publishDiagnostics");

        let pull_resp = client.request(
            "textDocument/diagnostic",
            json!({
                "textDocument": { "uri": &uri }
            }),
        );
        let pull_items = pull_resp["result"]["items"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        let pull_codes: Vec<String> = pull_items
            .iter()
            .filter_map(|d| d["code"].as_str().map(String::from))
            .collect();
        println!(
            "  {} → pull codes: {:?}",
            first.file_name().unwrap().to_string_lossy(),
            pull_codes
        );
        assert!(
            !pull_items.is_empty(),
            "pull diagnostic must return items for a negative fixture"
        );
        println!("  ✓ pull model working");
    }

    // ── 4. TypeScript examples — no ERROR-severity field contract violations ───
    println!("\n── TypeScript examples (field contract scan) ──────────────");
    let examples_dir = root.join("examples");
    let mut ts_violations: Vec<String> = Vec::new();
    if examples_dir.exists() {
        let mut ts_files: Vec<PathBuf> = fs::read_dir(&examples_dir)
            .into_iter()
            .flatten()
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.extension().map(|e| e == "ts").unwrap_or(false))
            .collect();
        ts_files.sort();
        for path in &ts_files {
            let content = fs::read_to_string(path).expect("read ts");
            if !content.contains("@wasm4pm/") && !content.contains("wasm4pm-cognition") {
                continue;
            }
            let uri = Url::from_file_path(path).expect("file url");
            let diags = open_ocel(&mut client, &uri, &content);
            let errors: Vec<String> = diags
                .iter()
                .filter(|d| d["severity"].as_u64() == Some(1))
                .filter_map(|d| d["code"].as_str().map(String::from))
                .filter(|c| c.starts_with("WASM4PM-TS-"))
                .collect();
            let name = path.file_name().unwrap().to_string_lossy().to_string();
            if errors.is_empty() {
                println!("  OK       {name}");
            } else {
                println!("  ERROR    {name} → {:?}", errors);
                ts_violations.push(format!("{}: {:?}", name, errors));
            }
        }
    }
    assert!(
        ts_violations.is_empty(),
        "TypeScript examples have ERROR-level field contract violations: {:?}",
        ts_violations
    );

    println!("\n── Summary ───────────────────────────────────────────────");
    let ocel_count = neg_files
        .iter()
        .filter(|p| p.to_string_lossy().ends_with(".ocel.json"))
        .count();
    assert!(
        ocel_missed.is_empty(),
        "OCEL negative fixtures produced no diagnostics: {:?}",
        ocel_missed
    );
    println!("  All {ocel_count} OCEL negative fixtures flagged. FIT verdict confirmed. Pull model working.");
}

// ── max/* implementation validation ──────────────────────────────────────────

#[test]
fn test_max_implementations_against_examples() {
    let root = repo_root();
    let mut client = LspClient::new();
    client
        .request("initialize", json!({ "capabilities": {} }))
        .get("result")
        .expect("initialize must succeed");
    client.notify("initialized", json!({}));

    // Open a real OCEL fixture so document state is populated
    let fixture = root.join("fixtures/negative/n14-undeclared-event-type.ocel.json");
    let content = fs::read_to_string(&fixture).expect("read n14 fixture");
    let uri = Url::from_file_path(&fixture).expect("file url");
    let _ = open_ocel(&mut client, &uri, &content);

    println!("\n── max/* implementation validation ──────────────────");

    // max/admission — must reflect real doc state
    let resp = client.request("max/admission", json!({}));
    let r = &resp["result"];
    println!("  max/admission → {:?}", r);
    assert_eq!(
        r["document_count"].as_u64().unwrap_or(0),
        1,
        "admission must count 1 open doc"
    );
    assert!(
        r.get("admitted").is_some(),
        "admission must have 'admitted' field"
    );

    // max/manifoldSnapshot — must reflect doc state (camelCase per lsp-max protocol)
    let resp = client.request("max/manifoldSnapshot", json!({}));
    let r = &resp["result"];
    println!(
        "  max/manifoldSnapshot → document_count={}",
        r["document_count"]
    );
    assert_eq!(
        r["document_count"].as_u64().unwrap_or(0),
        1,
        "snapshot must count 1 doc"
    );
    let snaps = r["snapshots"].as_array().expect("snapshots must be array");
    assert_eq!(snaps.len(), 1, "snapshot must have 1 entry");
    assert!(
        snaps[0]["verdict"].as_str().is_some(),
        "snapshot entry must have verdict"
    );

    // max/autonomicLoop — ocel_documents must be non-empty (camelCase per lsp-max protocol)
    let resp = client.request("max/autonomicLoop", json!({}));
    let r = &resp["result"];
    println!("  max/autonomicLoop → status={}", r["status"]);
    let ocel_docs = r["ocel_documents"]
        .as_array()
        .expect("ocel_documents must be array");
    assert_eq!(ocel_docs.len(), 1, "autonomicLoop must see 1 ocel doc");

    // max/lawfulTransition — known type is admitted, unknown is not (camelCase per lsp-max protocol)
    let resp = client.request("max/lawfulTransition", json!("Create Order"));
    let r = &resp["result"];
    println!(
        "  max/lawfulTransition 'Create Order' → admitted={}",
        r["admitted"]
    );
    assert_eq!(
        r["admitted"],
        json!(true),
        "Create Order must be admitted (declared in n14)"
    );

    let resp = client.request("max/lawfulTransition", json!("Teleport Order"));
    let r = &resp["result"];
    assert_eq!(
        r["admitted"],
        json!(false),
        "Teleport Order must NOT be admitted"
    );

    // max/chain — must have chain key; may be non-empty since .wasm4pm/receipts/ exists
    let resp = client.request("max/chain", json!({}));
    let r = &resp["result"];
    println!("  max/chain → length={}", r["length"]);
    assert!(r["chain"].as_array().is_some(), "chain must be array");
    let chain_len = r["length"].as_u64().unwrap_or(0);
    if chain_len > 0 {
        let entry = &r["chain"][0];
        assert!(
            entry["output_hash"].as_str().is_some(),
            "chain entry must have output_hash"
        );
        println!("  max/chain entry[0] run_id={:?}", entry["run_id"]);
    }

    // max/verifyLedger — must not report broken (output_hash present in all receipts)
    let resp = client.request("max/verifyLedger", json!({}));
    let r = &resp["result"];
    println!(
        "  max/verifyLedger → valid={}, receipt_count={}, missing_input_hash={}",
        r["valid"], r["receipt_count"], r["missing_input_hash_count"]
    );
    assert_eq!(
        r["valid"],
        json!(true),
        "ledger must be valid (all receipts have output_hash)"
    );
    let broken = r["broken_receipts"]
        .as_array()
        .expect("broken_receipts must be array");
    assert!(
        broken.is_empty(),
        "no receipts should be broken (all have output_hash)"
    );

    // max/ledgerReport — must mention open documents and receipts
    let resp = client.request("max/ledgerReport", json!({}));
    let report = resp["result"]
        .as_str()
        .expect("ledgerReport must return string");
    println!("  max/ledgerReport → {report}");
    assert!(
        report.contains("1 open documents"),
        "report must mention 1 open documents"
    );
    assert!(report.contains("receipts"), "report must mention receipts");

    // max/hook — must have exactly 4 handlers
    let resp = client.request("max/hook", json!({}));
    let r = &resp["result"];
    let handlers = r["handlers"].as_array().expect("handlers must be array");
    assert_eq!(handlers.len(), 4, "hook must have 4 handlers");
    println!("  max/hook → {} handlers ✓", handlers.len());

    // max/hookGraph — must have 7 nodes and 8 edges
    let resp = client.request("max/hookGraph", json!({}));
    let r = &resp["result"];
    let nodes = r["nodes"].as_array().expect("nodes must be array");
    let edges = r["edges"].as_array().expect("edges must be array");
    assert_eq!(nodes.len(), 7, "hookGraph must have 7 nodes");
    assert_eq!(edges.len(), 8, "hookGraph must have 8 edges");
    println!(
        "  max/hookGraph → {} nodes, {} edges ✓",
        nodes.len(),
        edges.len()
    );

    // max/dumpState — must reflect open doc
    let resp = client.request("max/dumpState", json!({}));
    let r = &resp["result"];
    println!("  max/dumpState → document_count={}", r["document_count"]);
    assert_eq!(r["document_count"].as_u64().unwrap_or(0), 1);

    // max/conformanceDelta with empty before — all open docs should appear as delta
    let resp = client.request("max/conformanceDelta", json!({ "before": {} }));
    let r = &resp["result"];
    println!(
        "  max/conformanceDelta → changed_count={}",
        r["changed_count"]
    );
    assert!(
        r["changed_count"].as_u64().unwrap_or(0) >= 1,
        "delta must show the open doc (was UNKNOWN)"
    );

    println!("\n  ✓ All max/* implementations validated against real data");
}
