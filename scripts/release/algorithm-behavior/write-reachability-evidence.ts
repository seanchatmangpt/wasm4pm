import fs from 'node:fs';
import path from 'node:path';
import { getRegistry } from '../../../packages/kernel/src/registry.js';
import { WASM_FUNCTION_NAMES } from '../../../packages/contracts/src/algorithm-registry.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

function packageVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
  return pkg.version;
}

function computeHash(data: unknown): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function readApiCases(): Set<string> {
  const apiSrc = readFileSync(path.resolve(process.cwd(), 'packages/kernel/src/api.ts'), 'utf8');
  const cases = new Set<string>();
  for (const m of apiSrc.matchAll(/case '([^']+)':/g)) {
    cases.add(m[1]);
  }
  return cases;
}

function readWasmExports(): Set<string> {
  const bgPath = path.resolve(process.cwd(), 'wasm4pm/pkg/wasm4pm_bg.js');
  if (!fs.existsSync(bgPath)) return new Set();
  const src = readFileSync(bgPath, 'utf8');
  const exports = new Set<string>();
  for (const m of src.matchAll(/export function (\w+)/g)) {
    exports.add(m[1]);
  }
  return exports;
}

const STRUCTURED_ABSENCE: Record<string, string> = {
  petri_net_reduction: 'not registered in kernel registry (no stable WASM export in product surface)',
  agentic_pipeline: 'requires feature-cloud WASM build',
};

async function main() {
  const version = packageVersion();
  const registry = getRegistry();
  const algorithms = registry.list();
  const apiCases = readApiCases();
  const wasmExports = readWasmExports();
  const rootDir = process.cwd();

  const evidence = {
    package: 'wasm4pm',
    version,
    generated_at: new Date().toISOString(),
    algorithm_count: algorithms.length,
    algorithms: algorithms.map((algo) => {
      const wasmFn = WASM_FUNCTION_NAMES[algo.id];
      const hasApiCase = apiCases.has(algo.id);
      const hasWasmExport = wasmFn ? wasmExports.has(wasmFn) : false;
      const absence = STRUCTURED_ABSENCE[algo.id];
      const reachable = hasApiCase && (hasWasmExport || Boolean(absence));

      return {
        id: algo.id,
        category: algo.category,
        reachable,
        dispatch_path: hasApiCase ? 'packages/kernel/src/api.ts runRaw' : null,
        wasm_required: !absence,
        wasm_export: wasmFn ?? null,
        wasm_export_present: hasWasmExport,
        structured_absence_reason: absence ?? null,
      };
    }),
    reachability_hash: '',
  };

  evidence.reachability_hash = computeHash(evidence);

  const outPath = path.resolve(rootDir, `artifacts/release/ALGORITHM_REACHABILITY_EVIDENCE.v${version}.json`);
  if (!fs.existsSync(path.dirname(outPath))) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
  }

  fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2));
  console.log(`[SUCCESS] Wrote Algorithm Reachability Evidence to ${outPath}`);
  console.log(
    `[INFO] reachable=${evidence.algorithms.filter((a) => a.reachable).length}/${evidence.algorithms.length}`
  );
}

main().catch(console.error);
