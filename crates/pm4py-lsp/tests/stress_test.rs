use std::str::FromStr;
use futures::FutureExt;
use pm4py_lsp::analysis::PipelineFacts;
use pm4py_lsp::diagnose_text;
use pm4py_lsp::fixtures::{persist_fixture, reload_fixture, Fixture};
use pm4py_lsp::receipts::{persist_receipt, verify_receipt_file, Receipt, SnapshotId};
use pm4py_lsp::Backend;
use std::sync::Arc;
use tempfile::tempdir;
use tower_lsp_max::lsp_types::*;
use tower_lsp_max::{LanguageServer, LspService};

// Helper to generate different PM4Py-like file content
fn generate_random_pm4py_file(i: usize) -> String {
    let df_name = format!("df_{}", i);
    let csv_file = format!("log_{}.csv", i);
    match i % 5 {
        0 => format!(
            "import pm4py\nimport pandas as pd\n{} = pd.read_csv('{}')\n{} = pm4py.format_dataframe({}, case_id='case_id', activity_key='activity', timestamp_key='timestamp')\nnet, im, fm = pm4py.discover_petri_net_inductive({})\n",
            df_name, csv_file, df_name, df_name, df_name
        ),
        1 => format!(
            "import pm4py\nimport pandas as pd\n{} = pd.read_csv('{}')\nnet, im, fm = pm4py.discover_petri_net_inductive({})\n",
            df_name, csv_file, df_name
        ),
        2 => format!(
            "import pm4py as pm\nimport pandas as pd\n{} = pd.read_csv('{}')\n{} = pm.format_dataframe({}, case_id='case_id')\n",
            df_name, csv_file, df_name, df_name
        ),
        3 => format!(
            "from pm4py import discover_bpmn_inductive\nimport pandas as pd\n{} = pd.read_excel('{}')\nbpmn = discover_bpmn_inductive({})\n",
            df_name, csv_file, df_name
        ),
        _ => format!(
            "import pandas as pd\n{} = pd.read_csv('{}')\n# No pm4py imports at all\n",
            df_name, csv_file
        )
    }
}

/// S1. 1,000 PM4Py-like files analyzed without panic.
#[test]
#[ignore = "stress gate"]
fn test_stress_s1_files_analyzed_without_panic() {
    for i in 0..1000 {
        let content = generate_random_pm4py_file(i);
        let diags = diagnose_text(&content);
        // Ensure the operation completes and doesn't crash
        let _ = diags;
    }
}

/// S2. 10,000 read_csv lines analyzed within bounded time.
#[test]
#[ignore = "stress gate"]
fn test_stress_s2_read_csv_bounded_time() {
    let mut content = String::new();
    content.push_str("import pm4py\nimport pandas as pd\n");
    for i in 0..10000 {
        content.push_str(&format!("df_{} = pd.read_csv('log_{}.csv')\n", i, i));
    }

    let start = std::time::Instant::now();
    let diags = diagnose_text(&content);
    let duration = start.elapsed();
    let _ = diags;

    assert!(
        duration.as_secs_f64() < 5.0,
        "S2: 10,000 read_csv lines analysis took too long: {:?}",
        duration
    );
}

/// S3. 1,000 receipts generated and verified.
#[test]
#[ignore = "stress gate"]
fn test_stress_s3_receipts_generated_verified() {
    let dir = tempdir().unwrap();
    let base_path = dir.path();

    for i in 0..1000 {
        let uri = format!("file:///script_{}.py", i);
        let content = format!("import pm4py\n# iteration {}\n", i);
        let snapshot_id = SnapshotId::new(&[uri.as_str()], &[content.as_str()], "");
        let data = serde_json::json!({
            "iteration": i,
            "status": "ok",
            "type": "receipt_test"
        });
        let canonical = wasm4pm_compat::hash::canonical_json(&data).unwrap();
        let hash = wasm4pm_compat::hash::blake3_string(&canonical);
        let receipt_id = format!("receipt_{}", i);
        let receipt = Receipt {
            id: receipt_id.clone(),
            snapshot_id,
            data,
            hash,
            prev_receipt_hash: None,
        };

        persist_receipt(&receipt, base_path)
            .unwrap_or_else(|e| unreachable!("S3: Failed to persist receipt at {}: {}", i, e));

        let receipt_path = base_path
            .join("receipts/pm4py-lsp")
            .join(receipt.snapshot_id.as_str())
            .join(format!("{}.json", receipt_id));

        assert!(
            verify_receipt_file(&receipt_path),
            "S3: Verification failed for receipt {} at path {:?}",
            i,
            receipt_path
        );
    }
}

/// S4. 1,000 fixtures generated and reloaded.
#[test]
#[ignore = "stress gate"]
fn test_stress_s4_fixtures_generated_reloaded() {
    let dir = tempdir().unwrap();
    let base_path = dir.path();

    for i in 0..1000 {
        let uri = format!("file:///doc_{}.py", i);
        let content = format!("import pm4py\n# iteration {}\n", i);
        let snapshot_id = SnapshotId::new(&[uri.as_str()], &[content.as_str()], "stress_fixture");
        let data = serde_json::json!({
            "iteration": i,
            "uri": uri,
            "content": content,
        });

        let fixture = Fixture {
            snapshot_id: snapshot_id.clone(),
            data,
            version: 1,
        };

        persist_fixture(&fixture, base_path)
            .unwrap_or_else(|e| unreachable!("S4: Failed to persist fixture at {}: {}", i, e));

        let reloaded = reload_fixture(&snapshot_id, base_path)
            .unwrap_or_else(|e| unreachable!("S4: Failed to reload fixture at {}: {}", i, e));

        assert_eq!(
            reloaded.snapshot_id, fixture.snapshot_id,
            "S4: snapshot_id mismatch at {}",
            i
        );
        assert_eq!(reloaded.data, fixture.data, "S4: data mismatch at {}", i);
    }
}

/// S5. 100 concurrent didChange events stabilize.
#[tokio::test]
#[ignore = "stress gate"]
async fn test_stress_s5_concurrent_did_change() {
    use futures::sink::SinkExt;
    use futures::stream::StreamExt;

    let (service, socket) = LspService::new(|client| Backend::new(client));
    let (mut request_stream, mut response_sink) = socket.split();

    // Drain the client socket in the background to prevent blocking
    tokio::spawn(async move {
        while let Some(req) = request_stream.next().await {
            if let Some(id) = req.id() {
                let res = tower_lsp_max::jsonrpc::Response::from_ok(
                    id.clone(),
                    serde_json::json!({"applied": true}),
                );
                let _ = response_sink.send(res).await;
            }
        }
    });

    let backend = service.inner();
    let mut futures: Vec<futures::future::BoxFuture<'_, ()>> = Vec::new();

    for i in 0..100 {
        let uri = DocumentUri::from_str(&format!("file:///doc_{}.py", i)).unwrap();
        futures.push(
            async move {
                // Call did_open first
                backend
                    .did_open(DidOpenTextDocumentParams {
                        text_document: TextDocumentItem {
                            uri: uri.clone(),
                            language_id: "python".to_string(),
                            version: 1,
                            text: "import pm4py\n".to_string(),
                        },
                    })
                    .await;

                // Call did_change to update content
                backend
                    .did_change(DidChangeTextDocumentParams {
                        text_document: VersionedTextDocumentIdentifier {
                            uri: uri.clone(),
                            version: 2,
                        },
                        content_changes: vec![TextDocumentContentChangeEvent {
                            range: None,
                            range_length: None,
                            text: format!("import pm4py\n# version {}\n", i),
                        }],
                    })
                    .await;
            }
            .boxed(),
        );
    }

    // Run them concurrently using cooperative multitasking
    futures::future::join_all(futures).await;

    // Verify document map size has stabilized at 100
    let docs = backend.documents.lock().await;
    assert_eq!(
        docs.len(),
        100,
        "S5: Expected 100 documents to be registered"
    );
}

/// S6. repeated conformance queries are stable.
#[tokio::test]
#[ignore = "stress gate"]
async fn test_stress_s6_repeated_conformance_queries() {
    let (service, _) = LspService::new(|client| Backend::new(client));
    let backend = service.inner();

    // Set up a few documents in the backend
    let uri1 = DocumentUri::from_str("file:///doc1.py").unwrap();
    backend.documents.lock().await.insert(
        uri1.clone(),
        "import pm4py\nimport pandas as pd\ndf = pd.read_csv('log.csv')\n".to_string(),
    );

    let uri2 = DocumentUri::from_str("file:///doc2.py").unwrap();
    backend.documents.lock().await.insert(
        uri2.clone(),
        "import pm4py\nimport pandas as pd\ndf = pd.read_csv('log.csv')\ndf = pm4py.format_dataframe(df)\n".to_string(),
    );

    let snap_id = backend.max_snapshot().await.unwrap();
    let first = backend
        .max_conformance_vector(Some(snap_id.clone()))
        .await
        .unwrap();

    for i in 0..100 {
        let cv = backend
            .max_conformance_vector(Some(snap_id.clone()))
            .await
            .unwrap();
        assert_eq!(
            first.score, cv.score,
            "S6: Score mismatch at iteration {}",
            i
        );
        assert_eq!(
            first.admitted, cv.admitted,
            "S6: Admitted mismatch at iteration {}",
            i
        );
        assert_eq!(
            first.refused, cv.refused,
            "S6: Refused mismatch at iteration {}",
            i
        );
        assert_eq!(
            first.strict_mode, cv.strict_mode,
            "S6: Strict mode mismatch at iteration {}",
            i
        );
    }
}

/// S7. memory/leakage control: verify document map size returns to 0 after didClose.
#[tokio::test]
#[ignore = "stress gate"]
async fn test_stress_s7_memory_leakage_control() {
    let (service, _) = LspService::new(|client| Backend::new(client));
    let backend = service.inner();

    let mut uris = Vec::new();
    for i in 0..100 {
        let uri = DocumentUri::from_str(&format!("file:///doc_{}.py", i)).unwrap();
        backend
            .did_open(DidOpenTextDocumentParams {
                text_document: TextDocumentItem {
                    uri: uri.clone(),
                    language_id: "python".to_string(),
                    version: 1,
                    text: "import pm4py\n".to_string(),
                },
            })
            .await;
        uris.push(uri);
    }

    {
        let docs = backend.documents.lock().await;
        assert_eq!(
            docs.len(),
            100,
            "S7: Document map size should be 100 after did_open"
        );
    }

    for uri in uris {
        backend
            .did_close(DidCloseTextDocumentParams {
                text_document: TextDocumentIdentifier { uri },
            })
            .await;
    }

    {
        let docs = backend.documents.lock().await;
        assert_eq!(
            docs.len(),
            0,
            "S7: Document map size should return to 0 after did_close"
        );
    }
}

/// S8. deadlock check: parallel codeAction + executeCommand.
#[tokio::test]
#[ignore = "stress gate"]
async fn test_stress_s8_deadlock_check() {
    use futures::sink::SinkExt;
    use futures::stream::StreamExt;

    let (service, socket) = LspService::new(|client| Backend::new(client));
    let (mut request_stream, mut response_sink) = socket.split();

    // Drain the socket to handle the client apply_edit/log_message calls
    tokio::spawn(async move {
        while let Some(req) = request_stream.next().await {
            if let Some(id) = req.id() {
                let res = tower_lsp_max::jsonrpc::Response::from_ok(
                    id.clone(),
                    serde_json::json!({"applied": true}),
                );
                let _ = response_sink.send(res).await;
            }
        }
    });

    let backend = service.inner();

    // Pre-populate documents so we have something to query
    let uri = DocumentUri::from_str("file:///deadlock_test.py").unwrap();
    let text = "import pm4py\nimport pandas as pd\ndf = pd.read_csv('log.csv')\n";
    backend
        .documents
        .lock()
        .await
        .insert(uri.clone(), text.to_string());

    let mut futures: Vec<futures::future::BoxFuture<'_, ()>> = Vec::new();
    for _ in 0..50 {
        // code action task
        let uri_clone = uri.clone();
        futures.push(
            async move {
                let params = CodeActionParams {
                    text_document: TextDocumentIdentifier { uri: uri_clone },
                    range: Range::default(),
                    context: CodeActionContext {
version: None,
                        diagnostics: vec![Diagnostic {
                            range: Range::default(),
                            code: Some(NumberOrString::String(
                                "pm4py.py.unformatted_dataframe".to_string(),
                            )),
                            message: "unformatted".to_string(),
                            code_description: None,
                            ..Default::default()
                        }],
                        only: None,
                        trigger_kind: None,
                    },
                    work_done_progress_params: WorkDoneProgressParams {
                        work_done_token: None,
                    },
                    partial_result_params: PartialResultParams {
is_partial_result_token_null: false,
                        partial_result_token: None,
                    },
                };
                let _ = backend.code_action(params).await;
            }
            .boxed(),
        );

        // execute command task
        let uri_clone = uri.clone();
        futures.push(
            async move {
                let params = ExecuteCommandParams {
                    command: "pm4py-lsp.formatDataFrame".to_string(),
                    arguments: vec![
                        serde_json::to_value(&uri_clone).unwrap(),
                        serde_json::to_value(Range::default()).unwrap(),
                        serde_json::to_value(
                            "Variable 'df' is loaded via pd.read_csv but not formatted for PM4Py.",
                        )
                        .unwrap(),
                    ],
                    ..Default::default()
                };
                let _ = backend.execute_command(params).await;
            }
            .boxed(),
        );
    }

    futures::future::join_all(futures).await;
}
