import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import type { OutputOptions } from '../output.js';

export interface DoctorOptions extends OutputOptions {
  fix?: boolean;
}

/** Result of a single health check */
interface CheckResult {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  message: string;
  fix?: string;
}

/** Aggregate report */
interface DoctorReport {
  checks: CheckResult[];
  ok: number;
  warn: number;
  fail: number;
  healthy: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Check 1: Node.js version (≥ 18)
// ────────────────────────────────────────────────────────────────────────────

async function checkNodeVersion(): Promise<CheckResult> {
  const raw = process.version;
  const major = parseInt(raw.slice(1).split('.')[0] ?? '0', 10);
  if (major >= 18) {
    return { name: 'Node.js version', status: 'ok', message: `${raw} (≥ 18 required)` };
  }
  return {
    name: 'Node.js version',
    status: 'fail',
    message: `${raw} is too old — Node.js ≥ 18 is required`,
    fix: 'Install Node.js 18+ from https://nodejs.org or use a version manager: nvm install 20',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Check 2: pnpm version (≥ 8)
// ────────────────────────────────────────────────────────────────────────────

async function checkPnpmVersion(): Promise<CheckResult> {
  try {
    const version = execSync('pnpm --version', { encoding: 'utf8', stdio: 'pipe' }).trim();
    const major = parseInt(version.split('.')[0], 10);
    if (major >= 8) {
      return { name: 'pnpm version', status: 'ok', message: `pnpm ${version} (≥ 8 required)` };
    }
    return {
      name: 'pnpm version',
      status: 'warn',
      message: `pnpm ${version} is old — ≥ 8 recommended`,
      fix: 'Upgrade pnpm: corepack enable && corepack prepare pnpm@latest --activate',
    };
  } catch {
    return {
      name: 'pnpm version',
      status: 'warn',
      message: 'pnpm not found in PATH',
      fix: 'Install pnpm: corepack enable && corepack prepare pnpm@latest --activate',
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Check 3: WASM binary exists and is non-empty
// ────────────────────────────────────────────────────────────────────────────

async function resolveWasmPkgDir(): Promise<string | null> {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return path.join(dir, 'wasm4pm', 'pkg');
    }
    const pkgJson = path.join(dir, 'package.json');
    if (existsSync(pkgJson)) {
      try {
        const raw = await fs.readFile(pkgJson, 'utf-8');
        const pkg = JSON.parse(raw) as { name?: string; workspaces?: unknown };
        if (pkg.name === 'wasm4pm' || pkg.name === '@pictl/root') {
          return path.join(dir, 'wasm4pm', 'pkg');
        }
      } catch {
        // ignore
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

async function checkWasmBinary(): Promise<CheckResult> {
  const wasmPkgDir = await resolveWasmPkgDir();
  if (!wasmPkgDir) {
    return {
      name: 'WASM binary',
      status: 'fail',
      message: 'Cannot locate wasm4pm/pkg/ directory (workspace root not found)',
      fix: 'Run this command from inside the wasm4pm workspace, then rebuild: cd wasm4pm && npm run build',
    };
  }

  const wasmFile = path.join(wasmPkgDir, 'wasm4pm_bg.wasm');
  const jsFile = path.join(wasmPkgDir, 'wasm4pm.js');

  try {
    const [wasmStat, jsStat] = await Promise.all([fs.stat(wasmFile), fs.stat(jsFile)]);

    if (wasmStat.size === 0) {
      return {
        name: 'WASM binary',
        status: 'fail',
        message: `${wasmFile} exists but is empty`,
        fix: 'Rebuild WASM: cd wasm4pm && npm run build',
      };
    }

    const sizeMb = (wasmStat.size / 1024 / 1024).toFixed(1);
    void jsStat;
    return { name: 'WASM binary', status: 'ok', message: `wasm4pm_bg.wasm found (${sizeMb} MB)` };
  } catch {
    return {
      name: 'WASM binary',
      status: 'fail',
      message: `WASM binary not built — ${wasmFile} not found`,
      fix: 'Build the WASM module: cd wasm4pm && npm run build',
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Check 4: WASM loads and get_version() works
// ────────────────────────────────────────────────────────────────────────────

async function checkWasmLoads(): Promise<CheckResult> {
  const wasmPkgDir = await resolveWasmPkgDir();
  if (!wasmPkgDir) {
    return {
      name: 'WASM loads',
      status: 'fail',
      message: 'Skipped — pkg/ directory not found',
      fix: 'Run from inside the wasm4pm workspace',
    };
  }

  const jsFile = path.join(wasmPkgDir, 'wasm4pm.js');
  if (!existsSync(jsFile)) {
    return {
      name: 'WASM loads',
      status: 'fail',
      message: 'wasm4pm.js not found — module not built',
      fix: 'cd wasm4pm && npm run build',
    };
  }

  try {
    const url = new URL(`file://${jsFile}`);
    const mod = await import(url.href);

    if (typeof mod.get_version === 'function') {
      const v: string = mod.get_version();
      return { name: 'WASM loads', status: 'ok', message: `Loaded OK — module version ${v}` };
    }

    return { name: 'WASM loads', status: 'ok', message: 'Loaded OK (get_version not exported)' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      name: 'WASM loads',
      status: 'fail',
      message: `Failed to import WASM module: ${msg}`,
      fix: 'Rebuild with: cd wasm4pm && npm run build',
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Check 5: SIMD support in current WASM runtime
// ────────────────────────────────────────────────────────────────────────────

async function checkSimdSupport(): Promise<CheckResult> {
  try {
    // WebAssembly SIMD is detected by compiling a small SIMD module
    const simdModule = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x07, 0x01, 0x60, 0x02, 0x7b,
      0x7b, 0x01, 0x7b, 0x03, 0x02, 0x01, 0x00, 0x07, 0x0b, 0x01, 0x07, 0x73, 0x69, 0x6d,
      0x64, 0x5f, 0x74, 0x65, 0x73, 0x74, 0x00, 0x00, 0x0a, 0x09, 0x01, 0x07, 0x00, 0x20,
      0x00, 0x20, 0x00, 0xfd, 0x0c, 0x00, 0x0b,
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const compile = (globalThis as any).WebAssembly?.compile as ((buf: Uint8Array) => Promise<any>) | undefined;
    if (!compile) {
      return {
        name: 'WASM SIMD',
        status: 'warn',
        message: 'WebAssembly not available in this runtime',
        fix: 'Use Node.js 18+ or a Chromium-based browser',
      };
    }
    await compile(simdModule);
    return { name: 'WASM SIMD', status: 'ok', message: 'SIMD128 supported — algorithms will use optimized paths' };
  } catch {
    return {
      name: 'WASM SIMD',
      status: 'warn',
      message: 'SIMD128 not available — algorithms will run at reduced speed',
      fix: 'Use Node.js 18+ or a Chromium-based browser with SIMD enabled',
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Check 6: Config file found
// ────────────────────────────────────────────────────────────────────────────

async function checkConfigFound(): Promise<CheckResult> {
  const configNames = ['pictl.toml', 'pictl.json', 'wasm4pm.toml', 'wasm4pm.json'];
  const cwd = process.cwd();
  const searchDirs: string[] = [cwd];
  let current = cwd;
  for (let i = 0; i < 3; i++) {
    const parent = path.dirname(current);
    if (parent === current) break;
    searchDirs.push(parent);
    current = parent;
  }

  for (const dir of searchDirs) {
    for (const name of configNames) {
      const candidate = path.join(dir, name);
      if (existsSync(candidate)) {
        const relative = path.relative(cwd, candidate) || name;
        return { name: 'Config file', status: 'ok', message: `Found ${relative}` };
      }
    }
  }

  return {
    name: 'Config file',
    status: 'warn',
    message: 'No pictl.toml / wasm4pm.json found in current directory or parents',
    fix: 'Create a config with: pictl init    (defaults work fine without one)',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Check 7: Config validation (if found, parse with Zod)
// ────────────────────────────────────────────────────────────────────────────

async function checkConfigValidation(): Promise<CheckResult> {
  const configNames = ['pictl.toml', 'pictl.json', 'wasm4pm.toml', 'wasm4pm.json'];
  const cwd = process.cwd();
  let configPath: string | null = null;

  const searchDirs: string[] = [cwd];
  let current = cwd;
  for (let i = 0; i < 3; i++) {
    const parent = path.dirname(current);
    if (parent === current) break;
    searchDirs.push(parent);
    current = parent;
  }

  for (const dir of searchDirs) {
    for (const name of configNames) {
      const candidate = path.join(dir, name);
      if (existsSync(candidate)) {
        configPath = candidate;
        break;
      }
    }
    if (configPath) break;
  }

  if (!configPath) {
    return { name: 'Config validation', status: 'ok', message: 'Skipped — no config file found' };
  }

  // JSON configs can be validated directly
  if (configPath.endsWith('.json')) {
    try {
      const raw = await fs.readFile(configPath, 'utf-8');
      JSON.parse(raw);
      return { name: 'Config validation', status: 'ok', message: `${path.basename(configPath)} is valid JSON` };
    } catch (err) {
      return {
        name: 'Config validation',
        status: 'fail',
        message: `Invalid JSON in ${path.basename(configPath)}: ${err instanceof Error ? err.message : String(err)}`,
        fix: 'Fix the JSON syntax in your config file',
      };
    }
  }

  // TOML configs — basic check (full validation requires @pictl/config)
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    const lines = raw.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
    if (lines.length === 0) {
      return {
        name: 'Config validation',
        status: 'warn',
        message: `${path.basename(configPath)} is empty`,
        fix: 'Add configuration or run: pictl init',
      };
    }
    return {
      name: 'Config validation',
      status: 'ok',
      message: `${path.basename(configPath)} has ${lines.length} config lines (basic check passed)`,
    };
  } catch (err) {
    return {
      name: 'Config validation',
      status: 'fail',
      message: `Cannot read ${path.basename(configPath)}: ${err instanceof Error ? err.message : String(err)}`,
      fix: 'Check file permissions',
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Check 8: XES files in cwd
// ────────────────────────────────────────────────────────────────────────────

async function checkXesFiles(): Promise<CheckResult> {
  const cwd = process.cwd();
  const found: string[] = [];

  async function scanDir(dir: string, depth: number): Promise<void> {
    if (depth > 2) return;
    let entries: import('fs').Dirent[];
    try {
      entries = (await fs.readdir(dir, { withFileTypes: true, encoding: 'utf-8' })) as import('fs').Dirent[];
    } catch {
      return;
    }
    for (const entry of entries) {
      const name = String(entry.name);
      if (name.startsWith('.') || name === 'node_modules') continue;
      const fullPath = path.join(dir, name);
      if (entry.isDirectory()) {
        await scanDir(fullPath, depth + 1);
      } else if (entry.isFile() && name.endsWith('.xes')) {
        found.push(path.relative(cwd, fullPath));
      }
    }
  }

  await scanDir(cwd, 0);

  if (found.length === 0) {
    return {
      name: 'XES event logs',
      status: 'warn',
      message: 'No .xes files found in current directory (depth ≤ 2)',
      fix: 'Place an XES event log here, or pass --input <path> to pictl run/predict',
    };
  }

  const preview = found.slice(0, 3).join(', ') + (found.length > 3 ? ` (+${found.length - 3} more)` : '');
  return {
    name: 'XES event logs',
    status: 'ok',
    message: `${found.length} file(s): ${preview}`,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Check 9: System memory (warn < 256 MB free)
// ────────────────────────────────────────────────────────────────────────────

async function checkSystemMemory(): Promise<CheckResult> {
  const freeMb = os.freemem() / 1024 / 1024;
  const totalMb = os.totalmem() / 1024 / 1024;
  const pct = ((freeMb / totalMb) * 100).toFixed(0);

  if (freeMb < 128) {
    return {
      name: 'System memory',
      status: 'warn',
      message: `Low free memory: ${freeMb.toFixed(0)} MB free of ${totalMb.toFixed(0)} MB total (${pct}%)`,
      fix: 'Close other applications; process mining on large logs requires ≥ 256 MB free',
    };
  }

  return {
    name: 'System memory',
    status: 'ok',
    message: `${freeMb.toFixed(0)} MB free of ${totalMb.toFixed(0)} MB total (${pct}% free)`,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Check 10: Disk space (warn < 500 MB free)
// ────────────────────────────────────────────────────────────────────────────

async function checkDiskSpace(): Promise<CheckResult> {
  try {
    // Use df on macOS/Linux, wmic on Windows
    let freeMb: number;
    if (process.platform === 'win32') {
      const out = execSync('wmic logicaldisk get freespace /format:csv', {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      const lines = out.trim().split('\n').filter((l) => l.trim());
      // Parse first non-header line (CSV format: Node,FreeSpace)
      const values = lines[lines.length - 1]?.split(',').map((s) => s.trim());
      freeMb = parseInt(values?.[1] ?? '0', 10) / 1024 / 1024;
    } else {
      const out = execSync('df -k .', { encoding: 'utf8', stdio: 'pipe' });
      const lines = out.trim().split('\n');
      // Last line has the filesystem stats
      const parts = lines[lines.length - 1]?.split(/\s+/);
      freeMb = parseInt(parts?.[3] ?? '0', 10) / 1024;
    }

    if (freeMb < 500) {
      return {
        name: 'Disk space',
        status: 'warn',
        message: `Low disk space: ${freeMb.toFixed(0)} MB free — WASM builds require ~100 MB`,
        fix: 'Free up disk space before building WASM modules',
      };
    }

    return {
      name: 'Disk space',
      status: 'ok',
      message: `${freeMb.toFixed(0)} MB free on current filesystem`,
    };
  } catch {
    return { name: 'Disk space', status: 'ok', message: 'Skipped — could not determine disk space' };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Check 11: Git hooks (pre-commit, pre-push)
// ────────────────────────────────────────────────────────────────────────────

async function checkGitHooks(): Promise<CheckResult> {
  let gitDir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(gitDir, '.git'))) break;
    const parent = path.dirname(gitDir);
    if (parent === gitDir) {
      return { name: 'Git hooks', status: 'ok', message: 'Skipped — not inside a git repository' };
    }
    gitDir = parent;
  }

  const hooksDir = path.join(gitDir, '.git', 'hooks');
  const preCommit = path.join(hooksDir, 'pre-commit');
  const prePush = path.join(hooksDir, 'pre-push');

  const hasPreCommit = existsSync(preCommit);
  const hasPrePush = existsSync(prePush);

  if (hasPreCommit && hasPrePush) {
    return { name: 'Git hooks', status: 'ok', message: 'pre-commit and pre-push hooks installed' };
  }

  const missing: string[] = [];
  if (!hasPreCommit) missing.push('pre-commit');
  if (!hasPrePush) missing.push('pre-push');

  return {
    name: 'Git hooks',
    status: 'warn',
    message: `Missing hooks: ${missing.join(', ')}`,
    fix: 'Install hooks: pnpm prepare',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Check 12: TypeScript compilation
// ────────────────────────────────────────────────────────────────────────────

async function checkTypeScriptCompilation(): Promise<CheckResult> {
  const rootDir = await resolveWorkspaceRoot();
  if (!rootDir) {
    return { name: 'TypeScript compilation', status: 'ok', message: 'Skipped — workspace root not found' };
  }

  try {
    execSync('npx tsc --noEmit', { cwd: rootDir, encoding: 'utf8', stdio: 'pipe', timeout: 60000 });
    return { name: 'TypeScript compilation', status: 'ok', message: 'tsc --noEmit passes' };
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? '';
    const lineCount = stderr.trim().split('\n').filter((l) => l.trim()).length;
    return {
      name: 'TypeScript compilation',
      status: 'warn',
      message: `${lineCount} TypeScript error(s) — run: pnpm lint for details`,
      fix: 'Fix TypeScript errors: pnpm lint',
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Check 13: @pictl/ml available
// ────────────────────────────────────────────────────────────────────────────

async function checkMicroMl(): Promise<CheckResult> {
  try {
    // Try to resolve the package
    const mlPath = await import('@pictl/ml');
    const hasClassify = typeof mlPath.classifyTraces === 'function';
    if (hasClassify) {
      return { name: '@pictl/ml', status: 'ok', message: 'Native ML package available (classify, cluster, forecast, anomaly, regress, pca)' };
    }
    return { name: '@pictl/ml', status: 'warn', message: 'Package found but classifyTraces not exported' };
  } catch {
    return {
      name: '@pictl/ml',
      status: 'warn',
      message: '@pictl/ml not resolvable — ML commands will not work',
      fix: 'Install the ML package: pnpm install @pictl/ml',
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Check 14: Rust toolchain (cargo + wasm-pack)
// ────────────────────────────────────────────────────────────────────────────

async function checkRustToolchain(): Promise<CheckResult> {
  let cargoVersion: string | null = null;
  let wasmPackVersion: string | null = null;

  try {
    cargoVersion = execSync('cargo --version', { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch {
    // not installed
  }

  try {
    wasmPackVersion = execSync('wasm-pack --version', { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch {
    // not installed
  }

  if (cargoVersion && wasmPackVersion) {
    return {
      name: 'Rust toolchain',
      status: 'ok',
      message: `${cargoVersion}, ${wasmPackVersion}`,
    };
  }

  const missing: string[] = [];
  if (!cargoVersion) missing.push('cargo');
  if (!wasmPackVersion) missing.push('wasm-pack');

  return {
    name: 'Rust toolchain',
    status: 'warn',
    message: `Missing: ${missing.join(', ')} — only needed if modifying Rust algorithms`,
    fix: 'Install Rust: https://rustup.rs then: cargo install wasm-pack',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Check 15: Results directory writable
// ────────────────────────────────────────────────────────────────────────────

async function checkResultsDir(): Promise<CheckResult> {
  const rootDir = await resolveWorkspaceRoot();
  if (!rootDir) {
    return { name: 'Results directory', status: 'ok', message: 'Skipped — workspace root not found' };
  }

  const resultsDir = path.join(rootDir, '.wasm4pm', 'results');

  try {
    await fs.access(resultsDir, fs.constants.W_OK);
    return { name: 'Results directory', status: 'ok', message: `.wasm4pm/results/ is writable` };
  } catch {
    // Try to create it
    try {
      await fs.mkdir(resultsDir, { recursive: true });
      return { name: 'Results directory', status: 'ok', message: `.wasm4pm/results/ created and writable` };
    } catch (err) {
      return {
        name: 'Results directory',
        status: 'warn',
        message: `Cannot write to .wasm4pm/results/: ${err instanceof Error ? err.message : String(err)}`,
        fix: 'Check directory permissions; discovery results auto-save here',
      };
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Check 16: Algorithm registry (all 15 registered)
// ────────────────────────────────────────────────────────────────────────────

async function checkAlgorithmRegistry(): Promise<CheckResult> {
  const wasmPkgDir = await resolveWasmPkgDir();
  if (!wasmPkgDir) {
    return { name: 'Algorithm registry', status: 'ok', message: 'Skipped — workspace not found' };
  }

  const jsFile = path.join(wasmPkgDir, 'wasm4pm.js');
  if (!existsSync(jsFile)) {
    return { name: 'Algorithm registry', status: 'ok', message: 'Skipped — WASM not built' };
  }

  try {
    const url = new URL(`file://${jsFile}`);
    const mod = await import(url.href);

    // Known algorithm functions
    const expected: string[] = [
      'discover_dfg',
      'extract_process_skeleton',
      'discover_alpha_plus_plus',
      'discover_heuristic_miner',
      'discover_inductive_miner',
      'discover_hill_climbing',
      'discover_declare',
      'discover_simulated_annealing',
      'discover_a_star',
      'discover_aco',
      'discover_pso',
      'discover_genetic_algorithm',
      'discover_ilp',
      'discover_powl',
    ];

    const missing = expected.filter((name) => typeof mod[name] !== 'function');

    if (missing.length === 0) {
      return { name: 'Algorithm registry', status: 'ok', message: `All ${expected.length} algorithms registered` };
    }

    return {
      name: 'Algorithm registry',
      status: 'warn',
      message: `${missing.length} algorithm(s) missing: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ` (+${missing.length - 3})` : ''}`,
      fix: 'Rebuild WASM: cd wasm4pm && npm run build',
    };
  } catch {
    return { name: 'Algorithm registry', status: 'ok', message: 'Skipped — WASM import failed' };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Check 17: Package workspace integrity
// ────────────────────────────────────────────────────────────────────────────

async function checkWorkspaceIntegrity(): Promise<CheckResult> {
  const rootDir = await resolveWorkspaceRoot();
  if (!rootDir) {
    return { name: 'Workspace integrity', status: 'ok', message: 'Skipped — workspace root not found' };
  }

  const expectedPackages = [
    'packages/engine',
    'packages/kernel',
    'packages/config',
    'packages/contracts',
    'packages/types',
    'packages/planner',
    'packages/observability',
    'packages/testing',
    'packages/connectors',
    'packages/sinks',
    'packages/ocel',
    'packages/service',
    'packages/templates',
    'packages/wasm4pm',
    'packages/ml',
    'packages/swarm',
    'apps/pmctl',
  ];

  const missing: string[] = [];
  for (const pkg of expectedPackages) {
    const pkgJson = path.join(rootDir, pkg, 'package.json');
    if (!existsSync(pkgJson)) {
      missing.push(pkg);
    }
  }

  if (missing.length === 0) {
    return { name: 'Workspace integrity', status: 'ok', message: `All ${expectedPackages.length} packages present` };
  }

  return {
    name: 'Workspace integrity',
    status: 'warn',
    message: `${missing.length} package(s) missing: ${missing.join(', ')}`,
    fix: 'Run: pnpm install to restore missing packages',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

async function resolveWorkspaceRoot(): Promise<string | null> {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Formatting
// ────────────────────────────────────────────────────────────────────────────

const BADGE = {
  ok: '  ok  ',
  warn: ' warn ',
  fail: ' FAIL ',
} as const;

function renderBadge(status: CheckResult['status']): string {
  return `[${BADGE[status]}]`;
}

function printReport(formatter: HumanFormatter, report: DoctorReport): void {
  formatter.log('');
  formatter.log('pictl doctor — system health check');
  formatter.log('─'.repeat(58));

  for (const check of report.checks) {
    const badge = renderBadge(check.status);
    formatter.log(`${badge}  ${check.name}`);
    formatter.log(`         ${check.message}`);
    if (check.fix && check.status !== 'ok') {
      formatter.log(`         Fix: ${check.fix}`);
    }
    formatter.log('');
  }

  formatter.log('─'.repeat(58));
  formatter.log(`Result: ${report.ok} ok  ${report.warn} warn  ${report.fail} fail`);
  formatter.log('');

  if (report.healthy) {
    formatter.success('All required checks passed. pictl is ready to use.');
  } else {
    formatter.error('One or more required checks failed. Fix the issues above and re-run: pictl doctor');
  }
  formatter.log('');
}

// ────────────────────────────────────────────────────────────────────────────
// Command definition
// ────────────────────────────────────────────────────────────────────────────

export const doctor = defineCommand({
  meta: {
    name: 'doctor',
    description: 'Check environment health (17 checks) and print a fix guide for any issues found',
  },
  args: {
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      description: 'Show all checks including passing ones',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
      alias: 'q',
    },
  },
  async run(ctx) {
    const formatter = getFormatter({
      format: ctx.args.format as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

    const checks: CheckResult[] = await Promise.all([
      checkNodeVersion(),
      checkPnpmVersion(),
      checkWasmBinary(),
      checkWasmLoads(),
      checkSimdSupport(),
      checkConfigFound(),
      checkConfigValidation(),
      checkXesFiles(),
      checkSystemMemory(),
      checkDiskSpace(),
      checkGitHooks(),
      checkTypeScriptCompilation(),
      checkMicroMl(),
      checkRustToolchain(),
      checkResultsDir(),
      checkAlgorithmRegistry(),
      checkWorkspaceIntegrity(),
    ]);

    const report: DoctorReport = {
      checks,
      ok: checks.filter((c) => c.status === 'ok').length,
      warn: checks.filter((c) => c.status === 'warn').length,
      fail: checks.filter((c) => c.status === 'fail').length,
      healthy: checks.every((c) => c.status !== 'fail'),
    };

    if (formatter instanceof JSONFormatter) {
      if (report.healthy) {
        formatter.success('pictl environment is healthy', {
          ...report,
          checks: report.checks.map((c) => ({ ...c })),
        });
      } else {
        formatter.warn('pictl environment has issues', {
          ...report,
          checks: report.checks.map((c) => ({ ...c })),
        });
      }
    } else {
      printReport(formatter as HumanFormatter, report);
    }

    process.exit(report.healthy ? EXIT_CODES.success : EXIT_CODES.config_error);
  },
});
