# How-To: Browse and Inspect Previous Results

**Time required**: 5 minutes
**Difficulty**: Beginner

## Problem

You have run discovery and prediction tasks with `pmctl`, and the results were auto-saved. Now you need to find and inspect those previous results without re-running the tasks.

## How Results Are Stored

Every `pmctl run` and `pmctl predict` command automatically saves its output to the local results directory:

```
.wasm4pm/results/<timestamp>-<task>.json
```

For example, a next-activity prediction run on April 6, 2026 might produce:

```
.wasm4pm/results/20260406-143022-next_activity.json
```

Results include the full receipt (BLAKE3 hashes, timing, algorithm info) and the task output.

To skip auto-saving, pass `--no-save`.

## Step 1 -- List Recent Results

```bash
pmctl results
```

What you should see:

```
Recent results (.wasm4pm/results/)
  #  Time                   Task             Algorithm    Status
  1  2026-04-06 14:30:22   next_activity   dfg          success
  2  2026-04-06 14:28:01   discovery       heuristic    success
  3  2026-04-06 14:15:44   drift           dfg          success
  4  2026-04-05 09:00:11   next_activity   dfg          success

4 results shown (use --limit to see more)
```

By default, the listing shows the 20 most recent results. To see more:

```bash
pmctl results --limit 50
```

## Step 2 -- Run a Prediction to Generate a Result

If you do not have results yet, run a prediction task:

```bash
pmctl predict next-activity -i orders.xes
```

What you should see:

```
  Prediction: next-activity
  Algorithm:  dfg
  Log:        orders.xes

  Activity    Probability
  ─────────   ───────────
  Ship Order  ████████████ 0.42
  Pay Invoice ██████       0.31
  Review      ███          0.15
  Close       █            0.08

  Saved to .wasm4pm/results/20260406-143022-next_activity.json
```

## Step 3 -- Inspect the Latest Result

Print the most recent result in full:

```bash
pmctl results --last
```

What you should see:

```json
{
  "run_id": "a1b2c3d4-...-f5e4d3c2",
  "task": "next_activity",
  "algorithm": "dfg",
  "status": "success",
  "timestamp": "2026-04-06T14:30:22Z",
  "config_hash": "abc123...",
  "input_hash": "def456...",
  "output_hash": "789abc...",
  "predictions": [
    { "activity": "Ship Order", "probability": 0.42 },
    { "activity": "Pay Invoice", "probability": 0.31 },
    { "activity": "Review", "probability": 0.15 },
    { "activity": "Close", "probability": 0.08 }
  ]
}
```

## Step 4 -- Retrieve a Specific Result by Index

Use the index number from the listing to print a particular result:

```bash
pmctl results --cat 3
```

This prints the full JSON of the result at index 3 (the drift result in the example listing above).

## Step 5 -- Retrieve a Result by Task Name

You can also look up results by task name instead of index:

```bash
pmctl results --cat next-activity
```

This prints the most recent result whose task name matches `next-activity`.

## Step 6 -- Machine-Readable Listing

For scripting or pipeline integration, get the listing in JSON format:

```bash
pmctl results --format json
```

What you should see:

```json
{
  "total": 4,
  "results": [
    {
      "index": 1,
      "timestamp": "2026-04-06T14:30:22Z",
      "task": "next_activity",
      "algorithm": "dfg",
      "status": "success",
      "file": "20260406-143022-next_activity.json"
    },
    ...
  ]
}
```

## Command Reference

| Command | Description |
|---------|-------------|
| `pmctl results` | List recent results (default 20) |
| `pmctl results --limit N` | List up to N results |
| `pmctl results --last` | Print the most recent result in full |
| `pmctl results --cat N` | Print result at index N |
| `pmctl results --cat <task>` | Print most recent result matching task name |
| `pmctl results --format json` | JSON output for the listing |

## Related

- [How-To: Analyze an Event Log](analyze-log.md) -- running discovery that produces results
- [How-To: Configure Predictions](configure-predictions.md) -- setting up prediction tasks
- [How-To: Benchmark Algorithms](benchmark-algorithms.md) -- comparing algorithms with `pmctl compare`
