# @wasm4pm/contracts

Runtime contracts, receipts, and cryptographic verification for process mining.

## Features

- **Receipt System**: BLAKE3-signed execution proofs
- **Deterministic Hashing**: Same input → same hash always
- **Tampering Detection**: Verify execution integrity
- **Type-Safe**: Full TypeScript support
- **Zero Dependencies**: Minimal footprint

## Quick Start

```typescript
import {
  ReceiptBuilder,
  validateReceipt,
  detectTampering,
} from '@wasm4pm/contracts';

// Create receipt
const receipt = new ReceiptBuilder()
  .setConfig({ algorithm: 'alpha++' })
  .setInput(eventLog)
  .setPlan(executionPlan)
  .setTiming(startTime, endTime)
  .setStatus('success')
  .setSummary({ traces_processed: 100 })
  .setAlgorithm({ name: 'alpha++', version: '1.0' })
  .setModel({ nodes: 42, edges: 156 })
  .build();

// Validate
const result = validateReceipt(receipt);

// Detect tampering
const tampered = detectTampering(receipt, config, input, plan);
```

## Documentation

- [RECEIPT.md](./RECEIPT.md) - Complete API reference
- [IMPLEMENTATION.md](./IMPLEMENTATION.md) - Design and implementation details

## Testing

```bash
npm test              # Run all tests
npm test:watch       # Watch mode
npm run build        # Compile TypeScript
npm run clean        # Remove dist directory
```

## License

MIT
