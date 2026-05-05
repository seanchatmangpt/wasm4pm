# pictl Rust/WASM Development

**Cargo workspace, wasm-bindgen patterns, deployment profiles.**

## Cargo Workspace Structure

```
pictl/                          # Workspace root
├── Cargo.toml                  # members = ["wasm4pm", "tps-metrics"]
├── wasm4pm/                    # WASM crate (source: wasm4pm/src/)
│   ├── Cargo.toml              # crate name: "pictl"
│   ├── package.json            # npm package: "@wasm4pm/cli"
│   └── src/                    # 114 modules
├── tps-metrics/               # Metrics crate
└── target/                    # Build artifacts (auto-generated)
```

**Key naming:**
- Crate name: `wpm` (wasm4pm)
- npm package: `@wasm4pm/cli`
- Source directory: `wasm4pm/` (historical, not renamed)
- Binary artifact: `liblinucb.rlib` (in workspace root, gitignored)

## Build Commands

```bash
# Always use cargo make, never direct cargo
cd wasm4pm
cargo make check                # Fast type check
cargo make build                # Build WASM library (release)
cargo make build:nodejs         # Node.js target
cargo make build:all            # All targets (bundler, nodejs, web)
cargo make test                 # Run all tests (vitest + cargo)
cargo make build:mcp            # Compile MCP server
cargo make start:mcp            # Build + run MCP server
```

**Never use direct `cargo build` or `cargo test` — always use `cargo make`.**

## wasm-bindgen Patterns

### Exporting to JavaScript
```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn discover_dfg(log_handle: &str, activity_key: &str) -> Result<String, JsValue> {
    let result = discovery::dfg(log_handle, activity_key)?;
    Ok(serde_json::to_string(&result).map_err(|e| JsValue::from_str(&e.to_string()))?)
}

#[wasm_bindgen(constructor)]
pub fn MyStruct::new(config: &str) -> Result<MyStruct, JsValue> { ... }

#[wasm_bindgen(static_method_of = MyStruct)]
pub fn from_json(json: &str) -> Result<MyStruct, JsValue> { ... }
```

### Interop Rules
- Use `String` instead of `&str` in exported function parameters (WASM boundary)
- Use `JsValue` for error returns (never panic across WASM boundary)
- Use `serde_wasm_bindgen` for complex type serialization (NOT `json!()` — see known bug in memory)
- Avoid `RefCell` in exported APIs (use `Rc<RefCell>` with explicit getter/setter)

### Known Serialization Bug
**`serde_wasm_bindgen::to_value(&json!({...}))` returns empty object `{}`.**

Use `serde_json::to_string()` + `JsValue::from_str()` instead. Affected files:
- `ilp_discovery.rs` (lines 336, 450)
- `final_analytics.rs` (6 occurrences)

## Deployment Profiles

| Profile | Size | Features | Use Case |
|---------|------|----------|----------|
| `mobile` | ~500KB | Minimal, hand-rolled stats | Mobile devices |
| `iot` | ~1MB | No GPU, basic discovery | IoT devices |
| `edge` | ~1.5MB | CDN workers, streaming basic | Edge computing |
| `fog` | ~2MB | IoT gateways, ML algorithms | Fog nodes |
| `browser` | ~2.78MB | Full features (default) | Web browsers, servers |

```bash
npm run build:mobile    # ~500KB
npm run build:iot       # ~1MB
npm run build:edge      # ~1.5MB
npm run build:fog       # ~2MB
npm run build:browser   # ~2.78MB (default, all features)
```

## Feature Flags (13 total)

| Flag | Purpose |
|------|---------|
| `feature-conformance-basic` | Token replay fitness |
| `feature-conformance-full` | Alignments |
| `feature-discovery-advanced` | Genetic, ILP, ACO, PSO |
| `feature-ml` | ML algorithms (classify, cluster, etc.) |
| `feature-ocel` | Object-centric event logs |
| `feature-powl` | Partial-order workflows |
| `feature-streaming-basic` | Basic streaming DFG |
| `feature-streaming-full` | Full streaming with SIMD |
| `feature-gpu` | GPU-accelerated LinUCB (NOT for wasm32) |
| `feature-hand-rolled-stats` | Size-constrained statistics |
| `feature-statrs` | Full-precision statistics |
| `feature-rayon` | Parallel processing |

## Conditional Compilation

```rust
#[cfg(all(feature = "feature-ml", target_arch = "wasm32"))]
pub mod prediction { ... }

#[cfg(feature = "feature-gpu")]
pub mod gpu { ... }  // NOT available on wasm32
```

## Testing

### Integration Tests
- Location: `wasm4pm/tests/*.rs` (29 files, ~490 tests)
- Run: `cargo test --test <test_name>`

### Inline Tests
- Location: `wasm4pm/src/**/*.rs` (104 files, ~647 tests)
- Run: `cargo test --lib`

### Known Gotcha: SIGABRT on Exit
`cargo test --lib` exits with SIGABRT (signal 6) due to wasm-bindgen thread cleanup.
All tests pass but the process crashes on exit. Verify with:
```bash
cargo test --lib 2>&1 | grep -c "^test .* ok$"
```

### Visibility for Tests
`pub(crate)` is NOT enough for integration test access — items must be `pub`.
Cargo auto-discovers `tests/*.rs` but NOT `tests/subdir/*.rs`.

## Performance Characteristics

- **Linear scalability**: R² > 0.995 for event count vs time
- **Sub-second processing**: Logs up to 100K events
- **SIMD optimization**: Streaming algorithms (feature-streaming-full)
- **LRU cache**: Parsed logs (FNV-1a hash), bounded memory

## Versioning: CalVer

**Format:** `vYEAR.MONTH.DAY` — PATCH is the day of month (1-31).
- `v26.4.10` = April 10, 2026
- Multiple releases same day: `v26.4.10a`, `v26.4.10b` (letter suffixes)
- Never use PATCH > 31

**Known inconsistency:** Four different version numbers exist across the project:
- `apps/wasm4pm/package.json`: `26.4.10`
- `wasm4pm/Cargo.toml`: `26.4.10`
- `wasm4pm/package.json`: `26.4.6`
- `apps/wasm4pm/src/cli.ts` (hardcoded): `26.4.7`
