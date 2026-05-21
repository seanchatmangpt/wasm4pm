# How-To: Integrate wasm4pm into Node.js

**Time required**: 15 minutes  
**Difficulty**: Intermediate  

## Installation

```bash
npm install @wasm4pm/wasm4pm @wasm4pm/types
```

## Basic Usage

```javascript
const Wasm4pm = require('@wasm4pm/wasm4pm');

const pm = new Wasm4pm();

// Run discovery
const result = await pm.run({
  config: {
    discovery: {
      algorithm: 'dfg',
      profile: 'fast'
    },
    source: {
      type: 'file',
      path: 'sample.xes'
    }
  }
});

console.log(`Model has ${result.model.nodes.length} nodes`);
```

## Load Event Log

```javascript
// From file
const log = await pm.loadEventLog({
  source: { type: 'file', path: 'sample.xes' }
});

// From JSON
const log = await pm.loadEventLog({
  source: {
    type: 'inline',
    data: JSON.stringify(events)
  }
});
```

## Run Algorithm

```javascript
const result = await pm.discover({
  algorithm: 'heuristic',
  log: log,
  params: {
    noise_threshold: 0.2
  }
});

console.log(result.model);
```

## Stream Processing

```javascript
const stream = pm.watch({
  config: { /* ... */ },
  onProgress: (percent) => console.log(`${percent}%`),
  onCheckpoint: (ckpt) => console.log(`Checkpoint: ${ckpt.id}`),
  onComplete: (receipt) => console.log('Done!')
});

for await (const event of stream) {
  console.log(event);
}
```

## Error Handling

```javascript
try {
  const result = await pm.run({ config });
} catch (error) {
  if (error.code === 'CONFIG_ERROR') {
    console.error('Invalid config:', error.message);
  } else if (error.code === 'SOURCE_ERROR') {
    console.error('Input file error:', error.message);
  } else {
    console.error('Execution error:', error);
  }
}
```

## Type Definitions

```typescript
import { 
  Wasm4pm, 
  Config, 
  Receipt, 
  WatchEvent 
} from '@wasm4pm/types';

const pm: Wasm4pm = new Wasm4pm();
const result: Receipt = await pm.run({ config: Config });
```

## Full Example

```javascript
const Wasm4pm = require('@wasm4pm/wasm4pm');
const fs = require('fs');

async function analyzeProcess() {
  const pm = new Wasm4pm();

  // 1. Load event log
  const logData = fs.readFileSync('sample.xes', 'utf8');

  // 2. Configure discovery
  const config = {
    discovery: {
      algorithm: 'heuristic',
      profile: 'balanced'
    },
    source: {
      type: 'inline',
      data: logData
    }
  };

  // 3. Run discovery
  const receipt = await pm.run({ config });

  // 4. Save results
  fs.writeFileSync(
    'output.json',
    JSON.stringify(receipt, null, 2)
  );

  console.log(`Completed in ${receipt.execution_time_ms}ms`);
  console.log(`Model: ${receipt.model.nodes.length} nodes, ${receipt.model.edges.length} edges`);
}

analyzeProcess().catch(console.error);
```

## Express.js Integration

```javascript
const express = require('express');
const Wasm4pm = require('@wasm4pm/wasm4pm');

const app = express();
const pm = new Wasm4pm();

app.post('/analyze', async (req, res) => {
  try {
    const receipt = await pm.run({
      config: req.body.config
    });
    res.json(receipt);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.listen(3000);
```

## See Also

- [Reference: TypeScript Types](../reference/types.ts)
- [Tutorial: Service Mode](../tutorials/service-mode.md)
- [Reference: HTTP API](../reference/http-api.md)
