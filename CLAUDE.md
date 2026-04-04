# CLAUDE.md - Project Guidelines for Claude Code

Configuration file for Claude Code agents working on the wasm4pm project.

## Project Overview

**wasm4pm** - High-performance process mining algorithms compiled to WebAssembly for JavaScript/TypeScript environments.

- **Status**: Production-Ready (v0.5.4)
- **Primary Language**: Rust (WASM) + TypeScript
- **Location**: `/Users/sac/wasm4pm/`
- **Repository**: https://github.com/seanchatmangpt/wasm4pm

## Project Structure

```
wasm4pm/                          # Cargo workspace root
├── Cargo.toml                    # Workspace manifest (members: ["wasm4pm"])
├── docs/                         # Documentation
└── wasm4pm/                      # Package — run npm/cargo commands from here
    ├── src/
    │   ├── lib.rs                # WASM module entry
    │   ├── models.rs             # Core data structures
    │   ├── state.rs              # Global state management
    │   ├── discovery.rs          # Basic discovery algorithms
    │   ├── advanced_algorithms.rs# Heuristic, Inductive, etc.
    │   ├── algorithms.rs         # Algorithm utilities
    │   ├── analysis.rs           # Analysis functions
    │   ├── conformance.rs        # Conformance checking
    │   ├── ilp_discovery.rs      # ILP Optimization
    │   ├── genetic_discovery.rs  # Genetic Algorithm
    │   ├── fast_discovery.rs     # A*, Hill Climbing, etc.
    │   ├── more_discovery.rs     # ACO, Simulated Annealing
    │   ├── final_analytics.rs    # Analytics functions
    │   ├── io.rs                 # I/O utilities
    │   ├── types.rs              # Type definitions
    │   ├── utilities.rs          # Shared utilities
    │   ├── xes_format.rs         # XES format parsing
    │   ├── api.ts                # API surface types
    │   ├── client.ts             # TypeScript bindings
    │   ├── visualizations.ts     # Visualization generation
    │   └── mcp_server.ts         # MCP integration
    ├── Cargo.toml                # Rust manifest
    ├── package.json              # npm manifest
    ├── wasm-pack.toml            # WASM build config
    ├── benchmarks/               # Performance tests
    ├── __tests__/                # Test suite
    └── examples/                 # Usage examples
```

## Build Commands

### WASM Compilation

> Run these from the `wasm4pm/` subdirectory (the package, not the workspace root).

```bash
# Default build (bundler target — for npm publishing)
npm run build

# Node.js target
npm run build:nodejs

# Web/browser target
npm run build:web

# All targets
npm run build:all

# Build MCP server TypeScript
npm run build:mcp
```

### Cargo Commands
```bash
# Check compilation
cargo check

# Build library
cargo build --release

# Run tests
cargo test

# View documentation
cargo doc --open
```

## Testing

```bash
# All tests (unit + integration)
npm test

# Unit tests only
npm run test:unit

# Unit tests in watch mode
npm run test:unit:watch

# Integration tests only
npm run test:integration

# Browser tests
npm run test:browser
```

## Key Technologies

- **Rust 1.70+** - Core algorithms
- **wasm-bindgen 0.2.92** - Rust ↔ JavaScript bridge
- **TypeScript 5.3+** - Client bindings
- **Vitest 1.1+** - Testing framework
- **wasm-pack 1.3+** - Build tool
- **MCP SDK 0.1.0** - Claude integration

## Important Files

### Configuration
- `Cargo.toml` - Rust dependencies and metadata
- `package.json` - npm dependencies and scripts
- `wasm-pack.toml` - WASM build configuration
- `tsconfig.json` - TypeScript configuration
- `vitest.config.ts` - Test configuration

### Core Algorithms (Read Before Modifying)
- `src/discovery.rs` (200 lines) - DFG, basic algorithms
- `src/advanced_algorithms.rs` (350 lines) - Heuristic, Inductive, Bottleneck detection
- `src/ilp_discovery.rs` (280 lines) - ILP Optimization
- `src/genetic_discovery.rs` (350 lines) - Genetic Algorithm, PSO
- `src/fast_discovery.rs` (500 lines) - A*, Hill Climbing, Variants, Patterns, Drift, Clustering
- `src/more_discovery.rs` (400 lines) - ACO, Simulated Annealing, Process Skeleton, Dependencies

### Data Structures
- `src/models.rs` (280 lines) - EventLog, Trace, Event, PetriNet, DFG, etc.
- `src/state.rs` (130 lines) - Global AppState for handle-based architecture

### Client & Integration
- `src/client.ts` (500+ lines) - Complete TypeScript client library
- `src/mcp_server.ts` - MCP integration for Claude
- `src/visualizations.ts` (380 lines) - Mermaid, D3, HTML report generation

### Documentation (in `docs/` folder)
- `README.md` - Project overview (at root)
- `docs/QUICKSTART.md` - 5-minute setup
- `docs/TUTORIAL.md` - Real-world examples
- `docs/DEPLOYMENT.md` - Build & publish
- `docs/FAQ.md` - Common questions
- `docs/MCP.md` - Claude integration
- `docs/API.md` - Complete API reference
- `docs/ALGORITHMS.md` - Algorithm descriptions
- `docs/THESIS.md` - Academic paper & benchmarks

## Development Guidelines

### Code Style
- **Rust**: Follow Rust conventions, run `cargo fmt` before committing
- **TypeScript**: Follow prettier config, run `npm run format` before committing
- **Comments**: Add comments for non-obvious logic, especially in algorithm implementations

### Testing Requirements
- Add tests for new functions
- Run full test suite before committing: `npm test`
- Check coverage: `npm run test:coverage`
- Benchmark performance-sensitive changes: `npm run bench`

### Documentation Requirements
- Update relevant .md files when changing features
- Add JSDoc comments to TypeScript functions
- Add doc comments to Rust public functions
- Include examples in documentation

### Git Practices
- Create feature branches: `git checkout -b feature/your-feature`
- Write clear commit messages with context
- Test locally before pushing
- Reference relevant documentation in commits

## Common Tasks

### Adding a New Algorithm
1. **Implement** in appropriate `src/*_discovery.rs` file
2. **Export** in `src/lib.rs` with `#[wasm_bindgen]`
3. **Test** with unit tests in `__tests__/`
4. **Benchmark** in `benchmarks/benchmark.rs`
5. **Document** in `ALGORITHMS.md` and `API.md`
6. **Example** in `examples/` directory

### Fixing a Bug
1. **Locate** the bug in relevant source file
2. **Write** a test that reproduces it
3. **Fix** the implementation
4. **Verify** all tests pass: `npm test`
5. **Benchmark** if performance-critical: `npm run bench`
6. **Commit** with clear message explaining the fix

### Updating Documentation
1. **Identify** what changed (algorithm, API, feature)
2. **Update** relevant .md files (README, API, ALGORITHMS, etc.)
3. **Verify** links work and examples are accurate
4. **Commit** with message: "Docs: Update [section]"

### Building for Release
```bash
# 1. Update version in Cargo.toml and package.json
# 2. Run all tests and checks
npm test && npm run lint

# 3. Build release
npm run build:release

# 4. Generate documentation
npm run docs

# 5. Create git tag
git tag -a v0.6.0 -m "Release v0.6.0"

# 6. Publish to npm
npm publish
```

## Performance Considerations

### Algorithm Selection
- **DFG** (0.5ms/100 events) - Use for quick overviews, minimal memory
- **Process Skeleton** (0.3ms/100 events) - Fastest algorithm
- **Alpha++** (5ms/100 events) - Balanced accuracy/speed
- **Genetic Algorithm** (40ms/100 events) - Best quality for complex processes
- **ILP Optimization** (20ms/100 events) - Optimal models (use with timeouts)

### Memory Management
- Use `pm.freeHandle(handle)` to explicitly free memory when done
- Large logs (100k+ events) should be chunked
- WASM memory is single-threaded - process in workers for concurrency

### Optimization Tips
- Filter logs before processing: `filterLogByDateRange()`, `filterByActivity()`
- Cache results when running multiple operations on same log
- Use Web Workers (browser) or Worker Threads (Node.js) for parallelism
- Reduce algorithm parameters (generations, population size) for speed

## Critical Dependencies

### Must Keep
- `wasm-bindgen` - Rust ↔ JavaScript bridge
- `serde/serde_json` - Serialization (used extensively)
- `chrono` - Timestamp handling (event logs)
- `itertools` - Collection utilities
- `indexmap` - Ordered hash maps (algorithm tracking)

### Can Remove (If Unused)
- Check imports before removing any crate
- Run `cargo tree` to see dependency graph

## Version Compatibility

- **Node.js**: 16+ (18+ recommended)
- **Browsers**: Chrome 57+, Firefox 52+, Safari 11+, Edge 79+
- **Rust**: 1.70+ (for WASM support)
- **TypeScript**: 5.3+

## Debugging

### Enable Logging
```rust
// In Rust code
eprintln!("Debug message: {:?}", value);

// In TypeScript
console.log("Debug:", value);
```

### Check WASM Memory
```javascript
if (performance.memory) {
  console.log('Used JS heap:', performance.memory.usedJSHeapSize);
}
```

### Profile Performance
```javascript
const start = performance.now();
// ... operation ...
console.log('Time:', performance.now() - start, 'ms');
```

### Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| "WASM module not initialized" | Call `await pm.init()` first |
| "Module not found" | Run `npm install` in wasm4pm directory |
| Build fails with Rust errors | Update Rust: `rustup update` |
| Tests timeout | Increase timeout in vitest.config.ts |
| Large memory usage | Use streaming/chunking, free handles explicitly |
| Slow algorithm | Reduce complexity (generations, population size) |

## MCP Integration

### Testing MCP Tools
```bash
npm run start:mcp
# Then test with Claude or mcp-inspector
```

### Adding New MCP Tools
1. **Define** tool in `getAvailableTools()` in `src/mcp_server.ts`
2. **Implement** handler in `executeTool()` method
3. **Test** with MCP inspector or Claude
4. **Document** in `MCP.md`

## Permissions & Constraints

### Authorized Actions
- ✅ Modify source files in `src/`
- ✅ Add tests in `__tests__/`
- ✅ Update documentation in `.md` files
- ✅ Modify `Cargo.toml`, `package.json` for dependencies
- ✅ Create feature branches and commit
- ✅ Push to `main` branch

### Requires Confirmation
- ⚠️ Removing files or directories (verify unused first)
- ⚠️ Changing public API signatures (breaking changes)
- ⚠️ Major refactoring (coordinate with team)
- ⚠️ Publishing to npm (requires version bump and tests)

### Prohibited Actions
- ❌ Force push to main/master
- ❌ Delete branches without permission
- ❌ Commit to main/master directly
- ❌ Disable security checks (--no-verify)
- ❌ Modify CI/CD without documentation

## Useful Commands Quick Reference

```bash
# Run from wasm4pm/ subdirectory

# Setup
npm install                    # Install dependencies
npm run build:all              # Build for all targets

# Development
npm run build                  # Build bundler target
npm run test:unit:watch        # Run unit tests on file changes
npm run format                 # Auto-format code

# Testing
npm test                       # Run all tests (unit + integration)
npm run test:unit              # Unit tests only
npm run test:integration       # Integration tests only

# Lint / type-check
npm run lint                   # format:check + type:check

# Documentation
npm run docs                   # Generate TypeScript docs

# MCP (Claude Integration)
npm run start:mcp              # Build + start MCP server

# Release
npm run build:all && npm run lint && npm test   # Pre-publish checks
npm publish                    # Publish to npm
```

## Important Notes

### Handle-Based Architecture
- All large objects (EventLog, PetriNet, DFG) are stored in Rust memory
- JavaScript receives opaque string handles to refer to them
- This enables efficient memory management and object lifetime control

### Single-Threaded WASM
- WASM runs in single thread
- Algorithms cannot use rayon parallelism in browser
- Use Web Workers for concurrent processing

### XES Format Support
- Supports XES 1.0 and 2.0 standard
- Includes traces, events, attributes, timestamps
- Not all custom extensions are supported

### Semantic Versioning
- **MAJOR** (0.x.0): Breaking changes
- **MINOR** (0.x.0): New features (backward compatible)
- **PATCH** (x.x.0): Bug fixes

## Getting Help

1. **Check Documentation**: README.md, [docs/QUICKSTART.md](./docs/QUICKSTART.md), [docs/FAQ.md](./docs/FAQ.md)
2. **Run Tests**: `npm test` to verify environment
3. **Check Examples**: See `examples/` directory
4. **Read API**: See [docs/API.md](./docs/API.md) for function signatures
5. **Review Source**: Algorithm implementations in `src/`

## Related Documents

- **[README.md](./README.md)** - Project overview and features
- **[docs/QUICKSTART.md](./docs/QUICKSTART.md)** - 5-minute setup guide
- **[docs/TUTORIAL.md](./docs/TUTORIAL.md)** - Real-world examples
- **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** - Build, test, publish guide
- **[docs/FAQ.md](./docs/FAQ.md)** - Troubleshooting and common questions
- **[docs/MCP.md](./docs/MCP.md)** - Claude integration guide
- **[docs/API.md](./docs/API.md)** - Complete API reference
- **[docs/ALGORITHMS.md](./docs/ALGORITHMS.md)** - Algorithm descriptions
- **[docs/PROJECT_STATUS.md](./docs/PROJECT_STATUS.md)** - Current project status

## Project Status

✅ **Production Ready** - All features implemented, tested, documented, and deployed
✅ **Well Documented** - 5000+ lines across 9 comprehensive guides
✅ **Fully Tested** - 130+ tests with high coverage
✅ **Performant** - Linear scalability, optimized WASM binary
✅ **Integrated** - Works with React, Vue, Express, Node.js, browsers, and Claude

---

**Last Updated**: April 2026
**Version**: 0.5.4
**Status**: Production Ready

