# Diagnostic System Investigation Report

**Role**: Diagnostics Agent (`diagnostics`)  
**Milestone**: Milestone 7 Verification and Checkpoint Promotion  
**Project**: `pm4py-lsp` Diagnostic Rules & Verification

## 1. Diagnostic Definitions

The `pm4py-lsp` adapter implements the following LSP diagnostics to enforce PM4Py compliance during python script editing:

| Diagnostic Code | LSP Code Identifier | Severity | Range Mapping | Standard Message |
| --- | --- | --- | --- | --- |
| `UnformattedDataframe` | `pm4py.py.unformatted_dataframe` | `WARNING` | Range of `read_csv` function call. | "Variable '{var_name}' is loaded via pd.read_csv but not formatted for PM4Py. Use pm4py.format_dataframe({var_name}, ...)" |
| `MissingCaseIdMapping` | `pm4py.py.missing_case_id_mapping` | `WARNING` | Range of `format_dataframe` function call. | "Missing 'case_id' mapping in format_dataframe." |
| `MissingActivityMapping` | `pm4py.py.missing_activity_mapping` | `WARNING` | Range of `format_dataframe` function call. | "Missing 'activity' mapping in format_dataframe." |
| `MissingTimestampMapping` | `pm4py.py.missing_timestamp_mapping` | `WARNING` | Range of `format_dataframe` function call. | "Missing 'timestamp' mapping in format_dataframe." |
| `DiscoveryBeforeFormatting` | `pm4py.py.discovery_before_formatting` | `WARNING` | Range of the process discovery call. | "Process discovery called before formatting the DataFrame." |
| `ParityFixtureMissing` | `pm4py.py.parity_fixture_missing` | `INFORMATION` | Range of `import pm4py` statement. | "No parity fixture found for this snapshot. Use pm4py-lsp.createParityFixture to create one." |
| `UnreceiptedOutput` | `pm4py.py.unreceipted_output` | `INFORMATION` | Range of `import pm4py` statement. | "No execution receipts generated for this snapshot." |

## 2. Dynamic Diagnostic Wiring
Diagnostics are triggered dynamically upon text document opening (`did_open`) and alteration (`did_change`). The language server evaluates the AST facts to publish diagnostic reports back to the LSP client.

## 3. Test Verification
Diagnostic accuracy is tested and verified by:
- `tests/diagnostic_test.rs`: Runs unit test checks on formatted and unformatted pipelines.
- `tests/diagnostics_test.rs`: Specifically checks for missing event log mapping warnings (`test_missing_mappings_diagnostics`) and checks general diagnostic detection.
- `tests/capability_test.rs`: Validates standard formatting diagnostic workflows.
All diagnostic tests compile and pass successfully.
