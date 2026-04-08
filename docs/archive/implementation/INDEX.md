# wasm4pm v26.4.5 - Monorepo Index

This is the starting point for understanding and working with the wasm4pm pnpm monorepo.

## Quick Navigation

| Document | Purpose | Read Time |
|----------|---------|-----------|
| **[MONOREPO.md](./MONOREPO.md)** | Complete monorepo structure, commands, and workflows | 20 min |
| **[SETUP.md](./SETUP.md)** | Setup verification and next steps | 10 min |
| **[README.md](./README.md)** | Project overview and features | 5 min |
| **[INDEX.md](./INDEX.md)** | This file - navigation guide | 2 min |

## Project Structure

```
wasm4pm v26.4.5 (pnpm monorepo)
├── 14 Workspace Members
│   ├── 12 Packages (packages/)
│   ├── 1 Application (apps/)
│   └── 1 Legacy Package (root)
├── All packages at v26.4.5
├── pnpm workspace configuration
└── Ready for team implementation
```

## Getting Started (5 minutes)

```bash
# 1. Navigate to repo
cd /Users/sac/wasm4pm

# 2. Install dependencies
pnpm install

# 3. List all packages
pnpm ls --depth=0

# 4. Build all
pnpm run build

# 5. Run tests
pnpm run test
```

## Team Workflows

### I'm a Package Developer

1. Pick a package from `packages/`
2. Navigate: `cd packages/your-package`
3. Implement in `src/` directory
4. Add tests in `__tests__/` directory
5. Update build/test scripts in `package.json`
6. Test locally: `pnpm --filter @wasm4pm/your-package run build`

**Example: Working on @wasm4pm/engine**
```bash
pnpm --filter @wasm4pm/engine run build
pnpm --filter @wasm4pm/engine run test
```

### I'm Building the CLI

1. Start with `apps/pmctl` (@wasm4pm/pmctl)
2. Depends on: engine, connectors, sinks, config
3. Implement CLI commands in `src/`
4. Build: `pnpm --filter @wasm4pm/pmctl run build`
5. Binary available at `apps/pmctl/dist/bin/cli.js`

### I'm Setting Up Integration

1. Review dependency graph in MONOREPO.md
2. Start with foundation packages: contracts, kernel
3. Move up to services: engine, planner
4. Add integrations: connectors, sinks, ocel
5. Test with: `pnpm run test`

### I'm Preparing for Release

1. Verify version in root `package.json`: 26.4.5
2. Run full pipeline: `pnpm run release`
3. This runs: build, test, lint across all packages
4. Tag release: `git tag v26.4.5`
5. Publish: `npm publish --workspaces`

## Key Files Explained

### Root Configuration

**package.json**
- Root workspace manifest
- Version: 26.4.5 (shared across all packages)
- Scripts: build, test, lint, clean, release
- Constraints: Node >=18.0.0, pnpm >=8.0.0

**pnpm-workspace.yaml**
- Defines workspace members:
  - `wasm4pm` (legacy, being migrated)
  - `apps/*` (applications)
  - `packages/*` (libraries)

**.npmrc**
- npm/pnpm configuration
- shamefully-hoist=false (strict boundaries)
- registry=https://registry.npmjs.org/
- access=public (packages published publicly)

### Documentation

**MONOREPO.md** (4000+ lines)
- Complete structure explanation
- All workspace commands
- Development guidelines
- Dependency graph
- Troubleshooting

**SETUP.md** (500+ lines)
- Setup verification
- Next steps for teams
- Key points for different roles
- Migration status

### Packages

Each package has:
- `package.json` - Configuration with dependencies
- `src/` - Source code directory
- `__tests__/` - Test directory
- `dist/` - Build output (created by build)

## Dependency Structure

### Foundation (No Dependencies)
- @wasm4pm/contracts - Type definitions

### Core (1 Level Up)
- @wasm4pm/kernel - Runtime utilities

### Algorithms (2 Levels Up)
- @wasm4pm/wasm4pm - WASM core

### Services (3 Levels Up)
- @wasm4pm/engine - Main orchestration
- @wasm4pm/planner - Optimization

### Integrations (4 Levels Up)
- @wasm4pm/config - Configuration
- @wasm4pm/connectors - Data I/O
- @wasm4pm/sinks - Output exporters
- @wasm4pm/ocel - Object-centric events
- @wasm4pm/templates - Process patterns

### Support
- @wasm4pm/observability - Logging/monitoring
- @wasm4pm/testing - Test utilities

### Applications
- @wasm4pm/pmctl - CLI tool

## All Packages at a Glance

| Package | Purpose | Dependencies |
|---------|---------|--------------|
| @wasm4pm/contracts | Type definitions | none |
| @wasm4pm/kernel | Runtime utilities | contracts |
| @wasm4pm/wasm4pm | WASM algorithms | contracts |
| @wasm4pm/engine | Process mining engine | wasm4pm, kernel, contracts |
| @wasm4pm/planner | Planning & optimization | engine, contracts |
| @wasm4pm/config | Configuration management | contracts |
| @wasm4pm/connectors | Data connectors | engine, contracts |
| @wasm4pm/sinks | Output exporters | engine, contracts |
| @wasm4pm/observability | Logging/monitoring | contracts |
| @wasm4pm/ocel | Object-centric events | engine, contracts |
| @wasm4pm/testing | Test utilities | engine, contracts |
| @wasm4pm/templates | Process patterns | engine, contracts |
| @wasm4pm/pmctl | CLI application | engine, connectors, sinks, config |

## Common Tasks

### Build Specific Package
```bash
pnpm --filter @wasm4pm/engine run build
```

### Test Specific Package
```bash
pnpm --filter @wasm4pm/engine run test
```

### Add Dependency to Package
```bash
pnpm add --filter @wasm4pm/engine lodash
```

### Add Workspace Dependency
```bash
pnpm add --filter @wasm4pm/engine @wasm4pm/contracts
```

### Build All in Parallel
```bash
pnpm run build
```

### Test Everything
```bash
pnpm run test
```

### Full Release Pipeline
```bash
pnpm run release
```

### Check Package Dependency Tree
```bash
pnpm ls
```

## Troubleshooting

### Packages not installing?
```bash
pnpm run clean
rm pnpm-lock.yaml
pnpm install
```

### Workspace dependencies not resolving?
```bash
# Verify workspace includes your package
pnpm ls

# Check package.json for workspace: protocol
cat packages/mypackage/package.json | grep workspace
```

### Version mismatch?
```bash
# List all package versions (should all be 26.4.5)
pnpm ls --depth=0
```

## Important Notes

**DO NOT:**
- Modify the legacy `wasm4pm/` package structure
- Force push to main/master
- Use `npm` commands (use `pnpm` instead)
- Bypass version constraints

**DO:**
- Use `workspace:*` protocol for internal dependencies
- Run `pnpm install` instead of `npm install`
- Increment version in root `package.json` when bumping
- Test locally before pushing: `pnpm run release`
- Use `pnpm --filter` for focused work

## Version Management

All packages share version 26.4.5. To bump version:

1. Update root `package.json` version field
2. Commit: `git add package.json && git commit -m "chore: bump to X.Y.Z"`
3. Tag: `git tag vX.Y.Z`
4. Publish: `npm publish --workspaces`

All 13 packages automatically update to the new version.

## Support Resources

- **npm workspaces**: https://docs.npmjs.com/cli/v8/using-npm/workspaces
- **pnpm workspaces**: https://pnpm.io/workspaces
- **Monorepo best practices**: https://monorepo.tools/

## File Locations

```
/Users/sac/wasm4pm/
├── package.json           - Root workspace config
├── pnpm-workspace.yaml    - Workspace definition
├── .npmrc                 - npm/pnpm config
├── INDEX.md               - This file
├── MONOREPO.md            - Complete guide
├── SETUP.md               - Setup verification
├── README.md              - Project overview
├── apps/pmctl/            - CLI application
├── packages/              - 12 library packages
└── wasm4pm/               - Legacy WASM package
```

---

**Status**: Scaffolding Complete - Ready for Implementation
**Version**: 26.4.5
**Last Updated**: 2026-04-04
**Workspace Members**: 14 (12 packages + 1 app + 1 legacy)
