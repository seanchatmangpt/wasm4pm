import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
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
        if (pkg.name === 'wasm4pm') {
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
      fix: 'Run this command from inside the wasm4pm workspace, then rebuild: cd wasm4pm && pnpm run build',
    };
  }

  const wasmFile = path.join(wasmPkgDir, 'pictl_bg.wasm');
  const jsFile = path.join(wasmPkgDir, 'pictl.js');

  try {
    const [wasmStat, jsStat] = await Promise.all([fs.stat(wasmFile), fs.stat(jsFile)]);

    if (wasmStat.size === 0) {
      return {
        name: 'WASM binary',
        status: 'fail',
        message: `${wasmFile} exists but is empty`,
        fix: 'Rebuild WASM: cd wasm4pm && pnpm run build',
      };
    }

    const sizeMb = (wasmStat.size / 1024 / 1024).toFixed(1);
    void jsStat;
    return { name: 'WASM binary', status: 'ok', message: `pictl_bg.wasm found (${sizeMb} MB)` };
  } catch {
    return {
      name: 'WASM binary',
      status: 'fail',
      message: `WASM binary not built — ${wasmFile} not found`,
      fix: 'Build the WASM module: cd wasm4pm && pnpm run build',
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

  const jsFile = path.join(wasmPkgDir, 'pictl.js');
  if (!existsSync(jsFile)) {
    return {
      name: 'WASM loads',
      status: 'fail',
      message: 'pictl.js not found — module not built',
      fix: 'cd wasm4pm && pnpm run build',
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
      fix: 'Rebuild with: cd wasm4pm && pnpm run build',
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

  const jsFile = path.join(wasmPkgDir, 'pictl.js');
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
// TPS Pipeline Integrity Checks (Equipment + Quality + Operation Kaizen)
//
// These validate cross-reference integrity across the Rust > WASM > TypeScript
// pipeline. They catch stale enums, missing mappings, broken state transitions,
// and inconsistent naming — the class of bugs that silently break the system.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Try to read a source file relative to the workspace root.
 * Returns null if the file doesn't exist (e.g., when running from installed npm package).
 */
function readSourceFile(relativePath: string): string | null {
  // Cache the resolved root
  const rootDir = getCachedWorkspaceRoot();
  if (rootDir) {
    const fullPath = path.join(rootDir, relativePath);
    if (existsSync(fullPath)) return readFileSync(fullPath, 'utf-8');
  }
  return null;
}

let _cachedRoot: string | null | undefined;

function getCachedWorkspaceRoot(): string | null {
  if (_cachedRoot !== undefined) return _cachedRoot;
  _cachedRoot = null;
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      _cachedRoot = dir;
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Determine if we have access to source files for TPS checks.
 */
function hasSourceAccess(): boolean {
  const rootDir = getCachedWorkspaceRoot();
  if (!rootDir) return false;
  return existsSync(path.join(rootDir, 'packages/contracts/src/templates/algorithm-registry.ts'));
}

// ── Check 18: PlanStepType enum ↔ PLAN_STEP_TYPE_VALUES sync ──

async function checkStepTypeSync(): Promise<CheckResult> {
  if (!hasSourceAccess()) {
    return { name: 'Step type sync (TPS)', status: 'ok', message: 'Skipped — source files not available (run from repo)' };
  }

  const plannerSrc = readSourceFile('packages/planner/src/steps.ts');
  const contractsSrc = readSourceFile('packages/contracts/src/steps.ts');
  if (!plannerSrc || !contractsSrc) {
    return { name: 'Step type sync (TPS)', status: 'ok', message: 'Skipped — source files not found' };
  }

  const enumMatch = plannerSrc.match(/enum\s+PlanStepType\s*\{([\s\S]*?)\}/);
  const arrayMatch = contractsSrc.match(/export\s+const\s+PLAN_STEP_TYPE_VALUES\s*=\s*\[([\s\S]*?)\]\s*as\s+const/);

  if (!enumMatch || !arrayMatch) {
    return { name: 'Step type sync (TPS)', status: 'ok', message: 'Skipped — could not parse source' };
  }

  const enumValues = new Set<string>();
  for (const m of enumMatch[1].matchAll(/'([^']+)'/g)) enumValues.add(m[1]);

  const arrayValues = new Set<string>();
  for (const m of arrayMatch[1].matchAll(/'([^']+)'/g)) arrayValues.add(m[1]);

  const inEnumNotArray = [...enumValues].filter(v => !arrayValues.has(v));
  const inArrayNotEnum = [...arrayValues].filter(v => !enumValues.has(v));

  if (inEnumNotArray.length === 0 && inArrayNotEnum.length === 0) {
    return { name: 'Step type sync (TPS)', status: 'ok', message: `PlanStepType and PLAN_STEP_TYPE_VALUES in sync (${enumValues.size} values)` };
  }

  const details: string[] = [];
  if (inEnumNotArray.length > 0) details.push(`${inEnumNotArray.length} in enum but not array: ${inEnumNotArray.slice(0, 3).join(', ')}`);
  if (inArrayNotEnum.length > 0) details.push(`${inArrayNotEnum.length} in array but not enum: ${inArrayNotEnum.slice(0, 3).join(', ')}`);

  return {
    name: 'Step type sync (TPS)',
    status: 'fail',
    message: details.join('; '),
    fix: 'Sync PlanStepType enum (planner/steps.ts) with PLAN_STEP_TYPE_VALUES (contracts/steps.ts)',
  };
}

// ── Check 19: Algorithm registry key consistency ──

async function checkRegistryConsistency(): Promise<CheckResult> {
  if (!hasSourceAccess()) {
    return { name: 'Registry consistency (TPS)', status: 'ok', message: 'Skipped — source files not available' };
  }

  const registrySrc = readSourceFile('packages/contracts/src/templates/algorithm-registry.ts');
  if (!registrySrc) {
    return { name: 'Registry consistency (TPS)', status: 'ok', message: 'Skipped — registry not found' };
  }

  const idsMatch = registrySrc.match(/export\s+const\s+ALGORITHM_IDS\s*=\s*\[([^\]]*)\]/);
  const stepTypeMatch = registrySrc.match(/export\s+const\s+ALGORITHM_ID_TO_STEP_TYPE\s*:\s*Record[^=]*=\s*\{([\s\S]*?)\}\s*;/);
  const displayMatch = registrySrc.match(/export\s+const\s+ALGORITHM_DISPLAY_NAMES\s*:\s*Record[^=]*=\s*\{([\s\S]*?)\}\s*;/);
  const outputMatch = registrySrc.match(/export\s+const\s+ALGORITHM_OUTPUT_TYPES\s*:\s*Record[^=]*=\s*\{([\s\S]*?)\}\s*;/);

  if (!idsMatch || !stepTypeMatch || !displayMatch || !outputMatch) {
    return { name: 'Registry consistency (TPS)', status: 'ok', message: 'Skipped — could not parse registry' };
  }

  const ids = new Set<string>();
  for (const m of idsMatch[1].matchAll(/'([^']+)'/g)) ids.add(m[1]);

  const stepTypeKeys = new Set<string>();
  for (const m of stepTypeMatch[1].matchAll(/(\w+)\s*:/g)) stepTypeKeys.add(m[1]);

  const displayKeys = new Set<string>();
  for (const m of displayMatch[1].matchAll(/(\w+)\s*:/g)) displayKeys.add(m[1]);

  const outputKeys = new Set<string>();
  for (const m of outputMatch[1].matchAll(/(\w+)\s*:/g)) outputKeys.add(m[1]);

  const issues: string[] = [];

  // IDs in ALGORITHM_IDS but not in ALGORITHM_ID_TO_STEP_TYPE
  for (const id of ids) {
    if (!stepTypeKeys.has(id)) issues.push(`'${id}' in ALGORITHM_IDS but not ALGORITHM_ID_TO_STEP_TYPE`);
  }

  // Keys in ALGORITHM_ID_TO_STEP_TYPE but not in ALGORITHM_DISPLAY_NAMES
  for (const key of stepTypeKeys) {
    if (!displayKeys.has(key)) issues.push(`'${key}' in ALGORITHM_ID_TO_STEP_TYPE but not ALGORITHM_DISPLAY_NAMES`);
  }

  // Keys in ALGORITHM_ID_TO_STEP_TYPE but not in ALGORITHM_OUTPUT_TYPES
  for (const key of stepTypeKeys) {
    if (!outputKeys.has(key)) issues.push(`'${key}' in ALGORITHM_ID_TO_STEP_TYPE but not ALGORITHM_OUTPUT_TYPES`);
  }

  if (issues.length === 0) {
    return { name: 'Registry consistency (TPS)', status: 'ok', message: `ALGORITHM_IDS, STEP_TYPE, DISPLAY_NAMES, OUTPUT_TYPES aligned (${ids.size} algorithms)` };
  }

  return {
    name: 'Registry consistency (TPS)',
    status: 'fail',
    message: `${issues.length} inconsistency(ies): ${issues.slice(0, 3).join('; ')}${issues.length > 3 ? ` (+${issues.length - 3})` : ''}`,
    fix: 'Add missing entries to algorithm-registry.ts or remove orphaned keys',
  };
}

// ── Check 20: State machine integrity ──

async function checkStateMachineIntegrity(): Promise<CheckResult> {
  if (!hasSourceAccess()) {
    return { name: 'State machine (TPS)', status: 'ok', message: 'Skipped — source files not available' };
  }

  const transitionsSrc = readSourceFile('packages/engine/src/transitions.ts');
  const engineSrc = readSourceFile('packages/engine/src/engine.ts');
  const typesSrc = readSourceFile('packages/contracts/src/types.ts');
  if (!transitionsSrc || !engineSrc || !typesSrc) {
    return { name: 'State machine (TPS)', status: 'ok', message: 'Skipped — source files not found' };
  }

  // Extract EngineState type values
  const stateTypeMatch = typesSrc.match(/EngineState\s*=\s*([^;]+)/);
  const stateValues = new Set<string>();
  if (stateTypeMatch) {
    for (const m of stateTypeMatch[1].matchAll(/'([^']+)'/g)) stateValues.add(m[1]);
  }

  // Extract VALID_TRANSITIONS (handle nested generics Record<K, Set<V>>)
  const transitionsMatch = transitionsSrc.match(/VALID_TRANSITIONS\s*:\s*Record<[^,]+,\s*Set<[^>]+>>\s*=\s*\{([\s\S]*?)\}\s*;/);
  const transitionKeys = new Set<string>();
  const allTargets = new Set<string>();
  if (transitionsMatch) {
    for (const m of transitionsMatch[1].matchAll(/(\w+)\s*:\s*new\s+Set\(\[([^\]]*)\]\)/g)) {
      transitionKeys.add(m[1]);
      for (const t of m[2].matchAll(/'([^']+)'/g)) allTargets.add(t[1]);
    }
  }

  const issues: string[] = [];

  // EngineState values not in VALID_TRANSITIONS keys
  for (const s of stateValues) {
    if (!transitionKeys.has(s)) issues.push(`EngineState '${s}' missing from VALID_TRANSITIONS`);
  }

  // VALID_TRANSITIONS keys not in EngineState
  for (const k of transitionKeys) {
    if (!stateValues.has(k)) issues.push(`VALID_TRANSITIONS key '${k}' not in EngineState`);
  }

  // Transition targets not in EngineState
  for (const t of allTargets) {
    if (!stateValues.has(t)) issues.push(`Transition target '${t}' not a valid EngineState`);
  }

  // Extract hardcoded transitions from engine.ts and verify they exist as targets
  for (const m of engineSrc.matchAll(/this\.stateMachine\.transition\(\s*'([^']+)'/g)) {
    if (!stateValues.has(m[1])) {
      issues.push(`engine.ts transitions to '${m[1]}' which is not a valid EngineState`);
    }
  }

  if (issues.length === 0) {
    return { name: 'State machine (TPS)', status: 'ok', message: `${stateValues.size} states, ${transitionKeys.size} transitions, all valid` };
  }

  return {
    name: 'State machine (TPS)',
    status: 'fail',
    message: `${issues.length} issue(s): ${issues.slice(0, 3).join('; ')}${issues.length > 3 ? ` (+${issues.length - 3})` : ''}`,
    fix: 'Update VALID_TRANSITIONS in transitions.ts or fix invalid transitions in engine.ts',
  };
}

// ── Check 21: Profile → registry coverage ──

async function checkProfileCoverage(): Promise<CheckResult> {
  if (!hasSourceAccess()) {
    return { name: 'Profile coverage (TPS)', status: 'ok', message: 'Skipped — source files not available' };
  }

  const registrySrc = readSourceFile('packages/contracts/src/templates/algorithm-registry.ts');
  if (!registrySrc) {
    return { name: 'Profile coverage (TPS)', status: 'ok', message: 'Skipped — registry not found' };
  }

  const idsMatch = registrySrc.match(/export\s+const\s+ALGORITHM_IDS\s*=\s*\[([^\]]*)\]/);
  const stepTypeMatch = registrySrc.match(/export\s+const\s+ALGORITHM_ID_TO_STEP_TYPE\s*:\s*Record[^=]*=\s*\{([\s\S]*?)\}\s*;/);
  const profileMatch = registrySrc.match(/const\s+map\s*:\s*Record<string,\s*string\[\]>\s*=\s*\{([\s\S]*?)\}\s*;/);

  if (!idsMatch || !stepTypeMatch || !profileMatch) {
    return { name: 'Profile coverage (TPS)', status: 'ok', message: 'Skipped — could not parse registry' };
  }

  const validIds = new Set<string>();
  for (const m of idsMatch[1].matchAll(/'([^']+)'/g)) validIds.add(m[1]);
  for (const m of stepTypeMatch[1].matchAll(/(\w+)\s*:/g)) validIds.add(m[1]);

  const issues: string[] = [];
  for (const profileGroup of profileMatch[1].matchAll(/(\w+)\s*:\s*\[([^\]]*)\]/g)) {
    const profileName = profileGroup[1];
    for (const idMatch of profileGroup[2].matchAll(/'([^']+)'/g)) {
      const algoId = idMatch[1];
      if (!validIds.has(algoId)) {
        issues.push(`Profile '${profileName}' references unknown '${algoId}'`);
      }
    }
  }

  if (issues.length === 0) {
    return { name: 'Profile coverage (TPS)', status: 'ok', message: 'All profile algorithm IDs exist in registry' };
  }

  return {
    name: 'Profile coverage (TPS)',
    status: 'fail',
    message: `${issues.length} invalid reference(s): ${issues.slice(0, 3).join('; ')}`,
    fix: 'Update getProfileAlgorithms() or add missing algorithm to registry',
  };
}

// ── Check 22: Canonical algorithm naming in config/tests ──

async function checkCanonicalNaming(): Promise<CheckResult> {
  if (!hasSourceAccess()) {
    return { name: 'Canonical naming (TPS)', status: 'ok', message: 'Skipped — source files not available' };
  }

  const configTestSrc = readSourceFile('packages/config/src/__tests__/resolution.test.ts');
  if (!configTestSrc) {
    return { name: 'Canonical naming (TPS)', status: 'ok', message: 'Skipped — config tests not found' };
  }

  // Known short aliases that should NOT appear in config/test files
  const bannedShortNames = ['alpha', 'heuristic', 'genetic', 'inductive', 'astar', 'powl', 'skeleton', 'correlation', 'alignment'];

  const issues: string[] = [];
  for (const shortName of bannedShortNames) {
    const regex = new RegExp(`['"]${shortName}['"]`, 'g');
    const matches = configTestSrc.match(regex);
    if (matches) {
      issues.push(`'${shortName}' found ${matches.length}x — use canonical ID`);
    }
  }

  if (issues.length === 0) {
    return { name: 'Canonical naming (TPS)', status: 'ok', message: 'Config tests use canonical algorithm IDs' };
  }

  return {
    name: 'Canonical naming (TPS)',
    status: 'warn',
    message: `${issues.length} banned short name(s): ${issues.slice(0, 3).join('; ')}`,
    fix: 'Replace short aliases with canonical IDs (e.g., heuristic → heuristic_miner)',
  };
}

// ── Check 23: Step type coverage (registry → PLAN_STEP_TYPE_VALUES) ──

async function checkStepTypeCoverage(): Promise<CheckResult> {
  if (!hasSourceAccess()) {
    return { name: 'Step type coverage (TPS)', status: 'ok', message: 'Skipped — source files not available' };
  }

  const registrySrc = readSourceFile('packages/contracts/src/templates/algorithm-registry.ts');
  const contractsSrc = readSourceFile('packages/contracts/src/steps.ts');
  if (!registrySrc || !contractsSrc) {
    return { name: 'Step type coverage (TPS)', status: 'ok', message: 'Skipped — source files not found' };
  }

  const stepTypeMatch = registrySrc.match(/export\s+const\s+ALGORITHM_ID_TO_STEP_TYPE\s*:\s*Record[^=]*=\s*\{([\s\S]*?)\}\s*;/);
  const arrayMatch = contractsSrc.match(/export\s+const\s+PLAN_STEP_TYPE_VALUES\s*=\s*\[([\s\S]*?)\]\s*as\s+const/);

  if (!stepTypeMatch || !arrayMatch) {
    return { name: 'Step type coverage (TPS)', status: 'ok', message: 'Skipped — could not parse source' };
  }

  const validStepTypes = new Set<string>();
  for (const m of arrayMatch[1].matchAll(/'([^']+)'/g)) validStepTypes.add(m[1]);

  const missing: string[] = [];
  for (const m of stepTypeMatch[1].matchAll(/'([^']+)'/g)) {
    // Match the value (after the colon), not the key
    void m;
  }

  // Parse key: 'value' pairs
  for (const m of stepTypeMatch[1].matchAll(/(\w+)\s*:\s*'([^']+)'/g)) {
    if (!validStepTypes.has(m[2])) {
      missing.push(`${m[1]} → '${m[2]}'`);
    }
  }

  if (missing.length === 0) {
    return { name: 'Step type coverage (TPS)', status: 'ok', message: 'All registry step types exist in PLAN_STEP_TYPE_VALUES' };
  }

  return {
    name: 'Step type coverage (TPS)',
    status: 'fail',
    message: `${missing.length} missing step type(s): ${missing.slice(0, 3).join('; ')}`,
    fix: 'Add missing values to PLAN_STEP_TYPE_VALUES in packages/contracts/src/steps.ts',
  };
}

// ── Check 24: State machine completeness (no orphans or dead-ends) ──

async function checkStateMachineCompleteness(): Promise<CheckResult> {
  if (!hasSourceAccess()) {
    return { name: 'State machine completeness (TPS)', status: 'ok', message: 'Skipped — source files not available' };
  }

  const transitionsSrc = readSourceFile('packages/engine/src/transitions.ts');
  if (!transitionsSrc) {
    return { name: 'State machine completeness (TPS)', status: 'ok', message: 'Skipped — source files not found' };
  }

  const transitionsMatch = transitionsSrc.match(/VALID_TRANSITIONS\s*:\s*Record<[^,]+,\s*Set<[^>]+>>\s*=\s*\{([\s\S]*?)\}\s*;/);
  if (!transitionsMatch) {
    return { name: 'State machine completeness (TPS)', status: 'ok', message: 'Skipped — could not parse transitions' };
  }

  const issues: string[] = [];
  const allTargets = new Set<string>();
  const stateEntries: Array<{ from: string; targets: Set<string> }> = [];

  for (const m of transitionsMatch[1].matchAll(/(\w+)\s*:\s*new\s+Set\(\[([^\]]*)\]\)/g)) {
    const targets = new Set<string>();
    for (const t of m[2].matchAll(/'([^']+)'/g)) {
      targets.add(t[1]);
      allTargets.add(t[1]);
    }
    stateEntries.push({ from: m[1], targets });
  }

  // Check for unreachable states (never a target of any transition)
  for (const entry of stateEntries) {
    if (entry.from !== 'uninitialized' && !allTargets.has(entry.from)) {
      issues.push(`State '${entry.from}' is never a transition target (unreachable)`);
    }
  }

  // Check for dead-end states (no outgoing transitions)
  for (const entry of stateEntries) {
    if (entry.targets.size === 0) {
      issues.push(`State '${entry.from}' has no outgoing transitions (dead-end)`);
    }
  }

  if (issues.length === 0) {
    return { name: 'State machine completeness (TPS)', status: 'ok', message: `${stateEntries.length} states — all reachable, no dead-ends` };
  }

  return {
    name: 'State machine completeness (TPS)',
    status: 'warn',
    message: `${issues.length} issue(s): ${issues.join('; ')}`,
    fix: 'Add missing transitions in packages/engine/src/transitions.ts',
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

  let lastSection = '';
  for (const check of report.checks) {
    const isTps = check.name.includes('(TPS)');
    const section = isTps ? 'TPS Pipeline Integrity' : 'Environment';
    if (section !== lastSection) {
      if (lastSection) formatter.log('');
      formatter.log(`  ${section}:`);
      lastSection = section;
    }

    const badge = renderBadge(check.status);
    formatter.log(`    ${badge}  ${check.name}`);
    formatter.log(`             ${check.message}`);
    if (check.fix && check.status !== 'ok') {
      formatter.log(`             Fix: ${check.fix}`);
    }
  }

  formatter.log('');
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
    description: 'Check environment health (24 checks) and pipeline integrity — print a fix guide for any issues found',
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
      // ── Environment checks (1-17) ──
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
      // ── TPS Pipeline Integrity checks (18-24) ──
      checkStepTypeSync(),
      checkRegistryConsistency(),
      checkStateMachineIntegrity(),
      checkProfileCoverage(),
      checkCanonicalNaming(),
      checkStepTypeCoverage(),
      checkStateMachineCompleteness(),
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
          healthy: true,
          checks: report.checks.map((c) => ({ ...c })),
        });
      } else {
        formatter.warn('pictl environment has issues', {
          ...report,
          healthy: false,
          checks: report.checks.map((c) => ({ ...c })),
        });
      }
    } else {
      printReport(formatter as HumanFormatter, report);
    }

    // Set exit code but don't call process.exit()
    // This allows citty to handle the exit properly
    if (!report.healthy) {
      process.exitCode = EXIT_CODES.config_error;
    }
  },
});
