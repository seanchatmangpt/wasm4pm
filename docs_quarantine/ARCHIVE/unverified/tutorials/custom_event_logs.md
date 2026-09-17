<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs_quarantine/ARCHIVE/unverified/tutorials/custom_event_logs.md; source-sha256: aee93ab83573359c0b41f4e9732d84fdf3f9176c1c86acf3cf2958b4203d3e5c; reason: tooling or agent control surface -->

# Tutorial: Parsing Custom Event Logs

## Learning Objectives
In this tutorial, you will learn to:
1. Parse non-standard CSV data into the standard XES format.
2. Map custom columns to standard XES extensions.

## Step 1: CSV Mapping
If you have a CSV like `raw_data.csv`, define a mapping file `mapping.json`:
```json
{
  "case_id": "OrderNumber",
  "activity": "Action",
  "timestamp": "Time"
}
```

## Step 2: Conversion
Use the CLI utility to convert the log:
```bash
wpm import csv raw_data.csv --mapping mapping.json -o converted.xes
```

## Step 3: Validation
Validate the new XES file against the strict schema:
```bash
wpm validate converted.xes
```
