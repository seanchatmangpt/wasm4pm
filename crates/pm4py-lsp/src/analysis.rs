use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PipelineFacts {
    pub has_pm4py: bool,
    pub pm4py_aliases: Vec<String>,
    pub pandas_aliases: Vec<String>,
    pub csv_loads: Vec<String>,
    pub csv_vars: Vec<String>,
    pub formatted_vars: Vec<String>,
    pub discovery_calls: Vec<String>,
    pub conformance_calls: Vec<String>,
    pub export_calls: Vec<String>,
    pub missing_case_id: bool,
    pub missing_activity: bool,
    pub missing_timestamp: bool,
}

impl PipelineFacts {
    pub fn extract(content: &str) -> Self {
        let mut facts = PipelineFacts::default();

        // Check for pm4py imports (indented too)
        let re_pm4py = Regex::new(r"(?m)^[ \t]*import\s+pm4py(?:\s+as\s+(\w+))?").unwrap();
        for cap in re_pm4py.captures_iter(content) {
            facts.has_pm4py = true;
            if let Some(alias) = cap.get(1) {
                facts.pm4py_aliases.push(alias.as_str().to_string());
            } else {
                facts.pm4py_aliases.push("pm4py".to_string());
            }
        }

        let re_from_pm4py = Regex::new(r"(?m)^[ \t]*from\s+pm4py\b").unwrap();
        if re_from_pm4py.is_match(content) {
            facts.has_pm4py = true;
        }

        // Check for pandas aliases (indented too)
        let re_pandas = Regex::new(r"(?m)^[ \t]*import\s+pandas(?:\s+as\s+(\w+))?").unwrap();
        for cap in re_pandas.captures_iter(content) {
            if let Some(alias) = cap.get(1) {
                facts.pandas_aliases.push(alias.as_str().to_string());
            } else {
                facts.pandas_aliases.push("pandas".to_string());
            }
        }
        let re_from_pandas = Regex::new(r"(?m)^[ \t]*from\s+pandas\b").unwrap();
        if re_from_pandas.is_match(content) && !facts.pandas_aliases.contains(&"pandas".to_string())
        {
            facts.pandas_aliases.push("pandas".to_string());
        }
        if facts.pandas_aliases.is_empty() {
            facts.pandas_aliases.push("pd".to_string()); // Common default
        }

        // CSV loads and variables (supporting read_csv, read_parquet, read_json, read_excel)
        let re_csv = Regex::new(r#"\b(\w+)\s*=\s*(?:(\w+)\.)?(read_csv|read_parquet|read_json|read_excel)\s*\(\s*(?:filepath|filepath_or_buffer\s*=\s*)?(?:['"]([^'"]+)['"]|(\w+))"#).unwrap();
        for cap in re_csv.captures_iter(content) {
            let var_name = cap.get(1).unwrap().as_str().to_string();
            facts.csv_vars.push(var_name);
            if let Some(path_literal) = cap.get(4) {
                facts.csv_loads.push(path_literal.as_str().to_string());
            } else if let Some(path_var) = cap.get(5) {
                facts.csv_loads.push(path_var.as_str().to_string());
            }
        }

        // Formatted vars (format_dataframe)
        let re_format =
            Regex::new(r#"\b(\w+)\s*=\s*(?:(\w+)\.)?format_dataframe\s*\(([^)]*)\)"#).unwrap();
        for cap in re_format.captures_iter(content) {
            let var_name = cap.get(1).unwrap().as_str().to_string();
            facts.formatted_vars.push(var_name);

            let args_str = cap.get(3).unwrap().as_str();

            let mut has_case_id = false;
            let mut has_activity = false;
            let mut has_timestamp = false;

            if args_str.contains("case_id") {
                has_case_id = true;
            }
            if args_str.contains("activity") {
                has_activity = true;
            }
            if args_str.contains("timestamp") {
                has_timestamp = true;
            }

            let args: Vec<&str> = args_str
                .split(',')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();

            if args.len() > 1 && !args[1].contains('=') {
                has_case_id = true;
            }
            if args.len() > 2 && !args[2].contains('=') {
                has_activity = true;
            }
            if args.len() > 3 && !args[3].contains('=') {
                has_timestamp = true;
            }

            if !has_case_id {
                facts.missing_case_id = true;
            }
            if !has_activity {
                facts.missing_activity = true;
            }
            if !has_timestamp {
                facts.missing_timestamp = true;
            }
        }

        // Discovery, Conformance, and Export/Write calls
        let re_calls =
            Regex::new(r#"\b(?:(\w+)\.)?(discover_[a-zA-Z0-9_]+|conformance_[a-zA-Z0-9_]+|fitness_[a-zA-Z0-9_]+|precision_[a-zA-Z0-9_]+|write_[a-zA-Z0-9_]+|check_wf_net_soundness)\b"#)
                .unwrap();
        for cap in re_calls.captures_iter(content) {
            let prefix = cap.get(1).map(|m| m.as_str());
            let func = cap.get(2).unwrap().as_str();
            let full_call = if let Some(p) = prefix {
                format!("{}.{}", p, func)
            } else {
                func.to_string()
            };

            if func.starts_with("discover_") {
                facts.discovery_calls.push(full_call);
            } else if func.starts_with("conformance_")
                || func.starts_with("fitness_")
                || func.starts_with("precision_")
                || func == "check_wf_net_soundness"
            {
                facts.conformance_calls.push(full_call);
            } else if func.starts_with("write_") {
                facts.export_calls.push(full_call);
            }
        }

        facts
    }
}
