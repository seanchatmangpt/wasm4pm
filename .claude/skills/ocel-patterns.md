---
name: OCEL Object-Centric Event Log Patterns
description: OCEL 2.0 event structure, object typing, lifecycle validation
paths: ["packages/*/src/**/*.ts", "wasm4pm/src/ocel*.rs"]
type: skill
---

# Skill: OCEL Patterns

## Purpose

Construct, validate, and consume object-centric event logs (OCEL 2.0) for process mining conformance checking and process discovery.

## OCEL 2.0 Structure

```json
{
  "ocel:version": "2.0",
  "ocel:objectTypes": [
    "artifact",
    "receipt",
    "proof-gate",
    "benchmark",
    "release"
  ],
  "ocel:events": [
    {
      "ocel:eid": "event-001",
      "ocel:activity": "breed-ontology",
      "ocel:timestamp": "2026-05-07T14:23:45Z",
      "ocel:omap": [
        {
          "ocel:oid": "artifact-a1",
          "ocel:otype": "artifact"
        }
      ],
      "ocel:vmap": {
        "ostar:state_before": "seeded",
        "ostar:state_after": "bred",
        "ostar:elapsed_ms": 2341
      }
    }
  ],
  "ocel:objects": [
    {
      "ocel:oid": "artifact-a1",
      "ocel:otype": "artifact",
      "ocel:ovmap": {
        "ostar:created_at": "2026-05-07T14:00:00Z",
        "ostar:current_hash": "blake3_hash_hex"
      }
    }
  ]
}
```

## Event Structure Requirements

Every OCEL event MUST have:

| Field | Type | Required | Example |
|-------|------|----------|---------|
| `ocel:eid` | string | Yes | `"event-001"` |
| `ocel:activity` | string | Yes | `"breed-ontology"` |
| `ocel:timestamp` | ISO-8601 | Yes | `"2026-05-07T14:23:45Z"` |
| `ocel:omap` | array | Yes | `[{oid, otype}]` |
| `ocel:vmap` | object | No | `{custom_attrs}` |

## Object Types (Canonical)

```typescript
type OcelObjectType = 
  | 'artifact'        // Seeded, bred, validated artifact
  | 'receipt'         // BLAKE3 receipt proof
  | 'proof-gate'      // Validation gate result
  | 'benchmark'       // Performance measurement
  | 'release'         // Released artifact version
```

## Lifecycle Rules by Object Type

### artifact

```
seeded → bred → validated → benchmarked → released
```

Forbidden transitions:
- ❌ `validated` → `seeded` (no rollback without explicit rework event)
- ❌ `released` before `validated`
- ❌ Two events with state_after=`bred` without intervening `validated`

### receipt

```
created → linked → verified
```

Forbidden transitions:
- ❌ `verified` without all `linked` receipts first
- ❌ `linked` chain broken (previous_hash doesn't match)

### proof-gate

```
evaluated → passed
    ↓
    failed
```

### benchmark

```
started → completed
```

Must follow a corresponding `released` event.

### release

```
released
```

Terminal state. Only one per artifact version.

## Construction Pattern (TypeScript)

```typescript
import { OcelBuilder, OcelEvent, OcelObject } from '@wasm4pm/ocel';

const builder = new OcelBuilder();

// Add artifact object
builder.addObject({
  oid: 'artifact-a1',
  otype: 'artifact',
  ovmap: {
    'ostar:created_at': new Date().toISOString(),
    'ostar:current_hash': blake3Hash(content),
  },
});

// Add event: breed
builder.addEvent({
  eid: `event-${Date.now()}-breed`,
  activity: 'breed-ontology',
  timestamp: new Date().toISOString(),
  omap: [{ oid: 'artifact-a1', otype: 'artifact' }],
  vmap: {
    'ostar:state_before': 'seeded',
    'ostar:state_after': 'bred',
    'ostar:elapsed_ms': elapsed,
  },
});

// Validate lifecycle
const validation = builder.validate();
// validation.valid: boolean
// validation.errors: string[]
```

## Validation Rules

Before emitting OCEL, validate:

1. **No orphan objects** — Every object in `ocel:omap` must be defined in `ocel:objects`
2. **Unique event IDs** — No duplicate `ocel:eid` values
3. **Chronological order** — Events ordered by timestamp (ascending)
4. **Lifecycle consistency** — States follow allowed transitions per object type
5. **Required attributes** — All events have activity, timestamp, omap

## Forbidden Patterns

❌ Event without `ocel:timestamp`
❌ Object type mismatch between `ocel:omap` and `ocel:objects`
❌ Orphan events (reference object that doesn't exist)
❌ Duplicate object IDs with different types
❌ Timestamps out of order (event N+1 before event N)

## Commands

```bash
# Validate OCEL file
pnpm -F @wasm4pm/ocel run validate log.json

# Convert OTEL traces to OCEL
wpm ocel from-otel --traces-url http://localhost:3200 --hours 24

# Discover process from OCEL
pnpm -F @wasm4pm/process-mining run discover log.json

# Check conformance
pnpm -F @wasm4pm/process-mining run conformance log.json model.bpmn
```
