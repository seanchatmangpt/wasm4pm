# Development Guide for wasm4pm

Architecture, extension points, and internal design documentation.

## Project Structure

```
wasm4pm/
├── src/                           # Rust WASM implementation
│   ├── lib.rs                    # Entry point, module exports
│   ├── api.ts                    # TypeScript API definitions (reference)
│   ├── client.ts                 # TypeScript client library
│   ├── visualizations.ts         # Mermaid & D3 generation
│   │
│   ├── models.rs                 # Core data structures
│   ├── state.rs                  # Global object storage (AppState)
│   ├── io.rs                     # Load/export functions
│   ├── types.rs                  # Type utilities
│   │
│   ├── discovery.rs              # Basic discovery (DFG, Alpha++)
│   ├── ilp_discovery.rs          # ILP optimization algorithms
│   ├── genetic_discovery.rs      # Evolutionary algorithms
│   ├── advanced_algorithms.rs    # Heuristic, rework, bottleneck detection
│   │
│   ├── analysis.rs               # Statistics and analysis
│   ├── conformance.rs            # Token-based replay
│   ├── utilities.rs              # Helper functions
│   ├── xes_format.rs             # XES parser/generator
│   └── streaming.rs              # Streaming DFG builder (IoT/chunked ingestion)
│
├── cli/                          # Command-line interface
│   └── index.ts                  # wasm4pm CLI commands
│
├── examples/                      # Example applications
│   ├── interactive-demo.html      # Browser demo
│   └── react-component.tsx        # React integration
│
├── __tests__/                    # Test suites
│   ├── unit.test.ts              # Unit tests
│   ├── integration.test.js        # Integration tests
│   └── fixtures/                 # Test data
│
├── Cargo.toml                    # Rust configuration
├── wasm-pack.toml                # WASM build config
├── tsconfig.json                 # TypeScript configuration
├── package.json                  # npm configuration
├── BUILD.md                      # Build instructions
├── README.md                     # User documentation
└── DEVELOPMENT.md                # This file
```

## Architecture Overview

### Three-Layer Design

```
┌─────────────────────────────────────┐
│   JavaScript Client / Examples      │  Presentation & Integration
├─────────────────────────────────────┤
│   TypeScript API (client.ts)        │  High-level API bindings
├─────────────────────────────────────┤
│   WASM Bindings & Models (Rust)    │  Algorithm implementation
└─────────────────────────────────────┘
```

### Data Flow

```
Event Log (JSON/XES)
    ↓
[load_eventlog_from_json]
    ↓
EventLog Model (in WASM memory)
    ↓
[discover_*] algorithms
    ↓
Process Model (DFG/PetriNet/DECLARE)
    ↓
[export_to_json]
    ↓
JSON output / Visualization
```

## Handle-Based Memory Management

Objects larger than primitives use handles to manage memory:

```rust
// Rust side - store in global AppState
let handle = get_or_init_state()
    .store_object(StoredObject::EventLog(log))?;
// Returns: "eventlog_123"

// JavaScript side - hold the handle
const log = new EventLogHandle("eventlog_123", wasmModule);

// Later - access the object
const stats = log.getStats();  // Uses handle internally
```

Benefits:

- Prevents copying large objects across WASM boundary
- Automatic memory management in Rust
- Multiple JavaScript references to same object
- Simple cleanup: `log.delete()`

## Adding a New Discovery Algorithm

### 1. Implement in Rust

Create `src/new_algorithm.rs`:

```rust
use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::*;
use serde_json::json;

#[wasm_bindgen]
pub fn discover_new_algorithm(
    eventlog_handle: &str,
    activity_key: &str,
    param1: f64,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            // 1. Build columnar view for efficient integer-key counting
            let col = log.to_columnar(activity_key);

            // 2. Run algorithm
            let mut dfg = DirectlyFollowsGraph::new();
            // ... algorithm implementation using col.events / col.vocab ...

            Ok(dfg)
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })?;
    // Lock released here — safe to store without mutex re-entry
    let handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(dfg.clone()))
        .map_err(|_e| JsValue::from_str("Failed to store"))?;

    Ok(serde_json::to_string(&json!({
        "handle": handle,
        "algorithm": "new_algorithm",
        "nodes": dfg.nodes.len(),
        "edges": dfg.edges.len(),
    }))
    .map_err(|e| JsValue::from_str(&format!("Serialization: {}", e)))?)
```

### 2. Register Module

Edit `src/lib.rs`:

```rust
pub mod new_algorithm;
```

### 3. Add TypeScript Types

Edit `src/api.ts`:

```typescript
discovery: {
  discoverNewAlgorithm(
    log: EventLog,
    options?: {
      activityKey?: string;
      param1?: number;
    }
  ): Promise<DirectlyFollowsGraph | Error>;
}
```

### 4. Add Client Method

Edit `src/client.ts`:

```typescript
discoverNewAlgorithm(
  options: {
    activityKey?: string;
    param1?: number;
  } = {}
): DFGHandle {
  const activityKey = options.activityKey || 'concept:name';
  const param1 = options.param1 || 0.5;

  const json = this.wasmModule.discover_new_algorithm(
    this.handle,
    activityKey,
    param1
  );
  const result = JSON.parse(json);
  return new DFGHandle(result.handle, this.wasmModule);
}
```

### 5. Test It

```bash
npm test
# Add test case in __tests__/unit.test.ts
```

## Adding a New Analysis Function

Similar pattern to discovery:

```rust
#[wasm_bindgen]
pub fn analyze_new_metric(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<String, JsValue> {
    // Implementation
    Ok(serde_json::to_string(&json!({
        "metric": value,
    }))?)
}
```

Then expose on EventLogHandle in client.ts:

```typescript
getNewMetric(): number {
  const json = this.wasmModule.analyze_new_metric(this.handle);
  return JSON.parse(json).metric;
}
```

## Working with Event Logs

### EventLog Structure

```rust
pub struct EventLog {
    pub attributes: HashMap<String, AttributeValue>,
    pub traces: Vec<Trace>,  // Cases
}

pub struct Trace {
    pub attributes: HashMap<String, AttributeValue>,
    pub events: Vec<Event>,
}

pub struct Event {
    pub attributes: HashMap<String, AttributeValue>,
}
```

### Common Operations

```rust
// Get activities
let activities = log.get_activities("concept:name");

// Get directly-follows relations
let relations = log.get_directly_follows("concept:name");
// Returns: Vec<(String, String, usize)>

// Iterate traces
for trace in &log.traces {
    for (i, event) in trace.events.iter().enumerate() {
        let activity = event.attributes.get("concept:name");
    }
}

// Event count
let total = log.event_count();  // Sum of all trace lengths
let cases = log.case_count();   // Number of traces
```

## Performance Optimization Tips

### 1. Minimize Boundary Crossing

✅ Good: Process all data in Rust, return aggregated result
❌ Bad: Call JavaScript frequently in loops

### 2. Use Appropriate Algorithms

- DFG: Fast, simple overview (O(n))
- Alpha++: Solid, handles noise (O(n log n))
- ILP: Optimal but slower (O(n²))
- Genetic: Flexible, best for complex cases (O(g×p×n))

### 3. Memory Management

```rust
// Release objects when done
let handle = get_or_init_state().store_object(obj)?;
// Use handle...
get_or_init_state().delete_object(&handle)?;
```

### 4. Lazy Computation

Compute metrics only when requested:

```rust
// Don't compute all metrics upfront
// Only compute what was asked for
```

## Error Handling Pattern

All WASM functions return `Result<String, JsValue>`:

```rust
get_or_init_state().with_object(handle, |obj| match obj {
    Some(StoredObject::EventLog(log)) => {
        // Success path — log is borrowed, no clone
        Ok(serde_json::to_string(&json!({ ... }))?)
    }
    Some(_) => Err(JsValue::from_str("Wrong object type")),
    None => Err(JsValue::from_str("Handle not found")),
})
```

JavaScript receives error:

```typescript
try {
  const result = log.discoverDFG();
} catch (error) {
  console.error('Discovery failed:', error.message);
}
```

## Debugging Tips

### In Rust

Enable debug logging:

```rust
console_log::init_with_level(web_sys::console::LogLevel::Debug);
log::debug!("Message: {}", value);
```

### In JavaScript

```typescript
console.log('Handle:', log.getId());
console.log('Stats:', log.getStats());
```

### Check WASM Memory

In DevTools console:

```javascript
// Inspect WASM module
console.log(wasm4pm);

// Check exported functions
Object.keys(wasm4pm).slice(0, 20);
```

## Testing Strategy

### Unit Tests (Rust)

In `src/lib.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_discovery_empty_log() {
        // Test edge cases
    }
}
```

### Integration Tests (JavaScript)

In `__tests__/integration.test.js`:

```javascript
describe('Discovery Algorithms', () => {
  it('should discover DFG from event log', async () => {
    const log = client.loadEventLogFromJSON(testData);
    const dfg = log.discoverDFG();
    expect(dfg.toJSON().nodes.length).toBeGreaterThan(0);
  });
});
```

## Browser Compatibility

| Algorithm | Safari | Chrome | Firefox | Edge |
| --------- | ------ | ------ | ------- | ---- |
| DFG       | ✅     | ✅     | ✅      | ✅   |
| Alpha++   | ✅     | ✅     | ✅      | ✅   |
| ILP       | ✅     | ✅     | ✅      | ✅   |
| Genetic   | ✅     | ✅     | ✅      | ✅   |
| PSO       | ✅     | ✅     | ✅      | ✅   |

Minimum: ES2020, WebAssembly support

## Performance Profiling

### Bundle Analysis

```bash
npm run build:all
wc -c pkg/wasm4pm_bg.wasm
```

### Runtime Profiling

```javascript
const start = performance.now();
const dfg = log.discoverDFG();
const duration = performance.now() - start;
console.log(`Discovery took ${duration.toFixed(1)}ms`);
```

## Contributing Checklist

- [ ] Rust code compiles: `cargo check --target wasm32-unknown-unknown`
- [ ] WASM builds: `npm run build`
- [ ] Tests pass: `npm test`
- [ ] TypeScript types valid: `npm run type:check`
- [ ] Code formatted: `npm run format`
- [ ] Added documentation
- [ ] Updated changelog

## Future Enhancements

- [ ] Streaming conformance checking (token replay on streaming builder)
- [ ] Parallel algorithm execution (web workers)
- [ ] More visualization options
- [ ] Conformance metrics refinement
- [ ] Anomaly detection

---

**Version**: 0.5.5  
**Last Updated**: 2026-04-04  
**Audience**: Contributors and maintainers
