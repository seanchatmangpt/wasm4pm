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
  // Detect target — nodejs target emits CommonJS `exports.X = X`,
  // bundler target emits ESM `export ...`. Check for CommonJS markers.
  const jsPath = path.join(repoRoot, 'wasm4pm/pkg/wasm4pm.js');
  const content = fs.readFileSync(jsPath, 'utf-8');
  // Nodejs target signal: presence of `exports.` assignments at line start.
  const hasCjsExports = /^exports\./m.test(content);
  if (!hasCjsExports) {
    throw new Error(
      `[global-setup] wasm4pm/pkg/ is not nodejs target. ` +
        `Run: cd wasm4pm && npm run build:nodejs`,
    );
  }
}
