# HTTP API Reference

wasm4pm exposes all 18 tools as HTTP endpoints through the Kubernetes service.
The service accepts POST requests with a JSON body and returns structured JSON (or plain text for
encode_* tools).

---

## Base URL

```
http://<service-host>:<port>
```

When deployed via the Helm chart the default service name is `wasm4pm` in the `wasm4pm` namespace:

```
http://wasm4pm.wasm4pm.svc.cluster.local:8080
```

---

## Endpoints

| Endpoint | Tool | Input Format | Description |
|----------|------|--------------|-------------|
| `/mcp/tools/analyze_statistics` | `analyze_statistics` | `handle` | Analyze Statistics |
| `/mcp/tools/check_conformance` | `check_conformance` | `xes` | Check Conformance |
| `/mcp/tools/compare_algorithms` | `compare_algorithms` | `xes` | Compare Algorithms |
| `/mcp/tools/detect_bottlenecks` | `detect_bottlenecks` | `handle` | Detect Bottlenecks |
| `/mcp/tools/detect_concept_drift` | `detect_concept_drift` | `handle` | Detect Concept Drift |
| `/mcp/tools/discover_alpha_plus_plus` | `discover_alpha_plus_plus` | `xes` | Discover Alpha++ |
| `/mcp/tools/discover_dfg` | `discover_dfg` | `xes` | Discover DFG |
| `/mcp/tools/discover_genetic_algorithm` | `discover_genetic_algorithm` | `xes` | Discover Genetic Algorithm |
| `/mcp/tools/discover_ilp_optimization` | `discover_ilp_optimization` | `xes` | Discover ILP Optimization |
| `/mcp/tools/discover_oc_petri_net` | `discover_oc_petri_net` | `handle` | Discover OC Petri Net |
| `/mcp/tools/discover_ocel_dfg_per_type` | `discover_ocel_dfg_per_type` | `handle` | Discover OCEL DFG Per Type |
| `/mcp/tools/discover_variants` | `discover_variants` | `handle` | Discover Variants |
| `/mcp/tools/encode_dfg_as_text` | `encode_dfg_as_text` | `handle` | Encode DFG as Text |
| `/mcp/tools/encode_ocel_as_text` | `encode_ocel_as_text` | `handle` | Encode OCEL as Text |
| `/mcp/tools/extract_case_features` | `extract_case_features` | `handle` | Extract Case Features |
| `/mcp/tools/flatten_ocel` | `flatten_ocel` | `handle` | Flatten OCEL |
| `/mcp/tools/get_capability_registry` | `get_capability_registry` | `none` | Get Capability Registry |
| `/mcp/tools/load_ocel` | `load_ocel` | `ocel2` | Load OCEL |

---

## POST /mcp/call

All tools are also reachable through the unified MCP call endpoint. This is the preferred interface
for MCP clients and Claude tool use.

**Request body:**

```json
{
  "tool": "<toolId>",
  "arguments": {
    "log_content": "<xes or ocel2 string, if required>",
    "handle_id": "<handle UUID, if required>"
  }
}
```

**Response body (success):**

```json
{
  "content": [
    {
      "type": "text",
      "text": "<result string or JSON>"
    }
  ]
}
```

**Response body (error):**

```json
{
  "isError": true,
  "content": [
    {
      "type": "text",
      "text": "<error message>"
    }
  ]
}
```

---

## Input Format Notes

- `xes` — provide the full XES XML as a UTF-8 string in `log_content`
- `ocel2` — provide the OCEL 2.0 JSON as a string in `log_content`
- `handle` — provide the UUID returned by a previous `load_ocel` or `discover_dfg` call in `handle_id`
- `none` — omit `arguments` or pass an empty object

---

## See Also

- [Algorithm Reference](./algorithms.md) — tier classification and format details
- [Kubernetes Deployment](./kubernetes.md) — service configuration and ingress
