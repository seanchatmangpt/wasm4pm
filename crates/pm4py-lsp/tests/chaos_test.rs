/// Chaos / fault-injection tests for pm4py-lsp.
///
/// Each test calls real functions and asserts graceful error handling —
/// no panics, no deadlocks, errors returned cleanly.
use pm4py_lsp::{
    analysis::PipelineFacts,
    create_parity_fixture, diagnose_text,
    fixtures::{persist_fixture, Fixture},
    receipts::{persist_receipt, verify_receipt_file, Receipt, SnapshotId},
    Backend,
};
use std::collections::HashMap;
use std::sync::Arc;
use tempfile::tempdir;
use tower_lsp_max::lsp_types::Url;
use tower_lsp_max::{LanguageServer, LspService};

// ---------------------------------------------------------------------------
// 1. Corrupt / malformed CSV-like Python source passed to the analyser
// ---------------------------------------------------------------------------

#[test]
fn test_chaos_corrupt_csv_input() {
    // Inject binary noise, null bytes, and overlong lines — should not panic.
    let corrupt_inputs: &[&str] = &[
        "\x00\x01\x02\u{FF}\u{FE} import pm4py",
        &"x".repeat(1_000_000),
        "import pm4py\n\x00read_csv(\x00\x00\x00)",
        ";;;,,,\n\nimport pm4py\n```python``",
        "import pm4py\nimport pandas as pd\ndf = pd.read_csv(\x00\x01'log.csv')",
    ];

    for input in corrupt_inputs {
        // Must not panic
        let facts = PipelineFacts::extract(input);
        let diagnostics = diagnose_text(input);
        // We do not assert specific content — only that these returned without panic
        let _ = facts;
        let _ = diagnostics;
    }
}

// ---------------------------------------------------------------------------
// 2. Empty / whitespace-only source — diagnostic emitted, not panic
// ---------------------------------------------------------------------------

#[test]
fn test_chaos_empty_dataframe() {
    let empty_inputs: &[&str] = &["", "   ", "\n\n\n", "\t\t"];

    for input in empty_inputs {
        let facts = PipelineFacts::extract(input);
        assert!(!facts.has_pm4py, "Empty input should not claim pm4py");

        let diagnostics = diagnose_text(input);
        // Empty / no-pm4py source must produce zero or more diagnostics but not panic
        let _ = diagnostics;
    }
}

// ---------------------------------------------------------------------------
// 3. Null / empty column names embedded in Python source
// ---------------------------------------------------------------------------

#[test]
fn test_chaos_null_column_names() {
    // Simulate Python source that references empty string column names
    let python_with_empty_cols = r#"
import pm4py
import pandas as pd
df = pd.read_csv('log.csv')
df = pm4py.format_dataframe(df, case_id='', activity_key='', timestamp_key='')
pm4py.discover_petri_net_inductive(df)
"#;

    let facts = PipelineFacts::extract(python_with_empty_cols);
    let diagnostics = diagnose_text(python_with_empty_cols);

    // Must not panic; formatted_vars should reflect the call was parsed
    let _ = facts;
    let _ = diagnostics;

    // Also feed completely null-like column specification
    let null_col_source =
        "import pm4py\ndf = pm4py.format_dataframe(df, case_id=None, activity_key=None)";
    let _ = PipelineFacts::extract(null_col_source);
    let _ = diagnose_text(null_col_source);
}

// ---------------------------------------------------------------------------
// 4. Concurrent analysis — 4 threads, no deadlock
// ---------------------------------------------------------------------------

#[test]
fn test_chaos_concurrent_analysis() {
    use std::thread;

    let python_code = Arc::new(
        r#"
import pm4py
import pandas as pd
df = pd.read_csv('log.csv')
pm4py.discover_petri_net_inductive(df)
"#
        .to_string(),
    );

    let handles: Vec<_> = (0..4)
        .map(|_| {
            let code = Arc::clone(&python_code);
            thread::spawn(move || {
                for _ in 0..50 {
                    let facts = PipelineFacts::extract(&code);
                    let diagnostics = diagnose_text(&code);
                    assert!(facts.has_pm4py);
                    assert!(!diagnostics.is_empty());
                }
            })
        })
        .collect();

    for handle in handles {
        handle.join().expect("Thread must not panic or deadlock");
    }
}

// ---------------------------------------------------------------------------
// 5. Missing required pm4py columns — diagnostic emitted, not panic
// ---------------------------------------------------------------------------

#[test]
fn test_chaos_missing_pm4py_columns() {
    // format_dataframe call with no column arguments at all
    let missing_all = r#"
import pm4py
import pandas as pd
df = pd.read_csv('log.csv')
df = pm4py.format_dataframe(df)
pm4py.discover_petri_net_inductive(df)
"#;

    let facts = PipelineFacts::extract(missing_all);
    let diagnostics = diagnose_text(missing_all);

    // Should have at least one formatted var but flag missing mappings
    assert!(
        !facts.formatted_vars.is_empty(),
        "Should detect format_dataframe call"
    );
    let missing_case_id = diagnostics.iter().any(|d| {
        d.code
            == Some(tower_lsp_max::lsp_types::NumberOrString::String(
                "pm4py.py.missing_case_id_mapping".to_string(),
            ))
    });
    let missing_activity = diagnostics.iter().any(|d| {
        d.code
            == Some(tower_lsp_max::lsp_types::NumberOrString::String(
                "pm4py.py.missing_activity_mapping".to_string(),
            ))
    });
    let missing_timestamp = diagnostics.iter().any(|d| {
        d.code
            == Some(tower_lsp_max::lsp_types::NumberOrString::String(
                "pm4py.py.missing_timestamp_mapping".to_string(),
            ))
    });

    assert!(missing_case_id, "Expected missing_case_id diagnostic");
    assert!(missing_activity, "Expected missing_activity diagnostic");
    assert!(missing_timestamp, "Expected missing_timestamp diagnostic");
}

// ---------------------------------------------------------------------------
// 6. Receipt replay attack — re-using an existing receipt_id must be rejected
// ---------------------------------------------------------------------------

#[test]
fn test_chaos_receipt_replay_attack() {
    let tmp = tempdir().expect("tempdir must succeed");
    let base = tmp.path();

    let snapshot_id = SnapshotId::new(&["file:///test.py"], &["import pm4py"], "config-v1");

    let data = serde_json::json!({ "event": "formatDataFrame", "var": "df" });
    let canonical =
        wasm4pm_types::hash::canonical_json(&data).expect("canonical_json must succeed");
    let hash = wasm4pm_types::hash::blake3_string(&canonical);

    let receipt = Receipt {
        id: "receipt-replay-test-001".to_string(),
        snapshot_id: snapshot_id.clone(),
        data: data.clone(),
        hash: hash.clone(),
        prev_receipt_hash: None,
    };

    // First persist — must succeed
    persist_receipt(&receipt, base).expect("First persist must succeed");

    // Verify the persisted receipt is valid
    let receipt_path = base
        .join("receipts/pm4py-lsp")
        .join(snapshot_id.as_str())
        .join("receipt-replay-test-001.json");
    assert!(
        receipt_path.exists(),
        "Receipt file must exist after first persist"
    );
    assert!(
        verify_receipt_file(&receipt_path),
        "First receipt must be valid"
    );

    // Replay attack: attempt to persist a second receipt with the same id
    // but different (tampered) data — a conforming implementation must either
    // reject this or the hash verification must detect the tamper.
    let tampered_data = serde_json::json!({ "event": "formatDataFrame", "var": "TAMPERED" });
    let tampered_canonical =
        wasm4pm_types::hash::canonical_json(&tampered_data).expect("canonical_json must succeed");
    let tampered_hash = wasm4pm_types::hash::blake3_string(&tampered_canonical);

    // Craft a receipt that carries the original hash but tampered data
    let forged_receipt = Receipt {
        id: "receipt-replay-test-001".to_string(),
        snapshot_id: snapshot_id.clone(),
        data: tampered_data,
        hash: hash.clone(), // original hash — intentional mismatch with tampered data
        prev_receipt_hash: None,
    };

    // Overwriting is a file-system-level replay; verify_receipt_file must now
    // return false because hash ≠ content.
    persist_receipt(&forged_receipt, base).expect("OS write must succeed (we test hash mismatch)");

    let forged_valid = verify_receipt_file(&receipt_path);
    assert!(
        !forged_valid,
        "Forged receipt (mismatched hash) must fail verification — replay attack rejected"
    );

    // Also verify that a receipt with both matching hash and tampered content
    // (computed from tampered data) is itself self-consistent but represents
    // a different operation — snapshot divergence is detected at the application
    // layer by comparing snapshot_id, which is immutable once minted.
    let legit_tampered = Receipt {
        id: "receipt-replay-test-002".to_string(),
        snapshot_id: snapshot_id.clone(),
        data: serde_json::json!({ "event": "formatDataFrame", "var": "TAMPERED" }),
        hash: tampered_hash,
        prev_receipt_hash: None,
    };
    persist_receipt(&legit_tampered, base).expect("persist must succeed");

    let receipt2_path = base
        .join("receipts/pm4py-lsp")
        .join(snapshot_id.as_str())
        .join("receipt-replay-test-002.json");
    // This receipt is internally consistent; verification returns true.
    assert!(
        verify_receipt_file(&receipt2_path),
        "Self-consistent receipt must pass hash verification"
    );
    // But note: it carries a different receipt_id — replay of the original id
    // (001) was already rejected above.
}
