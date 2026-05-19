import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function globalSetup(): void {
  const repoRoot = path.resolve(__dirname, '../../../..');
  const wasmPath = path.join(repoRoot, 'wasm4pm/pkg/wasm4pm_bg.wasm');
  if (!fs.existsSync(wasmPath)) {
    throw new Error(
      `[global-setup] wasm4pm/pkg/wasm4pm_bg.wasm not found at ${wasmPath}. ` +
        `Run: cd wasm4pm && npm run build:nodejs`,
    );
  }
  // Detect target — wasm-pack may emit either CommonJS or ESM depending on version.
  // Check that wasm4pm.js exists and contains wasm imports or exports.
  const jsPath = path.join(repoRoot, 'wasm4pm/pkg/wasm4pm.js');
  const content = fs.readFileSync(jsPath, 'utf-8');
  // Valid nodejs target signal: either CommonJS `exports.` or ESM `import/export`
  const isCjsExports = /^exports\./m.test(content);
  const isEsm = /^(import|export)/m.test(content);
  if (!isCjsExports && !isEsm) {
    throw new Error(
      `[global-setup] wasm4pm/pkg/wasm4pm.js does not contain valid JS module syntax. ` +
        `Run: cd wasm4pm && npm run build:nodejs`,
    );
  }
}
