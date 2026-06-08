use pm4py_lsp::Backend;
use std::collections::HashMap;
use tower_lsp_max::lsp_types::*;
use tower_lsp_max::LspService;

#[tokio::test]
async fn test_pm4py_diagnostic() {
    let text = r#"
import pandas as pd
import pm4py

df = pd.read_csv("data.csv")
print(df)
"#;
    let diagnostics = pm4py_lsp::diagnose_text(text);
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(
        diagnostics[0].code,
        Some(NumberOrString::String(
            "pm4py.py.unformatted_dataframe".to_string()
        ))
    );
    assert!(diagnostics[0].message.contains("Variable 'df'"));

    let text_formatted = r#"
import pandas as pd
import pm4py

df = pd.read_csv("data.csv")
df = pm4py.format_dataframe(df, case_id='case_id', activity_key='activity', timestamp_key='timestamp')
print(df)
"#;
    let diagnostics_formatted = pm4py_lsp::diagnose_text(text_formatted);
    assert_eq!(diagnostics_formatted.len(), 0);
}
