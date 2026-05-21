# How-To: Export Models in Different Formats

**Time required**: 5 minutes  
**Difficulty**: Beginner  

## Supported Formats

### DFG (Directly-Follows Graph)
```toml
[sink]
format = "dfg"  # or "json" (default)
```

Output: `model.dfg.json`

```json
{
  "nodes": [{"id": "A", "frequency": 42}],
  "edges": [{"source": "A", "target": "B", "frequency": 40}]
}
```

### Petri Net (JSON)
```toml
[sink]
format = "petri_net"
```

Output: `model.petri_net.json`

### PNML (Petri Net Markup Language)
```toml
[sink]
format = "pnml"
```

Output: `model.pnml` (XML format)

### BPMN (Business Process Model and Notation)
```toml
[sink]
format = "bpmn"
```

Output: `model.bpmn` (XML)

### Mermaid (Diagram)
```toml
[sink]
format = "mermaid"
```

Output: `model.mmd` (Markdown diagram)

## Multiple Formats

Export to multiple formats:

```toml
[sink]
type = "file"
directory = "output"
formats = ["json", "pnml", "bpmn", "mermaid"]
```

Generates:
- `model.json`
- `model.pnml`
- `model.bpmn`
- `model.mmd`

## HTML Report

```toml
[sink]
format = "html"
```

Generates interactive HTML report with visualization.

## See Also

- [Reference: Config Schema](../reference/config-schema.md)
- [Tutorial: First Model](../tutorials/first-model.md)
