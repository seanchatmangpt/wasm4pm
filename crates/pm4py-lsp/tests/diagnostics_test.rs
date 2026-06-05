use pm4py_lsp::analysis::PipelineFacts;
use pm4py_lsp::diagnostics::{check_diagnostics, DiagnosticCode};

#[test]
fn test_diagnostics_detection() {
    let content = r#"
import pm4py
import pandas as pd

df = pd.read_csv('event_log.csv')
net, im, fm = pm4py.discover_petri_net_inductive(df)
"#;
    let facts = PipelineFacts::extract(content);
    let diagnostics = check_diagnostics(&facts);

    let codes: Vec<DiagnosticCode> = diagnostics.into_iter().map(|d| d.code).collect();
    assert!(codes.contains(&DiagnosticCode::UnformattedDataframe));
    assert!(codes.contains(&DiagnosticCode::DiscoveryBeforeFormatting));
}

#[test]
fn test_missing_mappings_diagnostics() {
    let content = r#"
import pm4py
import pandas as pd

df = pd.read_csv('event_log.csv')
event_log = pm4py.format_dataframe(df)
"#;
    let facts = PipelineFacts::extract(content);
    let diagnostics = check_diagnostics(&facts);

    let codes: Vec<DiagnosticCode> = diagnostics.into_iter().map(|d| d.code).collect();
    assert!(codes.contains(&DiagnosticCode::MissingCaseIdMapping));
    assert!(codes.contains(&DiagnosticCode::MissingActivityMapping));
    assert!(codes.contains(&DiagnosticCode::MissingTimestampMapping));
}
