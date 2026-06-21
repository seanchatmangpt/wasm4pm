# How-To: Deploy on Edge Devices

## Goal
Compile and deploy the `wasm4pm` engine onto highly constrained Edge or IoT environments (e.g., Cloudflare Workers, Raspberry Pi).

## Steps

### 1. Select the Profile
The default build targets Node/Browser. For edge environments, select the `edge` or `iot` profile to aggressively strip memory overhead.
```bash
pnpm build:edge
```

### 2. Bundle
Include the minimized `pkg/wasm4pm_bg.wasm` file in your edge worker deployment bundle.

### 3. Instantiate
Use the lightweight initialization API in your worker code:
```javascript
import init, { simd_streaming_dfg } from './pkg/wasm4pm.js';

export default {
  async fetch(request, env) {
    await init();
    // ... run algorithms
  }
}
```
