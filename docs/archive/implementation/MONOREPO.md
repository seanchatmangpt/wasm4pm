# WASM4PM Monorepo Structure

This document describes the pnpm monorepo structure for **wasm4pm v26.4.5**.

## Overview

wasm4pm is a high-performance process mining monorepo with WebAssembly acceleration. It uses pnpm workspaces to manage multiple interdependent packages organized into logical groups.

## Directory Structure

```
wasm4pm/                                    # Repository root
├── apps/                                   # Standalone applications
│   └── pmctl/                             # Command-line interface
│       └── package.json                   # CLI application (public bin: pmctl)
├── packages/                              # Shared libraries and utilities
│   ├── wasm4pm/                           # WASM core library (algorithm implementations)
│   ├── engine/                            # Process mining engine and orchestration
│   ├── planner/                           # Planning and optimization
│   ├── config/                            # Configuration management
│   ├── contracts/                         # Type definitions and interfaces
│   ├── kernel/                            # Core runtime utilities
│   ├── connectors/                        # Data connectors and integrations
│   ├── sinks/                             # Output sinks and exporters
│   ├── observability/                     # Logging, tracing, monitoring
│   ├── ocel/                              # Object-Centric Event Log support
│   ├── testing/                           # Testing utilities and fixtures
│   └── templates/                         # Process templates and patterns
├── wasm4pm/                               # Legacy WASM package (will migrate)
├── package.json                           # Root workspace manifest (v26.4.5)
├── pnpm-workspace.yaml                    # Workspace configuration
├── .npmrc                                 # NPM registry and pnpm settings
└── MONOREPO.md                            # This file
```

## Package Descriptions

### Core Packages

**@wasm4pm/contracts** (Foundation)
- Shared TypeScript type definitions and interfaces
- Zero dependencies - used by all other packages
- Defines: Event, Trace, Trace, PetriNet, DFG, algorithm parameters

**@wasm4pm/kernel** (Foundation)
- Core runtime utilities and helpers
- Depends: @wasm4pm/contracts
- Provides: memory management, string interning, bitsets, data structures

**@wasm4pm/wasm4pm** (Core Algorithm Library)
- WebAssembly module with compiled Rust algorithms
- Depends: @wasm4pm/contracts
- Exports: discover_dfg, discover_alpha, discover_heuristic, discover_inductive, genetic algorithm, ILP optimization, A*, ACO, simulated annealing, conformance checking

### Services

**@wasm4pm/engine** (Orchestration)
- Process mining engine: coordinates algorithm execution
- Depends: @wasm4pm/wasm4pm, @wasm4pm/kernel, @wasm4pm/contracts
- Provides: algorithm selection, pipeline execution, result caching

**@wasm4pm/planner** (Optimization)
- Planning and parameter optimization
- Depends: @wasm4pm/engine, @wasm4pm/contracts
- Provides: complexity estimation, resource allocation, parameter tuning

**@wasm4pm/config** (Configuration)
- Configuration management and defaults
- Depends: @wasm4pm/contracts
- Provides: algorithm defaults, performance profiles, environment setup

### Integration Packages

**@wasm4pm/connectors** (I/O)
- Data connectors: CSV, JSON, XES, database connections
- Depends: @wasm4pm/engine, @wasm4pm/contracts
- Provides: event log loading, source abstraction

**@wasm4pm/sinks** (Output)
- Output exporters: Mermaid diagrams, PNML, JSON, HTML reports
- Depends: @wasm4pm/engine, @wasm4pm/contracts
- Provides: visualization generation, multi-format export

**@wasm4pm/ocel** (Object-Centric)
- Object-Centric Event Log support
- Depends: @wasm4pm/engine, @wasm4pm/contracts
- Provides: OCEL parsing, object-centric analytics

**@wasm4pm/observability** (Monitoring)
- Logging, tracing, metrics collection
- Depends: @wasm4pm/contracts
- Provides: structured logging, distributed tracing hooks, performance metrics

### Support Packages

**@wasm4pm/testing** (Quality)
- Testing utilities, fixtures, mock data generators
- Depends: @wasm4pm/engine, @wasm4pm/contracts
- Provides: test helpers, sample event logs, assertion libraries

**@wasm4pm/templates** (Patterns)
- Process templates and reference patterns
- Depends: @wasm4pm/engine, @wasm4pm/contracts
- Provides: industry templates, benchmark examples

### Applications

**@wasm4pm/pmctl** (CLI)
- Command-line interface for process mining operations
- Depends: @wasm4pm/engine, @wasm4pm/connectors, @wasm4pm/sinks, @wasm4pm/config
- Provides: pmctl command-line tool (binary)

## Dependency Graph

```
Contracts (Foundation)
    ↓
Kernel ← Observability
    ↓
WASM4PM (Algorithms)
    ↓
Engine
    ↓
├── Planner
├── Config
├── Connectors
├── Sinks
├── OCEL
└── Templates
    ↓
Testing (supports all)
    ↓
pmctl (CLI application)
```

## Workspace Commands

### Setup

```bash
# Install dependencies for all packages
pnpm install

# Clean all packages and node_modules
pnpm run clean
```

### Development

```bash
# Build all packages in parallel
pnpm run build

# Run tests across all packages
pnpm run test

# Run linter across all packages
pnpm run lint

# Format code with prettier
pnpm format
```

### Focused Commands

```bash
# Build specific package
pnpm --filter @wasm4pm/engine build

# Test specific package
pnpm --filter @wasm4pm/engine test

# Run multiple packages
pnpm --filter "@wasm4pm/{engine,kernel}" build
```

### Release

```bash
# Full release pipeline: build + test + lint
pnpm run release

# Then publish (when ready)
npm publish --workspaces
```

### WASM-Specific

```bash
# Build WASM library (special Rust compilation)
pnpm run build:wasm

# Build engine (depends on WASM)
pnpm run build:engine

# Build CLI (depends on engine + connectors + sinks)
pnpm run build:cli

# Develop: engine + CLI
pnpm run dev
```

## Package Publishing

Each package is independently publishable to npm under the `@wasm4pm` scope:

```bash
npm publish --workspace @wasm4pm/engine
npm publish --workspace @wasm4pm/contracts
npm publish --workspace @wasm4pm/pmctl
```

Or publish all at once:

```bash
npm publish --workspaces
```

Current version: **26.4.5**

## Version Management

All packages share the same version (26.4.5) via pnpm monorepo convention. When bumping version:

1. Update root `package.json` version
2. Commit with message: `chore: bump version to X.Y.Z`
3. Create git tag: `git tag vX.Y.Z`
4. Publish: `npm publish --workspaces`

## Inter-Package Dependencies

Packages use workspace protocol (`workspace:*`) to reference other local packages:

```json
{
  "dependencies": {
    "@wasm4pm/engine": "workspace:*",
    "@wasm4pm/contracts": "workspace:*"
  }
}
```

When published to npm, these automatically resolve to the published version.

## Development Guidelines

### Adding a New Package

1. Create directory: `packages/mypackage/` or `apps/myapp/`
2. Create `package.json` with name `@wasm4pm/mypackage`
3. Add dependencies using `workspace:*` protocol
4. Declare in `pnpm-workspace.yaml` (auto-detected from structure)
5. Run `pnpm install`

### Modifying Dependencies

```bash
# Add to specific package
pnpm add --filter @wasm4pm/engine lodash

# Add dev dependency
pnpm add --filter @wasm4pm/engine --save-dev vitest

# Add workspace dependency
pnpm add --filter @wasm4pm/engine @wasm4pm/contracts
```

### Testing Inter-Package Changes

```bash
# Build changed packages only
pnpm build --filter "...[origin/main]"

# Run tests for changed packages and dependents
pnpm test --filter "...[origin/main]"
```

## Configuration Files

### pnpm-workspace.yaml
Defines workspace packages:
```yaml
packages:
  - 'wasm4pm'           # Legacy WASM package
  - 'apps/*'            # All applications
  - 'packages/*'        # All library packages
```

### .npmrc
```
shamefully-hoist=false       # Strict monorepo boundaries
strict-peer-dependencies=false
use-lockfile=true
registry=https://registry.npmjs.org/
access=public
node-linker=hoisted
```

### Root package.json
- Defines root scripts: build, test, lint, clean, release
- Lists root devDependencies: TypeScript, Prettier
- Specifies Node >=18.0.0 and pnpm >=8.0.0
- packageManager: pnpm@9.15.0 (enforces pnpm version)

## Common Tasks

### I want to work on the engine...

```bash
pnpm --filter @wasm4pm/engine run build    # Build just engine
pnpm --filter @wasm4pm/engine run test     # Test just engine
```

### I want to add a new feature to the CLI...

```bash
pnpm --filter @wasm4pm/pmctl run build     # Build CLI and deps
# Edit src/... in apps/pmctl/
pnpm --filter @wasm4pm/pmctl run test      # Test CLI
```

### I want to run the full test suite...

```bash
pnpm run test  # Runs test script in every package
```

### I want to publish a new version...

```bash
# 1. Update root package.json version field
# 2. Build and test
pnpm run release

# 3. Commit and tag
git add package.json pnpm-lock.yaml
git commit -m "chore: bump version to 26.4.6"
git tag v26.4.6

# 4. Publish
npm publish --workspaces
```

## Troubleshooting

### Packages not installing?

```bash
# Clean and reinstall
pnpm run clean
rm pnpm-lock.yaml
pnpm install
```

### Workspace dependencies not resolving?

```bash
# Verify workspace includes your package
pnpm ls

# Check package.json has correct workspace: protocol
cat packages/mypackage/package.json | grep workspace
```

### Version mismatch errors?

```bash
# List all package versions
pnpm ls --depth=0

# All packages should be 26.4.5
```

## Migration Notes

**Legacy wasm4pm package** (`/wasm4pm`) is being migrated into the monorepo structure:
- Current location: `/wasm4pm/` (root-level Cargo/npm package)
- Target location: Unified under monorepo with contracts, engine, etc.
- Timeline: Gradual migration, current WASM library remains functional

**Old packages** (cli, types) have been removed:
- `cli` → migrated to `apps/pmctl`
- `types` → migrated to `packages/contracts`

## Resources

- **Root CLAUDE.md** - Project guidelines and constraints
- **docs/QUICKSTART.md** - 5-minute setup
- **docs/API.md** - Complete API reference
- **docs/DEPLOYMENT.md** - Build and deployment
- **README.md** - Project overview

---

**Last Updated:** 2026-04-04
**Version:** 26.4.5
**Structure:** pnpm monorepo with 12 packages + 1 application
