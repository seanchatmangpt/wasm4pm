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
