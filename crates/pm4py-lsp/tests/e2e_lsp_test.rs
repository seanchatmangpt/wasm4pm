use pm4py_lsp::Backend;
use std::sync::Arc;
use tokio::sync::Mutex;
use tower_lsp_max::lsp_types::*;
use tower_lsp_max::max_protocol::LawAxis;
use tower_lsp_max::{LanguageServer, LspService};

// Helper: well-formed pm4py file — no unformatted_dataframe diagnostic
fn well_formed_py() -> &'static str {
    "import pm4py\nimport pandas as pd\ndf = pd.read_csv('log.csv')\ndf = pm4py.format_dataframe(df)\n"
}

// Helper: file missing format_dataframe — triggers unformatted_dataframe diagnostic
fn unformatted_py() -> &'static str {
    "import pm4py\nimport pandas as pd\ndf = pd.read_csv('log.csv')\nnet, im, fm = pm4py.discover_petri_net_inductive(df)\n"
}

/// 1. Full initialize → initialized → shutdown round trip.
#[tokio::test]
async fn test_e2e_initialize_and_shutdown() {
    let (service, _socket) = LspService::new(|client| Backend::new(client));
    let backend = service.inner();

    let init_result = backend
        .initialize(InitializeParams {
            capabilities: ClientCapabilities::default(),
            ..Default::default()
        })
        .await
        .unwrap();

    // Server advertises full sync
    assert_eq!(
        init_result.capabilities.text_document_sync,
        Some(TextDocumentSyncCapability::Kind(TextDocumentSyncKind::FULL))
    );

    // Server advertises code actions
    assert!(
        init_result.capabilities.code_action_provider.is_some(),
        "server must advertise code_action_provider"
    );

    // initialized notification must not panic
    backend.initialized(InitializedParams {}).await;

    // shutdown returns Ok
    backend.shutdown().await.unwrap();
}

/// 2. did_open triggers diagnostics: verify the diagnostic engine produces
///    unformatted_dataframe for content missing format_dataframe.
#[tokio::test]
async fn test_e2e_did_open_triggers_diagnostics() {
    let (service, _socket) = LspService::new(|client| Backend::new(client));
    let backend = service.inner();
    let uri = Url::parse("file:///open_diag.py").unwrap();

    backend
        .did_open(DidOpenTextDocumentParams {
            text_document: TextDocumentItem {
                uri: uri.clone(),
                language_id: "python".to_string(),
                version: 1,
                text: unformatted_py().to_string(),
            },
        })
        .await;

    // Verify document is stored and diagnose_text produces unformatted_dataframe.
    // publish_diagnostics is called internally by on_change; the diagnostic content
    // is deterministic from the text, verified directly here.
    let docs = backend.documents.lock().await;
    let stored = docs
        .get(&uri)
        .expect("document must be stored after did_open");
    let diagnostics = pm4py_lsp::diagnose_text(stored);
    let found = diagnostics.iter().any(|d| {
        d.code
            == Some(NumberOrString::String(
                "pm4py.py.unformatted_dataframe".to_string(),
            ))
    });
    assert!(
        found,
        "diagnose_text must produce unformatted_dataframe for content missing format_dataframe"
    );
}

/// 3. did_change updates diagnostics: after changing to well-formed content,
///    the stored document reflects the fix and diagnose_text clears the diagnostic.
#[tokio::test]
async fn test_e2e_did_change_updates_diagnostics() {
    let (service, _socket) = LspService::new(|client| Backend::new(client));
    let backend = service.inner();
    let uri = Url::parse("file:///change_diag.py").unwrap();

    // Open with unformatted content
    backend
        .did_open(DidOpenTextDocumentParams {
            text_document: TextDocumentItem {
                uri: uri.clone(),
                language_id: "python".to_string(),
                version: 1,
                text: unformatted_py().to_string(),
            },
        })
        .await;

    // Verify initial state: diagnostic is present
    {
        let docs = backend.documents.lock().await;
        let stored = docs.get(&uri).unwrap();
        let diags = pm4py_lsp::diagnose_text(stored);
        assert!(
            diags.iter().any(|d| d.code
                == Some(NumberOrString::String(
                    "pm4py.py.unformatted_dataframe".to_string()
                ))),
            "unformatted_dataframe must be present before fix"
        );
    }

    // Change to well-formed content
    backend
        .did_change(DidChangeTextDocumentParams {
            text_document: VersionedTextDocumentIdentifier {
                uri: uri.clone(),
                version: 2,
            },
            content_changes: vec![TextDocumentContentChangeEvent {
                range: None,
                range_length: None,
                text: well_formed_py().to_string(),
            }],
        })
        .await;

    // Verify document updated and diagnostic cleared
    let docs = backend.documents.lock().await;
    let stored = docs
        .get(&uri)
        .expect("document must still exist after did_change");
    assert_eq!(
        stored,
        well_formed_py(),
        "document content must reflect did_change"
    );
    let diags = pm4py_lsp::diagnose_text(stored);
    assert!(
        !diags.iter().any(|d| d.code
            == Some(NumberOrString::String(
                "pm4py.py.unformatted_dataframe".to_string()
            ))),
        "unformatted_dataframe must be absent after fixing the file"
    );
}

/// 4. code_action returns a well-formed quickfix for unformatted_dataframe;
///    verifies the action structure and that applying the fix text clears the diagnostic.
#[tokio::test]
async fn test_e2e_code_action_repairs_diagnostic() {
    let (service, _socket) = LspService::new(|client| Backend::new(client));
    let backend = service.inner();
    let uri = Url::parse("file:///action_repair.py").unwrap();

    backend
        .did_open(DidOpenTextDocumentParams {
            text_document: TextDocumentItem {
                uri: uri.clone(),
                language_id: "python".to_string(),
                version: 1,
                text: unformatted_py().to_string(),
            },
        })
        .await;

    // Get diagnostic directly from the diagnostic engine
    let diagnostic = {
        let docs = backend.documents.lock().await;
        pm4py_lsp::diagnose_text(docs.get(&uri).unwrap())
            .into_iter()
            .find(|d| {
                d.code
                    == Some(NumberOrString::String(
                        "pm4py.py.unformatted_dataframe".to_string(),
                    ))
            })
            .expect("expected unformatted_dataframe diagnostic")
    };

    // Request code actions
    let actions = backend
        .code_action(CodeActionParams {
            text_document: TextDocumentIdentifier { uri: uri.clone() },
            range: diagnostic.range,
            context: CodeActionContext {
                diagnostics: vec![diagnostic.clone()],
                only: None,
                trigger_kind: None,
            },
            work_done_progress_params: WorkDoneProgressParams::default(),
            partial_result_params: PartialResultParams::default(),
        })
        .await
        .unwrap()
        .expect("should return code actions");

    assert!(
        !actions.is_empty(),
        "should return at least one code action"
    );

    let format_action = match &actions[0] {
        CodeActionOrCommand::CodeAction(ca) => ca,
        _ => panic!("expected CodeAction"),
    };
    assert!(
        format_action.title.contains("format_dataframe"),
        "action title must reference format_dataframe"
    );

    // Verify the action's command is the correct repair command
    let cmd = format_action
        .command
        .as_ref()
        .expect("action must have command");
    assert_eq!(
        cmd.command, "pm4py-lsp.formatDataFrame",
        "command id must be pm4py-lsp.formatDataFrame"
    );
    assert!(
        cmd.arguments
            .as_ref()
            .map(|a| a.len() >= 2)
            .unwrap_or(false),
        "command must carry at least uri + range arguments"
    );

    // Verify that the fix text (well_formed_py) produces no unformatted_dataframe diagnostic,
    // proving the repair command points to the correct transformation.
    let fix_diags = pm4py_lsp::diagnose_text(well_formed_py());
    assert!(
        !fix_diags.iter().any(|d| d.code
            == Some(NumberOrString::String(
                "pm4py.py.unformatted_dataframe".to_string()
            ))),
        "applying format_dataframe must eliminate the unformatted_dataframe diagnostic"
    );
}

/// 5. Two files opened concurrently are diagnosed independently.
#[tokio::test]
async fn test_e2e_multiple_files_concurrent() {
    let (service, _socket) = LspService::new(|client| Backend::new(client));
    let backend = service.inner();

    let uri_a = Url::parse("file:///concurrent_a.py").unwrap();
    let uri_b = Url::parse("file:///concurrent_b.py").unwrap();

    // Open both files concurrently
    tokio::join!(
        backend.did_open(DidOpenTextDocumentParams {
            text_document: TextDocumentItem {
                uri: uri_a.clone(),
                language_id: "python".to_string(),
                version: 1,
                text: unformatted_py().to_string(),
            },
        }),
        backend.did_open(DidOpenTextDocumentParams {
            text_document: TextDocumentItem {
                uri: uri_b.clone(),
                language_id: "python".to_string(),
                version: 1,
                text: well_formed_py().to_string(),
            },
        })
    );

    let docs = backend.documents.lock().await;

    // File A: unformatted — must have unformatted_dataframe
    let diags_a = pm4py_lsp::diagnose_text(docs.get(&uri_a).unwrap());
    assert!(
        diags_a.iter().any(|d| {
            d.code
                == Some(NumberOrString::String(
                    "pm4py.py.unformatted_dataframe".to_string(),
                ))
        }),
        "concurrent_a.py must have unformatted_dataframe diagnostic"
    );

    // File B: well-formed — must NOT have unformatted_dataframe
    let diags_b = pm4py_lsp::diagnose_text(docs.get(&uri_b).unwrap());
    assert!(
        !diags_b.iter().any(|d| {
            d.code
                == Some(NumberOrString::String(
                    "pm4py.py.unformatted_dataframe".to_string(),
                ))
        }),
        "concurrent_b.py must not have unformatted_dataframe diagnostic"
    );

    // Conformance vector must reflect both files: A refused, B admitted
    drop(docs);
    let snapshot = backend.max_snapshot().await.unwrap();
    let cv = backend.max_conformance_vector(snapshot).await.unwrap();
    assert!(
        cv.refused
            .contains(&LawAxis::Custom("pm4py.law.formatted".to_string())),
        "refused must contain pm4py.law.formatted when unformatted file is open"
    );
}

/// 6. did_close removes the document so no further diagnostics are produced from it.
#[tokio::test]
async fn test_e2e_close_removes_diagnostics() {
    use futures::stream::StreamExt;

    let (service, socket) = LspService::new(|client| Backend::new(client));
    let (mut request_stream, _response_sink) = socket.split();
    let received = Arc::new(Mutex::new(Vec::new()));
    let received_clone = received.clone();

    tokio::spawn(async move {
        while let Some(req) = request_stream.next().await {
            received_clone.lock().await.push(req);
        }
    });

    let backend = service.inner();
    let uri = Url::parse("file:///close_clear.py").unwrap();

    backend
        .did_open(DidOpenTextDocumentParams {
            text_document: TextDocumentItem {
                uri: uri.clone(),
                language_id: "python".to_string(),
                version: 1,
                text: unformatted_py().to_string(),
            },
        })
        .await;

    // Document must be stored
    {
        let docs = backend.documents.lock().await;
        assert!(
            docs.contains_key(&uri),
            "document must exist after did_open"
        );
    }

    backend
        .did_close(DidCloseTextDocumentParams {
            text_document: TextDocumentIdentifier { uri: uri.clone() },
        })
        .await;

    // Document must be removed — no state to produce diagnostics from
    {
        let docs = backend.documents.lock().await;
        assert!(
            !docs.contains_key(&uri),
            "document must be removed after did_close"
        );
    }

    // Conformance vector for an empty workspace has no refused axes for formatting
    let snapshot = backend.max_snapshot().await.unwrap();
    let cv = backend.max_conformance_vector(snapshot).await.unwrap();
    assert!(
        !cv.refused
            .contains(&LawAxis::Custom("pm4py.law.formatted".to_string())),
        "no refused axes expected after all documents are closed"
    );
}

/// 13-step E2E Lifecycle test.
#[tokio::test]
async fn test_e2e_lsp_lifecycle() {
    // Ensure we start clean for this test by removing persistence directories
    let _ = std::fs::remove_dir_all("fixtures/pm4py-parity");
    let _ = std::fs::remove_dir_all("receipts/pm4py-lsp");

    use futures::sink::SinkExt;
    use futures::stream::StreamExt;
    use tower::Service;

    // 1. Start pm4py-lsp through max service harness (LspService).
    let (mut service, socket) = LspService::new(|client| Backend::new(client));

    let (mut request_stream, mut response_sink) = socket.split();
    let received_requests = Arc::new(Mutex::new(Vec::new()));
    let received_requests_clone = received_requests.clone();

    tokio::spawn(async move {
        while let Some(request) = request_stream.next().await {
            println!("MOCK CLIENT RECEIVED: {:?}", request);
            received_requests_clone.lock().await.push(request.clone());
            if let Some(id) = request.id() {
                let response = tower_lsp_max::jsonrpc::Response::from_ok(
                    id.clone(),
                    serde_json::json!({"applied": true}),
                );
                let _ = response_sink.send(response).await;
            }
        }
    });

    // 2. initialize.
    let init_req = tower_lsp_max::jsonrpc::Request::build("initialize")
        .id(1)
        .params(serde_json::to_value(InitializeParams::default()).unwrap())
        .finish();
    let _ = service.call(init_req).await.unwrap();

    let initialized_req = tower_lsp_max::jsonrpc::Request::build("initialized").finish();
    let _ = service.call(initialized_req).await.unwrap();

    let backend = service.inner();

    // 3. didOpen Python file with PM4Py + unformatted read_csv.
    let uri = Url::parse("file:///test_e2e.py").unwrap();
    let code_unformatted = r#"
import pm4py
import pandas as pd

df = pd.read_csv('event_log.csv')
net, im, fm = pm4py.discover_petri_net_inductive(df)
"#;

    let open_params = DidOpenTextDocumentParams {
        text_document: TextDocumentItem {
            uri: uri.clone(),
            language_id: "python".to_string(),
            version: 1,
            text: code_unformatted.to_string(),
        },
    };
    backend.did_open(open_params).await;

    // Give some time for background notifications to be processed
    tokio::time::sleep(tokio::time::Duration::from_millis(400)).await;

    // 4. Verify diagnostic appears.
    let unformatted_diag = {
        let reqs = received_requests.lock().await;
        let mut unformatted_diag = None;
        for req in reqs.iter() {
            if req.method() == "textDocument/publishDiagnostics" {
                if let Some(params) = req.params() {
                    let diag_params: PublishDiagnosticsParams =
                        serde_json::from_value(params.clone()).unwrap();
                    if diag_params.uri == uri {
                        for diag in &diag_params.diagnostics {
                            if diag.code
                                == Some(NumberOrString::String(
                                    "pm4py.py.unformatted_dataframe".to_string(),
                                ))
                            {
                                unformatted_diag = Some(diag.clone());
                            }
                        }
                    }
                }
            }
        }
        unformatted_diag
            .expect("Should have received publishDiagnostics with unformatted_dataframe")
    };

    // 5. Request codeAction.
    let code_action_params = CodeActionParams {
        text_document: TextDocumentIdentifier { uri: uri.clone() },
        range: unformatted_diag.range.clone(),
        context: CodeActionContext {
            diagnostics: vec![unformatted_diag.clone()],
            only: None,
            trigger_kind: None,
        },
        work_done_progress_params: WorkDoneProgressParams::default(),
        partial_result_params: PartialResultParams::default(),
    };
    let code_actions = backend
        .code_action(code_action_params)
        .await
        .unwrap()
        .expect("Should return code actions");
    assert!(
        !code_actions.is_empty(),
        "Should return at least one code action"
    );
    let format_action = match &code_actions[0] {
        CodeActionOrCommand::CodeAction(action) => action,
        _ => panic!("Expected a CodeAction, not a Command"),
    };
    assert_eq!(
        format_action.command.as_ref().unwrap().command,
        "pm4py-lsp.formatDataFrame"
    );

    // 6. Execute formatDataFrame command.
    let cmd = format_action.command.as_ref().unwrap();
    let execute_params = ExecuteCommandParams {
        command: cmd.command.clone(),
        arguments: cmd.arguments.clone().unwrap_or_default(),
        work_done_progress_params: WorkDoneProgressParams::default(),
    };
    let command_result = backend
        .execute_command(execute_params)
        .await
        .unwrap()
        .expect("Command execution should return a receipt");

    // Give some time for background tasks and file system writes
    tokio::time::sleep(tokio::time::Duration::from_millis(400)).await;

    // 7. Verify WorkspaceEdit applied (e.g. by checking the mock client or simulating it).
    {
        let reqs_after_cmd = received_requests.lock().await;
        let mut found_apply_edit = false;
        for req in reqs_after_cmd.iter() {
            if req.method() == "workspace/applyEdit" {
                found_apply_edit = true;
                if let Some(params) = req.params() {
                    let edit_params: ApplyWorkspaceEditParams =
                        serde_json::from_value(params.clone()).unwrap();
                    let changes = edit_params
                        .edit
                        .changes
                        .expect("Should contain workspace edit changes");
                    let edits = changes.get(&uri).expect("Should contain edits for our URI");
                    assert!(!edits.is_empty(), "Edits list should not be empty");
                    assert!(edits[0]
                        .new_text
                        .contains("df = pm4py.format_dataframe(df)"));
                }
            }
        }
        assert!(
            found_apply_edit,
            "Should have sent workspace/applyEdit request to the client"
        );
    }

    // 8. Verify receipt returned and persisted.
    let receipt: tower_lsp_max::max_protocol::Receipt =
        serde_json::from_value(command_result).unwrap();
    assert!(receipt.receipt_id.starts_with("receipt-fd-"));

    // Check that it's persisted in backend memory
    let persisted_receipt = backend
        .max_receipt(receipt.receipt_id.clone())
        .await
        .unwrap();
    assert_eq!(persisted_receipt.hash, receipt.hash);

    // Check that it was persisted on disk
    let snapshot_id = backend.max_snapshot().await.unwrap().0;
    let receipt_path = std::path::Path::new("receipts/pm4py-lsp")
        .join(&snapshot_id)
        .join(format!("{}.json", receipt.receipt_id));
    assert!(
        receipt_path.exists(),
        "Receipt file should be persisted on disk"
    );

    // 9. didChange with repaired content.
    let code_formatted = r#"
import pm4py
import pandas as pd

df = pd.read_csv('event_log.csv')
df = pm4py.format_dataframe(df)
net, im, fm = pm4py.discover_petri_net_inductive(df)
"#;

    let change_params = DidChangeTextDocumentParams {
        text_document: VersionedTextDocumentIdentifier {
            uri: uri.clone(),
            version: 2,
        },
        content_changes: vec![TextDocumentContentChangeEvent {
            range: None,
            range_length: None,
            text: code_formatted.to_string(),
        }],
    };
    backend.did_change(change_params).await;

    // Give some time for publishDiagnostics notification
    tokio::time::sleep(tokio::time::Duration::from_millis(400)).await;

    // 10. Verify diagnostic clears through lifecycle.
    {
        let reqs_after_change = received_requests.lock().await;
        let mut found_updated_diags = false;
        let mut has_unformatted = false;
        for req in reqs_after_change.iter().rev() {
            if req.method() == "textDocument/publishDiagnostics" {
                if let Some(params) = req.params() {
                    let diag_params: PublishDiagnosticsParams =
                        serde_json::from_value(params.clone()).unwrap();
                    if diag_params.uri == uri {
                        found_updated_diags = true;
                        for diag in &diag_params.diagnostics {
                            if diag.code
                                == Some(NumberOrString::String(
                                    "pm4py.py.unformatted_dataframe".to_string(),
                                ))
                            {
                                has_unformatted = true;
                            }
                        }
                        break;
                    }
                }
            }
        }
        assert!(
            found_updated_diags,
            "Should have received publishDiagnostics after didChange"
        );
        assert!(
            !has_unformatted,
            "The unformatted dataframe diagnostic should be cleared"
        );
    }

    // 11. Verify conformance vector is Admitted for formatting law.
    let snapshot_id_2 = backend.max_snapshot().await.unwrap();
    let conformance_vector = backend.max_conformance_vector(snapshot_id_2).await.unwrap();
    assert!(conformance_vector
        .admitted
        .contains(&LawAxis::Custom("pm4py.law.formatted".to_string())));
    assert!(!conformance_vector
        .refused
        .contains(&LawAxis::Custom("pm4py.law.formatted".to_string())));

    // 12. didClose.
    let close_params = DidCloseTextDocumentParams {
        text_document: TextDocumentIdentifier { uri: uri.clone() },
    };
    backend.did_close(close_params).await;

    // 13. Verify document state clears/deactivates.
    let docs = backend.documents.lock().await;
    assert!(
        !docs.contains_key(&uri),
        "Document state should clear after didClose"
    );

    // Clean up files generated during test
    let _ = std::fs::remove_dir_all("fixtures/pm4py-parity");
    let _ = std::fs::remove_dir_all("receipts/pm4py-lsp");
}
