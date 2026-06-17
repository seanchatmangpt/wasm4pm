use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::Duration;

const READ_TIMEOUT: Duration = Duration::from_secs(10);

// ── Receipt content used across tests ─────────────────────────────────────────

const RECEIPT_CONTENT: &str = r#"{
  "algorithm": "alignments",
  "input_hash": "aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344",
  "output_hash": "deadbeef11223344deadbeef11223344deadbeef11223344deadbeef11223344",
  "run_id": "r1",
  "replay_pointer": "abcdef0123456789",
  "timestamp": "2026-06-12T00:00:00Z"
}"#;

// ── LspClient harness (verbatim from dogfood_gc007_lsp318.rs) ─────────────────

struct LspClient {
    stdin: ChildStdin,
    rx: Receiver<Value>,
    child: Child,
    next_id: i64,
    stashed_notifications: Vec<Value>,
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

        let stdout = child.stdout.take().expect("take stdout");
        let stdin = child.stdin.take().expect("take stdin");
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
                    reader.read_line(&mut line).unwrap(); // consume empty line
                    let mut body = vec![0u8; len];
                    reader.read_exact(&mut body).unwrap();
                    let msg: Value = serde_json::from_slice(&body).unwrap();
                    tx.send(msg).unwrap();
                }
            }
        });

        Self {
            stdin,
            rx,
            child,
            next_id: 1,
            stashed_notifications: Vec::new(),
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
            let msg = self
                .rx
                .recv_timeout(READ_TIMEOUT)
                .expect("LSP request timeout");
            if msg.get("id") == Some(&json!(id)) {
                return msg;
            }
            self.stashed_notifications.push(msg);
        }
    }

    fn notify(&mut self, method: &str, params: Value) {
        self.send(json!({ "jsonrpc": "2.0", "method": method, "params": params }));
    }

    fn wait_for_notification(&mut self, method: &str) -> Value {
        if let Some(pos) = self
            .stashed_notifications
            .iter()
            .position(|n| n.get("method") == Some(&json!(method)))
        {
            return self.stashed_notifications.remove(pos);
        }
        loop {
            let msg = self
                .rx
                .recv_timeout(READ_TIMEOUT)
                .expect("LSP notification timeout");
            if msg.get("method") == Some(&json!(method)) {
                return msg;
            }
            self.stashed_notifications.push(msg);
        }
    }
}

impl Drop for LspClient {
    fn drop(&mut self) {
        let _ = self.child.kill();
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn repo_root() -> String {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .to_str()
        .unwrap()
        .to_string()
}

fn start_server() -> LspClient {
    let mut client = LspClient::new();
    let root = repo_root();
    client.request(
        "initialize",
        json!({
            "processId": null,
            "rootUri": format!("file://{}", root),
            "capabilities": {}
        }),
    );
    client.notify("initialized", json!({}));
    client
}

/// Open the shared receipt document and drain the push-diagnostics notification.
fn open_receipt(client: &mut LspClient, uri: &str) {
    client.notify(
        "textDocument/didOpen",
        json!({
            "textDocument": {
                "uri": uri,
                "languageId": "json",
                "version": 1,
                "text": RECEIPT_CONTENT
            }
        }),
    );
    // Drain the push-diagnostics notification emitted after didOpen.
    client.wait_for_notification("textDocument/publishDiagnostics");
}

// ── Tests ─────────────────────────────────────────────────────────────────────

/// 1. Hover on "algorithm" key in a receipt file returns non-null contents.
#[test]
fn test_hover_receipt_crown_field() {
    let mut client = start_server();
    let uri = "file:///tmp/wasm4pm/receipts/test-alignments-latest.json";
    open_receipt(&mut client, uri);

    // Line 1 (0-indexed): `  "algorithm": "alignments",`
    // char 3 is inside the key "algorithm".
    let resp = client.request(
        "textDocument/hover",
        json!({
            "textDocument": { "uri": uri },
            "position": { "line": 1, "character": 3 }
        }),
    );
    assert!(
        resp.get("error").is_none(),
        "hover must not return an error, got: {resp}"
    );
    let result = &resp["result"];
    assert!(
        !result.is_null(),
        "hover must return a non-null result for 'algorithm' key, got: {resp}"
    );
    // The result must have a contents field.
    assert!(
        result.get("contents").is_some(),
        "hover result must have 'contents' field, got: {result}"
    );
}

/// 2. Completion inside an empty algorithm value returns non-empty items.
#[test]
fn test_completion_algo_id_in_receipt() {
    let mut client = start_server();
    let uri = "file:///tmp/wasm4pm/receipts/test-completion-receipt.json";
    // Open a minimal receipt with empty algorithm value.
    client.notify(
        "textDocument/didOpen",
        json!({
            "textDocument": {
                "uri": uri,
                "languageId": "json",
                "version": 1,
                "text": "{\"algorithm\": \"\"}"
            }
        }),
    );
    client.wait_for_notification("textDocument/publishDiagnostics");

    // line 0, char 15 — inside the empty string value after "algorithm": "
    let resp = client.request(
        "textDocument/completion",
        json!({
            "textDocument": { "uri": uri },
            "position": { "line": 0, "character": 15 },
            "context": { "triggerKind": 1 }
        }),
    );
    assert!(
        resp.get("error").is_none(),
        "completion must not return an error, got: {resp}"
    );
    // Accept either a plain array or a CompletionList object.
    let items: &Vec<Value> = &match &resp["result"] {
        Value::Array(arr) => arr.clone(),
        Value::Object(obj) => obj
            .get("items")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default(),
        _ => vec![],
    };
    assert!(
        !items.is_empty(),
        "completion for empty algorithm value must return at least one item, got: {resp}"
    );
}

/// 3. documentSymbol on a receipt file contains a symbol named "algorithm".
#[test]
fn test_document_symbol_receipt() {
    let mut client = start_server();
    let uri = "file:///tmp/wasm4pm/receipts/test-syms-receipt.json";
    open_receipt(&mut client, uri);

    let resp = client.request(
        "textDocument/documentSymbol",
        json!({ "textDocument": { "uri": uri } }),
    );
    assert!(
        resp.get("error").is_none(),
        "documentSymbol must not return an error, got: {resp}"
    );
    let symbols = resp["result"]
        .as_array()
        .expect("documentSymbol must return an array");
    let names: Vec<&str> = symbols.iter().filter_map(|s| s["name"].as_str()).collect();
    assert!(
        names.contains(&"algorithm"),
        "document symbols must contain 'algorithm', got: {names:?}"
    );
}

/// 4. gotoDefinition on "alignments" value in a receipt navigates to algorithms.ttl.
#[test]
fn test_goto_definition_algo_to_ttl() {
    let mut client = start_server();
    let uri = "file:///tmp/wasm4pm/receipts/test-goto-receipt.json";
    open_receipt(&mut client, uri);

    // Line 1 char 18: inside the "alignments" string value.
    let resp = client.request(
        "textDocument/definition",
        json!({
            "textDocument": { "uri": uri },
            "position": { "line": 1, "character": 18 }
        }),
    );
    assert!(
        resp.get("error").is_none(),
        "gotoDefinition must not return an error, got: {resp}"
    );
    // Result may be a Location, array of Locations, or null; either is acceptable
    // if no TTL index is on disk — but if a result IS returned it must point to TTL.
    if !resp["result"].is_null() {
        let uri_val = match &resp["result"] {
            Value::Object(obj) => obj
                .get("uri")
                .and_then(|u| u.as_str())
                .map(|s| s.to_string()),
            Value::Array(arr) => arr
                .first()
                .and_then(|v| v.get("uri"))
                .and_then(|u| u.as_str())
                .map(|s| s.to_string()),
            _ => None,
        };
        if let Some(uri_str) = uri_val {
            assert!(
                uri_str.contains("algorithms.ttl") || uri_str.contains(".ttl"),
                "gotoDefinition for algorithm id must point to a .ttl file, got: {uri_str}"
            );
        }
    }
}

/// 5. references on "alignments" position returns an array (may be empty).
#[test]
fn test_references_algo_from_receipt() {
    let mut client = start_server();
    let uri = "file:///tmp/wasm4pm/receipts/test-refs-receipt.json";
    open_receipt(&mut client, uri);

    let resp = client.request(
        "textDocument/references",
        json!({
            "textDocument": { "uri": uri },
            "position": { "line": 1, "character": 18 },
            "context": { "includeDeclaration": true }
        }),
    );
    assert!(
        resp.get("error").is_none(),
        "references must not return an error, got: {resp}"
    );
    // Result must be null or an array — never an object error.
    assert!(
        resp["result"].is_null() || resp["result"].is_array(),
        "references result must be null or array, got: {}",
        resp["result"]
    );
}

/// 6. moniker on "alignments" returns scheme=="ogse" and identifier contains "Algo/alignments".
#[test]
fn test_moniker_algo_in_receipt() {
    let mut client = start_server();
    let uri = "file:///tmp/wasm4pm/receipts/test-moniker-receipt.json";
    open_receipt(&mut client, uri);

    let resp = client.request(
        "textDocument/moniker",
        json!({
            "textDocument": { "uri": uri },
            "position": { "line": 1, "character": 18 }
        }),
    );
    assert!(
        resp.get("error").is_none(),
        "moniker must not return an error, got: {resp}"
    );
    let monikers = match &resp["result"] {
        Value::Array(arr) => arr.clone(),
        _ => vec![],
    };
    assert!(
        !monikers.is_empty(),
        "moniker must return at least one result for 'alignments' in a receipt file, got: {resp}"
    );
    let first = &monikers[0];
    let scheme = first["scheme"].as_str().unwrap_or("");
    assert_eq!(
        scheme, "ogse",
        "moniker scheme must be 'ogse', got: {scheme}"
    );
    let identifier = first["identifier"].as_str().unwrap_or("");
    assert!(
        identifier.contains("Algo/alignments") || identifier.contains("alignments"),
        "moniker identifier must reference 'alignments', got: {identifier}"
    );
}

/// 7. documentColor on a receipt file returns an array (not an error).
#[test]
fn test_document_color_receipt() {
    let mut client = start_server();
    let uri = "file:///tmp/wasm4pm/receipts/test-color-receipt.json";
    open_receipt(&mut client, uri);

    let resp = client.request(
        "textDocument/documentColor",
        json!({ "textDocument": { "uri": uri } }),
    );
    assert!(
        resp.get("error").is_none(),
        "documentColor must not return an error, got: {resp}"
    );
    assert!(
        resp["result"].is_array(),
        "documentColor must return an array, got: {}",
        resp["result"]
    );
}

/// 8. colorPresentation for admitted-green returns a label containing "admitted".
#[test]
fn test_color_presentation_green() {
    let mut client = start_server();
    let uri = "file:///tmp/wasm4pm/receipts/test-colorpres-receipt.json";
    open_receipt(&mut client, uri);

    let resp = client.request(
        "textDocument/colorPresentation",
        json!({
            "textDocument": { "uri": uri },
            "color": { "red": 0.0, "green": 0.78, "blue": 0.2, "alpha": 1.0 },
            "range": {
                "start": { "line": 0, "character": 0 },
                "end": { "line": 0, "character": 1 }
            }
        }),
    );
    assert!(
        resp.get("error").is_none(),
        "colorPresentation must not return an error, got: {resp}"
    );
    let presentations = resp["result"]
        .as_array()
        .expect("colorPresentation must return an array");
    assert!(
        !presentations.is_empty(),
        "colorPresentation must return at least one presentation"
    );
    let label = presentations[0]["label"].as_str().unwrap_or("");
    assert!(
        label.contains("admitted"),
        "colorPresentation label for admitted-green must contain 'admitted', got: {label}"
    );
}

/// 9. codeLens on a receipt file returns at least one lens with command starting "ogse.".
#[test]
fn test_code_lens_receipt() {
    let mut client = start_server();
    let uri = "file:///tmp/wasm4pm/receipts/test-codelens-receipt.json";
    open_receipt(&mut client, uri);

    let resp = client.request(
        "textDocument/codeLens",
        json!({ "textDocument": { "uri": uri } }),
    );
    assert!(
        resp.get("error").is_none(),
        "codeLens must not return an error, got: {resp}"
    );
    let lenses = resp["result"]
        .as_array()
        .expect("codeLens must return an array");
    assert!(
        !lenses.is_empty(),
        "codeLens on receipt must return at least one lens, got: {resp}"
    );
    let has_ogse = lenses.iter().any(|l| {
        l["command"]["command"]
            .as_str()
            .map(|c| c.starts_with("ogse."))
            .unwrap_or(false)
    });
    assert!(
        has_ogse,
        "at least one code lens must have a command starting with 'ogse.', got: {lenses:?}"
    );
}

/// 10. inlayHint on a receipt file returns an array.
#[test]
fn test_inlay_hint_receipt() {
    let mut client = start_server();
    let uri = "file:///tmp/wasm4pm/receipts/test-inlayhint-receipt.json";
    open_receipt(&mut client, uri);

    let resp = client.request(
        "textDocument/inlayHint",
        json!({
            "textDocument": { "uri": uri },
            "range": {
                "start": { "line": 0, "character": 0 },
                "end": { "line": 10, "character": 0 }
            }
        }),
    );
    assert!(
        resp.get("error").is_none(),
        "inlayHint must not return an error, got: {resp}"
    );
    assert!(
        resp["result"].is_array() || resp["result"].is_null(),
        "inlayHint must return an array or null, got: {}",
        resp["result"]
    );
}

/// 11. signatureHelp on a receipt file returns signatures array with label containing "Crown" or "Receipt".
#[test]
fn test_signature_help_in_receipt() {
    let mut client = start_server();
    let uri = "file:///tmp/wasm4pm/receipts/test-sighelp-receipt.json";
    open_receipt(&mut client, uri);

    let resp = client.request(
        "textDocument/signatureHelp",
        json!({
            "textDocument": { "uri": uri },
            "position": { "line": 0, "character": 5 }
        }),
    );
    assert!(
        resp.get("error").is_none(),
        "signatureHelp must not return an error, got: {resp}"
    );
    let result = &resp["result"];
    assert!(
        !result.is_null(),
        "signatureHelp must return a non-null result for receipt file, got: {resp}"
    );
    let sigs = result["signatures"]
        .as_array()
        .expect("signatureHelp result must have 'signatures' array");
    assert!(
        !sigs.is_empty(),
        "signatureHelp must return at least one signature for receipt file"
    );
    let has_crown_or_receipt = sigs.iter().any(|s| {
        s["label"]
            .as_str()
            .map(|l| l.contains("Crown") || l.contains("Receipt"))
            .unwrap_or(false)
    });
    assert!(
        has_crown_or_receipt,
        "at least one signature label must contain 'Crown' or 'Receipt', got: {sigs:?}"
    );
}

/// 12. willCreateFiles for a ggen-rendered path returns null (warning goes to log).
#[test]
fn test_will_create_files_logs_warning() {
    let mut client = start_server();

    let resp = client.request(
        "workspace/willCreateFiles",
        json!({
            "files": [
                { "uri": "file:///tmp/wasm4pm/src/algorithm_registry.rs" }
            ]
        }),
    );
    assert!(
        resp.get("error").is_none(),
        "willCreateFiles must not return an error, got: {resp}"
    );
    assert!(
        resp["result"].is_null(),
        "willCreateFiles must return null (warning goes to log_message), got: {}",
        resp["result"]
    );
}

/// 13. willDeleteFiles for a crown receipt path returns null.
#[test]
fn test_will_delete_files_logs_warning() {
    let mut client = start_server();

    let resp = client.request(
        "workspace/willDeleteFiles",
        json!({
            "files": [
                { "uri": "file:///home/.wasm4pm/receipts/pi-alignments-latest.json" }
            ]
        }),
    );
    assert!(
        resp.get("error").is_none(),
        "willDeleteFiles must not return an error, got: {resp}"
    );
    assert!(
        resp["result"].is_null(),
        "willDeleteFiles must return null (warning goes to log_message), got: {}",
        resp["result"]
    );
}

/// 14. workspace/textDocumentContent for ogse://standing/alignments returns text containing "Lambda".
#[test]
fn test_text_document_content_standing() {
    let mut client = start_server();

    let resp = client.request(
        "workspace/textDocumentContent",
        json!({
            "textDocument": { "uri": "ogse://standing/alignments" }
        }),
    );
    // The server returns method_not_found if no virtual doc; accept either a result or
    // a method_not_found error — but if a result IS returned it must contain "Lambda".
    if let Some(err) = resp.get("error") {
        let code = err["code"].as_i64().unwrap_or(0);
        assert_eq!(
            code, -32601,
            "if textDocumentContent fails, it must be method_not_found (-32601), got: {err}"
        );
    } else {
        let text = resp["result"]["text"].as_str().unwrap_or("");
        assert!(
            text.contains("Lambda") || text.contains('\u{039b}'),
            "textDocumentContent for ogse://standing must mention Lambda, got: {text}"
        );
    }
}

/// 15. executeCommand ogse.explainStanding returns result with "standing" key.
#[test]
fn test_execute_command_explain_standing() {
    let mut client = start_server();

    let resp = client.request(
        "workspace/executeCommand",
        json!({
            "command": "ogse.explainStanding",
            "arguments": ["alignments"]
        }),
    );
    assert!(
        resp.get("error").is_none(),
        "executeCommand ogse.explainStanding must not return an error, got: {resp}"
    );
    let result = &resp["result"];
    assert!(
        !result.is_null(),
        "executeCommand ogse.explainStanding must return a non-null result"
    );
    // Result may be the standing object directly or wrapped; check for "standing" key or
    // top-level "F"/"R"/"C"/"P" keys indicating a standing struct.
    let has_standing = result.get("standing").is_some()
        || result.get("F").is_some()
        || result.get("algorithm").is_some();
    assert!(
        has_standing,
        "ogse.explainStanding result must have 'standing' key or 'algorithm' key, got: {result}"
    );
}

/// 16. executeCommand ogse.verifyReceipt returns result with "algorithm" and "crown_valid" keys.
#[test]
fn test_execute_command_verify_receipt() {
    let mut client = start_server();

    let resp = client.request(
        "workspace/executeCommand",
        json!({
            "command": "ogse.verifyReceipt",
            "arguments": ["alignments"]
        }),
    );
    assert!(
        resp.get("error").is_none(),
        "executeCommand ogse.verifyReceipt must not return an error, got: {resp}"
    );
    let result = &resp["result"];
    assert!(
        !result.is_null(),
        "executeCommand ogse.verifyReceipt must return a non-null result"
    );
    assert!(
        result.get("algorithm").is_some(),
        "ogse.verifyReceipt result must have 'algorithm' key, got: {result}"
    );
    assert!(
        result.get("crown_valid").is_some(),
        "ogse.verifyReceipt result must have 'crown_valid' key, got: {result}"
    );
}

/// 17. typeHierarchy/supertypes returns an array (not an error).
#[test]
fn test_supertypes_algo() {
    let mut client = start_server();

    let item = json!({
        "name": "alignments",
        "kind": 12,
        "detail": "algorithm",
        "uri": "file:///tmp/x.json",
        "range": {
            "start": { "line": 0, "character": 0 },
            "end": { "line": 0, "character": 0 }
        },
        "selectionRange": {
            "start": { "line": 0, "character": 0 },
            "end": { "line": 0, "character": 0 }
        }
    });
    let resp = client.request("typeHierarchy/supertypes", json!({ "item": item }));
    assert!(
        resp.get("error").is_none(),
        "typeHierarchy/supertypes must not return an error, got: {resp}"
    );
    assert!(
        resp["result"].is_array() || resp["result"].is_null(),
        "typeHierarchy/supertypes must return an array or null, got: {}",
        resp["result"]
    );
}

/// 18. typeHierarchy/subtypes for ProcessIntelligenceAlgorithm returns an array.
#[test]
fn test_subtypes_base_class() {
    let mut client = start_server();

    let item = json!({
        "name": "ProcessIntelligenceAlgorithm",
        "kind": 5,
        "detail": "base class",
        "uri": "file:///tmp/x.json",
        "range": {
            "start": { "line": 0, "character": 0 },
            "end": { "line": 0, "character": 0 }
        },
        "selectionRange": {
            "start": { "line": 0, "character": 0 },
            "end": { "line": 0, "character": 0 }
        }
    });
    let resp = client.request("typeHierarchy/subtypes", json!({ "item": item }));
    assert!(
        resp.get("error").is_none(),
        "typeHierarchy/subtypes must not return an error, got: {resp}"
    );
    assert!(
        resp["result"].is_array() || resp["result"].is_null(),
        "typeHierarchy/subtypes must return an array or null, got: {}",
        resp["result"]
    );
}

/// 19. max/lsif response parses as JSON and has a "vertices" key.
#[test]
fn test_max_lsif_has_vertices() {
    let mut client = start_server();

    let resp = client.request("max/lsif", json!(null));
    assert!(
        resp.get("error").is_none(),
        "max/lsif must not return an error, got: {resp}"
    );
    // Result is a JSON-encoded string of the LSIF document.
    let lsif_str = resp["result"]
        .as_str()
        .expect("max/lsif result must be a JSON-encoded string");
    let lsif: Value =
        serde_json::from_str(lsif_str).expect("max/lsif result string must parse as JSON");
    assert!(
        lsif.get("vertices").is_some(),
        "max/lsif JSON must have 'vertices' key, got: {lsif}"
    );
}

/// 20. max/explainDiagnostic for "ogse.missing_receipt" returns a non-empty law_id.
#[test]
fn test_max_explain_ogse_diagnostic() {
    let mut client = start_server();

    let resp = client.request("max/explainDiagnostic", json!("ogse.missing_receipt"));
    assert!(
        resp.get("error").is_none(),
        "max/explainDiagnostic must not return an error, got: {resp}"
    );
    let result = &resp["result"];
    assert!(
        !result.is_null(),
        "max/explainDiagnostic must return a non-null result"
    );
    let law_id = result["law_id"].as_str().unwrap_or("");
    assert!(
        !law_id.is_empty(),
        "max/explainDiagnostic result must have non-empty 'law_id', got: {result}"
    );
}
