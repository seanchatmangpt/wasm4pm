# Receipt System - Quick Reference

## Installation

```bash
pnpm install
cd packages/contracts
npm run build
npm test
```

## Basic Usage

### Create a Receipt

```typescript
import { ReceiptBuilder } from '@wasm4pm/contracts';

const receipt = new ReceiptBuilder()
  .setConfig({ algorithm: 'alpha++', threshold: 0.8 })
  .setInput(eventLog)
  .setPlan(executionPlan)
  .setTiming('2026-04-04T10:00:00Z', '2026-04-04T10:01:00Z')
  .setStatus('success')
  .setSummary({
    traces_processed: 100,
    objects_processed: 500,
    variants_discovered: 10,
  })
  .setAlgorithm({
    name: 'alpha++',
    version: '1.0.0',
    parameters: { threshold: 0.8 },
  })
  .setModel({ nodes: 42, edges: 156 })
  .build();
```

### Validate Receipt

```typescript
import { validateReceipt } from '@wasm4pm/contracts';

const result = validateReceipt(receipt);
if (!result.valid) {
  console.error('Errors:', result.errors);
  console.warn('Warnings:', result.warnings);
}
```

### Detect Tampering

```typescript
import { detectTampering } from '@wasm4pm/contracts';

const isTampered = detectTampering(receipt, config, input, plan);
if (isTampered) {
  console.error('Receipt has been tampered with');
}
```

### Hash Data

```typescript
import { hashConfig, hashData, verifyHash } from '@wasm4pm/contracts';

// Hash a config object
const configHash = hashConfig({ algorithm: 'test' });

// Hash any data
const dataHash = hashData({ traces: [...] });

// Verify a hash
const isValid = verifyHash(data, hash);
```

## Type System

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

## API Reference

### ReceiptBuilder

```typescript
new ReceiptBuilder(runId?: string)
  .setRunId(id: string): ReceiptBuilder
  .setConfig(config: object): ReceiptBuilder
  .setInput(data: any): ReceiptBuilder
  .setPlan(plan: object): ReceiptBuilder
  .setTiming(start: string, end: string): ReceiptBuilder
  .setDuration(ms: number): ReceiptBuilder
  .setStatus(status: 'success' | 'partial' | 'failed'): ReceiptBuilder
  .setError(error: ErrorInfo): ReceiptBuilder
  .setSummary(summary: Partial<ExecutionSummary>): ReceiptBuilder
  .setAlgorithm(algo: Partial<AlgorithmInfo>): ReceiptBuilder
  .setModel(model: Partial<ModelInfo>): ReceiptBuilder
  .build(): Receipt
```

### Hash Functions

```typescript
hashConfig(config: Record<string, any>): string
hashData(data: any): string
hashJsonString(json: string): string
verifyHash(content: any, hash: string): boolean
normalizeForHashing(data: any): string
```

### Validation

```typescript
validateReceipt(receipt: unknown): ValidationResult
verifyReceiptHashes(
  receipt: unknown,
  config: Record<string, any>,
  input: any,
  plan: Record<string, any>
): ValidationResult
detectTampering(
  receipt: unknown,
  config: Record<string, any>,
  input: any,
  plan: Record<string, any>
): boolean
isReceipt(value: unknown): value is Receipt
```

## Receipt Structure

```typescript
interface Receipt {
  run_id: string;                    // UUID v4
  schema_version: string;            // "1.0"
  config_hash: string;               // BLAKE3 (64 hex chars)
  input_hash: string;                // BLAKE3 (64 hex chars)
  plan_hash: string;                 // BLAKE3 (64 hex chars)
  start_time: string;                // ISO 8601
  end_time: string;                  // ISO 8601
  duration_ms: number;
  status: 'success' | 'partial' | 'failed';
  error?: ErrorInfo;
  summary: ExecutionSummary;
  algorithm: AlgorithmInfo;
  model: ModelInfo;
}
```

## Common Patterns

### Store Receipt as JSON

```typescript
const json = JSON.stringify(receipt);
localStorage.setItem('receipt', json);

// Load later
const loaded = JSON.parse(localStorage.getItem('receipt'));
if (isReceipt(loaded)) {
  console.log('Valid receipt loaded');
}
```

### Verify Execution Integrity

```typescript
const receipt = /* from storage */;
const config = /* original config */;
const input = /* original input */;
const plan = /* original plan */;

const result = verifyReceiptHashes(receipt, config, input, plan);
if (result.valid) {
  console.log('Execution verified as authentic');
} else {
  console.error('Tampering detected:', result.errors);
}
```

### Handle Errors

```typescript
try {
  const receipt = new ReceiptBuilder()
    .setConfig({})
    // ... missing required fields ...
    .build();
} catch (error) {
  console.error('Missing required fields:', error.message);
}
```

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test hash.test.ts

# Run tests in watch mode
npm test:watch

# Build TypeScript
npm run build

# Clean build artifacts
npm run clean
```

## Key Guarantees

✅ **Determinism**: Same input always produces same hash  
✅ **Sensitivity**: Any change produces different hash  
✅ **Order-Independent**: Object key order doesn't matter  
✅ **Cryptographic**: BLAKE3 hashing (64-character output)  
✅ **Type-Safe**: Full TypeScript support  
✅ **Zero-Dependency**: Only blake3 and uuid  

## Performance

- Hash computation: O(n) where n = JSON string length
- Validation: O(1) structure + O(n) hash verification
- No async operations
- Suitable for high-frequency use

## Example: Complete Workflow

```typescript
import {
  ReceiptBuilder,
  validateReceipt,
  verifyReceiptHashes,
  detectTampering,
} from '@wasm4pm/contracts';

// Setup
const config = { algorithm: 'alpha++', threshold: 0.8 };
const input = { traces: [...] };
const plan = { steps: [...] };

// Execute and create receipt
const startTime = new Date().toISOString();
const endTime = new Date(Date.now() + 5000).toISOString();

const receipt = new ReceiptBuilder()
  .setConfig(config)
  .setInput(input)
  .setPlan(plan)
  .setTiming(startTime, endTime)
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
  .setModel({ nodes: 42, edges: 156 })
  .build();

// Validate structure
const structureResult = validateReceipt(receipt);
if (!structureResult.valid) {
  throw new Error(`Invalid receipt: ${structureResult.errors.join(', ')}`);
}

// Verify hashes (detect tampering)
const hashResult = verifyReceiptHashes(receipt, config, input, plan);
if (!hashResult.valid) {
  throw new Error('Receipt tampering detected');
}

// Store receipt
const json = JSON.stringify(receipt);
localStorage.setItem('execution-receipt', json);

// Later: verify integrity
const stored = JSON.parse(localStorage.getItem('execution-receipt'));
const isTampered = detectTampering(stored, config, input, plan);
console.log('Tampered:', isTampered);
```

---

For complete documentation, see:
- [RECEIPT.md](./RECEIPT.md) - Full API reference
- [IMPLEMENTATION.md](./IMPLEMENTATION.md) - Design details
