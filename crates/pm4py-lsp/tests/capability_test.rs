use pm4py_lsp::{create_parity_fixture, diagnose_text, Backend};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tower_lsp_max::lsp_types::*;
use tower_lsp_max::max_protocol::{AdmissionDecision, LawAxis};
use tower_lsp_max::{LanguageServer, LspService};

#[test]
fn test_unformatted_dataframe_diagnostic() {
    let python_code = r#"
import pm4py
import pandas as pd
df = pd.read_csv('log.csv')
pm4py.discover_petri_net_inductive(df)
"#;
    let diagnostics = diagnose_text(python_code);
    assert!(!diagnostics.is_empty());
    assert_eq!(
        diagnostics[0].code,
        Some(NumberOrString::String(
            "pm4py.py.unformatted_dataframe".to_string()
        ))
    );
}

#[test]
fn test_formatted_dataframe_diagnostic_none() {
    let python_code = r#"
import pm4py
import pandas as pd
df = pd.read_csv('log.csv')
df = pm4py.format_dataframe(df, case_id='case_id', activity_key='activity', timestamp_key='timestamp')
pm4py.discover_petri_net_inductive(df)
"#;
    let diagnostics = diagnose_text(python_code);
    assert!(diagnostics.is_empty());
}

#[test]
fn test_create_parity_fixture() {
    let python_code = r#"
import pm4py
import pandas as pd
log_df = pd.read_csv('data/event_log.csv', sep=';')
net, im, fm = pm4py.discover_petri_net_inductive(log_df)
"#;
    let fixture = create_parity_fixture(python_code).expect("Should create fixture");
    assert_eq!(fixture.csv_path, "data/event_log.csv");
    assert_eq!(fixture.parameters.get("sep"), Some(&"';'".to_string()));
    assert_eq!(fixture.expected_outcome, "Petri Net discovered");
}

#[tokio::test]
async fn test_conformance_vector_shift() {
    let (service, _) = LspService::new(|client| Backend::new(client));
    let backend = service.inner();

    let uri = Url::parse("file:///test.py").unwrap();

    // Initial state: Refused (unformatted)
    let code_refused = r#"
import pm4py
import pandas as pd
df = pd.read_csv('log.csv')
"#;
    backend
        .documents
        .lock()
        .await
        .insert(uri.clone(), code_refused.to_string());

    let snapshot_id = backend.max_snapshot().await.unwrap();
    let vector = backend
        .max_conformance_vector(snapshot_id.clone())
        .await
        .unwrap();

    assert!(vector
        .refused
        .contains(&LawAxis::Custom("pm4py.law.formatted".to_string())));
    assert!(!vector
        .admitted
        .contains(&LawAxis::Custom("pm4py.law.formatted".to_string())));
    assert!(vector
        .unknown
        .contains(&LawAxis::Custom("pm4py.law.mapped".to_string())));

    // Repaired state: Admitted
    let code_admitted = r#"
import pm4py
import pandas as pd
df = pd.read_csv('log.csv')
df = pm4py.format_dataframe(df)
"#;
    backend
        .documents
        .lock()
        .await
        .insert(uri.clone(), code_admitted.to_string());

    let vector_repaired = backend.max_conformance_vector(snapshot_id).await.unwrap();
    assert!(vector_repaired
        .admitted
        .contains(&LawAxis::Custom("pm4py.law.formatted".to_string())));
    assert!(!vector_repaired
        .refused
        .contains(&LawAxis::Custom("pm4py.law.formatted".to_string())));
    assert!(vector_repaired
        .unknown
        .contains(&LawAxis::Custom("pm4py.law.mapped".to_string())));
}

#[tokio::test]
async fn test_snapshot_determinism() {
    let (service, _) = LspService::new(|client| Backend::new(client));
    let backend = service.inner();

    let uri1 = Url::parse("file:///a.py").unwrap();
    let uri2 = Url::parse("file:///b.py").unwrap();

    backend
        .documents
        .lock()
        .await
        .insert(uri1.clone(), "content a".to_string());
    backend
        .documents
        .lock()
        .await
        .insert(uri2.clone(), "content b".to_string());

    let snap1 = backend.max_snapshot().await.unwrap();

    // Clear and re-insert in different order
    backend.documents.lock().await.clear();
    backend
        .documents
        .lock()
        .await
        .insert(uri2.clone(), "content b".to_string());
    backend
        .documents
        .lock()
        .await
        .insert(uri1.clone(), "content a".to_string());

    let snap2 = backend.max_snapshot().await.unwrap();

    assert_eq!(
        snap1.0, snap2.0,
        "Snapshots must be deterministic regardless of insertion order"
    );
}

#[tokio::test]
async fn test_physical_persistence() {
    // Ensure we start clean for this test
    let _ = std::fs::remove_dir_all("fixtures/pm4py-parity");
    let _ = std::fs::remove_dir_all("receipts/pm4py-lsp");

    let (service, _) = LspService::new(|client| Backend::new(client));
    let backend = service.inner();

    let uri = Url::parse("file:///test.py").unwrap();
    let code = r#"
import pm4py
import pandas as pd
df = pd.read_csv('log.csv')
"#;
    backend
        .documents
        .lock()
        .await
        .insert(uri.clone(), code.to_string());

    let params = ExecuteCommandParams {
        command: "pm4py-lsp.createParityFixture".to_string(),
        arguments: vec![serde_json::to_value(&uri).unwrap()],
        ..Default::default()
    };

    let result = backend
        .execute_command(params)
        .await
        .unwrap()
        .expect("Should return result");
    let receipt: tower_lsp_max::max_protocol::Receipt = serde_json::from_value(result).unwrap();

    let snapshot_id = backend.max_snapshot().await.unwrap().0;

    // Check fixture file
    let fixture_path =
        std::path::Path::new("fixtures/pm4py-parity").join(format!("{}.json", snapshot_id));
    assert!(
        fixture_path.exists(),
        "Fixture file should exist at {:?}",
        fixture_path
    );

    // Check receipt file
    let receipt_path = std::path::Path::new("receipts/pm4py-lsp")
        .join(&snapshot_id)
        .join(format!("{}.json", receipt.receipt_id));
    assert!(
        receipt_path.exists(),
        "Receipt file should exist at {:?}",
        receipt_path
    );

    // Verify receipt hash matches fixture
    let fixture_content = std::fs::read_to_string(fixture_path).unwrap();
    let expected_hash = wasm4pm_types::hash::blake3_string(&fixture_content);
    assert_eq!(
        receipt.hash, expected_hash,
        "Receipt hash must match fixture hash"
    );
}

#[tokio::test]
async fn test_integration_dataframe_formatting() {
    use futures::sink::SinkExt;
    use futures::stream::StreamExt;
    use tower::Service;

    // a. Opens a Python document with unformatted read_csv.
    let (mut service, socket) = LspService::new(|client| Backend::new(client));

    // 1. Send initialize request to service
    let init_req = tower_lsp_max::jsonrpc::Request::build("initialize")
        .id(1)
        .params(serde_json::to_value(InitializeParams::default()).unwrap())
        .finish();
    let _ = service.call(init_req).await;

    // 2. Send initialized notification to service
    let initialized_req = tower_lsp_max::jsonrpc::Request::build("initialized").finish();
    let _ = service.call(initialized_req).await;

    let backend = service.inner();

    // Spawn mock client receiver to apply edits
    let (mut request_stream, mut response_sink) = socket.split();
    tokio::spawn(async move {
        while let Some(request) = request_stream.next().await {
            if let Some(id) = request.id() {
                let response =
                    tower_lsp_max::jsonrpc::Response::from_ok(id.clone(), serde_json::json!({"applied": true}));
                let _ = response_sink.send(response).await;
            }
        }
    });

    let uri = Url::parse("file:///test_integration.py").unwrap();
    let code_unformatted = "import pm4py\nimport pandas as pd\ndf = pd.read_csv('log.csv')\n";

    backend.did_open(DidOpenTextDocumentParams {
        text_document: TextDocumentItem {
            uri: uri.clone(),
            language_id: "python".to_string(),
            version: 1,
            text: code_unformatted.to_string(),
        },
    }).await;

    // b. Verifies the `pm4py.py.unformatted_dataframe` diagnostic is present.
    let diagnostics_1 = diagnose_text(&code_unformatted);
    let has_unformatted = diagnostics_1.iter().any(|d| {
        d.code == Some(NumberOrString::String("pm4py.py.unformatted_dataframe".to_string()))
    });
    assert!(has_unformatted);

    // c. Simulates formatting repair (inserting `df = pm4py.format_dataframe(df)`).
    let execute_params = ExecuteCommandParams {
        command: "pm4py-lsp.formatDataFrame".to_string(),
        arguments: vec![
            serde_json::to_value(&uri).unwrap(),
            serde_json::to_value(Range::new(Position::new(2, 0), Position::new(2, 10))).unwrap(),
            serde_json::to_value("Variable 'df' is loaded via pd.read_csv but not formatted for PM4Py.").unwrap(),
        ],
        ..Default::default()
    };
    let result = backend.execute_command(execute_params).await.unwrap();
    assert!(result.is_some());

    // Update document content to simulate editor applying the edit and did_change notification
    let code_formatted = "import pm4py\nimport pandas as pd\ndf = pd.read_csv('log.csv')\ndf = pm4py.format_dataframe(df)\n";
    backend.did_change(DidChangeTextDocumentParams {
        text_document: VersionedTextDocumentIdentifier {
            uri: uri.clone(),
            version: 2,
        },
        content_changes: vec![TextDocumentContentChangeEvent {
            range: None,
            range_length: None,
            text: code_formatted.to_string(),
        }],
    }).await;

    // d. Verifies that the unformatted diagnostic is cleared but missing mapping diagnostics are present.
    let diagnostics_2 = diagnose_text(&code_formatted);
    let has_unformatted_2 = diagnostics_2.iter().any(|d| {
        d.code == Some(NumberOrString::String("pm4py.py.unformatted_dataframe".to_string()))
    });
    assert!(!has_unformatted_2);

    let has_missing_case_id = diagnostics_2.iter().any(|d| {
        d.code == Some(NumberOrString::String("pm4py.py.missing_case_id_mapping".to_string()))
    });
    let has_missing_activity = diagnostics_2.iter().any(|d| {
        d.code == Some(NumberOrString::String("pm4py.py.missing_activity_mapping".to_string()))
    });
    let has_missing_timestamp = diagnostics_2.iter().any(|d| {
        d.code == Some(NumberOrString::String("pm4py.py.missing_timestamp_mapping".to_string()))
    });
    assert!(has_missing_case_id);
    assert!(has_missing_activity);
    assert!(has_missing_timestamp);

    // e. Verifies idempotency by executing `pm4py-lsp.formatDataFrame` again and checking that it is safely refused.
    let execute_params_again = ExecuteCommandParams {
        command: "pm4py-lsp.formatDataFrame".to_string(),
        arguments: vec![
            serde_json::to_value(&uri).unwrap(),
            serde_json::to_value(Range::new(Position::new(2, 0), Position::new(2, 10))).unwrap(),
            serde_json::to_value("Variable 'df' is loaded via pd.read_csv but not formatted for PM4Py.").unwrap(),
        ],
        ..Default::default()
    };
    let result_again = backend.execute_command(execute_params_again).await;
    assert!(result_again.is_err());
    let err = result_again.err().unwrap();
    assert_eq!(err.message, "DataFrame is already formatted");
}

