# Static Analysis Investigation Report

**Role**: Static Analysis Agent (`analysis`)  
**Milestone**: Milestone 7 Verification and Checkpoint Promotion  
**Project**: `pm4py-lsp` AST & Facts Extraction

## 1. AST Facts Extraction & Parsing Strategy
Because the language server operates in a light-weight sidecar fashion, it relies on high-performance regular expression parsing inside `crates/pm4py-lsp/src/analysis.rs` to extract PM4Py pipeline facts. The parsed elements (`PipelineFacts`) include:
- `has_pm4py`: boolean indicating whether `pm4py` is imported.
- `pm4py_aliases`: list of aliases used to import `pm4py` (e.g. `import pm4py as pm`).
- `pandas_aliases`: list of aliases used to import `pandas` (e.g. `import pandas as pd`).
- `csv_loads`: lists of files loaded via `pd.read_csv`.
- `csv_vars`: variables storing CSV dataframes.
- `formatted_vars`: variables storing formatted dataframes (via `pm4py.format_dataframe`).
- `discovery_calls`: process mining/discovery functions invoked (e.g. `pm4py.discover_petri_net_inductive`).
- `missing_case_id`, `missing_activity`, `missing_timestamp`: indicators of missing required column mappings during formatting.

## 2. Regex Robustness
The regexes are specifically crafted to handle:
- **Varying indentation**: Match statements at start of line or indented.
- **Multiple styles of import**: Handles `import pm4py`, `import pm4py as pm`, and `from pm4py ...`.
- **String quoting variation**: Handles single or double quotes for file paths and parameters.
- **Keyword and positional arguments**: Handles formatting function arguments both positionally and via keyword argument assignments.

## 3. Tested Scenarios
In `static_analysis_test.rs`, the following scenarios are verified:
- `test_pipeline_facts_extraction`: Verifies that imports, CSV variables, dataframe formatting, and discovery calls are correctly extracted from standard workflow text.
- `test_missing_mappings`: Verifies that omitting required mapping parameters (`case_id`, `activity`, `timestamp`) is correctly flagged in the extracted facts structure.
