# Tutorial: Your First Process Model

**Time to complete**: 5 minutes  
**Level**: Beginner  
**Audience**: Anyone new to wasm4pm  

## What You'll Learn

- Install wasm4pm for your platform
- Create your first configuration file
- Run process discovery on sample data
- Inspect and interpret the generated model
- Export results for further analysis

## Prerequisites

- Node.js 18+ or Python 3.9+
- A text editor
- Command line familiarity

## Step 1: Install wasm4pm

### Via npm (Node.js)

```bash
npm install -g @wasm4pm/pmctl
pmctl --version
```

### Via pip (Python)

```bash
pip install wasm4pm
pmctl --version
```

### Verify Installation

```bash
pmctl init
# Creates a sample config.toml in current directory
```

## Step 2: Create Your First Configuration

Create a file named `config.toml` in your working directory:

```toml
# config.toml - Your first wasm4pm configuration

[discovery]
algorithm = "dfg"           # Start with Directly-Follows Graph
profile = "fast"            # Quick analysis
timeout_ms = 30000

[source]
type = "file"
path = "sample.xes"         # We'll create this next
format = "xes"

[sink]
type = "file"
directory = "output"
format = "json"
overwrite = "skip"

[observability]
level = "info"
```

## Step 3: Get Sample Data

wasm4pm comes with sample event logs. Create `sample.xes` or download from the repository:

```bash
# Option 1: Use built-in sample
pmctl init --sample sample.xes

# Option 2: Download from repo
curl -o sample.xes https://raw.githubusercontent.com/seanchatmangpt/wasm4pm/main/examples/sample.xes
```

View the first few lines:

```bash
head -20 sample.xes
```

You should see XML with events like:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <trace>
    <string key="concept:name" value="case-1"/>
    <event>
      <string key="concept:name" value="Submit Request"/>
      <date key="time:timestamp" value="2024-01-01T08:00:00Z"/>
    </event>
    <!-- more events... -->
  </trace>
</log>
```

## Step 4: Run Discovery

Execute the first analysis:

```bash
pmctl run --config config.toml --verbose
```

Output should look like:

```
[INFO] Initializing WASM engine...
[INFO] Loading configuration from config.toml
[INFO] Loading event log from sample.xes (1,234 events, 42 traces)
[INFO] Selected algorithm: DFG (Directly-Follows Graph)
[INFO] Starting discovery...
[PROGRESS] 0%
[PROGRESS] 50%
[PROGRESS] 100%
[INFO] Discovery completed in 45ms
[INFO] Generated model: 23 nodes, 18 edges
[INFO] Writing outputs to output/
[SUCCESS] Receipt saved: output/receipt.json
```

## Step 5: Examine Your Results

Check the output directory:

```bash
ls -la output/
```

You'll see:

- `receipt.json` — Proof of execution
- `model.dfg.json` — The discovered model
- `model.json` — Standard format
- `report.html` — Visual report (if enabled)

### View the Receipt

```bash
cat output/receipt.json
```

Example receipt:

```json
{
  "run_id": "run-2026-04-05-120145",
  "timestamp": "2026-04-05T12:01:45Z",
  "status": "success",
  "algorithm": "dfg",
  "config_hash": "blake3:a7f3e2...",
  "input_hash": "blake3:c9b1d4...",
  "output_hash": "blake3:5e8f2a...",
  "execution_time_ms": 45,
  "events_processed": 1234,
  "traces_processed": 42,
  "model": {
    "nodes": 23,
    "edges": 18,
    "type": "dfg"
  }
}
```

### View the Model

```bash
cat output/model.dfg.json | head -50
```

Example model structure:

```json
{
  "nodes": [
    {
      "id": "Submit Request",
      "label": "Submit Request",
      "frequency": 42,
      "type": "activity"
    },
    {
      "id": "Review",
      "label": "Review",
      "frequency": 40,
      "type": "activity"
    }
  ],
  "edges": [
    {
      "source": "Submit Request",
      "target": "Review",
      "label": "→",
      "frequency": 40
    }
  ]
}
```

### View the HTML Report

If you enabled HTML output:

```bash
open output/report.html
```

The report shows:
- Process flow diagram
- Activity frequencies
- Performance metrics
- Quality indicators

## Step 6: Experiment with Different Algorithms

Try a more sophisticated algorithm:

```toml
[discovery]
algorithm = "heuristic"    # Add noise filtering
profile = "balanced"       # Balance speed and quality
timeout_ms = 60000
```

Run again:

```bash
pmctl run --config config.toml --verbose
```

Compare the results:

```bash
# See how many nodes/edges differ
cat output/receipt.json | jq '.model'
```

You might see:
- DFG: 23 nodes, 18 edges (raw follows)
- Heuristic: 15 nodes, 14 edges (filtered noise)

## Step 7: Export to Different Formats

Modify the sink:

```toml
[sink]
type = "file"
directory = "output"
format = "pnml"            # Petri Net Markup Language
overwrite = "overwrite"    # Replace previous files
```

Run again:

```bash
pmctl run --config config.toml
ls -la output/ | grep pnml
```

## Next Steps

1. **Learn more algorithms**: [How-To: Choose the Right Algorithm](../how-to/choose-algorithm.md)
2. **Use in watch mode**: [Tutorial: Stream Processing with Watch Mode](./watch-mode.md)
3. **Deploy as a service**: [Tutorial: Running as a Service](./service-mode.md)
4. **Understand the receipt**: [Explanation: Receipts](../explanation/receipts.md)
5. **Reference**: [CLI Commands](../reference/cli-commands.md)

## Troubleshooting

### Error: "config.toml not found"

```bash
# Create a sample config
pmctl init
```

### Error: "sample.xes not found"

```bash
# Download the sample
pmctl init --sample sample.xes
```

### Error: "Algorithm timeout"

Increase the timeout in config.toml:

```toml
[discovery]
timeout_ms = 120000  # 2 minutes instead of 30 seconds
```

### Error: "Out of memory"

Use a faster profile or smaller input:

```toml
[discovery]
profile = "fast"     # Simpler algorithm
```

## Key Concepts Introduced

| Term | Meaning |
|------|---------|
| **Receipt** | Cryptographic proof of execution with hashes |
| **DFG** | Directly-Follows Graph (simplest model) |
| **Profile** | Preset algorithm combination (fast/balanced/quality) |
| **Sink** | Output destination (file, HTTP, database) |
| **Hash** | Checksum proving data integrity (BLAKE3) |

## Summary

You've successfully:
- ✅ Installed wasm4pm
- ✅ Created a configuration file
- ✅ Ran your first process discovery
- ✅ Examined the generated model
- ✅ Explored different algorithms
- ✅ Exported to different formats

**Total time**: ~5 minutes  
**Commands run**: 8  
**Files created**: 5+  

---

## Related Documentation

- **[How-To: Analyze an Event Log](../how-to/analyze-log.md)** — Next task-focused guide
- **[How-To: Choose the Right Algorithm](../how-to/choose-algorithm.md)** — Algorithm selection decision tree
- **[Reference: CLI Commands](../reference/cli-commands.md)** — All `pmctl` commands
- **[Reference: Config Schema](../reference/config-schema.md)** — Complete configuration options
- **[Explanation: Algorithm Profiles](../explanation/profiles.md)** — Deep dive into profiles
