# How-To: Analyze an Event Log

**Time required**: 5 minutes  
**Difficulty**: Beginner  

## Quick Reference

Basic analysis command:

```bash
pmctl run --config config.toml
```

With options:

```bash
pmctl run \
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
