use crate::analysis::PipelineFacts;
use serde::{Deserialize, Serialize};
use tower_lsp_max::lsp_types::{
    Diagnostic as LspDiagnostic, DiagnosticSeverity, NumberOrString, Position, Range,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DiagnosticCode {
    UnformattedDataframe,
    MissingCaseIdMapping,
    MissingActivityMapping,
    MissingTimestampMapping,
    DiscoveryBeforeFormatting,
    ParityFixtureMissing,
    UnreceiptedOutput,
}

impl DiagnosticCode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::UnformattedDataframe => "unformatted_dataframe",
            Self::MissingCaseIdMapping => "missing_case_id_mapping",
            Self::MissingActivityMapping => "missing_activity_mapping",
            Self::MissingTimestampMapping => "missing_timestamp_mapping",
            Self::DiscoveryBeforeFormatting => "discovery_before_formatting",
            Self::ParityFixtureMissing => "parity_fixture_missing",
            Self::UnreceiptedOutput => "unreceipted_output",
        }
    }
}

pub struct Diagnostic {
    pub code: DiagnosticCode,
    pub message: String,
}

pub fn check_diagnostics(facts: &PipelineFacts) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();

    if facts.has_pm4py {
        if !facts.csv_vars.is_empty() && facts.formatted_vars.is_empty() {
            let var_name = facts
                .csv_vars
                .first()
                .cloned()
                .unwrap_or_else(|| "df".to_string());
            diagnostics.push(Diagnostic {
                code: DiagnosticCode::UnformattedDataframe,
                message: format!(
                    "Variable '{}' is loaded via pd.read_csv but not formatted for PM4Py. Use pm4py.format_dataframe({}, ...)",
                    var_name, var_name
                ),
            });
        }

        if facts.missing_case_id {
            diagnostics.push(Diagnostic {
                code: DiagnosticCode::MissingCaseIdMapping,
                message: "Missing 'case_id' mapping in format_dataframe.".to_string(),
            });
        }

        if facts.missing_activity {
            diagnostics.push(Diagnostic {
                code: DiagnosticCode::MissingActivityMapping,
                message: "Missing 'activity' mapping in format_dataframe.".to_string(),
            });
        }

        if facts.missing_timestamp {
            diagnostics.push(Diagnostic {
                code: DiagnosticCode::MissingTimestampMapping,
                message: "Missing 'timestamp' mapping in format_dataframe.".to_string(),
            });
        }

        if !facts.discovery_calls.is_empty() && facts.formatted_vars.is_empty() {
            diagnostics.push(Diagnostic {
                code: DiagnosticCode::DiscoveryBeforeFormatting,
                message: "Process discovery called before formatting the DataFrame.".to_string(),
            });
        }
    }

    diagnostics
}

pub fn diagnose_pipeline(facts: &PipelineFacts) -> Vec<LspDiagnostic> {
    let mut diagnostics = Vec::new();

    if facts.has_pm4py {
        if !facts.csv_vars.is_empty() && facts.formatted_vars.is_empty() {
            let var_name = facts
                .csv_vars
                .first()
                .cloned()
                .unwrap_or_else(|| "df".to_string());
            diagnostics.push(LspDiagnostic {
                range: Range::new(Position::new(0, 0), Position::new(0, 0)),
                severity: Some(DiagnosticSeverity::WARNING),
                code: Some(NumberOrString::String(format!("pm4py.py.{}", DiagnosticCode::UnformattedDataframe.as_str()))),
                source: Some("pm4py-lsp".to_string()),
                message: format!(
                    "Variable '{}' is loaded via pd.read_csv but not formatted for PM4Py. Use pm4py.format_dataframe({}, ...)",
                    var_name, var_name
                ),
                ..Default::default()
            });
        }

        if facts.missing_case_id {
            diagnostics.push(LspDiagnostic {
                range: Range::new(Position::new(0, 0), Position::new(0, 0)),
                severity: Some(DiagnosticSeverity::WARNING),
                code: Some(NumberOrString::String(format!(
                    "pm4py.py.{}",
                    DiagnosticCode::MissingCaseIdMapping.as_str()
                ))),
                source: Some("pm4py-lsp".to_string()),
                message: "Missing 'case_id' mapping in format_dataframe.".to_string(),
                ..Default::default()
            });
        }

        if facts.missing_activity {
            diagnostics.push(LspDiagnostic {
                range: Range::new(Position::new(0, 0), Position::new(0, 0)),
                severity: Some(DiagnosticSeverity::WARNING),
                code: Some(NumberOrString::String(format!(
                    "pm4py.py.{}",
                    DiagnosticCode::MissingActivityMapping.as_str()
                ))),
                source: Some("pm4py-lsp".to_string()),
                message: "Missing 'activity' mapping in format_dataframe.".to_string(),
                ..Default::default()
            });
        }

        if facts.missing_timestamp {
            diagnostics.push(LspDiagnostic {
                range: Range::new(Position::new(0, 0), Position::new(0, 0)),
                severity: Some(DiagnosticSeverity::WARNING),
                code: Some(NumberOrString::String(format!(
                    "pm4py.py.{}",
                    DiagnosticCode::MissingTimestampMapping.as_str()
                ))),
                source: Some("pm4py-lsp".to_string()),
                message: "Missing 'timestamp' mapping in format_dataframe.".to_string(),
                ..Default::default()
            });
        }

        if !facts.discovery_calls.is_empty() && facts.formatted_vars.is_empty() {
            diagnostics.push(LspDiagnostic {
                range: Range::new(Position::new(0, 0), Position::new(0, 0)),
                severity: Some(DiagnosticSeverity::WARNING),
                code: Some(NumberOrString::String(format!(
                    "pm4py.py.{}",
                    DiagnosticCode::DiscoveryBeforeFormatting.as_str()
                ))),
                source: Some("pm4py-lsp".to_string()),
                message: "Process discovery called before formatting the DataFrame.".to_string(),
                ..Default::default()
            });
        }
    }

    diagnostics
}
