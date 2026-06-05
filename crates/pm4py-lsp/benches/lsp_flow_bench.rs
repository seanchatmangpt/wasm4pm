use criterion::{black_box, criterion_group, criterion_main, Criterion};
use futures::StreamExt;
use pm4py_lsp::Backend;
use tower_lsp_max::lsp_types::*;
use tower_lsp_max::{LanguageServer, LspService};

fn bench_code_action_latency(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let (service, _) = LspService::new(|client| Backend::new(client));
    let backend = service.inner();

    let uri = Url::parse("file:///test.py").unwrap();
    let params = CodeActionParams {
        text_document: TextDocumentIdentifier::new(uri.clone()),
        range: Range::default(),
        context: CodeActionContext {
            diagnostics: vec![Diagnostic {
                range: Range::default(),
                severity: Some(DiagnosticSeverity::WARNING),
                code: Some(NumberOrString::String(
                    "pm4py.py.unformatted_dataframe".to_string(),
                )),
                source: Some("pm4py-lsp".to_string()),
                message: "Variable 'df' is loaded via pd.read_csv but not formatted for PM4Py."
                    .to_string(),
                ..Default::default()
            }],
            only: None,
            trigger_kind: None,
        },
        work_done_progress_params: Default::default(),
        partial_result_params: Default::default(),
    };

    c.bench_function("B6_code_action_latency", |b| {
        b.iter(|| {
            rt.block_on(async {
                let response = backend
                    .code_action(black_box(params.clone()))
                    .await
                    .unwrap();
                black_box(response);
            });
        })
    });
}

fn bench_did_open_diagnostics_latency(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let (service, socket) = LspService::new(|client| Backend::new(client));
    let backend = service.inner();

    // Drain the socket to prevent blocking on writes
    let (mut request_stream, _) = socket.split();
    rt.spawn(async move { while let Some(_) = request_stream.next().await {} });

    let uri = Url::parse("file:///test.py").unwrap();
    let text = "import pm4py\nimport pandas as pd\ndf = pd.read_csv('log.csv')\n";

    c.bench_function("B8_did_open_diagnostics_latency", |b| {
        b.iter(|| {
            rt.block_on(async {
                let params = DidOpenTextDocumentParams {
                    text_document: TextDocumentItem {
                        uri: uri.clone(),
                        language_id: "python".to_string(),
                        version: 1,
                        text: text.to_string(),
                    },
                };
                backend.did_open(black_box(params)).await;
            });
        })
    });
}

criterion_group!(
    benches,
    bench_code_action_latency,
    bench_did_open_diagnostics_latency
);
criterion_main!(benches);
