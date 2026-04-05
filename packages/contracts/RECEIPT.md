# Receipt System - BLAKE3 Cryptographic Verification

## Overview

The receipt system provides cryptographic proof of execution for process mining operations. Each receipt contains BLAKE3 hashes of the configuration, input data, and execution plan, allowing verification that the execution was performed with the expected parameters and data.

## Core Types

### Receipt

```typescript
interface Receipt {
  // Identifiers
  run_id: string;              // UUID v4
  schema_version: string;      // "1.0"

  // BLAKE3 hashes (hex-encoded, 64 characters)
  config_hash: string;
  input_hash: string;
  plan_hash: string;

  // Execution timeline (ISO 8601)
  start_time: string;
  end_time: string;
  duration_ms: number;

  // Status and optional error
  status: 'success' | 'partial' | 'failed';
  error?: ErrorInfo;

  // Execution details
  summary: ExecutionSummary;
  algorithm: AlgorithmInfo;
  model: ModelInfo;
}
```

## Usage

### Building a Receipt

Use the fluent builder pattern:

```typescript
import { ReceiptBuilder } from '@wasm4pm/contracts';

const receipt = new ReceiptBuilder()
  .setRunId('custom-uuid-or-auto-generated')
  .setConfig({ algorithm: 'alpha++', threshold: 0.8 })
  .setInput(eventLog)
  .setPlan(executionPlan)
  .setTiming(
    new Date().toISOString(),
    new Date(Date.now() + 5000).toISOString()
  )
  .setStatus('success')
  .setSummary({
    traces_processed: 100,
    objects_processed: 500,
    variants_discovered: 10,
  })
  .setAlgorithm({
    name: 'alpha++',
    version: '1.0',
    parameters: { threshold: 0.8 },
  })
  .setModel({
    nodes: 42,
    edges: 156,
    artifacts: {
      petri_net: '/output/model.pnml',
      dfg: '/output/model.dfg',
    },
  })
  .build();
```

### Hashing Data

For manual hashing:

```typescript
import {
  hashConfig,
  hashData,
  verifyHash,
  normalizeForHashing,
} from '@wasm4pm/contracts';

// Hash any JSON-serializable value
const config = { algorithm: 'alpha', threshold: 0.8 };
const hash = hashConfig(config);
// hash = "abc123..." (64-char hex string)

// Verify hash correctness
const isValid = verifyHash(config, hash);

// Manual normalization (for pre-serialized data)
const normalized = normalizeForHashing(config);
// normalized = '{"algorithm":"alpha","threshold":0.8}'
```

### Validating Receipts

```typescript
import {
  validateReceipt,
  verifyReceiptHashes,
  detectTampering,
  isReceipt,
} from '@wasm4pm/contracts';

// Type guard
if (!isReceipt(obj)) {
  throw new Error('Invalid receipt');
}

// Structure validation
const structureResult = validateReceipt(receipt);
if (!structureResult.valid) {
  console.error('Validation errors:', structureResult.errors);
  console.warn('Warnings:', structureResult.warnings);
}

// Hash verification (detect tampering)
const config = /* original config */;
const input = /* original input */;
const plan = /* original plan */;

const hashResult = verifyReceiptHashes(receipt, config, input, plan);
if (!hashResult.valid) {
  console.error('Hashes do not match - possible tampering:', hashResult.errors);
}

// Quick tampering check
const isTampered = detectTampering(receipt, config, input, plan);
```

## Hash Guarantee

### Determinism

Same input always produces same hash:

```typescript
const config = { z: 1, a: 2 };
const hash1 = hashConfig(config);

const configReordered = { a: 2, z: 1 };
const hash2 = hashConfig(configReordered);

hash1 === hash2; // true - key order doesn't matter
```

### Sensitivity

Any change to input produces different hash:

```typescript
const hash1 = hashConfig({ threshold: 0.8 });
const hash2 = hashConfig({ threshold: 0.9 });

hash1 !== hash2; // true - detects even small changes
```

### BLAKE3 Format

- **Algorithm**: BLAKE3 (cryptographic hash)
- **Output**: 64 hex characters (32 bytes)
- **Normalization**: JSON with sorted keys
- **Encoding**: UTF-8 before hashing

## Schema Versioning

The receipt schema includes a `schema_version` field ("1.0") for forward compatibility.

- **Current version**: 1.0
- **Validation**: Warns on unknown versions but doesn't fail
- **Future versions**: Will allow migrating old receipts

## Test Coverage

All modules include comprehensive tests:

- **hash.test.ts**: Determinism, BLAKE3 format, sensitivity
- **receipt.test.ts**: Type guards, JSON round-trip, serialization
- **receipt-builder.test.ts**: Builder pattern, hashing, validation
- **validation.test.ts**: Structure validation, tampering detection, error messages

Run tests:

```bash
npm test
```

## Integration

### TypeScript Types

All types are exported from `@wasm4pm/contracts`:

```typescript
import type {
  Receipt,
  ErrorInfo,
  ExecutionSummary,
  AlgorithmInfo,
  ModelInfo,
  ValidationResult,
} from '@wasm4pm/contracts';
```

### Specific Exports

Import only what you need:

```typescript
// Subpath exports
import { ReceiptBuilder } from '@wasm4pm/contracts/receipt-builder';
import { hashConfig, verifyHash } from '@wasm4pm/contracts/hash';
import { validateReceipt } from '@wasm4pm/contracts/validation';
```

## Performance

- **Hashing**: O(n) where n = JSON string length
- **Validation**: O(1) for structure, O(n) for hash verification
- **Large logs**: No performance impact; hashes are computed once

## Error Handling

### Validation Errors

```typescript
const result = validateReceipt(receipt);

// result.errors - array of error strings
// result.warnings - array of warning strings
// result.valid - boolean

if (result.errors.length > 0) {
  console.error(result.errors);
  // Structure is invalid
}
```

### Hash Mismatch

```typescript
const result = verifyReceiptHashes(receipt, config, input, plan);

// Check for tampering specifically
const tampered = result.errors.some((e) => e.includes('hash mismatch'));
```

### Non-Serializable Data

If data cannot be JSON-serialized (circular references, functions, etc.):

```typescript
try {
  const hash = hashData(circularData);
} catch (error) {
  console.error('Non-serializable data:', error);
}
```

## File Organization

```
packages/contracts/
├── src/
│   ├── receipt.ts          # Receipt types and type guard
│   ├── hash.ts             # BLAKE3 hashing with determinism
│   ├── receipt-builder.ts  # Fluent builder API
│   ├── validation.ts       # Validation and tampering detection
│   └── index.ts            # Main exports
├── __tests__/
│   ├── receipt.test.ts
│   ├── hash.test.ts
│   ├── receipt-builder.test.ts
│   └── validation.test.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Dependencies

- `blake3`: Node.js binding for BLAKE3 algorithm
- `uuid`: UUID v4 generation

## License

MIT
