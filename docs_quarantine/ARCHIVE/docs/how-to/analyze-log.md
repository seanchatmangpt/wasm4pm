<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs_quarantine/ARCHIVE/docs/how-to/analyze-log.md; source-sha256: 51d8f24f318b5e654115a390b1f388db6b1002e809f79ad1078da5cf9d395f72; reason: tooling or agent control surface -->

# How-To: Analyze an Event Log

**Time required**: 5 minutes  
**Difficulty**: Beginner  

## Quick Reference

Basic analysis command:

```bash
wpm run --config config.toml
```

With options:

```bash
wpm run \
  --config config.toml \
  --profile fast \
  --format json \
  --verbose
```

## Configuration

Minimal `config.toml`:

```toml
[source]
type = "file"
path = "your-eventlog.xes"
format = "xes"

[sink]
type = "file"
directory = "output"
```

## Formats Supported

| Format | Extension | Use Case |
|--------|-----------|----------|
| XES | `.xes` | Standard event log |
| JSON | `.json` | Custom events |
| JSONL | `.jsonl` | Streaming events |
| OCEL | `.ocel.json` | Multi-object processes |

## Output

Results saved to `output/`:

```
output/
├── receipt.json          # Execution proof
├── model.dfg.json        # Process model
├── model.json            # Standard format
└── report.html           # Visual report
```

## Check Results

View model:

```bash
cat output/model.json | jq '.nodes'
```

View statistics:

```bash
jq '{nodes: (.nodes | length), edges: (.edges | length)}' output/model.json
```

## See Also

- [Tutorial: Your First Model](../tutorials/first-model.md)
- [How-To: Choose the Right Algorithm](./choose-algorithm.md)
- [Reference: CLI Commands](../reference/cli-commands.md)
