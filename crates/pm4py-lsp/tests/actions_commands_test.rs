use pm4py_lsp::{diagnose_text, Backend};
use serde_json::json;
use std::collections::HashMap;
use std::str::FromStr;
use tower_lsp_max::lsp_types::*;
use tower_lsp_max::{LanguageServer, LspService};

#[tokio::test]
async fn test_format_dataframe_command() {
    use futures::sink::SinkExt;
    use futures::stream::StreamExt;
    use tower::Service;

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

    let (mut request_stream, mut response_sink) = socket.split();
    tokio::spawn(async move {
        while let Some(request) = request_stream.next().await {
            println!("MOCK CLIENT RECEIVED: {:?}", request);
            if let Some(id) = request.id() {
                let response =
                    tower_lsp_max::jsonrpc::Response::from_ok(id.clone(), json!({"applied": true}));
                let _ = response_sink.send(response).await;
            }
        }
    });

    let uri = DocumentUri::from_str("file:///test.py").unwrap();
    let text = "import pm4py\nimport pandas as pd\ndf = pd.read_csv('log.csv')\n";
    backend
        .documents
        .lock()
        .await
        .insert(uri.clone(), text.to_string());

    let params = ExecuteCommandParams {
        command: "pm4py-lsp.formatDataFrame".to_string(),
        arguments: vec![
            serde_json::to_value(&uri).unwrap(),
            serde_json::to_value(Range::new(Position::new(2, 0), Position::new(2, 10))).unwrap(),
            serde_json::to_value(
                "Variable 'df' is loaded via pd.read_csv but not formatted for PM4Py.",
            )
            .unwrap(),
        ],
        ..Default::default()
    };

    let result = backend.execute_command(params).await.unwrap();
    assert!(result.is_some());

    // Check if receipt is persistent (logically, by checking if it returned a receipt)
    let receipt: tower_lsp_max::max_protocol::Receipt =
        serde_json::from_value(result.unwrap()).unwrap();
    assert!(receipt.receipt_id.starts_with("receipt-fd-"));
}

#[tokio::test]
async fn test_create_parity_fixture_command() {
    let (service, _) = LspService::new(|client| Backend::new(client));
    let backend = service.inner();

    let uri = DocumentUri::from_str("file:///test.py").unwrap();
    let text = "import pm4py\nimport pandas as pd\ndf = pd.read_csv('log.csv')\n";
    backend
        .documents
        .lock()
        .await
        .insert(uri.clone(), text.to_string());

    let params = ExecuteCommandParams {
        command: "pm4py-lsp.createParityFixture".to_string(),
        arguments: vec![serde_json::to_value(&uri).unwrap()],
        ..Default::default()
    };

    let result = backend.execute_command(params).await.unwrap();
    assert!(result.is_some());

    let receipt: tower_lsp_max::max_protocol::Receipt =
        serde_json::from_value(result.unwrap()).unwrap();
    assert!(receipt.receipt_id.starts_with("receipt-fixture-"));

    // Verify fixture file exists (using snapshot id)
    let snapshot_id = backend.max_snapshot().await.unwrap().0;
    let fixture_path =
        std::path::Path::new("fixtures/pm4py-parity").join(format!("{}.json", snapshot_id));
    assert!(fixture_path.exists());
}

#[tokio::test]
async fn test_malformed_command_refusal() {
    let (service, _) = LspService::new(|client| Backend::new(client));
    let backend = service.inner();

    let params = ExecuteCommandParams {
        command: "pm4py-lsp.formatDataFrame".to_string(),
        arguments: vec![], // Missing args
        ..Default::default()
    };

    let result = backend.execute_command(params).await;
    assert!(result.is_err());
}
