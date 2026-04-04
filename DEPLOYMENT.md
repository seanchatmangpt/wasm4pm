# Deployment Guide - wasm4pm

Build, test, publish, and deploy wasm4pm to production.

## Table of Contents
1. [Development Setup](#development-setup)
2. [Building](#building)
3. [Testing](#testing)
4. [Publishing to npm](#publishing-to-npm)
5. [Using in Production](#using-in-production)
6. [Docker Deployment](#docker-deployment)
7. [Troubleshooting](#troubleshooting)

---

## Development Setup

### Prerequisites
- **Node.js**: 16.x or later (18.x recommended)
- **Rust**: 1.70+ (install from https://rustup.rs/)
- **wasm-pack**: `cargo install wasm-pack`
- **npm**: Comes with Node.js

### Clone and Setup
```bash
git clone https://github.com/seanchatmangpt/rust4pm
cd rust4pm

# Install Node dependencies
cd process_mining_wasm
npm install

# Verify setup
npm run build:bundler
npm test
```

---

## Building

### For Bundlers (Webpack, Vite, etc.)
```bash
npm run build:bundler
```
- Output: `pkg/` directory
- Size: ~2MB (WASM binary)
- Gzipped: ~600KB
- Use in: Webpack, Vite, Next.js, React, Vue

### For Node.js
```bash
npm run build:nodejs
```
- Output: `pkg/` directory
- Target: Server-side JavaScript
- Use in: Express, FastAPI, backend services

### For Web (Direct Script Tag)
```bash
npm run build:web
```
- Output: `pkg/` directory
- Use: `<script src="pkg/wasm4pm.js"></script>`
- Size: Larger, includes runtime

### Build All Targets
```bash
npm run build:all
```
Builds for bundler, Node.js, and web targets.

### Development Build
```bash
npm run build:dev
```
- No optimizations
- Faster compilation
- Larger binary (~5MB)
- Use for local development only

### Release Build (Optimized)
```bash
npm run build:release
```
- Full optimization (WASM size -70%)
- Optimizations: LTO, dead code elimination
- Slower compilation (~60s)
- Use for production

---

## Testing

### Unit Tests
```bash
npm test
```
Runs all unit tests with Vitest.

### Integration Tests
```bash
npm run test:integration
```
Tests real-world workflows and algorithms.

### Performance Benchmarks
```bash
npm run bench
```
Runs performance tests and generates reports.

### Watch Mode (Development)
```bash
npm run test:watch
```
Automatically reruns tests on file changes.

### Coverage Report
```bash
npm run test:coverage
```
Generates code coverage report.

---

## Publishing to npm

### Prerequisites
- npm account (https://www.npmjs.com/)
- Logged in: `npm login`

### One-Time Setup
1. Create account on npm
2. Enable two-factor authentication (recommended)
3. Generate auth token: https://www.npmjs.com/settings/~/tokens/create
4. Store token in `~/.npmrc`:
   ```
   //registry.npmjs.org/:_authToken=YOUR_TOKEN_HERE
   ```

### Publishing Steps

#### 1. Update Version
Edit `package.json` and `Cargo.toml`:
```json
{
  "version": "0.6.0"
}
```

#### 2. Run Tests
```bash
npm test
npm run test:integration
npm run bench
```

#### 3. Build Release
```bash
npm run build:release
```

#### 4. Generate Changelog
Document changes since last version.

#### 5. Create Git Tag
```bash
git tag -a v0.6.0 -m "Release version 0.6.0"
git push origin v0.6.0
```

#### 6. Publish to npm
```bash
npm publish
```

Verify: https://www.npmjs.com/package/wasm4pm

#### 7. Create GitHub Release
```bash
gh release create v0.6.0 --title "wasm4pm v0.6.0" --body "Release notes..."
```

### CI/CD Automation
GitHub Actions automatically publishes on release (see `.github/workflows/publish.yml`).

---

## Using in Production

### React/Next.js

#### Installation
```bash
npm install wasm4pm
```

#### Dynamic Import
```typescript
import dynamic from 'next/dynamic';

const ProcessMining = dynamic(() => import('@/components/ProcessMining'), {
  ssr: false
});

export default function Page() {
  return <ProcessMining />;
}
```

#### Component Example
```typescript
import { useEffect, useState } from 'react';
import * as wasm4pm from 'wasm4pm';

export default function ProcessMining() {
  const [model, setModel] = useState(null);

  useEffect(() => {
    async function analyze() {
      await wasm4pm.init();
      const log = wasm4pm.loadEventLogFromXES(xesContent);
      const dfg = wasm4pm.discoverDFG(log);
      setModel(dfg);
    }
    analyze();
  }, []);

  return (
    <div>
      {model && (
        <pre>{JSON.stringify(model, null, 2)}</pre>
      )}
    </div>
  );
}
```

### Vue.js

```vue
<template>
  <div>
    <button @click="discoverModel">Analyze</button>
    <pre v-if="model">{{ model }}</pre>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import * as wasm4pm from 'wasm4pm';

const model = ref(null);

onMounted(async () => {
  await wasm4pm.init();
});

async function discoverModel() {
  const log = wasm4pm.loadEventLogFromXES(xesContent);
  model.value = wasm4pm.discoverDFG(log);
}
</script>
```

### Express/Node.js

```javascript
const express = require('express');
const wasm4pm = require('wasm4pm');
const fs = require('fs');

const app = express();

app.post('/api/analyze', async (req, res) => {
  try {
    await wasm4pm.init();
    
    const xesContent = fs.readFileSync('eventlog.xes', 'utf8');
    const log = wasm4pm.loadEventLogFromXES(xesContent);
    
    const dfg = wasm4pm.discoverDFG(log);
    const stats = wasm4pm.analyzeEventStatistics(log);
    const conformance = wasm4pm.checkConformance(log, dfg);
    
    res.json({
      model: dfg,
      stats: stats,
      conformance: conformance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000);
```

### Webpack Configuration

```javascript
// webpack.config.js
module.exports = {
  experiments: {
    asyncWebAssembly: true,
    layers: true,
  },
  module: {
    rules: [
      {
        test: /\.wasm$/,
        type: "webassembly/async",
      },
    ],
  },
};
```

### Vite Configuration

```javascript
// vite.config.js
export default {
  plugins: [
    {
      name: 'wasm',
      apply: 'build',
      enforce: 'pre',
      resolveId(id) {
        if (id.endsWith('.wasm')) {
          return id;
        }
      },
      load(id) {
        if (id.endsWith('.wasm')) {
          return fs.readFileSync(id);
        }
      }
    }
  ]
};
```

---

## Docker Deployment

### Dockerfile for Node.js Service
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --production

# Copy application code
COPY . .

# Copy wasm4pm package
COPY node_modules/wasm4pm ./node_modules/wasm4pm

# Expose port
EXPOSE 3000

# Start service
CMD ["node", "server.js"]
```

### Docker Compose
```yaml
version: '3.8'

services:
  process-mining-api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

### Build and Run
```bash
docker build -t wasm4pm-service .
docker run -p 3000:3000 wasm4pm-service
```

---

## Performance Optimization

### WASM Memory Management
```javascript
// Good: Free unused handles
const log = wasm4pm.loadEventLogFromXES(content);
const model = wasm4pm.discoverDFG(log);
wasm4pm.freeHandle(log);  // Free memory
```

### Lazy Loading
```javascript
// Load WASM only when needed
const loadWasm = async () => {
  const wasm4pm = await import('wasm4pm');
  await wasm4pm.init();
  return wasm4pm;
};
```

### Worker Thread (Node.js)
```javascript
// worker.js
const wasm4pm = require('wasm4pm');
const { parentPort } = require('worker_threads');

async function init() {
  await wasm4pm.init();
}

parentPort.on('message', async (msg) => {
  if (msg.type === 'DISCOVER') {
    const log = wasm4pm.loadEventLogFromXES(msg.xesContent);
    const dfg = wasm4pm.discoverDFG(log);
    parentPort.postMessage({ result: dfg });
  }
});

init();
```

### Web Worker (Browser)
```javascript
// worker.js
importScripts('node_modules/wasm4pm/pkg/wasm4pm.js');

self.onmessage = async (e) => {
  const { xesContent, algorithm } = e.data;
  
  const log = wasm4pm.loadEventLogFromXES(xesContent);
  let model;
  
  if (algorithm === 'dfg') {
    model = wasm4pm.discoverDFG(log);
  } else if (algorithm === 'genetic') {
    model = wasm4pm.discoverGeneticAlgorithm(log);
  }
  
  self.postMessage({ model });
};
```

---

## Monitoring and Logging

### Log Levels
```javascript
wasm4pm.setLogLevel('debug');    // Verbose
wasm4pm.setLogLevel('info');     // Normal
wasm4pm.setLogLevel('warn');     // Warnings only
wasm4pm.setLogLevel('error');    // Errors only
```

### Error Handling
```javascript
try {
  const log = wasm4pm.loadEventLogFromXES(content);
  const dfg = wasm4pm.discoverDFG(log);
} catch (error) {
  console.error('wasm4pm error:', error.message);
  // Handle error: log to monitoring service, alert, etc.
}
```

### Metrics Collection
```javascript
const metrics = {
  discoveryTime: performance.now(),
  model: wasm4pm.discoverDFG(log),
  discoveryTime: performance.now() - metrics.discoveryTime
};

// Send to monitoring
sendMetrics({
  algorithm: 'DFG',
  executionTime: metrics.discoveryTime,
  eventCount: log.eventCount,
  timestamp: new Date().toISOString()
});
```

---

## Troubleshooting

### WASM Module Not Found
```bash
# Verify installation
npm list wasm4pm

# Check if module is present
ls node_modules/wasm4pm/pkg/

# Reinstall
npm install wasm4pm
```

### Memory Leaks
```javascript
// Debug mode
wasm4pm.enableMemoryDebug(true);

// Monitor memory
const initialMem = performance.memory.usedJSHeapSize;
// ... do work ...
const finalMem = performance.memory.usedJSHeapSize;
console.log(`Memory used: ${(finalMem - initialMem) / 1024 / 1024}MB`);
```

### Slow Performance
```javascript
// Profile algorithm
const start = performance.now();
const model = wasm4pm.discoverGeneticAlgorithm(log, { 
  generations: 100 
});
console.log(`Time: ${performance.now() - start}ms`);

// Reduce complexity if needed
const model = wasm4pm.discoverGeneticAlgorithm(log, { 
  generations: 50  // Half iterations
});
```

### Browser Compatibility
```javascript
// Check if WASM is supported
if (typeof WebAssembly === 'undefined') {
  throw new Error('WebAssembly not supported in this browser');
}

// Polyfill if needed
import 'wasm-feature-detect';
```

---

## Version Management

### Semantic Versioning
- **MAJOR** (0.**x**.0): Breaking changes
- **MINOR** (0.x.**0**): New features, backwards compatible
- **PATCH** (x.x.**0**): Bug fixes

### Checking Version
```javascript
const version = wasm4pm.getVersion();
console.log(`wasm4pm v${version}`);
```

### Migration Guide
Always check CHANGELOG.md for breaking changes:
```bash
cat CHANGELOG.md
```

---

## Support and Resources

- **npm**: https://www.npmjs.com/package/wasm4pm
- **GitHub**: https://github.com/seanchatmangpt/rust4pm
- **Issues**: https://github.com/seanchatmangpt/rust4pm/issues
- **Documentation**: See docs/ directory

