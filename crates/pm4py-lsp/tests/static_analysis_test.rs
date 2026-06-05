use pm4py_lsp::analysis::PipelineFacts;

#[test]
fn test_pipeline_facts_extraction() {
    let content = r#"
import pm4py
import pandas as pd

df = pd.read_csv('event_log.csv')
event_log = pm4py.format_dataframe(df, case_id='case:concept:name', activity='concept:name', timestamp='time:timestamp')
net, im, fm = pm4py.discover_petri_net_inductive(event_log)
"#;
    let facts = PipelineFacts::extract(content);
    assert!(facts.has_pm4py);
    assert_eq!(facts.pm4py_aliases, vec!["pm4py"]);
    assert_eq!(facts.pandas_aliases, vec!["pd"]);
    assert_eq!(facts.csv_loads, vec!["event_log.csv"]);
    assert_eq!(facts.formatted_vars, vec!["event_log"]);
    assert_eq!(
        facts.discovery_calls,
        vec!["pm4py.discover_petri_net_inductive"]
    );
    assert!(!facts.missing_case_id);
}

#[test]
fn test_missing_mappings() {
    let content = r#"
import pm4py
import pandas as pd

df = pd.read_csv('event_log.csv')
event_log = pm4py.format_dataframe(df)
"#;
    let facts = PipelineFacts::extract(content);
    assert!(facts.missing_case_id);
    assert!(facts.missing_activity);
    assert!(facts.missing_timestamp);
}

#[test]
fn test_all_pm4py_capabilities_static_analysis() {
    let content = r#"
import pm4py as pm
import pandas as pd

df1 = pd.read_parquet('log.parquet')
df2 = pd.read_json('log.json')
df3 = pd.read_excel('log.xlsx')

log = pm.format_dataframe(df1, case_id='case_id', activity='activity', timestamp='timestamp')

dfg = pm.discover_dfg(log)
bpmn = pm.discover_bpmn_inductive(log)

conformance = pm.conformance_diagnostics_token_replay(log, net, im, fm)
fit = pm.fitness_token_based_replay(log, net, im, fm)
sound = pm.check_wf_net_soundness(pn)

pm.write_xes(log, 'output.xes')
pm.write_bpmn(bpmn, 'output.bpmn')
"#;
    let facts = PipelineFacts::extract(content);
    assert!(facts.has_pm4py);
    assert_eq!(facts.pm4py_aliases, vec!["pm"]);
    assert!(facts.csv_loads.contains(&"log.parquet".to_string()));
    assert!(facts.csv_loads.contains(&"log.json".to_string()));
    assert!(facts.csv_loads.contains(&"log.xlsx".to_string()));

    assert!(facts
        .discovery_calls
        .contains(&"pm.discover_dfg".to_string()));
    assert!(facts
        .discovery_calls
        .contains(&"pm.discover_bpmn_inductive".to_string()));

    assert!(facts
        .conformance_calls
        .contains(&"pm.conformance_diagnostics_token_replay".to_string()));
    assert!(facts
        .conformance_calls
        .contains(&"pm.fitness_token_based_replay".to_string()));
    assert!(facts
        .conformance_calls
        .contains(&"pm.check_wf_net_soundness".to_string()));

    assert!(facts.export_calls.contains(&"pm.write_xes".to_string()));
    assert!(facts.export_calls.contains(&"pm.write_bpmn".to_string()));
}

#[test]
fn test_from_pm4py_import_syntax() {
    let content = r#"
from pm4py import discover_petri_net_inductive, format_dataframe
import pandas as pd

df = pd.read_csv('event_log.csv')
event_log = format_dataframe(df, case_id='case:concept:name', activity='concept:name', timestamp='time:timestamp')
net, im, fm = discover_petri_net_inductive(event_log)
"#;
    let facts = PipelineFacts::extract(content);
    assert!(facts.has_pm4py);
    assert!(facts
        .discovery_calls
        .contains(&"discover_petri_net_inductive".to_string()));
}

