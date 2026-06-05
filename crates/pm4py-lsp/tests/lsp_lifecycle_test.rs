use pm4py_lsp::Backend;
use std::collections::HashMap;
use tower_lsp_max::lsp_types::*;
use tower_lsp_max::{LanguageServer, LspService};

#[tokio::test]
async fn test_lsp_initialize() {
    let (service, _) = LspService::new(|client| Backend::new(client));
    let backend = service.inner();

    let params = InitializeParams {
        capabilities: ClientCapabilities::default(),
        ..Default::default()
    };

    let result = backend.initialize(params).await.unwrap();
    let sync_capability = result.capabilities.text_document_sync.unwrap();
    assert_eq!(
        sync_capability,
        TextDocumentSyncCapability::Kind(TextDocumentSyncKind::FULL)
    );
}

#[tokio::test]
async fn test_lsp_did_open_and_change() {
    let (service, _) = LspService::new(|client| Backend::new(client));
    let backend = service.inner();

    let uri = Url::parse("file:///main.py").unwrap();

    // did_open
    let open_params = DidOpenTextDocumentParams {
        text_document: TextDocumentItem {
            uri: uri.clone(),
            language_id: "python".to_string(),
            version: 1,
            text: "import pm4py\n".to_string(),
        },
    };
    backend.did_open(open_params).await;

    {
        let docs = backend.documents.lock().await;
        assert_eq!(docs.get(&uri), Some(&"import pm4py\n".to_string()));
    }

    // did_change
    let change_params = DidChangeTextDocumentParams {
        text_document: VersionedTextDocumentIdentifier {
            uri: uri.clone(),
            version: 2,
        },
        content_changes: vec![TextDocumentContentChangeEvent {
            range: None,
            range_length: None,
            text: "import pm4py\nimport pandas as pd\n".to_string(),
        }],
    };
    backend.did_change(change_params).await;

    {
        let docs = backend.documents.lock().await;
        assert_eq!(
            docs.get(&uri),
            Some(&"import pm4py\nimport pandas as pd\n".to_string())
        );
    }

    // did_close
    let close_params = DidCloseTextDocumentParams {
        text_document: TextDocumentIdentifier { uri: uri.clone() },
    };
    backend.did_close(close_params).await;

    {
        let docs = backend.documents.lock().await;
        assert!(!docs.contains_key(&uri));
    }
}
