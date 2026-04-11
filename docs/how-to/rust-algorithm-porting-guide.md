# Rust Algorithm Porting Guide for pictl

**How to add a new Rust algorithm to pictl and register it in the WASM kernel**

This guide walks you through the complete process of porting a classical process mining algorithm from pseudocode or academic papers into pictl's high-performance WASM kernel, then exposing it via the LLM-discoverable capability registry.

**Prerequisites:**
- Rust 1.70+ with `wasm-pack` and `cargo-wasm`
- Familiarity with pictl's EventLog and model data structures
- Knowledge of the algorithm you're porting (theory and complexity)
- Basic understanding of WASM binary constraints (speed, memory, code size)

---

## 1. Implement the Algorithm in Rust

### 1.1 Create Algorithm Module

Create a new file in `wasm4pm/src/algorithms/`:

```bash
# Example: porting frequency analysis algorithm
touch /Users/sac/chatmangpt/pictl/wasm4pm/src/algorithms/frequency_analysis.rs
```

### 1.2 Algorithm Structure Template

Every algorithm module must follow this pattern:

```rust
// wasm4pm/src/algorithms/frequency_analysis.rs
use crate::error::{codes, wasm_err};
use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;
use rustc_hash::FxHashMap;
use serde_json::json;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

/// Discover activity frequencies and activity pairs from event log
#[wasm_bindgen]
pub fn discover_activity_frequencies(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    // Step 1: Retrieve and validate input
    let frequencies = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            // Step 2: Compute algorithm (no store inside closure)
            let mut activity_counts: FxHashMap<String, usize> = FxHashMap::default();

            // Iterate traces and events
            for trace in &log.traces {
                for event in &trace.events {
                    if let Some(AttributeValue::String(activity)) =
                        event.attributes.get(activity_key)
                    {
                        *activity_counts.entry(activity.clone()).or_insert(0) += 1;
                    }
                }
            }

            // Convert to sorted pairs
            let mut sorted: Vec<_> = activity_counts.into_iter().collect();
            sorted.sort_by(|a, b| b.1.cmp(&a.1)); // Sort descending

            Ok((sorted, log.traces.len()))
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an EventLog")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("EventLog '{}' not found", eventlog_handle),
        )),
    })?;

    // Step 3: Store result and return metadata
    let result = json!({
        "activities": frequencies.0.iter()
            .map(|(activity, count)| {
                json!({
                    "activity": activity,
                    "frequency": count,
                    "coverage": (*count as f64) / (frequencies.1 as f64)
                })
            })
            .collect::<Vec<_>>(),
        "total_events": frequencies.1,
        "unique_activities": frequencies.0.len(),
    });

    to_js(&result)
}

/// Analyze activity pairs (directly-follows relationships)
#[wasm_bindgen]
pub fn analyze_activity_pairs(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    let pairs = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut pair_counts: FxHashMap<(String, String), usize> = FxHashMap::default();

            // Count all (from_activity, to_activity) pairs
            for trace in &log.traces {
                for i in 0..trace.events.len().saturating_sub(1) {
                    let from = trace.events[i].attributes.get(activity_key)
                        .and_then(|v| v.as_string());
                    let to = trace.events[i + 1].attributes.get(activity_key)
                        .and_then(|v| v.as_string());

                    if let (Some(f), Some(t)) = (from, to) {
                        *pair_counts.entry((f.to_owned(), t.to_owned())).or_insert(0) += 1;
                    }
                }
            }

            let mut sorted: Vec<_> = pair_counts.into_iter().collect();
            sorted.sort_by(|a, b| b.1.cmp(&a.1));

            Ok(sorted)
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an EventLog")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("EventLog '{}' not found", eventlog_handle),
        )),
    })?;

    let result = json!({
        "pairs": pairs.iter()
            .map(|((from, to), count)| json!({
                "from": from,
                "to": to,
                "frequency": count,
            }))
            .collect::<Vec<_>>(),
        "total_pairs": pairs.len(),
    });

    to_js(&result)
}
```

### 1.3 Key Patterns to Follow

**Pattern 1: Error Handling — Match All Object States**

```rust
// Always handle all three cases:
get_or_init_state().with_object(handle, |obj| match obj {
    Some(StoredObject::EventLog(log)) => {
        // Compute here (no state mutation)
        Ok(result)
    }
    Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Wrong object type")),
    None => Err(wasm_err(
        codes::INVALID_HANDLE,
        format!("Handle '{}' not found", handle),
    )),
})?;
```

**Pattern 2: Columnar Layout for Performance**

For algorithms processing dense numeric data (e.g., trace duration matrix):

```rust
// GOOD: Columnar layout (cache-friendly)
struct ColumnarTrace {
    cols: Vec<Vec<f64>>,  // cols[j] = column j values
    n: usize,            // rows
    d: usize,            // columns
}

// For loop order: iterate columns in outer loop, rows in inner
for j in 0..d {
    for i in 0..n {
        let val = cols[j][i];
    }
}

// BAD: Row-major with random access across columns
for i in 0..n {
    for j in 0..d {
        let val = data[i][j];  // Cache miss every step
    }
}
```

**Pattern 3: Pre-allocate, No .push() in Hot Loops**

```rust
// GOOD: Pre-allocated buffer
let mut result = vec![0usize; log.traces.len()];
for (i, trace) in log.traces.iter().enumerate() {
    result[i] = process_trace(trace);
}

// BAD: .push() in tight loop (allocations, resizing)
let mut result = Vec::new();
for trace in &log.traces {
    result.push(process_trace(trace));  // Allocation overhead
}
```

**Pattern 4: Avoid sqrt() Until Output Boundary**

```rust
// GOOD: Compute squared distance, compare, sqrt only for output
let squared_dist = (x1 - x2).powi(2) + (y1 - y2).powi(2);
if squared_dist < threshold_sq {
    let dist = squared_dist.sqrt();
}

// BAD: sqrt in every iteration
let dist = ((x1 - x2).powi(2) + (y1 - y2).powi(2)).sqrt();
```

### 1.4 Register in Capability Registry

Modify `wasm4pm/src/capability_registry.rs` to add your algorithm:

```rust
// Inside get_capability_registry() json! macro:
{
    "name": "discover_activity_frequencies",
    "description": "Count activity occurrences in EventLog and return ranked list",
    "category": "analytics",
    "params": [
        { 
            "name": "eventlog_handle", 
            "type": "string", 
            "description": "Handle to loaded EventLog" 
        },
        { 
            "name": "activity_key", 
            "type": "string", 
            "description": "Attribute key for activity names (e.g., 'concept:name')" 
        }
    ],
    "returns": {
        "type": "object",
        "fields": {
            "activities": "array of {activity, frequency, coverage}",
            "total_events": "number",
            "unique_activities": "number"
        }
    },
    "example": "discover_activity_frequencies(log_handle, 'concept:name')",
    "performance": {
        "time_complexity": "O(n_events)",
        "space_complexity": "O(n_activities)",
        "typical_duration": "< 5ms on 200k events"
    }
}
```

---

## 2. Define Zod Type Contracts

Zod schemas ensure type safety and LLM-readable function signatures.

### 2.1 Create Contract File

```bash
touch /Users/sac/chatmangpt/pictl/packages/contracts/src/algorithms/frequency_analysis.ts
```

### 2.2 Contract Definitions

```typescript
// packages/contracts/src/algorithms/frequency_analysis.ts
import { z } from 'zod';

/** Input: EventLog handle and activity key */
export const ActivityFrequencyInputSchema = z.object({
  eventlog_handle: z.string().describe('Handle to loaded EventLog'),
  activity_key: z.string().describe('Attribute key for activity names'),
});
export type ActivityFrequencyInput = z.infer<typeof ActivityFrequencyInputSchema>;

/** Activity frequency record */
export const ActivityFrequencyRecordSchema = z.object({
  activity: z.string(),
  frequency: z.number().int().positive(),
  coverage: z.number().min(0).max(1),
});

/** Result: Ranked activities */
export const ActivityFrequencyResultSchema = z.object({
  activities: z.array(ActivityFrequencyRecordSchema),
  total_events: z.number().int().nonnegative(),
  unique_activities: z.number().int().positive(),
});
export type ActivityFrequencyResult = z.infer<typeof ActivityFrequencyResultSchema>;

/** Activity pair (directly-follows) */
export const ActivityPairSchema = z.object({
  from: z.string(),
  to: z.string(),
  frequency: z.number().int().positive(),
});

/** Pairs result */
export const ActivityPairResultSchema = z.object({
  pairs: z.array(ActivityPairSchema),
  total_pairs: z.number().int().nonnegative(),
});
export type ActivityPairResult = z.infer<typeof ActivityPairResultSchema>;
```

### 2.3 Register in Contract Exports

Add to `packages/contracts/src/index.ts`:

```typescript
export {
  ActivityFrequencyInputSchema,
  ActivityFrequencyResultSchema,
  ActivityPairSchema,
  ActivityPairResultSchema,
  type ActivityFrequencyInput,
  type ActivityFrequencyResult,
  type ActivityPairResult,
} from './algorithms/frequency_analysis.js';
```

---

## 3. Add to ALGORITHMS.md Reference

Update `wasm4pm/ALGORITHMS.md` with your algorithm in the correct section:

```markdown
### Analytics — Activity Analysis

**Activity Frequencies**

- Type: Frequency-based counting
- Speed: Ultra-fast (< 5ms on 200k events)
- Use: Identify dominant activities, activity distribution

```typescript
log.discoverActivityFrequencies(eventlog_handle, 'concept:name');
```

**Activity Pairs**

- Type: Directly-follows pairing
- Speed: Ultra-fast (< 10ms on 200k events)
- Use: Identify common transitions, process flow patterns

```typescript
log.analyzeActivityPairs(eventlog_handle, 'concept:name');
```
```

---

## 4. Compile to WASM

### 4.1 Build WASM Target

```bash
cd /Users/sac/chatmangpt/pictl/wasm4pm

# Build for Node.js (server-side)
npm run build:nodejs

# Or build for browser
npm run build:web

# Or via Makefile (all targets)
cd /Users/sac/chatmangpt/pictl
make bench-wasm  # Builds WASM as part of full suite
```

### 4.2 Check WASM Binary Size

```bash
# Size must remain < 10 MB for browser targets
ls -lh wasm4pm/pkg/pictl*.wasm

# Example output:
# -rw-r--r--  1 sac  staff  8.2M Apr 10 23:45 pictl_bg.wasm
```

If binary size balloons, check for:
- Large lookup tables or pre-computed data (move to runtime generation)
- Redundant dependencies (use feature gates: `#[cfg(feature = "...")]`)
- Unoptimized code paths (profile with `cargo flamegraph`)

### 4.3 Verify WASM Export

```bash
# Check that your function appears in bindings
grep -A 5 "discover_activity_frequencies" wasm4pm/pkg/pictl.d.ts
```

Expected output:
```typescript
export function discover_activity_frequencies(
    eventlog_handle: string,
    activity_key: string,
): any;
```

---

## 5. Test with pictl CLI

### 5.1 Load Test Data

```bash
# Use BPI Challenge 2012 dataset (standard for testing)
cd /Users/sac/chatmangpt/pictl
make bench-data  # Downloads datasets to bench_data/

# Or create minimal test log
node -e "
const pm = require('./wasm4pm/pkg/pictl_bg.js');
const log = {
  traces: [
    {
      case_id: 'c1',
      events: [
        { attributes: { 'concept:name': 'A' } },
        { attributes: { 'concept:name': 'B' } },
      ]
    },
    {
      case_id: 'c2',
      events: [
        { attributes: { 'concept:name': 'A' } },
        { attributes: { 'concept:name': 'C' } },
      ]
    }
  ]
};
console.log(JSON.stringify(log, null, 2));
" > /tmp/test.jsonl
```

### 5.2 Run Test via CLI

```bash
# Via pictl CLI (requires wasm4pm compiled)
cd /Users/sac/chatmangpt/pictl

# Load log
LOG_HANDLE=$(node -e "
  const pm = require('./wasm4pm/pkg/pictl_bg.js');
  const log = require('/tmp/test.jsonl');
  const h = pm.load_eventlog(JSON.stringify(log));
  console.log(h);
")

# Run algorithm
node -e "
  const pm = require('./wasm4pm/pkg/pictl_bg.js');
  const result = pm.discover_activity_frequencies('$LOG_HANDLE', 'concept:name');
  console.log(JSON.stringify(JSON.parse(result), null, 2));
"
```

Expected output:
```json
{
  "activities": [
    { "activity": "A", "frequency": 2, "coverage": 0.5 },
    { "activity": "B", "frequency": 1, "coverage": 0.25 },
    { "activity": "C", "frequency": 1, "coverage": 0.25 }
  ],
  "total_events": 4,
  "unique_activities": 3
}
```

### 5.3 Test with Real Datasets

```bash
# BPI Challenge 2012 (350k events, 13k cases, 23 activities)
node scripts/test_algorithm.js \
  --log bench_data/BPI_Challenge_2012.xes \
  --algorithm discover_activity_frequencies \
  --activity-key concept:name

# Expected: completion in < 50ms with memory < 100MB
```

---

## 6. Benchmark and Profile

### 6.1 Add Criterion Benchmark

Create `wasm4pm/benches/fast_algorithms.rs` (or extend existing):

```rust
use criterion::{black_box, criterion_group, criterion_main, Criterion};
use pictl::*;

fn bench_activity_frequencies(c: &mut Criterion) {
    let mut group = c.benchmark_group("analytics");
    group.sample_size(100);
    group.significance_level(0.05);

    let eventlog = /* load BPI_Challenge_2012.xes */;

    group.bench_function("activity_frequencies_200k", |b| {
        b.iter(|| {
            discover_activity_frequencies(
                black_box(&eventlog),
                black_box("concept:name"),
            )
        })
    });

    group.finish();
}

criterion_group!(benches, bench_activity_frequencies);
criterion_main!(benches);
```

### 6.2 Run Benchmark

```bash
cd /Users/sac/chatmangpt/pictl/wasm4pm

# Single benchmark
cargo bench --release --bench fast_algorithms -- activity_frequencies_200k

# Compare against baseline
LABEL=main cargo bench --release --bench fast_algorithms -- --baseline $LABEL activity_frequencies_200k
```

### 6.3 Profile with Flamegraph

```bash
# Install flamegraph
cargo install flamegraph

# Profile
cd wasm4pm
cargo flamegraph --bin discover_activity_frequencies --release -- \
  --log ../bench_data/BPI_Challenge_2012.xes \
  --activity-key concept:name

# Analyze
open flamegraph.svg
```

---

## 7. Common Pitfalls and Solutions

### Pitfall 1: Memory Safety Violations

**Symptom:** WASM binary panics with "index out of bounds" or "allocation failure"

**Causes:**
- Unsafe indexing without bounds checks
- Unbounded allocations on untrusted input

**Solution:**
```rust
// BAD: No bounds check
let trace_len = log.traces.len();
let first_event = log.traces[trace_len].events[0];  // Out of bounds!

// GOOD: Bounds-checked
if let Some(trace) = log.traces.get(trace_len) {
    if let Some(event) = trace.events.first() {
        // Safe access
    }
}
```

### Pitfall 2: WASM Binary Size Explosion

**Symptom:** WASM > 15MB, browser download takes > 5 seconds

**Causes:**
- Large pre-computed tables (e.g., distance matrices)
- Generic code duplication across types
- Debug symbols included

**Solution:**
```toml
# wasm4pm/Cargo.toml
[profile.release]
opt-level = "z"      # Optimize for size
lto = true           # Link-time optimization
codegen-units = 1    # Better optimization at cost of build time

# In package.json:
"scripts": {
  "build:nodejs": "wasm-pack build --target nodejs --release && wasm-opt -Oz -o pkg/pictl_bg_opt.wasm pkg/pictl_bg.wasm && mv pkg/pictl_bg_opt.wasm pkg/pictl_bg.wasm"
}
```

### Pitfall 3: Performance Regression — Unintended Allocations

**Symptom:** Algorithm was fast (< 10ms) but now takes 100ms

**Causes:**
- String cloning in tight loops
- `.collect()` on large iterators
- HashMap/BTreeMap allocations per event

**Solution:**
```rust
// BAD: Cloning in loop (allocates string every iteration)
for trace in &log.traces {
    let key = trace.case_id.clone();  // Unnecessary clone!
    activity_map.insert(key, count);
}

// GOOD: Borrow-only iteration
for trace in &log.traces {
    *activity_map.entry(&trace.case_id).or_insert(0) += 1;
}

// Or pre-allocate once:
let mut activity_map = FxHashMap::with_capacity_and_hasher(
    num_unique_activities,
    Default::default(),
);
```

### Pitfall 4: Incorrect JSON Serialization

**Symptom:** TypeScript type checking fails; LLM receives unexpected JSON structure

**Causes:**
- JSON key names don't match Zod schema
- Numeric vs string serialization mismatch
- Nested object structure differs

**Solution:**
```rust
// GOOD: Explicit field names matching Zod schema
let result = json!({
    "activities": activities,  // Must match ActivityFrequencyResult.activities
    "total_events": event_count,
    "unique_activities": activity_count,
});

// Validate against schema in test:
#[test]
fn test_result_schema() {
    let result = discover_activity_frequencies(...)?;
    let parsed: ActivityFrequencyResult = serde_json::from_value(result)?;
    assert_eq!(parsed.activities.len(), 3);
}
```

---

## 8. Testing Checklist

Before submitting a new algorithm:

- [ ] **Correctness**: Algorithm produces mathematically correct results (verified against known datasets)
- [ ] **Performance**: Runs in expected time on BPI Challenge datasets (see ALGORITHMS.md)
- [ ] **Memory Safety**: No panics on malformed input (fuzz tested)
- [ ] **WASM Size**: Binary remains < 12MB
- [ ] **Type Safety**: Zod schema matches JSON output
- [ ] **Capability Registry**: Function appears in LLM discovery
- [ ] **Documentation**: ALGORITHMS.md updated with Speed/Use/Example
- [ ] **Tests Pass**: `npm test` runs without warnings
- [ ] **Benchmark Baseline**: `make bench-save-baseline LABEL=new-algorithm`
- [ ] **Code Review**: Rust code follows wasm4pm style (columnar, pre-allocated, no mutations)

---

## 9. Real Example: Porter Stem Frequency Algorithm

Here's a complete, working example of porting a simple text-frequency algorithm:

### Full Implementation

```rust
// wasm4pm/src/algorithms/text_frequency.rs
use crate::error::{codes, wasm_err};
use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;
use rustc_hash::FxHashMap;
use serde_json::json;
use wasm_bindgen::prelude::*;

/// Analyze unstructured text attributes (e.g., log messages) for frequency
#[wasm_bindgen]
pub fn analyze_text_frequency(
    eventlog_handle: &str,
    text_key: &str,
) -> Result<JsValue, JsValue> {
    let result = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut word_freq: FxHashMap<String, usize> = FxHashMap::default();
            let mut event_count = 0;

            // Extract words from text attribute
            for trace in &log.traces {
                for event in &trace.events {
                    event_count += 1;
                    if let Some(AttributeValue::String(text)) = event.attributes.get(text_key) {
                        // Simple word tokenization (split on whitespace)
                        for word in text.split_whitespace() {
                            let normalized = word.to_lowercase();
                            *word_freq.entry(normalized).or_insert(0) += 1;
                        }
                    }
                }
            }

            // Sort by frequency descending
            let mut sorted: Vec<_> = word_freq.into_iter().collect();
            sorted.sort_by(|a, b| b.1.cmp(&a.1));

            Ok((sorted, event_count))
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an EventLog")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("EventLog '{}' not found", eventlog_handle),
        )),
    })?;

    let (frequencies, event_count) = result;

    to_js(&json!({
        "words": frequencies.iter()
            .take(100)  // Top 100 most frequent
            .map(|(word, count)| {
                json!({
                    "word": word,
                    "frequency": count,
                    "relative_frequency": (*count as f64) / (event_count as f64),
                })
            })
            .collect::<Vec<_>>(),
        "unique_words": frequencies.len(),
        "total_words": event_count,
    }))
}
```

### Test

```typescript
// packages/ml/__tests__/text_frequency.test.ts
import { describe, it, expect } from 'vitest';
import pm from '../../wasm4pm/pkg/pictl_bg.js';

describe('analyze_text_frequency', () => {
  it('should count word frequencies correctly', () => {
    const log = {
      traces: [
        {
          case_id: 'c1',
          events: [
            {
              attributes: {
                'concept:name': 'A',
                'message': 'error system failure',
              },
            },
            {
              attributes: {
                'concept:name': 'B',
                'message': 'error recovery system',
              },
            },
          ],
        },
      ],
    };

    const logHandle = pm.load_eventlog(JSON.stringify(log));
    const result = pm.analyze_text_frequency(logHandle, 'message');
    const parsed = JSON.parse(result);

    expect(parsed.words).toBeDefined();
    expect(parsed.words[0].word).toBe('error');
    expect(parsed.words[0].frequency).toBe(2);
    expect(parsed.unique_words).toBe(4);  // error, system, failure, recovery
  });
});
```

---

## Summary

To port a new algorithm:

1. **Implement** in `wasm4pm/src/algorithms/{category}.rs` using columnar layout, pre-allocation, squared-distance
2. **Register** in `capability_registry.rs` with metadata (type, params, returns, performance)
3. **Contract** in `packages/contracts/src/` with Zod schema for type safety
4. **Document** in `ALGORITHMS.md` with use cases and performance metrics
5. **Compile** with `cargo make wasm-build` or `npm run build:nodejs`
6. **Test** on real datasets (BPI Challenge) and verify speed/memory expectations
7. **Benchmark** with Criterion and save baseline for future comparisons
8. **Profile** with flamegraph if performance regresses

**Key principle**: High-performance process mining in WASM requires thinking in columnar layouts, pre-allocated buffers, and arithmetic-only computations. The algorithms you port become the foundation of real-time process intelligence for thousands of enterprise users.

---

**References:**
- [pictl ALGORITHMS.md](../../../wasm4pm/ALGORITHMS.md)
- [Capability Registry](../../../wasm4pm/src/capability_registry.rs)
- [Zod Contracts](../../../packages/contracts/src/)
- [Benchmark Suite](../../../Makefile)
