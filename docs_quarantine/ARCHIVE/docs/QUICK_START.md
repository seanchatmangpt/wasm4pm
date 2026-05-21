# Quick Start (3-5 Minutes)

Get up and running with wasm4pm in under 5 minutes.

## Prerequisites

- **Installation:** `npm install -g @wasm4pm/cli` ([full guide](INSTALL.md))
- **Verify:** `wpm --version`

## Step 1: Get a Sample Event Log (30 seconds)

Download a sample XES file:

```bash
# Option A: Use the built-in sepsis dataset
wget https://raw.githubusercontent.com/sac/wasm4pm/main/bench_data/sepsis.xes -O sample.xes

# Option B: Use a file from your local checkout
cp <wasm4pm-repo>/bench_data/sepsis.xes ./sample.xes

# Option C: Use your own event log
# (supports XES, JSON, and other standard process mining formats)
```

### What's in the file?

The sepsis dataset contains ~1000 patient event logs with activities like:
- "Register", "Leucocytes", "CRP", "LacticAcid", etc.

Perfect for testing discovery and prediction algorithms.

## Step 2: Run Process Discovery (1 minute)

```bash
wpm run sample.xes
```

**What happens:**
1. Loads the event log
2. Runs the DFG (Directly-Follows Graph) algorithm by default
3. Generates a process model
4. Creates a BLAKE3 receipt proving the run happened
5. Saves results to `.wasm4pm/results/`

**Expected output (human format):**
```
✓ Discovery complete
  Algorithm: dfg
  Activities: 10
  Traces: 1000
  Variants: 42
  Model saved to: .wasm4pm/results/20260517-123456-dfg.json
  Receipt: d1c2e3f4a5b6c7d8e9f0a1b2c3d4e5f6
```

**In JSON format:**
```bash
wpm run sample.xes --format json | jq .
```

## Step 3: View and Inspect Results (30 seconds)

```bash
# List all saved results
wpm results

# Verify a result's integrity (checks receipt hash)
wpm results --verify d1c2e3f4a5b6c7d8e9f0a1b2c3d4e5f6

# Compare two results side-by-side
wpm results --diff <ref1,ref2>
```

## Step 4: Try Other Commands (Optional, 1-2 minutes)

### Compare Algorithms

See how different algorithms perform on the same log:

```bash
wpm compare dfg,heuristic_miner,ilp -i sample.xes

# Output: side-by-side comparison with ASCII sparklines
# Speed:  dfg(●────), heuristic(─●───), ilp(────●)
# Quality: dfg(●────), heuristic(───●─), ilp(────●)
```

### Check Conformance

If you have a known-good model, measure fitness:

```bash
wpm conformance -i sample.xes --model model.pnml
```

### Predict Next Activity

Run next-activity prediction on partial traces:

```bash
wpm predict next-activity -i sample.xes
```

Output: Top 3 predicted activities for each prefix, with confidence.

### Analyze Temporal Patterns

Identify bottlenecks and performance issues:

```bash
wpm temporal -i sample.xes
```

Output: Slowest activities, mean duration per activity, variance.

## Step 5: Configure (Optional)

Instead of command-line args, use a config file:

**wasm4pm.toml:**
```toml
[source]
kind = "file"
path = "sample.xes"

[algorithm]
name = "heuristic_miner"

[execution]
profile = "quality"

[output]
format = "json"
```

Then:
```bash
wpm run
# Automatically uses wasm4pm.toml
```

See [docs/CONFIG.md](CONFIG.md) for all options.

## What's Next?

### To Learn More
- **Full CLI Reference:** [docs/reference/cli-commands.md](reference/cli-commands.md)
- **Algorithm Guide:** [docs/reference/algorithms.md](reference/algorithms.md) — All 41 algorithms with parameters
- **Workflow Examples:** [docs/TUTORIAL.md](TUTORIAL.md) — Real-world scenarios

### To Go Deeper
- **Process Mining Theory:** [Process Mining: Data Science in Action](http://www.processmining.org/) by Wil van der Aalst
- **Architecture:** [docs/cognition-overview.md](cognition-overview.md) — How the system works under the hood
- **BLAKE3 Receipts:** [docs/reference/receipts.md](reference/receipts.md) — Cryptographic proof of execution

### To Troubleshoot
- **FAQ:** [docs/FAQ.md](FAQ.md)
- **Issues:** https://github.com/sac/wasm4pm/issues

## Common Patterns

### Save results without auto-save

```bash
wpm run sample.xes --no-save
# Results still printed to stdout, not saved to .wasm4pm/
```

### Run with custom algorithm

```bash
wpm run sample.xes --algorithm ilp
# Use ILP instead of default DFG
```

### Watch for changes

```bash
wpm watch
# Re-runs discovery every time wasm4pm.toml changes
```

### Export to different format

```bash
wpm run sample.xes --output-format mermaid
# Generate Mermaid diagram instead of JSON
```

## Summary

| Task | Command | Time |
|------|---------|------|
| Install | `npm install -g @wasm4pm/cli` | 30s |
| Get data | `wget bench_data/sepsis.xes` | 10s |
| Run discovery | `wpm run sample.xes` | 1-5s |
| View results | `wpm results` | 1s |
| **Total** | | **<2 min** |

You're ready! Now try [docs/TUTORIAL.md](TUTORIAL.md) for real-world examples, or jump to [docs/reference/cli-commands.md](reference/cli-commands.md) for the full command reference.
