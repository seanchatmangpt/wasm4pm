use crate::analysis::PipelineFacts;
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Pm4pyDiagCode — canonical diagnostic code enum for pm4py-lsp
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Pm4pyDiagCode {
    UnformattedDataframe,
    MissingMappings,
    UnreceiptedOutput,
    ConformanceExport,
    MissingImport,
}

impl Pm4pyDiagCode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::UnformattedDataframe => "unformatted_dataframe",
            Self::MissingMappings => "missing_mappings",
            Self::UnreceiptedOutput => "unreceipted_output",
            Self::ConformanceExport => "conformance_export",
            Self::MissingImport => "missing_import",
        }
    }
}

impl std::fmt::Display for Pm4pyDiagCode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

#[cfg(test)]
mod pm4py_diag_code_tests {
    use super::Pm4pyDiagCode;

    #[test]
    fn test_as_str_variants() {
        assert_eq!(Pm4pyDiagCode::UnformattedDataframe.as_str(), "unformatted_dataframe");
        assert_eq!(Pm4pyDiagCode::MissingMappings.as_str(), "missing_mappings");
        assert_eq!(Pm4pyDiagCode::UnreceiptedOutput.as_str(), "unreceipted_output");
        assert_eq!(Pm4pyDiagCode::ConformanceExport.as_str(), "conformance_export");
        assert_eq!(Pm4pyDiagCode::MissingImport.as_str(), "missing_import");
    }

    #[test]
    fn test_display() {
        assert_eq!(Pm4pyDiagCode::MissingImport.to_string(), "missing_import");
        assert_eq!(Pm4pyDiagCode::ConformanceExport.to_string(), "conformance_export");
    }
}

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

        let has_any_execution = !facts.discovery_calls.is_empty()
            || !facts.conformance_calls.is_empty()
            || !facts.export_calls.is_empty();

        if has_any_execution && facts.formatted_vars.is_empty() {
            diagnostics.push(Diagnostic {
                code: DiagnosticCode::DiscoveryBeforeFormatting,
                message: "Process mining operations called before formatting the DataFrame."
                    .to_string(),
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

        let has_any_execution = !facts.discovery_calls.is_empty()
            || !facts.conformance_calls.is_empty()
            || !facts.export_calls.is_empty();

        if has_any_execution && facts.formatted_vars.is_empty() {
            diagnostics.push(LspDiagnostic {
                range: Range::new(Position::new(0, 0), Position::new(0, 0)),
                severity: Some(DiagnosticSeverity::WARNING),
                code: Some(NumberOrString::String(format!(
                    "pm4py.py.{}",
                    DiagnosticCode::DiscoveryBeforeFormatting.as_str()
                ))),
                source: Some("pm4py-lsp".to_string()),
                message: "Process mining operations called before formatting the DataFrame."
                    .to_string(),
                ..Default::default()
            });
        }
    }

    diagnostics
}
