# wasm4pm Rust/WASM Development

**Cargo workspace, wasm-bindgen patterns, deployment profiles.**

## Cargo Workspace Structure

```
wasm4pm/                          # Workspace root
├── Cargo.toml                  # members = ["wasm4pm", "tps-metrics", "crates/wasm4pm-types",
│                               #            "crates/wasm4pm-algos", "crates/wasm4pm-cli",
│                               #            "crates/wasm4pm-utils", "crates/miniml-core",
│                               #            "crates/wasm4pm-cognition", "crates/prolog8"]
├── wasm4pm/                    # WASM crate (source: wasm4pm/src/)
│   ├── Cargo.toml              # crate name: "wasm4pm" (verified: wasm4pm/Cargo.toml line 1)
│   ├── package.json            # npm package: "wasm4pm" (root npm package; CLI app is "@wasm4pm/cli" in apps/wasm4pm/)
│   └── src/                    # 100+ modules
├── tps-metrics/               # Metrics crate
├── crates/                    # Additional workspace crates (cognition, types, algos, cli, utils, miniml-core, prolog8)
└── target/                    # Build artifacts (auto-generated)
```

**Key naming:**
- Cargo crate name: `wasm4pm` (per `wasm4pm/Cargo.toml`). Earlier text in this doc claimed `wpm` — that is the **CLI binary alias** / brand name, not the crate name.
- npm package: `wasm4pm` (root) and `@wasm4pm/cli` (CLI app at `apps/wasm4pm/`)
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

**Known inconsistency (audit 2026-05-08):** version strings still drift across the project. Snapshot:
- `Cargo.toml` (workspace): `26.4.28`
- `apps/wasm4pm/package.json`: `26.4.23`
- `wasm4pm/package.json`: `26.4.23`
- `apps/wasm4pm/src/cli.ts` (hardcoded): `26.4.17`
- `wasm4pm/Cargo.toml`: inherits via `version.workspace = true` (so `26.4.28`)

The cli.ts hardcoded value lags the package versions — confirm before publishing.
