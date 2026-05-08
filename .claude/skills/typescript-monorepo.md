---
name: TypeScript Monorepo Patterns
description: pnpm workspaces, Vitest, consola logging, package.json organization
paths: ["packages/**/*.ts", "apps/**/*.ts"]
type: skill
---

# Skill: TypeScript Monorepo Patterns

## Purpose

Navigate and develop in the wasm4pm TypeScript monorepo using pnpm workspaces, Vitest testing, and structured logging.

## Workspace Structure

```
packages/
  ├── core/            # @wasm4pm/core — shared types, algorithms
  ├── ocel/            # @wasm4pm/ocel — OCEL object-centric event logs
  ├── process-mining/  # @wasm4pm/process-mining — pm4py integration
  ├── mcp-client/      # @wasm4pm/mcp-client — MCP protocol client
  └── cli/             # @wasm4pm/cli — command-line interface

apps/
  ├── studio/          # Tauri desktop app
  └── web/             # Web UI
```

## pnpm Workspace Rules

### Installing Dependencies

```bash
# Add to root workspace
pnpm add -w axios

# Add to specific package
pnpm add -D @types/node -F @wasm4pm/core

# Install all workspace dependencies
pnpm install
```

### Building

```bash
# Build all packages
pnpm build

# Build specific package
pnpm -F @wasm4pm/core build

# Watch mode
pnpm --recursive run watch
```

### Testing

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm -F @wasm4pm/process-mining test

# Watch mode
pnpm test -- --watch
```

## Package Configuration (package.json)

Every package must declare:

```json
{
  "name": "@wasm4pm/package-name",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./dist/index.js",
    "./types": "./dist/index.d.ts"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest",
    "lint": "eslint src/"
  }
}
```

## Vitest Pattern (Chicago TDD)

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ProcessMiner } from '@wasm4pm/process-mining';

describe('ProcessMiner', () => {
  let miner: ProcessMiner;
  
  beforeEach(() => {
    miner = new ProcessMiner();
  });

  it('discovers process from OCEL event log', async () => {
    // AAA: Arrange (real OCEL, real event log)
    const ocelLog = await loadOcelFromFile('test-data/ocel.json');
    
    // Act (real process mining algorithm)
    const discoveredModel = await miner.discover(ocelLog, 'inductive');
    
    // Assert (observable state: model exists, metrics computed)
    expect(discoveredModel.activities.length).toBeGreaterThan(0);
    expect(discoveredModel.fitness).toBeGreaterThanOrEqual(0.8);
  });
});
```

## Logging with consola

```typescript
import { consola } from 'consola';

// Info
consola.info('Loading OCEL', { path: 'log.json' });

// Warning
consola.warn('Degraded conformance fitness', { fitness: 0.75 });

// Error
consola.error('Failed to parse OCEL', { error: e.message });

// Verbose (dev mode)
consola.debug('Event log statistics', { events: 4500, objects: 120 });
```

## Shared Type Definitions

All types defined in `packages/core/src/types/`:

```typescript
// types.ts
export interface OcelEvent {
  id: string;
  activity: string;
  timestamp: Date;
  objectId: string;
  objectType: 'artifact' | 'receipt' | 'proof' | 'benchmark' | 'release';
}

// Exported from @wasm4pm/core
export * from './types';
```

## Inter-Package Dependencies

Correct:
```json
{
  "dependencies": {
    "@wasm4pm/core": "workspace:*"
  }
}
```

This ensures all packages use the same version.

## Forbidden Patterns

❌ Direct imports from sibling packages without declaring dependency in package.json
❌ Circular dependencies (A → B → A)
❌ Importing from `dist/` instead of published package name
❌ Mixing CJS and ESM (use `"type": "module"` everywhere)

## Commands

```bash
# Install and link all packages
pnpm install

# Build all
pnpm build

# Test all
pnpm test

# Run specific script in all packages
pnpm --recursive run build

# Run command in one package
pnpm -F @wasm4pm/core test
```
