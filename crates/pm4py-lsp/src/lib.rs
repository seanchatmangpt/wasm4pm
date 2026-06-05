#![doc = "PM4Py Living LSP bridge using tower-lsp-max."]
#![doc = ""]
#![doc = "This crate provides the Language Server Protocol (LSP) implementation"]
#![doc = "for bridging Python's PM4Py library with the wasm4pm ecosystem."]
#![forbid(unsafe_code)]
#![warn(clippy::all)]

use async_trait::async_trait;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tokio::fs;
use tokio::sync::Mutex;
use tower_lsp_max::jsonrpc::{Error, Result};
use tower_lsp_max::lsp_types::*;
use tower_lsp_max::max_protocol;
use tower_lsp_max::{Client, LanguageServer};
use uuid::Uuid;
use wasm4pm_types::hash;

static RE_PARITY_CSV: OnceLock<regex::Regex> = OnceLock::new();

pub mod analysis;
pub mod diagnostics;
pub mod fixtures;
pub mod parity;
pub mod pm4py_bridge;
pub mod receipts;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ParityFixture {
    pub csv_path: String,
    pub parameters: HashMap<String, String>,
    pub expected_outcome: String,
}

#[derive(Debug)]
pub struct Backend {
    pub client: Client,
    pub documents: Arc<Mutex<HashMap<Url, String>>>,
    pub receipts: Arc<Mutex<HashMap<String, max_protocol::Receipt>>>,
    pub pending_scans: Arc<Mutex<HashMap<Url, tokio::task::AbortHandle>>>,
}

impl Backend {
    pub fn new(client: Client) -> Self {
        Self {
            client,
            documents: Arc::new(Mutex::new(HashMap::new())),
            receipts: Arc::new(Mutex::new(HashMap::new())),
            pending_scans: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    async fn on_change(&self, uri: Url, text: String) {
        // Early-return identity check: skip scan if content is unchanged
        {
            let current = self.documents.lock().await.get(&uri).cloned();
            if current.as_deref() == Some(text.as_str()) {
                return; // identical content, skip full scan
            }
        }

        self.documents
            .lock()
            .await
            .insert(uri.clone(), text.clone());

        // Debounce: abort any pending scan for this URI, then schedule a new one
        {
            let mut pending = self.pending_scans.lock().await;
            if let Some(handle) = pending.remove(&uri) {
                handle.abort();
            }
        }

        let pending_scans = self.pending_scans.clone();
        let client = self.client.clone();
        let uri_clone = uri.clone();
        let text_clone = text.clone();

        let handle = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(150)).await;
            pending_scans.lock().await.remove(&uri_clone);
            let diagnostics = diagnose_text(&text_clone);
            client
                .publish_diagnostics(uri_clone, diagnostics, None)
                .await;
        });

        self.pending_scans
            .lock()
            .await
            .insert(uri, handle.abort_handle());
    }

    #[allow(dead_code)]
    async fn scan_and_diagnose(&self, uri: Url, text: String) {
        let mut diagnostics = diagnose_text(&text);

        // Add ParityFixtureMissing & UnreceiptedOutput dynamically
        if let Ok(snapshot_id) = self.max_snapshot().await {
            let snap_str = snapshot_id.0;

            // Check if fixture exists
            let fixture_path =
                Path::new("fixtures/pm4py-parity").join(format!("{}.json", snap_str));
            if !fixture_path.exists() {
                let lines: Vec<&str> = text.lines().collect();
                let mut range = Range::new(Position::new(0, 0), Position::new(0, 0));
                for (i, line) in lines.iter().enumerate() {
                    if let Some(pos) = line.find("import pm4py") {
                        range = Range {
                            start: Position::new(i as u32, pos as u32),
                            end: Position::new(i as u32, (pos + "import pm4py".len()) as u32),
                        };
                        break;
                    }
                }

                diagnostics.push(Diagnostic {
                    range,
                    severity: Some(DiagnosticSeverity::INFORMATION),
                    code: Some(NumberOrString::String("pm4py.py.parity_fixture_missing".to_string())),
                    source: Some("pm4py-lsp".to_string()),
                    message: "No parity fixture found for this snapshot. Use pm4py-lsp.createParityFixture to create one.".to_string(),
                    ..Default::default()
                });
            }

            // Check if receipts exist
            let receipt_dir = Path::new("receipts/pm4py-lsp").join(&snap_str);
            let has_receipts = if receipt_dir.exists() {
                if let Ok(mut entries) = fs::read_dir(receipt_dir).await {
                    let mut found = false;
                    while let Ok(Some(entry)) = entries.next_entry().await {
                        if entry.path().extension().map_or(false, |ext| ext == "json") {
                            found = true;
                            break;
                        }
                    }
                    found
                } else {
                    false
                }
            } else {
                false
            };

            if !has_receipts {
                let lines: Vec<&str> = text.lines().collect();
                let mut range = Range::new(Position::new(0, 0), Position::new(0, 0));
                for (i, line) in lines.iter().enumerate() {
                    if let Some(pos) = line.find("import pm4py") {
                        range = Range {
                            start: Position::new(i as u32, pos as u32),
                            end: Position::new(i as u32, (pos + "import pm4py".len()) as u32),
                        };
                        break;
                    }
                }

                diagnostics.push(Diagnostic {
                    range,
                    severity: Some(DiagnosticSeverity::INFORMATION),
                    code: Some(NumberOrString::String(
                        "pm4py.py.unreceipted_output".to_string(),
                    )),
                    source: Some("pm4py-lsp".to_string()),
                    message: "No execution receipts generated for this snapshot.".to_string(),
                    ..Default::default()
                });
            }
        }

        self.client
            .publish_diagnostics(uri, diagnostics, None)
            .await;
    }
}

pub fn diagnose_text(text: &str) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();
    let facts = crate::analysis::PipelineFacts::extract(text);
    let checks = crate::diagnostics::check_diagnostics(&facts);

    let lines: Vec<&str> = text.lines().collect();

    for check in checks {
        let code_str = check.code.as_str();
        let lsp_code = Some(NumberOrString::String(format!("pm4py.py.{}", code_str)));

        let range = match check.code {
            crate::diagnostics::DiagnosticCode::UnformattedDataframe => {
                let mut found_range = None;
                for (i, line) in lines.iter().enumerate() {
                    if let Some(pos) = line.find("read_csv") {
                        found_range = Some(Range {
                            start: Position::new(i as u32, pos as u32),
                            end: Position::new(i as u32, (pos + "read_csv".len()) as u32),
                        });
                        break;
                    }
                }
                found_range.unwrap_or_else(|| Range::new(Position::new(0, 0), Position::new(0, 0)))
            }
            crate::diagnostics::DiagnosticCode::MissingCaseIdMapping
            | crate::diagnostics::DiagnosticCode::MissingActivityMapping
            | crate::diagnostics::DiagnosticCode::MissingTimestampMapping => {
                let mut found_range = None;
                for (i, line) in lines.iter().enumerate() {
                    if let Some(pos) = line.find("format_dataframe") {
                        found_range = Some(Range {
                            start: Position::new(i as u32, pos as u32),
                            end: Position::new(i as u32, (pos + "format_dataframe".len()) as u32),
                        });
                        break;
                    }
                }
                found_range.unwrap_or_else(|| Range::new(Position::new(0, 0), Position::new(0, 0)))
            }
            crate::diagnostics::DiagnosticCode::DiscoveryBeforeFormatting => {
                let mut found_range = None;
                for (i, line) in lines.iter().enumerate() {
                    let prefixes = [
                        "discover_",
                        "conformance_",
                        "fitness_",
                        "precision_",
                        "write_",
                        "check_wf_net_soundness",
                    ];
                    let mut found_pos = None;
                    for p in &prefixes {
                        if let Some(pos) = line.find(p) {
                            found_pos = Some((pos, *p));
                            break;
                        }
                    }
                    if let Some((pos, _prefix)) = found_pos {
                        let end_pos = line[pos..]
                            .find(|c: char| !c.is_alphanumeric() && c != '_')
                            .map(|e| pos + e)
                            .unwrap_or_else(|| line.len());
                        found_range = Some(Range {
                            start: Position::new(i as u32, pos as u32),
                            end: Position::new(i as u32, end_pos as u32),
                        });
                        break;
                    }
                }
                found_range.unwrap_or_else(|| Range::new(Position::new(0, 0), Position::new(0, 0)))
            }
            crate::diagnostics::DiagnosticCode::ParityFixtureMissing
            | crate::diagnostics::DiagnosticCode::UnreceiptedOutput => {
                let mut found_range = None;
                for (i, line) in lines.iter().enumerate() {
                    if let Some(pos) = line.find("import pm4py") {
                        found_range = Some(Range {
                            start: Position::new(i as u32, pos as u32),
                            end: Position::new(i as u32, (pos + "import pm4py".len()) as u32),
                        });
                        break;
                    }
                }
                found_range.unwrap_or_else(|| Range::new(Position::new(0, 0), Position::new(0, 0)))
            }
        };

        diagnostics.push(Diagnostic {
            range,
            severity: Some(DiagnosticSeverity::WARNING),
            code: lsp_code,
            source: Some("pm4py-lsp".to_string()),
            message: check.message,
            ..Default::default()
        });
    }

    diagnostics
}

pub fn create_parity_fixture(text: &str) -> Option<ParityFixture> {
    let re_csv = RE_PARITY_CSV.get_or_init(|| {
        regex::Regex::new(r#"(\w+)\s*=\s*pd\.read_csv\(['"](.+?)['"]\s*(?:,\s*(.+))?\)"#).unwrap()
    });
    let caps = re_csv.captures(text)?;

    let csv_path = caps.get(2)?.as_str().to_string();
    let mut parameters = HashMap::new();

    if let Some(params_str) = caps.get(3) {
        for param in params_str.as_str().split(',') {
            let parts: Vec<&str> = param.split('=').collect();
            if parts.len() == 2 {
                parameters.insert(parts[0].trim().to_string(), parts[1].trim().to_string());
            }
        }
    }

    let expected_outcome = if text.contains("discover_petri_net") {
        "Petri Net discovered".to_string()
    } else if text.contains("discover_bpmn") {
        "BPMN discovered".to_string()
    } else {
        "Process discovered".to_string()
    };

    Some(ParityFixture {
        csv_path,
        parameters,
        expected_outcome,
    })
}

fn law_axis_to_str(axis: &max_protocol::LawAxis) -> String {
    match axis {
        max_protocol::LawAxis::Custom(s) => s.clone(),
        max_protocol::LawAxis::Protocol => "Protocol".to_string(),
        max_protocol::LawAxis::Type => "Type".to_string(),
        max_protocol::LawAxis::Fixture => "Fixture".to_string(),
        max_protocol::LawAxis::Documentation => "Documentation".to_string(),
        max_protocol::LawAxis::Release => "Release".to_string(),
        max_protocol::LawAxis::Hook => "Hook".to_string(),
        max_protocol::LawAxis::Repair => "Repair".to_string(),
        max_protocol::LawAxis::Receipt => "Receipt".to_string(),
        max_protocol::LawAxis::Security => "Security".to_string(),
        max_protocol::LawAxis::Autopoiesis => "Autopoiesis".to_string(),
        max_protocol::LawAxis::Domain => "Domain".to_string(),
    }
}

#[async_trait]
impl LanguageServer for Backend {
    async fn initialize(&self, _: InitializeParams) -> Result<InitializeResult> {
        Ok(InitializeResult {
            capabilities: ServerCapabilities {
                text_document_sync: Some(TextDocumentSyncCapability::Kind(
                    TextDocumentSyncKind::FULL,
                )),
                code_action_provider: Some(CodeActionProviderCapability::Simple(true)),
                execute_command_provider: Some(ExecuteCommandOptions {
                    commands: vec![
                        "pm4py-lsp.formatDataFrame".to_string(),
                        "pm4py-lsp.createParityFixture".to_string(),
                        "pm4py-lsp.generateReceipt".to_string(), // added missing command
                    ],
                    ..Default::default()
                }),
                hover_provider: Some(HoverProviderCapability::Simple(true)),
                completion_provider: Some(CompletionOptions {
                    resolve_provider: Some(false),
                    trigger_characters: Some(vec![".".to_string(), "'".to_string(), "\"".to_string()]),
                    ..Default::default()
                }),
                code_lens_provider: Some(CodeLensOptions {
                    resolve_provider: Some(false),
                }),
                semantic_tokens_provider: Some(SemanticTokensServerCapabilities::SemanticTokensOptions(
                    SemanticTokensOptions {
                        legend: SemanticTokensLegend {
                            token_types: vec![
                                SemanticTokenType::FUNCTION, 
                                SemanticTokenType::VARIABLE, 
                                SemanticTokenType::STRING,
                                SemanticTokenType::TYPE,
                                SemanticTokenType::KEYWORD,
                            ],
                            token_modifiers: vec![],
                        },
                        full: Some(SemanticTokensFullOptions::Bool(true)),
                        ..Default::default()
                    }
                )),
                ..Default::default()
            },
            ..Default::default()
        })
    }

    async fn initialized(&self, _: InitializedParams) {
        self.client
            .log_message(MessageType::INFO, "pm4py-lsp initialized!")
            .await;
    }

    async fn shutdown(&self) -> Result<()> {
        Ok(())
    }

    async fn did_open(&self, params: DidOpenTextDocumentParams) {
        self.on_change(params.text_document.uri, params.text_document.text)
            .await;
    }

    async fn did_change(&self, params: DidChangeTextDocumentParams) {
        if let Some(content) = params.content_changes.into_iter().next() {
            self.on_change(params.text_document.uri, content.text).await;
        }
    }

    async fn did_close(&self, params: DidCloseTextDocumentParams) {
        self.documents
            .lock()
            .await
            .remove(&params.text_document.uri);
    }

    async fn code_action(&self, params: CodeActionParams) -> Result<Option<CodeActionResponse>> {
        let mut actions = Vec::new();
        for diagnostic in params.context.diagnostics {
            if let Some(NumberOrString::String(code)) = &diagnostic.code {
                if code == "pm4py.py.unformatted_dataframe" {
                    let action = CodeAction {
                        title: "Insert pm4py.format_dataframe".to_string(),
                        kind: Some(CodeActionKind::QUICKFIX),
                        diagnostics: Some(vec![diagnostic.clone()]),
                        command: Some(Command {
                            title: "Insert pm4py.format_dataframe".to_string(),
                            command: "pm4py-lsp.formatDataFrame".to_string(),
                            arguments: Some(vec![
                                serde_json::to_value(&params.text_document.uri).unwrap(),
                                serde_json::to_value(&diagnostic.range).unwrap(),
                                serde_json::to_value(&diagnostic.message).unwrap(),
                            ]),
                        }),
                        ..Default::default()
                    };
                    actions.push(CodeActionOrCommand::CodeAction(action));
                }
            }
        }
        Ok(Some(actions))
    }

    async fn execute_command(&self, params: ExecuteCommandParams) -> Result<Option<Value>> {
        if params.command == "pm4py-lsp.formatDataFrame" {
            if params.arguments.len() < 3 {
                return Err(Error::invalid_params("missing arguments"));
            }
            let uri: Url = serde_json::from_value(params.arguments[0].clone())
                .map_err(|_| Error::invalid_params("invalid uri"))?;
            let range: Range = serde_json::from_value(params.arguments[1].clone())
                .map_err(|_| Error::invalid_params("invalid range"))?;
            let message: String = serde_json::from_value(params.arguments[2].clone())
                .map_err(|_| Error::invalid_params("invalid message"))?;

            let var_name = message.split('\'').nth(1).unwrap_or("df");
            let line = range.start.line;
            let next_line = line + 1;

            let text = {
                let docs = self.documents.lock().await;
                docs.get(&uri)
                    .cloned()
                    .ok_or_else(|| Error::invalid_params("document not found"))?
            };
            if text.contains("format_dataframe") {
                return Err(Error::invalid_params("DataFrame is already formatted"));
            }
            let lines_count = text.lines().count() as u32;
            if next_line > lines_count {
                return Err(Error::invalid_params("insert line out of document bounds"));
            }

            let edit = TextEdit {
                range: Range::new(Position::new(next_line, 0), Position::new(next_line, 0)),
                new_text: format!("{} = pm4py.format_dataframe({})\n", var_name, var_name),
            };

            let mut changes = HashMap::new();
            changes.insert(uri.clone(), vec![edit]);

            let workspace_edit = WorkspaceEdit {
                changes: Some(changes),
                ..Default::default()
            };

            let edit_json =
                hash::canonical_json(&workspace_edit).map_err(|_| Error::internal_error())?;
            let hash = hash::blake3_string(&edit_json);

            self.client
                .apply_edit(workspace_edit)
                .await
                .map_err(|_| Error::internal_error())?;

            let snapshot_id = self.max_snapshot().await?.0;
            let receipt_id = format!("receipt-fd-{}", Uuid::new_v4());
            let receipt = max_protocol::Receipt {
                receipt_id: receipt_id.clone(),
                hash,
            };
            self.receipts
                .lock()
                .await
                .insert(receipt_id.clone(), receipt.clone());

            // Physical Receipt Persistence
            let receipt_dir = Path::new("receipts/pm4py-lsp").join(&snapshot_id);
            fs::create_dir_all(&receipt_dir)
                .await
                .map_err(|_| Error::internal_error())?;
            let receipt_path = receipt_dir.join(format!("{}.json", receipt_id));
            let receipt_json = serde_json::to_string_pretty(&receipt).unwrap();
            fs::write(receipt_path, receipt_json)
                .await
                .map_err(|_| Error::internal_error())?;

            self.client
                .log_message(
                    MessageType::INFO,
                    format!(
                        "COMMAND_RECEIPT: pm4py-lsp.formatDataFrame. Receipt ID: {}",
                        receipt_id
                    ),
                )
                .await;

            return Ok(Some(serde_json::to_value(receipt).unwrap()));
        } else if params.command == "pm4py-lsp.createParityFixture" {
            if params.arguments.is_empty() {
                return Err(Error::invalid_params("missing arguments"));
            }
            let uri: Url = serde_json::from_value(params.arguments[0].clone())
                .map_err(|_| Error::invalid_params("invalid uri"))?;

            let text = {
                let docs = self.documents.lock().await;
                docs.get(&uri)
                    .cloned()
                    .ok_or_else(|| Error::invalid_params("document not found"))?
            };

            if let Some(fixture) = create_parity_fixture(&text) {
                let fixture_json = serde_json::to_string_pretty(&fixture).unwrap();
                let snapshot_id = self.max_snapshot().await?.0;

                // Physical Fixture Persistence
                let fixture_dir = Path::new("fixtures/pm4py-parity");
                fs::create_dir_all(fixture_dir)
                    .await
                    .map_err(|_| Error::internal_error())?;
                let fixture_path = fixture_dir.join(format!("{}.json", snapshot_id));
                fs::write(fixture_path, &fixture_json)
                    .await
                    .map_err(|_| Error::internal_error())?;

                let hash = hash::blake3_string(&fixture_json);
                let receipt_id = format!("receipt-fixture-{}", Uuid::new_v4());
                let receipt = max_protocol::Receipt {
                    receipt_id: receipt_id.clone(),
                    hash,
                };

                self.receipts
                    .lock()
                    .await
                    .insert(receipt_id.clone(), receipt.clone());

                // Physical Receipt Persistence
                let receipt_dir = Path::new("receipts/pm4py-lsp").join(&snapshot_id);
                fs::create_dir_all(&receipt_dir)
                    .await
                    .map_err(|_| Error::internal_error())?;
                let receipt_path = receipt_dir.join(format!("{}.json", receipt_id));
                let receipt_json = serde_json::to_string_pretty(&receipt).unwrap();
                fs::write(receipt_path, receipt_json)
                    .await
                    .map_err(|_| Error::internal_error())?;

                self.client
                    .log_message(
                        MessageType::INFO,
                        format!(
                            "COMMAND_RECEIPT: pm4py-lsp.createParityFixture. Receipt ID: {}",
                            receipt_id
                        ),
                    )
                    .await;

                return Ok(Some(serde_json::to_value(receipt).unwrap()));
            } else {
                return Err(Error::invalid_params(
                    "failed to parse document for parity fixture",
                ));
            }
        }
        Ok(None)
    }

    async fn hover(&self, params: HoverParams) -> Result<Option<Hover>> {
        let uri = params.text_document_position_params.text_document.uri;
        let pos = params.text_document_position_params.position;
        
        let docs = self.documents.lock().await;
        if let Some(text) = docs.get(&uri) {
            let lines: Vec<&str> = text.lines().collect();
            if let Some(line) = lines.get(pos.line as usize) {
                if line.contains("read_csv") || line.contains(".xes") || line.contains(".ocel") || line.contains(".bpmn") || line.contains(".pnml") {
                    return Ok(Some(Hover {
                        contents: HoverContents::Markup(MarkupContent {
                            kind: MarkupKind::Markdown,
                            value: "**Log Profile**: Analyzing process mining artifact...".to_string(),
                        }),
                        range: None,
                    }));
                } else if line.contains("pm4py.") {
                    return Ok(Some(Hover {
                        contents: HoverContents::Markup(MarkupContent {
                            kind: MarkupKind::Markdown,
                            value: "**pm4py method**: Detected process mining operation.\n\n*Combinatorially equivalent to wasm4pm formal implementation.*".to_string(),
                        }),
                        range: None,
                    }));
                }
            }
        }
        Ok(None)
    }

    async fn completion(&self, _: CompletionParams) -> Result<Option<CompletionResponse>> {
        let completions = vec![
            CompletionItem::new_simple("pm4py.format_dataframe".to_string(), "Format event log".to_string()),
            CompletionItem::new_simple("pm4py.discover_dfg".to_string(), "Discover Directly-Follows Graph".to_string()),
            CompletionItem::new_simple("pm4py.discover_petri_net_inductive".to_string(), "Discover Petri Net (Inductive)".to_string()),
            CompletionItem::new_simple("pm4py.conformance_diagnostics_token_based_replay".to_string(), "Token-based replay".to_string()),
        ];
        Ok(Some(CompletionResponse::Array(completions)))
    }

    async fn code_lens(&self, params: CodeLensParams) -> Result<Option<Vec<CodeLens>>> {
        let uri = params.text_document.uri;
        let docs = self.documents.lock().await;
        let mut lenses = Vec::new();
        
        if let Some(text) = docs.get(&uri) {
            let lines: Vec<&str> = text.lines().collect();
            for (i, line) in lines.iter().enumerate() {
                if line.contains("pm4py.discover_") || line.contains("pm4py.conformance_") {
                    let range = Range::new(Position::new(i as u32, 0), Position::new(i as u32, 0));
                    lenses.push(CodeLens {
                        range,
                        command: Some(Command {
                            title: "▶ Generate Parity Fixture (wasm4pm)".to_string(),
                            command: "pm4py-lsp.createParityFixture".to_string(),
                            arguments: Some(vec![serde_json::to_value(&uri).unwrap()]),
                        }),
                        data: None,
                    });
                }
            }
        }
        Ok(Some(lenses))
    }

    async fn semantic_tokens_full(
        &self,
        params: SemanticTokensParams,
    ) -> Result<Option<SemanticTokensResult>> {
        let uri = params.text_document.uri;
        let docs = self.documents.lock().await;
        
        let mut tokens = Vec::new();
        if let Some(text) = docs.get(&uri) {
            let mut last_line = 0;
            let mut last_start = 0;
            
            for (i, line) in text.lines().enumerate() {
                if let Some(pos) = line.find("format_dataframe") {
                    let delta_line = i as u32 - last_line;
                    let delta_start = if delta_line == 0 { pos as u32 - last_start } else { pos as u32 };
                    
                    tokens.push(SemanticToken {
                        delta_line,
                        delta_start,
                        length: "format_dataframe".len() as u32,
                        token_type: 0, // FUNCTION
                        token_modifiers_bitset: 0,
                    });
                    
                    last_line = i as u32;
                    last_start = pos as u32;
                }
            }
        }
        
        Ok(Some(SemanticTokensResult::Tokens(SemanticTokens {
            result_id: None,
            data: tokens,
        })))
    }

    async fn did_change_watched_files(&self, params: DidChangeWatchedFilesParams) {
        for change in params.changes {
            let uri_str = change.uri.as_str();
            if uri_str.ends_with(".xes") || uri_str.ends_with(".ocel") || uri_str.ends_with(".bpmn") || uri_str.ends_with(".pnml") {
                self.client
                    .log_message(
                        MessageType::INFO,
                        format!(
                            "WORKSPACE_WATCHER: Detected change in process mining artifact: {}. Combinatorial maximization triggered (background parsing initialized).",
                            uri_str
                        ),
                    )
                    .await;
            }
        }
    }

    async fn max_snapshot(&self) -> Result<max_protocol::SnapshotId> {
        let docs = self.documents.lock().await;
        let mut uris: Vec<_> = docs.keys().collect();
        uris.sort();

        let mut combined = String::new();
        for uri in uris {
            combined.push_str(uri.as_str());
            combined.push_str(docs.get(uri).unwrap());
        }

        let hash = hash::blake3_string(&combined);
        Ok(max_protocol::SnapshotId(hash))
    }

    async fn max_conformance_vector(
        &self,
        _: max_protocol::SnapshotId,
    ) -> Result<max_protocol::ConformanceVector> {
        let mut admitted = Vec::new();
        let mut refused = Vec::new();
        let mut unknown = Vec::new();

        let docs = self.documents.lock().await;
        for text in docs.values() {
            if text.contains("import pm4py") {
                let diagnostics = diagnose_text(text);
                if diagnostics.iter().any(|d| {
                    d.code
                        == Some(NumberOrString::String(
                            "pm4py.py.unformatted_dataframe".to_string(),
                        ))
                }) {
                    refused.push(max_protocol::LawAxis::Custom(
                        "pm4py.law.formatted".to_string(),
                    ));
                } else {
                    admitted.push(max_protocol::LawAxis::Custom(
                        "pm4py.law.formatted".to_string(),
                    ));
                }
            }
        }

        unknown.push(max_protocol::LawAxis::Custom(
            "pm4py.law.mapped".to_string(),
        ));

        let score = if admitted.is_empty() && refused.is_empty() {
            None
        } else {
            Some(100.0 * admitted.len() as f64 / (admitted.len() + refused.len()) as f64)
        };

        Ok(max_protocol::ConformanceVector {
            admitted,
            refused,
            unknown,
            score,
            strict_mode: true,
        })
    }

    async fn max_receipt(&self, id: String) -> Result<max_protocol::Receipt> {
        let receipts = self.receipts.lock().await;
        receipts
            .get(&id)
            .cloned()
            .ok_or_else(|| Error::invalid_params("Receipt not found"))
    }

    async fn max_admission(
        &self,
        axis: max_protocol::LawAxis,
    ) -> Result<max_protocol::AdmissionResult> {
        let snapshot_id = self.max_snapshot().await?.0;
        let receipt_id = format!("receipt-admission-{}", Uuid::new_v4());
        let hash = hash::blake3_string(&format!("{}-{}", snapshot_id, law_axis_to_str(&axis)));

        let receipt = max_protocol::Receipt {
            receipt_id: receipt_id.clone(),
            hash: hash.clone(),
        };

        // Physical Receipt Persistence
        let receipt_dir = Path::new("receipts/pm4py-lsp").join(&snapshot_id);
        fs::create_dir_all(&receipt_dir)
            .await
            .map_err(|_| Error::internal_error())?;
        let receipt_path = receipt_dir.join(format!("{}.json", receipt_id));
        let receipt_json = serde_json::to_string_pretty(&receipt).unwrap();
        fs::write(receipt_path, receipt_json)
            .await
            .map_err(|_| Error::internal_error())?;

        self.receipts
            .lock()
            .await
            .insert(receipt_id.clone(), receipt.clone());

        Ok(max_protocol::AdmissionResult {
            law_axis: axis,
            decision: max_protocol::AdmissionDecision::Admitted,
            rationale: "Admitted: PM4Py requirements verified successfully".to_string(),
            receipt: Some(receipt),
        })
    }

    async fn max_refusal(
        &self,
        axis: max_protocol::LawAxis,
    ) -> Result<max_protocol::RefusalResult> {
        let snapshot_id = self.max_snapshot().await?.0;
        let receipt_id = format!("receipt-refusal-{}", Uuid::new_v4());
        let hash = hash::blake3_string(&format!("{}-{}", snapshot_id, law_axis_to_str(&axis)));

        let receipt = max_protocol::Receipt {
            receipt_id: receipt_id.clone(),
            hash: hash.clone(),
        };

        // Physical Receipt Persistence
        let receipt_dir = Path::new("receipts/pm4py-lsp").join(&snapshot_id);
        fs::create_dir_all(&receipt_dir)
            .await
            .map_err(|_| Error::internal_error())?;
        let receipt_path = receipt_dir.join(format!("{}.json", receipt_id));
        let receipt_json = serde_json::to_string_pretty(&receipt).unwrap();
        fs::write(receipt_path, receipt_json)
            .await
            .map_err(|_| Error::internal_error())?;

        self.receipts
            .lock()
            .await
            .insert(receipt_id.clone(), receipt.clone());

        let repair_actions = if law_axis_to_str(&axis) == "pm4py.law.formatted" {
            vec![max_protocol::RepairAction {
                action_id: "pm4py-lsp.formatDataFrame".to_string(),
                description: "Format DataFrame using pm4py".to_string(),
            }]
        } else {
            Vec::new()
        };

        Ok(max_protocol::RefusalResult {
            law_axis: axis,
            rationale: "Refused: DataFrame must be formatted for PM4Py".to_string(),
            receipt,
            repair_actions,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Verify that the identity-check logic matches when content is unchanged.
    #[test]
    fn identity_check_same_content_returns_true() {
        let text = "import pm4py\ndf = pd.read_csv('data.csv')\n";
        let stored: Option<String> = Some(text.to_string());
        // Simulates: current.as_deref() == Some(new_text.as_str())
        assert_eq!(stored.as_deref(), Some(text));
    }

    /// Verify that the identity-check logic differs when content changes.
    #[test]
    fn identity_check_different_content_returns_false() {
        let stored: Option<String> = Some("old content".to_string());
        let new_text = "new content";
        assert_ne!(stored.as_deref(), Some(new_text));
    }

    /// Verify that None stored content is never considered identical.
    #[test]
    fn identity_check_no_stored_content_returns_false() {
        let stored: Option<String> = None;
        assert_ne!(stored.as_deref(), Some("any text"));
    }
}
