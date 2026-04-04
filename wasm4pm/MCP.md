# Model Context Protocol (MCP) Integration for wasm4pm

Exposes wasm4pm as an MCP server, enabling Claude and other MCP clients to use process mining capabilities.

## What is MCP?

**Model Context Protocol** is a standard for communication between AI models (like Claude) and tools/services. It allows Claude to:
- Discover available tools dynamically
- Execute tools with proper input validation
- Receive structured results
- Handle errors gracefully

## MCP Server for wasm4pm

The wasm4pm MCP server exposes 14 discovery algorithms, analysis functions, and visualization capabilities as MCP tools.

### Available MCP Tools

#### Discovery Algorithms
- `discover_dfg` - Directly-Follows Graph (fastest)
- `discover_alpha_plus_plus` - Petri Net discovery
- `discover_ilp_optimization` - Integer Linear Programming
- `discover_genetic_algorithm` - Evolutionary algorithm
- `discover_variants` - Find unique trace variants

#### Analysis Tools
- `check_conformance` - Verify log against model
- `analyze_statistics` - Log statistics and metrics
- `detect_bottlenecks` - Find slow activities
- `detect_concept_drift` - Detect process changes

#### Visualization Tools
- `generate_mermaid_diagram` - Generate Mermaid process diagram
- `generate_html_report` - Create comprehensive HTML report

#### Utilities
- `compare_algorithms` - Benchmark multiple algorithms

## Installation

### Prerequisites
```bash
npm install @modelcontextprotocol/sdk
npm install wasm4pm
```

### Setup

#### 1. Create MCP Server File
```typescript
// mcp_server.ts (already provided)
import Wasm4pmMCPServer from 'wasm4pm/src/mcp_server';

const server = new Wasm4pmMCPServer();
await server.start();
```

#### 2. Configure Claude to Use MCP

Add to your Claude configuration (e.g., in `.claude.json` or Claude desktop config):

```json
{
  "mcpServers": {
    "wasm4pm": {
      "command": "node",
      "args": ["dist/mcp_server.js"],
      "cwd": "./path/to/wasm4pm"
    }
  }
}
```

#### 3. Build and Start

```bash
npm run build
npm run start:mcp
```

## Usage Examples

### Example 1: Process Discovery via Claude

```
User: "Analyze this event log and discover the most likely process model"
Claude uses: discover_dfg tool
Result: Returns DFG model with activities and edges
```

### Example 2: Conformance Analysis

```
User: "Check if these events conform to the discovered model"
Claude uses: check_conformance tool
Result: Returns fitness, precision, and deviations
```

### Example 3: Bottleneck Detection

```
User: "Find performance bottlenecks in the process"
Claude uses: detect_bottlenecks tool
Result: Returns slow activities with timing details
```

### Example 4: Model Comparison

```
User: "Compare DFG and Genetic Algorithm on this log"
Claude uses: compare_algorithms tool
Result: Returns metrics for both algorithms
```

## Tool Specifications

### discover_dfg

```
Input:
  - xes_content (string, required): XES event log content
  - min_frequency (number, optional): Minimum edge frequency (0-1)

Output:
  - nodes: Array of activities in the model
  - edges: Connections between activities with frequencies
  - metrics: Quality metrics (nodes, edges, density)
```

Example:
```javascript
const result = await mcp.call('discover_dfg', {
  xes_content: xesFileContent,
  min_frequency: 0.05
});
```

### discover_genetic_algorithm

```
Input:
  - xes_content (string, required): XES event log content
  - population_size (number, optional): Population size. Default: 50
  - generations (number, optional): Number of generations. Default: 100

Output:
  - model: Discovered process model
  - fitness: Model quality (0-1)
  - evolution: Fitness progression over generations
```

### check_conformance

```
Input:
  - xes_content (string, required): Event log
  - model_json (string, required): Process model as JSON
  - include_deviations (boolean, optional): Include deviation details

Output:
  - fitness: Trace replay fitness (0-1)
  - precision: Model specificity (0-1)
  - generalization: Model flexibility (0-1)
  - simplicity: Model simplicity (0-1)
  - deviations: Non-conforming traces (if included)
```

### analyze_statistics

```
Input:
  - xes_content (string, required): Event log

Output:
  - traceCount: Number of cases
  - eventCount: Total events
  - activities: Unique activities
  - duration: Case duration statistics
  - startTime, endTime: Time range
  - averageCaseDuration: Mean duration
```

### detect_bottlenecks

```
Input:
  - xes_content (string, required): Event log
  - threshold (number, optional): Percentile threshold. Default: 0.75

Output:
  - activities: Slow activities with timing details
    - name: Activity name
    - avgDuration: Average execution time
    - p95Duration: 95th percentile
    - frequency: How often activity occurs
```

### detect_concept_drift

```
Input:
  - xes_content (string, required): Event log
  - window_size (number, optional): Window size. Default: 100

Output:
  - driftDetected: Boolean indicating if drift found
  - changePoint: Event index where change occurs
  - beforeMetrics: Metrics before change
  - afterMetrics: Metrics after change
  - confidence: Confidence of detection (0-1)
```

### generate_mermaid_diagram

```
Input:
  - model_json (string, required): Process model

Output:
  - mermaid_code: Mermaid diagram code
            Paste at https://mermaid.live to visualize
```

### generate_html_report

```
Input:
  - xes_content (string, required): Event log
  - model_json (string, required): Process model

Output:
  - html_content: Complete HTML report
             Save to file and open in browser
```

### compare_algorithms

```
Input:
  - xes_content (string, required): Event log
  - algorithms (array, optional): Algorithms to compare
              Default: ['dfg', 'alpha_plus_plus', 'genetic']

Output:
  - results: Object with algorithm metrics
    - time_ms: Execution time
    - fitness: Model fitness
    - precision: Model precision
    - generalization: Model generalization
```

## Integration with Claude Desktop

### macOS Configuration

Edit `~/.config/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wasm4pm": {
      "command": "/usr/local/bin/node",
      "args": [
        "/path/to/wasm4pm/dist/mcp_server.js"
      ]
    }
  }
}
```

Restart Claude Desktop for changes to take effect.

### Windows Configuration

Edit `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wasm4pm": {
      "command": "node",
      "args": [
        "C:\\path\\to\\wasm4pm\\dist\\mcp_server.js"
      ]
    }
  }
}
```

## Building the MCP Server

```bash
cd wasm4pm

# Install MCP SDK
npm install @modelcontextprotocol/sdk

# Build TypeScript
npm run build

# Start MCP server
npm run start:mcp
```

## Debugging

### Enable Verbose Logging

```bash
DEBUG=* npm run start:mcp
```

### Test with MCP Inspector

```bash
npm install -g @modelcontextprotocol/inspector
mcp-inspector node dist/mcp_server.js
```

This opens a web interface where you can:
- See available tools
- Test tool calls
- View request/response JSON
- Debug communication

## Performance

MCP tool execution time (measured on wasm4pm operations):

| Operation | Time | Notes |
|-----------|------|-------|
| discover_dfg (100 events) | 0.5ms | Fastest |
| analyze_statistics (1000 events) | 1-2ms | Quick analysis |
| discover_alpha_plus_plus (1000 events) | 50ms | Balanced |
| discover_genetic_algorithm (1000 events, 100 generations) | 400ms | High quality |
| check_conformance (10k events) | 100-200ms | Depends on model size |

## Limitations

- XES format limited to standard features (timestamps, strings, integers)
- Large logs (100k+ events) may need chunking
- Some algorithms have timeouts to prevent excessive computation
- WASM memory is single-threaded

## Troubleshooting

### Tool not found in Claude

1. Restart Claude Desktop
2. Check configuration file syntax (valid JSON)
3. Verify server is running: `npm run start:mcp`
4. Check error logs in Claude

### "Module not found" error

```bash
# Ensure dependencies installed
npm install

# Rebuild
npm run build

# Check that dist/mcp_server.js exists
ls -la dist/
```

### Timeout errors

Reduce algorithm complexity:
```javascript
{
  algorithm: 'discover_genetic_algorithm',
  arguments: {
    xes_content: log,
    generations: 50  // Reduce from default 100
  }
}
```

## Example: Using wasm4pm MCP from Claude

```
Human: I have an event log (BPI_2019.xes). Can you:
1. Discover a process model
2. Analyze its quality
3. Find bottlenecks
4. Generate a visualization

Claude uses:
1. discover_dfg(xes_content) → DFG model
2. check_conformance(xes_content, model) → Quality metrics
3. detect_bottlenecks(xes_content) → Slow activities
4. generate_mermaid_diagram(model) → Visualization code

Result: Complete process analysis with model diagram
```

## Contributing

To add more MCP tools:

1. Add tool definition in `getAvailableTools()`
2. Implement tool handler in `executeTool()`
3. Add tests in `mcp_server.test.ts`
4. Update this documentation

## References

- [MCP Protocol Specification](https://spec.modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Claude Integration Guide](https://claude.ai/docs)
- [wasm4pm Documentation](./README.md)

