use pm4py_lsp::analysis::PipelineFacts;
use pm4py_lsp::diagnose_text;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[test]
fn test_validate_pm4py_repo() {
    let repo_path = Path::new("../../vendors/pm4py");
    if !repo_path.exists() {
        println!(
            "pm4py repo not found at {:?}, skipping validation",
            repo_path
        );
        return;
    }

    let mut py_files = 0;
    let mut ipynb_files = 0;
    let mut total_diagnostics = 0;
    let mut files_with_diagnostics = 0;

    let target_dirs = ["tests", "examples", "notebooks"];

    for dir in target_dirs {
        let full_path = repo_path.join(dir);
        if !full_path.exists() {
            continue;
        }

        for entry in WalkDir::new(full_path).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_file() {
                if path.extension().and_then(|s| s.to_str()) == Some("py") {
                    py_files += 1;
                    let content = fs::read_to_string(path).expect("failed to read py file");
                    let diags = diagnose_text(&content);
                    if !diags.is_empty() {
                        if files_with_diagnostics < 5 {
                            println!("Sample Diagnostics for {:?}:", path);
                            for diag in &diags {
                                println!("  - [{:?}] {}", diag.code, diag.message);
                            }
                        }
                        files_with_diagnostics += 1;
                        total_diagnostics += diags.len();
                    }
                } else if path.extension().and_then(|s| s.to_str()) == Some("ipynb") {
                    ipynb_files += 1;
                    if let Ok(content) = fs::read_to_string(path) {
                        if let Ok(json) = serde_json::from_str::<Value>(&content) {
                            let mut combined_code = String::new();
                            if let Some(cells) = json.get("cells").and_then(|v| v.as_array()) {
                                for cell in cells {
                                    if cell.get("cell_type").and_then(|v| v.as_str())
                                        == Some("code")
                                    {
                                        if let Some(source) = cell.get("source") {
                                            if let Some(lines) = source.as_array() {
                                                for line in lines {
                                                    if let Some(s) = line.as_str() {
                                                        combined_code.push_str(s);
                                                    }
                                                }
                                                combined_code.push('\n');
                                            } else if let Some(s) = source.as_str() {
                                                combined_code.push_str(s);
                                                combined_code.push('\n');
                                            }
                                        }
                                    }
                                }
                            }
                            let diags = diagnose_text(&combined_code);
                            if !diags.is_empty() {
                                files_with_diagnostics += 1;
                                total_diagnostics += diags.len();
                            }
                        }
                    }
                }
            }
        }
    }

    println!("Validation Summary for pm4py repo:");
    println!("  .py files scanned: {}", py_files);
    println!("  .ipynb files scanned: {}", ipynb_files);
    println!("  Files with diagnostics: {}", files_with_diagnostics);
    println!("  Total diagnostics found: {}", total_diagnostics);

    // We don't assert 0 diagnostics because real-world code might have unformatted dataframes
    // or other patterns we flag. This is more of a "smoke test" to ensure no panics
    // and that we are actually seeing things.
}
