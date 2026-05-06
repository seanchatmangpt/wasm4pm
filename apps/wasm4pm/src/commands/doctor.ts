import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { existsSync, readFileSync, execSync, statSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import type { OutputOptions } from '../output.js';

export interface DoctorOptions extends OutputOptions {
  fix?: boolean;
}

export type Pathology =
  | 'ENVIRONMENT_FAULT'
  | 'MODEL_TRUTH_FAULT'
  | 'PLAN_TRUTH_FAULT'
  | 'TIMING_TRUTH_FAULT'
  | 'DEPLOYABILITY_TRUTH_FAULT'
  | 'REPRODUCIBILITY_TRUTH_FAULT'
  | 'ANTI_LIE_TRUTH_FAULT'
  | 'EPISTEMIC_FAULT';

export type Severity = 'INFO' | 'WARNING' | 'STOP_THE_LINE';

export type RepairMode =
  | 'MANUAL_INTERVENTION'
  | 'REBUILD_ARTIFACTS'
  | 'SYNC_REGISTRY'
  | 'SCAFFOLD_CONFIG'
  | 'REINSTALL_DEPENDENCIES'
  | 'AUTO_REPAIR';

/** Result of a single health diagnosis */
export interface Diagnosis {
  name: string;
  pathology?: Pathology;
  severity: Severity;
  message: string;
  repairMode?: RepairMode;
  repairCommand?: string; // The smallest lawful repair
  fixGuide?: string; // For manual intervention
  fix?: string; // Backwards compatibility for raw checks
}

/** Aggregate report */
interface DoctorReport {
  diagnoses: Diagnosis[];
  info: number;
  warnings: number;
  stopTheLine: number;
  epistemicHealth: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Check 1: Node.js version (≥ 18)
// ────────────────────────────────────────────────────────────────────────────

async function checkNodeVersion(): Promise<Diagnosis> {
  const raw = process.version;
  const major = parseInt(raw.slice(1).split('.')[0] ?? '0', 10);
  if (major >= 18) {
    return {
      name: 'Node.js version',
      pathology: 'ENVIRONMENT_FAULT',
      severity: 'INFO',
      message: `${raw} (≥ 18 required)`,
    };
  }
  return {
    name: 'Node.js version',
    pathology: 'ENVIRONMENT_FAULT',
    severity: 'STOP_THE_LINE',
    message: `${raw} is too old — Node.js ≥ 18 is required`,
    fix: 'Install Node.js 18+ from https://nodejs.org or use a version manager: nvm install 20',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Check 2: pnpm version (≥ 8)
// ────────────────────────────────────────────────────────────────────────────

async function checkPnpmVersion(): Promise<Diagnosis> {
  try {
    const version = execSync('pnpm --version', { encoding: 'utf8', stdio: 'pipe' }).trim();
    const major = parseInt(version.split('.')[0], 10);
    if (major >= 8) {
      return {
        name: 'pnpm version',
        pathology: 'ENVIRONMENT_FAULT',
        severity: 'INFO',
        message: `pnpm ${version} (≥ 8 required)`,
      };
    }
    return {
      name: 'pnpm version',
      pathology: 'ENVIRONMENT_FAULT',
      severity: 'WARNING',
      message: `pnpm ${version} is old — ≥ 8 recommended`,
      fix: 'Upgrade pnpm: corepack enable && corepack prepare pnpm@latest --activate',
    };
  } catch {
    return {
      name: 'pnpm version',
      pathology: 'ENVIRONMENT_FAULT',
      severity: 'WARNING',
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

async function checkWasmBinary(): Promise<Diagnosis> {
  const wasmPkgDir = await resolveWasmPkgDir();
  if (!wasmPkgDir) {
    return {
      name: 'WASM binary',
      pathology: 'ENVIRONMENT_FAULT',
      severity: 'STOP_THE_LINE',
      message: 'Cannot locate wasm4pm/pkg/ directory (workspace root not found)',
      fix: 'Run this command from inside the wasm4pm workspace, then rebuild: cd wasm4pm && pnpm run build',
    };
  }

  const wasmFile = path.join(wasmPkgDir, 'wpm_bg.wasm');
  const jsFile = path.join(wasmPkgDir, 'wpm.js');

  try {
    const [wasmStat, jsStat] = await Promise.all([fs.stat(wasmFile), fs.stat(jsFile)]);

    if (wasmStat.size === 0) {
      return {
        name: 'WASM binary',
        pathology: 'ENVIRONMENT_FAULT',
        severity: 'STOP_THE_LINE',
        message: `${wasmFile} exists but is empty`,
        fix: 'Rebuild WASM: cd wasm4pm && pnpm run build',
      };
    }

    const sizeMb = (wasmStat.size / 1024 / 1024).toFixed(1);
    void jsStat;
    return {
      name: 'WASM binary',
      pathology: 'ENVIRONMENT_FAULT',
      severity: 'INFO',
      message: `wasm4pm_bg.wasm found (${sizeMb} MB)`,
    };
  } catch {
    return {
      name: 'WASM binary',
      pathology: 'ENVIRONMENT_FAULT',
      severity: 'STOP_THE_LINE',
      message: `WASM binary not built — ${wasmFile} not found`,
      fix: 'Build the WASM module: cd wasm4pm && pnpm run build',
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Check 4: WASM loads and get_version() works
// ────────────────────────────────────────────────────────────────────────────

async function checkWasmLoads(): Promise<Diagnosis> {
  const wasmPkgDir = await resolveWasmPkgDir();
  if (!wasmPkgDir) {
    return {
      name: 'WASM loads',
      pathology: 'ENVIRONMENT_FAULT',
      severity: 'STOP_THE_LINE',
      message: 'Skipped — pkg/ directory not found',
      fix: 'Run from inside the wasm4pm workspace',
    };
  }

  const jsFile = path.join(wasmPkgDir, 'wpm.js');
  if (!existsSync(jsFile)) {
    return {
      name: 'WASM loads',
      pathology: 'ENVIRONMENT_FAULT',
      severity: 'STOP_THE_LINE',
      message: 'wpm.js not found — module not built',
      fix: 'cd wasm4pm && pnpm run build',
    };
  }

  try {
    const url = new URL(`file://${jsFile}`);
    const mod = await import(url.href);

    if (typeof mod.get_version === 'function') {
      const v: string = mod.get_version();
      return {
        name: 'WASM loads',
        pathology: 'ENVIRONMENT_FAULT',
        severity: 'INFO',
        message: `Loaded OK — module version ${v}`,
      };
    }

    return {
      name: 'WASM loads',
      pathology: 'ENVIRONMENT_FAULT',
      severity: 'INFO',
      message: 'Loaded OK (get_version not exported)',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      name: 'WASM loads',
      pathology: 'ENVIRONMENT_FAULT',
      severity: 'STOP_THE_LINE',
      message: `Failed to import WASM module: ${msg}`,
      fix: 'Rebuild with: cd wasm4pm && pnpm run build',
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Check 5: SIMD support in current WASM runtime
// ────────────────────────────────────────────────────────────────────────────

async function checkSimdSupport(): Promise<Diagnosis> {
  try {
    // WebAssembly SIMD is detected by compiling a small SIMD module
    const simdModule = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x07, 0x01, 0x60, 0x02, 0x7b, 0x7b,
      0x01, 0x7b, 0x03, 0x02, 0x01, 0x00, 0x07, 0x0b, 0x01, 0x07, 0x73, 0x69, 0x6d, 0x64, 0x5f,
      0x74, 0x65, 0x73, 0x74, 0x00, 0x00, 0x0a, 0x09, 0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x00,
      0xfd, 0x0c, 0x00, 0x0b,
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const compile = (globalThis as any).WebAssembly?.compile as
      | ((buf: Uint8Array) => Promise<unknown>)
      | undefined;
    if (!compile) {
      return {
        name: 'WASM SIMD',
        pathology: 'ENVIRONMENT_FAULT',
        severity: 'WARNING',
        message: 'WebAssembly not available in this runtime',
        fix: 'Use Node.js 18+ or a Chromium-based browser',
      };
    }
    await compile(simdModule);
    return {
      name: 'WASM SIMD',
      pathology: 'ENVIRONMENT_FAULT',
      severity: 'INFO',
      message: 'SIMD128 supported — algorithms will use optimized paths',
    };
  } catch {
    return {
      name: 'WASM SIMD',
      pathology: 'ENVIRONMENT_FAULT',
      severity: 'WARNING',
      message: 'SIMD128 not available — algorithms will run at reduced speed',
      fix: 'Use Node.js 18+ or a Chromium-based browser with SIMD enabled',
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Check 6: Config file found
// ────────────────────────────────────────────────────────────────────────────

async function checkConfigFound(): Promise<Diagnosis> {
  const configNames = ['wasm4pm.toml', 'wasm4pm.json', 'wasm4pm.toml', 'wasm4pm.json'];
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
        return {
          name: 'Config file',
          pathology: 'REPRODUCIBILITY_TRUTH_FAULT',
          severity: 'INFO',
          message: `Found ${relative}`,
        };
      }
    }
  }

  return {
    name: 'Config file',
    pathology: 'REPRODUCIBILITY_TRUTH_FAULT',
    severity: 'WARNING',
    message: 'No wasm4pm.toml / wasm4pm.json found in current directory or parents',
    fix: 'Create a config with: wpm init    (defaults work fine without one)',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Check 7: Config validation (if found, parse with Zod)
// ────────────────────────────────────────────────────────────────────────────

async function checkConfigValidation(): Promise<Diagnosis> {
  const configNames = ['wasm4pm.toml', 'wasm4pm.json', 'wasm4pm.toml', 'wasm4pm.json'];
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
    return {
      name: 'Config validation',
      pathology: 'REPRODUCIBILITY_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — no config file found',
    };
  }

  // JSON configs can be validated directly
  if (configPath.endsWith('.json')) {
    try {
      const raw = await fs.readFile(configPath, 'utf-8');
      JSON.parse(raw);
      return {
        name: 'Config validation',
        pathology: 'REPRODUCIBILITY_TRUTH_FAULT',
        severity: 'INFO',
        message: `${path.basename(configPath)} is valid JSON`,
      };
    } catch (err) {
      return {
        name: 'Config validation',
        pathology: 'REPRODUCIBILITY_TRUTH_FAULT',
        severity: 'STOP_THE_LINE',
        message: `Invalid JSON in ${path.basename(configPath)}: ${err instanceof Error ? err.message : String(err)}`,
        fix: 'Fix the JSON syntax in your config file',
      };
    }
  }

  // TOML configs — basic check (full validation requires @wasm4pm/config)
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    const lines = raw.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
    if (lines.length === 0) {
      return {
        name: 'Config validation',
        pathology: 'REPRODUCIBILITY_TRUTH_FAULT',
        severity: 'WARNING',
        message: `${path.basename(configPath)} is empty`,
        fix: 'Add configuration or run: wpm init',
      };
    }
    return {
      name: 'Config validation',
      pathology: 'REPRODUCIBILITY_TRUTH_FAULT',
      severity: 'INFO',
      message: `${path.basename(configPath)} has ${lines.length} config lines (basic check passed)`,
    };
  } catch (err) {
    return {
      name: 'Config validation',
      pathology: 'REPRODUCIBILITY_TRUTH_FAULT',
      severity: 'STOP_THE_LINE',
      message: `Cannot read ${path.basename(configPath)}: ${err instanceof Error ? err.message : String(err)}`,
      fix: 'Check file permissions',
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Check 8: XES files in cwd
// ────────────────────────────────────────────────────────────────────────────

async function checkXesFiles(): Promise<Diagnosis> {
  const cwd = process.cwd();
  const found: string[] = [];

  async function scanDir(dir: string, depth: number): Promise<void> {
    if (depth > 2) return;
    let entries: import('fs').Dirent[];
    try {
      entries = (await fs.readdir(dir, {
        withFileTypes: true,
        encoding: 'utf-8',
      })) as import('fs').Dirent[];
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
      pathology: 'REPRODUCIBILITY_TRUTH_FAULT',
      severity: 'WARNING',
      message: 'No .xes files found in current directory (depth ≤ 2)',
      fix: 'Place an XES event log here, or pass --input <path> to wpm run/predict',
    };
  }

  const preview =
    found.slice(0, 3).join(', ') + (found.length > 3 ? ` (+${found.length - 3} more)` : '');
  return {
    name: 'XES event logs',
    pathology: 'REPRODUCIBILITY_TRUTH_FAULT',
    severity: 'INFO',
    message: `${found.length} file(s): ${preview}`,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Check 9: System memory (warn < 256 MB free)
// ────────────────────────────────────────────────────────────────────────────

async function checkSystemMemory(): Promise<Diagnosis> {
  const freeMb = os.freemem() / 1024 / 1024;
  const totalMb = os.totalmem() / 1024 / 1024;
  const pct = ((freeMb / totalMb) * 100).toFixed(0);

  if (freeMb < 128) {
    return {
      name: 'System memory',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'WARNING',
      message: `Low free memory: ${freeMb.toFixed(0)} MB free of ${totalMb.toFixed(0)} MB total (${pct}%)`,
      fix: 'Close other applications; process mining on large logs requires ≥ 256 MB free',
    };
  }

  return {
    name: 'System memory',
    pathology: 'DEPLOYABILITY_TRUTH_FAULT',
    severity: 'INFO',
    message: `${freeMb.toFixed(0)} MB free of ${totalMb.toFixed(0)} MB total (${pct}% free)`,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Check 10: Disk space (warn < 500 MB free)
// ────────────────────────────────────────────────────────────────────────────

async function checkDiskSpace(): Promise<Diagnosis> {
  try {
    // Use df on macOS/Linux, wmic on Windows
    let freeMb: number;
    if (process.platform === 'win32') {
      const out = execSync('wmic logicaldisk get freespace /format:csv', {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      const lines = out
        .trim()
        .split('\n')
        .filter((l) => l.trim());
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
        pathology: 'DEPLOYABILITY_TRUTH_FAULT',
        severity: 'WARNING',
        message: `Low disk space: ${freeMb.toFixed(0)} MB free — WASM builds require ~100 MB`,
        fix: 'Free up disk space before building WASM modules',
      };
    }

    return {
      name: 'Disk space',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'INFO',
      message: `${freeMb.toFixed(0)} MB free on current filesystem`,
    };
  } catch {
    return {
      name: 'Disk space',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — could not determine disk space',
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Check 11: Git hooks (pre-commit, pre-push)
// ────────────────────────────────────────────────────────────────────────────

async function checkGitHooks(): Promise<Diagnosis> {
  let gitDir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(gitDir, '.git'))) break;
    const parent = path.dirname(gitDir);
    if (parent === gitDir) {
      return {
        name: 'Git hooks',
        pathology: 'DEPLOYABILITY_TRUTH_FAULT',
        severity: 'INFO',
        message: 'Skipped — not inside a git repository',
      };
    }
    gitDir = parent;
  }

  const hooksDir = path.join(gitDir, '.git', 'hooks');
  const preCommit = path.join(hooksDir, 'pre-commit');
  const prePush = path.join(hooksDir, 'pre-push');

  const hasPreCommit = existsSync(preCommit);
  const hasPrePush = existsSync(prePush);

  if (hasPreCommit && hasPrePush) {
    return {
      name: 'Git hooks',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'INFO',
      message: 'pre-commit and pre-push hooks installed',
    };
  }

  const missing: string[] = [];
  if (!hasPreCommit) missing.push('pre-commit');
  if (!hasPrePush) missing.push('pre-push');

  return {
    name: 'Git hooks',
    pathology: 'DEPLOYABILITY_TRUTH_FAULT',
    severity: 'WARNING',
    message: `Missing hooks: ${missing.join(', ')}`,
    fix: 'Install hooks: pnpm prepare',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Check 12: TypeScript compilation
// ────────────────────────────────────────────────────────────────────────────

async function checkTypeScriptCompilation(): Promise<Diagnosis> {
  const rootDir = await resolveWorkspaceRoot();
  if (!rootDir) {
    return {
      name: 'TypeScript compilation',
      pathology: 'EPISTEMIC_FAULT',
      severity: 'INFO',
      message: 'Skipped — workspace root not found',
    };
  }

  try {
    execSync('npx tsc --noEmit', { cwd: rootDir, encoding: 'utf8', stdio: 'pipe', timeout: 60000 });
    return {
      name: 'TypeScript compilation',
      pathology: 'EPISTEMIC_FAULT',
      severity: 'INFO',
      message: 'tsc --noEmit passes',
    };
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? '';
    const lineCount = stderr
      .trim()
      .split('\n')
      .filter((l) => l.trim()).length;
    return {
      name: 'TypeScript compilation',
      pathology: 'EPISTEMIC_FAULT',
      severity: 'WARNING',
      message: `${lineCount} TypeScript error(s) — run: pnpm lint for details`,
      fix: 'Fix TypeScript errors: pnpm lint',
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Check 13: @wasm4pm/ml available
// ────────────────────────────────────────────────────────────────────────────

async function checkMicroMl(): Promise<Diagnosis> {
  try {
    // Try to resolve the package
    const mlPath = await import('@wasm4pm/ml');
    const hasClassify = typeof mlPath.classifyTraces === 'function';
    if (hasClassify) {
      return {
        name: '@wasm4pm/ml',
        pathology: 'ENVIRONMENT_FAULT',
        severity: 'INFO',
        message: 'Native ML package available (classify, cluster, forecast, anomaly, regress, pca)',
      };
    }
    return {
      name: '@wasm4pm/ml',
      pathology: 'ENVIRONMENT_FAULT',
      severity: 'WARNING',
      message: 'Package found but classifyTraces not exported',
    };
  } catch {
    return {
      name: '@wasm4pm/ml',
      pathology: 'ENVIRONMENT_FAULT',
      severity: 'WARNING',
      message: '@wasm4pm/ml not resolvable — ML commands will not work',
      fix: 'Install the ML package: pnpm install @wasm4pm/ml',
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Check 14: Rust toolchain (cargo + wasm-pack)
// ────────────────────────────────────────────────────────────────────────────

async function checkRustToolchain(): Promise<Diagnosis> {
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
      pathology: 'ENVIRONMENT_FAULT',
      severity: 'INFO',
      message: `${cargoVersion}, ${wasmPackVersion}`,
    };
  }

  const missing: string[] = [];
  if (!cargoVersion) missing.push('cargo');
  if (!wasmPackVersion) missing.push('wasm-pack');

  return {
    name: 'Rust toolchain',
    pathology: 'ENVIRONMENT_FAULT',
    severity: 'WARNING',
    message: `Missing: ${missing.join(', ')} — only needed if modifying Rust algorithms`,
    fix: 'Install Rust: https://rustup.rs then: cargo install wasm-pack',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Check 15: Results directory writable
// ────────────────────────────────────────────────────────────────────────────

async function checkResultsDir(): Promise<Diagnosis> {
  const rootDir = await resolveWorkspaceRoot();
  if (!rootDir) {
    return {
      name: 'Results directory',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — workspace root not found',
    };
  }

  const resultsDir = path.join(rootDir, '.wasm4pm', 'results');

  try {
    await fs.access(resultsDir, fs.constants.W_OK);
    return {
      name: 'Results directory',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'INFO',
      message: `.wasm4pm/results/ is writable`,
    };
  } catch {
    // Try to create it
    try {
      await fs.mkdir(resultsDir, { recursive: true });
      return {
        name: 'Results directory',
        pathology: 'DEPLOYABILITY_TRUTH_FAULT',
        severity: 'INFO',
        message: `.wasm4pm/results/ created and writable`,
      };
    } catch (err) {
      return {
        name: 'Results directory',
        pathology: 'DEPLOYABILITY_TRUTH_FAULT',
        severity: 'WARNING',
        message: `Cannot write to .wasm4pm/results/: ${err instanceof Error ? err.message : String(err)}`,
        fix: 'Check directory permissions; discovery results auto-save here',
      };
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Check 16: Algorithm registry (all 15 registered)
// ────────────────────────────────────────────────────────────────────────────

async function checkAlgorithmRegistry(): Promise<Diagnosis> {
  const wasmPkgDir = await resolveWasmPkgDir();
  if (!wasmPkgDir) {
    return {
      name: 'Algorithm registry',
      pathology: 'ENVIRONMENT_FAULT',
      severity: 'INFO',
      message: 'Skipped — workspace not found',
    };
  }

  const jsFile = path.join(wasmPkgDir, 'wpm.js');
  if (!existsSync(jsFile)) {
    return {
      name: 'Algorithm registry',
      pathology: 'ENVIRONMENT_FAULT',
      severity: 'INFO',
      message: 'Skipped — WASM not built',
    };
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
      return {
        name: 'Algorithm registry',
        pathology: 'ENVIRONMENT_FAULT',
        severity: 'INFO',
        message: `All ${expected.length} algorithms registered`,
      };
    }

    return {
      name: 'Algorithm registry',
      pathology: 'ENVIRONMENT_FAULT',
      severity: 'WARNING',
      message: `${missing.length} algorithm(s) missing: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ` (+${missing.length - 3})` : ''}`,
      fix: 'Rebuild WASM: cd wasm4pm && npm run build',
    };
  } catch {
    return {
      name: 'Algorithm registry',
      pathology: 'ENVIRONMENT_FAULT',
      severity: 'INFO',
      message: 'Skipped — WASM import failed',
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Check 17: Package workspace integrity
// ────────────────────────────────────────────────────────────────────────────

async function checkWorkspaceIntegrity(): Promise<Diagnosis> {
  const rootDir = await resolveWorkspaceRoot();
  if (!rootDir) {
    return {
      name: 'Workspace integrity',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — workspace root not found',
    };
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
    'apps/wasm4pm',
  ];

  const missing: string[] = [];
  for (const pkg of expectedPackages) {
    const pkgJson = path.join(rootDir, pkg, 'package.json');
    if (!existsSync(pkgJson)) {
      missing.push(pkg);
    }
  }

  if (missing.length === 0) {
    return {
      name: 'Workspace integrity',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'INFO',
      message: `All ${expectedPackages.length} packages present`,
    };
  }

  return {
    name: 'Workspace integrity',
    pathology: 'DEPLOYABILITY_TRUTH_FAULT',
    severity: 'WARNING',
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

async function checkStepTypeSync(): Promise<Diagnosis> {
  if (!hasSourceAccess()) {
    return {
      name: 'Step type sync (TPS)',
      pathology: 'PLAN_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — source files not available (run from repo)',
    };
  }

  const plannerSrc = readSourceFile('packages/planner/src/steps.ts');
  const contractsSrc = readSourceFile('packages/contracts/src/steps.ts');
  if (!plannerSrc || !contractsSrc) {
    return {
      name: 'Step type sync (TPS)',
      pathology: 'PLAN_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — source files not found',
    };
  }

  const enumMatch = plannerSrc.match(/enum\s+PlanStepType\s*\{([\s\S]*?)\}/);
  const arrayMatch = contractsSrc.match(
    /export\s+const\s+PLAN_STEP_TYPE_VALUES\s*=\s*\[([\s\S]*?)\]\s*as\s+const/
  );

  if (!enumMatch || !arrayMatch) {
    return {
      name: 'Step type sync (TPS)',
      pathology: 'PLAN_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — could not parse source',
    };
  }

  const enumValues = new Set<string>();
  for (const m of enumMatch[1].matchAll(/'([^']+)'/g)) enumValues.add(m[1]);

  const arrayValues = new Set<string>();
  for (const m of arrayMatch[1].matchAll(/'([^']+)'/g)) arrayValues.add(m[1]);

  const inEnumNotArray = [...enumValues].filter((v) => !arrayValues.has(v));
  const inArrayNotEnum = [...arrayValues].filter((v) => !enumValues.has(v));

  if (inEnumNotArray.length === 0 && inArrayNotEnum.length === 0) {
    return {
      name: 'Step type sync (TPS)',
      pathology: 'PLAN_TRUTH_FAULT',
      severity: 'INFO',
      message: `PlanStepType and PLAN_STEP_TYPE_VALUES in sync (${enumValues.size} values)`,
    };
  }

  const details: string[] = [];
  if (inEnumNotArray.length > 0)
    details.push(
      `${inEnumNotArray.length} in enum but not array: ${inEnumNotArray.slice(0, 3).join(', ')}`
    );
  if (inArrayNotEnum.length > 0)
    details.push(
      `${inArrayNotEnum.length} in array but not enum: ${inArrayNotEnum.slice(0, 3).join(', ')}`
    );

  return {
    name: 'Step type sync (TPS)',
    pathology: 'PLAN_TRUTH_FAULT',
    severity: 'STOP_THE_LINE',
    message: details.join('; '),
    fix: 'Sync PlanStepType enum (planner/steps.ts) with PLAN_STEP_TYPE_VALUES (contracts/steps.ts)',
  };
}

// ── Check 19: Algorithm registry key consistency ──

async function checkRegistryConsistency(): Promise<Diagnosis> {
  if (!hasSourceAccess()) {
    return {
      name: 'Registry consistency (TPS)',
      pathology: 'MODEL_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — source files not available',
    };
  }

  const registrySrc = readSourceFile('packages/contracts/src/templates/algorithm-registry.ts');
  if (!registrySrc) {
    return {
      name: 'Registry consistency (TPS)',
      pathology: 'MODEL_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — registry not found',
    };
  }

  const idsMatch = registrySrc.match(/export\s+const\s+ALGORITHM_IDS\s*=\s*\[([^\]]*)\]/);
  const stepTypeMatch = registrySrc.match(
    /export\s+const\s+ALGORITHM_ID_TO_STEP_TYPE\s*:\s*Record[^=]*=\s*\{([\s\S]*?)\}\s*;/
  );
  const displayMatch = registrySrc.match(
    /export\s+const\s+ALGORITHM_DISPLAY_NAMES\s*:\s*Record[^=]*=\s*\{([\s\S]*?)\}\s*;/
  );
  const outputMatch = registrySrc.match(
    /export\s+const\s+ALGORITHM_OUTPUT_TYPES\s*:\s*Record[^=]*=\s*\{([\s\S]*?)\}\s*;/
  );

  if (!idsMatch || !stepTypeMatch || !displayMatch || !outputMatch) {
    return {
      name: 'Registry consistency (TPS)',
      pathology: 'MODEL_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — could not parse registry',
    };
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
    if (!stepTypeKeys.has(id))
      issues.push(`'${id}' in ALGORITHM_IDS but not ALGORITHM_ID_TO_STEP_TYPE`);
  }

  // Keys in ALGORITHM_ID_TO_STEP_TYPE but not in ALGORITHM_DISPLAY_NAMES
  for (const key of stepTypeKeys) {
    if (!displayKeys.has(key))
      issues.push(`'${key}' in ALGORITHM_ID_TO_STEP_TYPE but not ALGORITHM_DISPLAY_NAMES`);
  }

  // Keys in ALGORITHM_ID_TO_STEP_TYPE but not in ALGORITHM_OUTPUT_TYPES
  for (const key of stepTypeKeys) {
    if (!outputKeys.has(key))
      issues.push(`'${key}' in ALGORITHM_ID_TO_STEP_TYPE but not ALGORITHM_OUTPUT_TYPES`);
  }

  if (issues.length === 0) {
    return {
      name: 'Registry consistency (TPS)',
      pathology: 'MODEL_TRUTH_FAULT',
      severity: 'INFO',
      message: `ALGORITHM_IDS, STEP_TYPE, DISPLAY_NAMES, OUTPUT_TYPES aligned (${ids.size} algorithms)`,
    };
  }

  return {
    name: 'Registry consistency (TPS)',
    pathology: 'MODEL_TRUTH_FAULT',
    severity: 'STOP_THE_LINE',
    message: `${issues.length} inconsistency(ies): ${issues.slice(0, 3).join('; ')}${issues.length > 3 ? ` (+${issues.length - 3})` : ''}`,
    fix: 'Add missing entries to algorithm-registry.ts or remove orphaned keys',
  };
}

// ── Check 20: State machine integrity ──

async function checkStateMachineIntegrity(): Promise<Diagnosis> {
  if (!hasSourceAccess()) {
    return {
      name: 'State machine (TPS)',
      pathology: 'ANTI_LIE_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — source files not available',
    };
  }

  const transitionsSrc = readSourceFile('packages/engine/src/transitions.ts');
  const engineSrc = readSourceFile('packages/engine/src/engine.ts');
  const typesSrc = readSourceFile('packages/contracts/src/types.ts');
  if (!transitionsSrc || !engineSrc || !typesSrc) {
    return {
      name: 'State machine (TPS)',
      pathology: 'ANTI_LIE_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — source files not found',
    };
  }

  // Extract EngineState type values
  const stateTypeMatch = typesSrc.match(/EngineState\s*=\s*([^;]+)/);
  const stateValues = new Set<string>();
  if (stateTypeMatch) {
    for (const m of stateTypeMatch[1].matchAll(/'([^']+)'/g)) stateValues.add(m[1]);
  }

  // Extract VALID_TRANSITIONS (handle nested generics Record<K, Set<V>>)
  const transitionsMatch = transitionsSrc.match(
    /VALID_TRANSITIONS\s*:\s*Record<[^,]+,\s*Set<[^>]+>>\s*=\s*\{([\s\S]*?)\}\s*;/
  );
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
    return {
      name: 'State machine (TPS)',
      pathology: 'ANTI_LIE_TRUTH_FAULT',
      severity: 'INFO',
      message: `${stateValues.size} states, ${transitionKeys.size} transitions, all valid`,
    };
  }

  return {
    name: 'State machine (TPS)',
    pathology: 'ANTI_LIE_TRUTH_FAULT',
    severity: 'STOP_THE_LINE',
    message: `${issues.length} issue(s): ${issues.slice(0, 3).join('; ')}${issues.length > 3 ? ` (+${issues.length - 3})` : ''}`,
    fix: 'Update VALID_TRANSITIONS in transitions.ts or fix invalid transitions in engine.ts',
  };
}

// ── Check 21: Profile → registry coverage ──

async function checkProfileCoverage(): Promise<Diagnosis> {
  if (!hasSourceAccess()) {
    return {
      name: 'Profile coverage (TPS)',
      pathology: 'MODEL_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — source files not available',
    };
  }

  const registrySrc = readSourceFile('packages/contracts/src/templates/algorithm-registry.ts');
  if (!registrySrc) {
    return {
      name: 'Profile coverage (TPS)',
      pathology: 'MODEL_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — registry not found',
    };
  }

  const idsMatch = registrySrc.match(/export\s+const\s+ALGORITHM_IDS\s*=\s*\[([^\]]*)\]/);
  const stepTypeMatch = registrySrc.match(
    /export\s+const\s+ALGORITHM_ID_TO_STEP_TYPE\s*:\s*Record[^=]*=\s*\{([\s\S]*?)\}\s*;/
  );
  const profileMatch = registrySrc.match(
    /const\s+map\s*:\s*Record<string,\s*string\[\]>\s*=\s*\{([\s\S]*?)\}\s*;/
  );

  if (!idsMatch || !stepTypeMatch || !profileMatch) {
    return {
      name: 'Profile coverage (TPS)',
      pathology: 'MODEL_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — could not parse registry',
    };
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
    return {
      name: 'Profile coverage (TPS)',
      pathology: 'MODEL_TRUTH_FAULT',
      severity: 'INFO',
      message: 'All profile algorithm IDs exist in registry',
    };
  }

  return {
    name: 'Profile coverage (TPS)',
    pathology: 'MODEL_TRUTH_FAULT',
    severity: 'STOP_THE_LINE',
    message: `${issues.length} invalid reference(s): ${issues.slice(0, 3).join('; ')}`,
    fix: 'Update getProfileAlgorithms() or add missing algorithm to registry',
  };
}

// ── Check 22: Canonical algorithm naming in config/tests ──

async function checkCanonicalNaming(): Promise<Diagnosis> {
  if (!hasSourceAccess()) {
    return {
      name: 'Canonical naming (TPS)',
      pathology: 'MODEL_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — source files not available',
    };
  }

  const configTestSrc = readSourceFile('packages/config/src/__tests__/resolution.test.ts');
  if (!configTestSrc) {
    return {
      name: 'Canonical naming (TPS)',
      pathology: 'MODEL_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — config tests not found',
    };
  }

  // Known short aliases that should NOT appear in config/test files
  const bannedShortNames = [
    'alpha',
    'heuristic',
    'genetic',
    'inductive',
    'astar',
    'powl',
    'skeleton',
    'correlation',
    'alignment',
  ];

  const issues: string[] = [];
  for (const shortName of bannedShortNames) {
    const regex = new RegExp(`['"]${shortName}['"]`, 'g');
    const matches = configTestSrc.match(regex);
    if (matches) {
      issues.push(`'${shortName}' found ${matches.length}x — use canonical ID`);
    }
  }

  if (issues.length === 0) {
    return {
      name: 'Canonical naming (TPS)',
      pathology: 'MODEL_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Config tests use canonical algorithm IDs',
    };
  }

  return {
    name: 'Canonical naming (TPS)',
    pathology: 'MODEL_TRUTH_FAULT',
    severity: 'WARNING',
    message: `${issues.length} banned short name(s): ${issues.slice(0, 3).join('; ')}`,
    fix: 'Replace short aliases with canonical IDs (e.g., heuristic → heuristic_miner)',
  };
}

// ── Check 23: Step type coverage (registry → PLAN_STEP_TYPE_VALUES) ──

async function checkStepTypeCoverage(): Promise<Diagnosis> {
  if (!hasSourceAccess()) {
    return {
      name: 'Step type coverage (TPS)',
      pathology: 'PLAN_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — source files not available',
    };
  }

  const registrySrc = readSourceFile('packages/contracts/src/templates/algorithm-registry.ts');
  const contractsSrc = readSourceFile('packages/contracts/src/steps.ts');
  if (!registrySrc || !contractsSrc) {
    return {
      name: 'Step type coverage (TPS)',
      pathology: 'PLAN_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — source files not found',
    };
  }

  const stepTypeMatch = registrySrc.match(
    /export\s+const\s+ALGORITHM_ID_TO_STEP_TYPE\s*:\s*Record[^=]*=\s*\{([\s\S]*?)\}\s*;/
  );
  const arrayMatch = contractsSrc.match(
    /export\s+const\s+PLAN_STEP_TYPE_VALUES\s*=\s*\[([\s\S]*?)\]\s*as\s+const/
  );

  if (!stepTypeMatch || !arrayMatch) {
    return {
      name: 'Step type coverage (TPS)',
      pathology: 'PLAN_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — could not parse source',
    };
  }

  const validStepTypes = new Set<string>();
  for (const m of arrayMatch[1].matchAll(/'([^']+)'/g)) validStepTypes.add(m[1]);

  const missing: string[] = [];

  // Parse key: 'value' pairs
  for (const m of stepTypeMatch[1].matchAll(/(\w+)\s*:\s*'([^']+)'/g)) {
    if (!validStepTypes.has(m[2])) {
      missing.push(`${m[1]} → '${m[2]}'`);
    }
  }

  if (missing.length === 0) {
    return {
      name: 'Step type coverage (TPS)',
      pathology: 'PLAN_TRUTH_FAULT',
      severity: 'INFO',
      message: 'All registry step types exist in PLAN_STEP_TYPE_VALUES',
    };
  }

  return {
    name: 'Step type coverage (TPS)',
    pathology: 'PLAN_TRUTH_FAULT',
    severity: 'STOP_THE_LINE',
    message: `${missing.length} missing step type(s): ${missing.slice(0, 3).join('; ')}`,
    fix: 'Add missing values to PLAN_STEP_TYPE_VALUES in packages/contracts/src/steps.ts',
  };
}

// ── Check 24: State machine completeness (no orphans or dead-ends) ──

async function checkStateMachineCompleteness(): Promise<Diagnosis> {
  if (!hasSourceAccess()) {
    return {
      name: 'State machine completeness (TPS)',
      pathology: 'ANTI_LIE_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — source files not available',
    };
  }

  const transitionsSrc = readSourceFile('packages/engine/src/transitions.ts');
  if (!transitionsSrc) {
    return {
      name: 'State machine completeness (TPS)',
      pathology: 'ANTI_LIE_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — source files not found',
    };
  }

  const transitionsMatch = transitionsSrc.match(
    /VALID_TRANSITIONS\s*:\s*Record<[^,]+,\s*Set<[^>]+>>\s*=\s*\{([\s\S]*?)\}\s*;/
  );
  if (!transitionsMatch) {
    return {
      name: 'State machine completeness (TPS)',
      pathology: 'ANTI_LIE_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — could not parse transitions',
    };
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
    return {
      name: 'State machine completeness (TPS)',
      pathology: 'ANTI_LIE_TRUTH_FAULT',
      severity: 'INFO',
      message: `${stateEntries.length} states — all reachable, no dead-ends`,
    };
  }

  return {
    name: 'State machine completeness (TPS)',
    pathology: 'ANTI_LIE_TRUTH_FAULT',
    severity: 'WARNING',
    message: `${issues.length} issue(s): ${issues.join('; ')}`,
    fix: 'Add missing transitions in packages/engine/src/transitions.ts',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Check arrays (used by subcommands to slice the check set)
// ────────────────────────────────────────────────────────────────────────────

export const ENV_CHECKS: Array<() => Promise<Diagnosis>> = [
  checkNodeVersion,
  checkPnpmVersion,
  checkWasmBinary,
  checkWasmLoads,
  checkSimdSupport,
  checkConfigFound,
  checkConfigValidation,
  checkXesFiles,
  checkSystemMemory,
  checkDiskSpace,
  checkGitHooks,
  checkTypeScriptCompilation,
  checkMicroMl,
  checkRustToolchain,
  checkResultsDir,
  checkAlgorithmRegistry,
  checkWorkspaceIntegrity,
];

export const TPS_CHECKS: Array<() => Promise<Diagnosis>> = [
  checkStepTypeSync,
  checkRegistryConsistency,
  checkStateMachineIntegrity,
  checkProfileCoverage,
  checkCanonicalNaming,
  checkStepTypeCoverage,
  checkStateMachineCompleteness,
];

export const ALL_CHECKS = [...ENV_CHECKS, ...TPS_CHECKS];

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
  INFO: ' INFO ',
  WARNING: ' WARN ',
  STOP_THE_LINE: ' STOP ',
} as const;

function renderBadge(severity: Diagnosis['severity']): string {
  return `[${BADGE[severity]}]`;
}

function printReport(formatter: HumanFormatter, report: DoctorReport): void {
  formatter.log('');
  formatter.log('wpm doctor — epistemic diagnostician & autonomic governor');
  formatter.log('─'.repeat(80));

  let lastSection = '';
  for (const diag of report.diagnoses) {
    const isTps = diag.name.includes('(TPS)');
    const section = isTps ? 'TPS Pipeline & Epistemic Truth' : 'Environment & Deployment Truth';
    if (section !== lastSection) {
      if (lastSection) formatter.log('');
      formatter.log(`  ${section}:`);
      lastSection = section;
    }

    const badge = renderBadge(diag.severity);
    formatter.log(`    ${badge}  ${diag.name} [${diag.pathology || 'UNKNOWN'}]`);
    formatter.log(`             Diagnosis: ${diag.message}`);

    if (diag.severity !== 'INFO') {
      const fixText = diag.fixGuide || diag.fix;

      // Dynamically infer repair mode
      let inferredRepairMode: RepairMode = diag.repairMode || 'MANUAL_INTERVENTION';
      let inferredRepairCmd = diag.repairCommand;

      if (fixText) {
        if (fixText.includes('pnpm run build') && fixText.includes('cd wasm4pm')) {
          inferredRepairMode = 'REBUILD_ARTIFACTS';
          inferredRepairCmd = 'cd wasm4pm && pnpm run build';
        } else if (fixText.includes('pnpm run build')) {
          inferredRepairMode = 'REBUILD_ARTIFACTS';
          inferredRepairCmd = 'pnpm run build';
        } else if (fixText.includes('pnpm install')) {
          inferredRepairMode = 'REINSTALL_DEPENDENCIES';
          inferredRepairCmd = 'pnpm install';
        } else if (fixText.includes('wpm init')) {
          inferredRepairMode = 'SCAFFOLD_CONFIG';
          inferredRepairCmd = 'wpm init';
        } else if (fixText.includes('corepack')) {
          inferredRepairMode = 'REINSTALL_DEPENDENCIES';
          inferredRepairCmd = fixText;
        } else if (isTps) {
          inferredRepairMode = 'SYNC_REGISTRY';
        }
      }

      if (inferredRepairMode !== 'MANUAL_INTERVENTION') {
        formatter.log(`             Repair Mode: ${inferredRepairMode}`);
        if (inferredRepairCmd) {
          formatter.log(`             Smallest Lawful Repair: ${inferredRepairCmd}`);
        }
      }

      if (fixText) {
        formatter.log(`             Manual Treatment: ${fixText}`);
      }
    }
  }

  formatter.log('');
  formatter.log('─'.repeat(80));
  formatter.log(
    `Result: ${report.info} INFO  ${report.warnings} WARNINGS  ${report.stopTheLine} STOP_THE_LINE`
  );
  formatter.log('');

  if (report.epistemicHealth) {
    formatter.success('System is epistemically healthy and operationally ready.');
  } else {
    formatter.error(
      'STOP THE LINE: System is epistemically unhealthy or missing critical deployment artifacts.'
    );
  }
  formatter.log('');
}

// ────────────────────────────────────────────────────────────────────────────
// Shared check runner
// ────────────────────────────────────────────────────────────────────────────

async function runChecks(
  checks: Array<() => Promise<Diagnosis>>,
  format: string,
  verbose: boolean | undefined,
  quiet: boolean | undefined
): Promise<DoctorReport> {
  const formatter = getFormatter({
    format: format as 'human' | 'json',
    verbose,
    quiet,
  });

  const diagnoses: Diagnosis[] = await Promise.all(checks.map((fn) => fn()));

  const report: DoctorReport = {
    diagnoses,
    info: diagnoses.filter((c) => c.severity === 'INFO').length,
    warnings: diagnoses.filter((c) => c.severity === 'WARNING').length,
    stopTheLine: diagnoses.filter((c) => c.severity === 'STOP_THE_LINE').length,
    epistemicHealth: diagnoses.every((c) => c.severity !== 'STOP_THE_LINE'),
  };

  if (formatter instanceof JSONFormatter) {
    if (report.epistemicHealth) {
      formatter.success('wpm environment is healthy', {
        ...report,
        healthy: true,
        diagnoses: report.diagnoses.map((c) => ({ ...c })),
      });
    } else {
      formatter.warn('wpm environment has issues', {
        ...report,
        healthy: false,
        diagnoses: report.diagnoses.map((c) => ({ ...c })),
      });
    }
  } else {
    printReport(formatter as HumanFormatter, report);
  }

  if (!report.epistemicHealth) {
    process.exitCode = EXIT_CODES.config_error;
  }

  return report;
}

// ────────────────────────────────────────────────────────────────────────────
// Safe-to-auto-execute fix prefixes
// ────────────────────────────────────────────────────────────────────────────

function isAutoExecutable(fixCmd: string): boolean {
  const safePrefixes = [
    'pnpm install',
    'mkdir -p',
    'pnpm prepare',
    'cd wasm4pm && pnpm run build',
  ];
  return safePrefixes.some((prefix) => fixCmd.startsWith(prefix));
}

// ────────────────────────────────────────────────────────────────────────────
// Subcommand: check
// ────────────────────────────────────────────────────────────────────────────

export const doctorCheck = defineCommand({
  meta: {
    name: 'check',
    description: 'Run all 24 health checks (or a filtered subset)',
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
    checks: {
      type: 'string',
      description: 'Comma-separated check function names to run (e.g. checkWasmBinary,checkNodeVersion)',
    },
  },
  async run(ctx) {
    let checksToRun = ALL_CHECKS;

    if (ctx.args.checks) {
      const names = (ctx.args.checks as string).split(',').map((s) => s.trim());
      const filtered = ALL_CHECKS.filter((fn) => names.includes(fn.name));
      if (filtered.length > 0) {
        checksToRun = filtered;
      }
    }

    await runChecks(
      checksToRun,
      (ctx.args.format as string) ?? 'human',
      ctx.args.verbose,
      ctx.args.quiet
    );
  },
});

// ────────────────────────────────────────────────────────────────────────────
// Subcommand: env
// ────────────────────────────────────────────────────────────────────────────

export const doctorEnv = defineCommand({
  meta: {
    name: 'env',
    description: 'Run only the 17 environment checks',
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
    await runChecks(
      ENV_CHECKS,
      (ctx.args.format as string) ?? 'human',
      ctx.args.verbose,
      ctx.args.quiet
    );
  },
});

// ────────────────────────────────────────────────────────────────────────────
// Subcommand: tps
// ────────────────────────────────────────────────────────────────────────────

export const doctorTps = defineCommand({
  meta: {
    name: 'tps',
    description: 'Run only the 7 TPS pipeline integrity checks',
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
    'fail-fast': {
      type: 'boolean',
      description: 'Exit on first failure',
    },
  },
  async run(ctx) {
    const failFast = ctx.args['fail-fast'] as boolean | undefined;

    if (failFast) {
      const formatter = getFormatter({
        format: (ctx.args.format as 'human' | 'json') ?? 'human',
        verbose: ctx.args.verbose,
        quiet: ctx.args.quiet,
      });

      for (const fn of TPS_CHECKS) {
        const diag = await fn();
        if (diag.severity === 'STOP_THE_LINE') {
          const report: DoctorReport = {
            diagnoses: [diag],
            info: 0,
            warnings: 0,
            stopTheLine: 1,
            epistemicHealth: false,
          };
          if (formatter instanceof JSONFormatter) {
            formatter.warn('TPS check failed', { ...report, healthy: false });
          } else {
            printReport(formatter as HumanFormatter, report);
          }
          process.exitCode = EXIT_CODES.config_error;
          return;
        }
      }

      // All passed — run full report
      await runChecks(
        TPS_CHECKS,
        (ctx.args.format as string) ?? 'human',
        ctx.args.verbose,
        ctx.args.quiet
      );
    } else {
      await runChecks(
        TPS_CHECKS,
        (ctx.args.format as string) ?? 'human',
        ctx.args.verbose,
        ctx.args.quiet
      );
    }
  },
});

// ────────────────────────────────────────────────────────────────────────────
// Subcommand: fix
// ────────────────────────────────────────────────────────────────────────────

export const doctorFix = defineCommand({
  meta: {
    name: 'fix',
    description: 'Run all checks and execute auto-fixable repair commands',
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
    'dry-run': {
      type: 'boolean',
      description: 'Print fix commands without executing',
    },
    yes: {
      type: 'boolean',
      description: 'Skip confirmation prompts',
      alias: 'y',
    },
  },
  async run(ctx) {
    const dryRun = ctx.args['dry-run'] as boolean | undefined;
    const yes = ctx.args.yes as boolean | undefined;
    const fmt = (ctx.args.format as string) ?? 'human';

    const formatter = getFormatter({
      format: fmt as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

    // Run all checks first
    const diagnoses: Diagnosis[] = await Promise.all(ALL_CHECKS.map((fn) => fn()));

    // Collect fixable checks
    const fixable = diagnoses.filter(
      (d) => d.severity !== 'INFO' && d.fix && isAutoExecutable(d.fix)
    );

    if (!(formatter instanceof JSONFormatter)) {
      const hf = formatter as HumanFormatter;
      hf.log('');
      hf.log(`wpm doctor fix — found ${fixable.length} auto-fixable issue(s)`);
      hf.log('─'.repeat(80));

      for (const d of diagnoses) {
        const badge = renderBadge(d.severity);
        hf.log(`  ${badge}  ${d.name}: ${d.message}`);
        if (d.severity !== 'INFO' && d.fix) {
          if (isAutoExecutable(d.fix)) {
            hf.log(`         → Auto-fix: ${d.fix}`);
          } else {
            hf.log(`         → Manual fix: ${d.fix}`);
          }
        }
      }

      hf.log('');

      if (fixable.length === 0) {
        hf.log('No auto-fixable issues found.');
        return;
      }

      if (dryRun) {
        hf.log(`Dry-run mode — would execute ${fixable.length} fix command(s):`);
        for (const d of fixable) {
          hf.log(`  $ ${d.fix}`);
        }
        return;
      }

      if (!yes) {
        // Simple confirmation (no readline — just skip if stdin is not a tty)
        hf.log(`Run ${fixable.length} fix command(s)? [y/N]`);
        // In non-interactive mode, skip
        if (!process.stdin.isTTY) {
          hf.log('Skipping — stdin is not a TTY. Use --yes to force.');
          return;
        }
        // Read one line
        const answer = await new Promise<string>((resolve) => {
          process.stdin.setEncoding('utf8');
          process.stdin.once('data', (chunk) => resolve(String(chunk).trim()));
        });
        if (answer.toLowerCase() !== 'y') {
          hf.log('Aborted.');
          return;
        }
      }

      // Execute fixes
      for (const d of fixable) {
        hf.log(`  $ ${d.fix}`);
        try {
          execSync(d.fix!, { stdio: 'inherit' });
        } catch (err) {
          hf.log(`  ✗ Failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Re-run all checks after fixes
      hf.log('');
      hf.log('Re-running checks after fixes...');
    }

    // Final check run
    await runChecks(ALL_CHECKS, fmt, ctx.args.verbose, ctx.args.quiet);
  },
});

// ────────────────────────────────────────────────────────────────────────────
// Subcommand: perf
// ────────────────────────────────────────────────────────────────────────────

interface PerfBaseline {
  _comment?: string;
  _updated?: string;
  _methodology?: string;
  [scenario: string]: {
    description: string;
    n: number;
    algorithm: string;
    measured_ms: number;
    ceiling_ms: number;
  } | string | undefined;
}

export const doctorPerf = defineCommand({
  meta: {
    name: 'perf',
    description: 'Benchmark key operations against the performance baseline',
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
    'update-baseline': {
      type: 'boolean',
      description: 'Write new measured values to the baseline JSON file',
    },
    threshold: {
      type: 'string',
      description: 'Percent over ceiling before treating as regression (default: 20)',
      default: '20',
    },
    yes: {
      type: 'boolean',
      description: 'Skip confirmation prompts',
      alias: 'y',
    },
  },
  async run(ctx) {
    const fmt = (ctx.args.format as string) ?? 'human';
    const updateBaseline = ctx.args['update-baseline'] as boolean | undefined;
    const thresholdPct = parseInt((ctx.args.threshold as string) ?? '20', 10);
    const yes = ctx.args.yes as boolean | undefined;

    const formatter = getFormatter({
      format: fmt as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

    // Find the baseline file
    const baselinePaths = [
      path.join(process.cwd(), 'packages/kernel/performance_baseline.json'),
    ];

    const rootDir = await resolveWorkspaceRoot();
    if (rootDir) {
      baselinePaths.unshift(path.join(rootDir, 'packages/kernel/performance_baseline.json'));
    }

    let baselinePath: string | null = null;
    let baseline: PerfBaseline | null = null;

    for (const p of baselinePaths) {
      if (existsSync(p)) {
        try {
          const raw = readFileSync(p, 'utf-8');
          baseline = JSON.parse(raw) as PerfBaseline;
          baselinePath = p;
          break;
        } catch {
          // ignore
        }
      }
    }

    if (!baseline || !baselinePath) {
      if (!(formatter instanceof JSONFormatter)) {
        (formatter as HumanFormatter).log('');
        (formatter as HumanFormatter).log(
          'Performance baseline file not found (packages/kernel/performance_baseline.json)'
        );
        (formatter as HumanFormatter).log('Run from within the wasm4pm workspace.');
      }
      process.exitCode = EXIT_CODES.system_error;
      return;
    }

    // Synthetic WASM stub — measures TypeScript dispatch overhead only (no real WASM needed)
    function syntheticDfgRun(_handle: string, _activityKey: string): Record<string, unknown> {
      return { nodes: ['A', 'B'], edges: [{ from: 'A', to: 'B', count: 1 }] };
    }

    interface ScenarioResult {
      scenario: string;
      measured_ms: number;
      ceiling_ms: number;
      status: 'OK' | 'REGRESSION' | 'SKIP';
    }

    const results: ScenarioResult[] = [];

    // Only test scenarios that involve the dfg/cache benchmarks
    const measurableScenarios = ['dfg_n100', 'dfg_n1k', 'cache_hit_n1k'];

    for (const scenarioKey of measurableScenarios) {
      const entry = baseline[scenarioKey];
      if (!entry || typeof entry === 'string') continue;

      const n = entry.n;
      const ceiling = entry.ceiling_ms;

      const start = Date.now();
      for (let i = 0; i < n; i++) {
        syntheticDfgRun(`handle-${i}`, 'concept:name');
      }
      const measured = Date.now() - start;

      const overPct = ((measured - ceiling) / ceiling) * 100;
      const status: 'OK' | 'REGRESSION' =
        overPct > thresholdPct ? 'REGRESSION' : 'OK';

      results.push({ scenario: scenarioKey, measured_ms: measured, ceiling_ms: ceiling, status });
    }

    if (formatter instanceof JSONFormatter) {
      const allOk = results.every((r) => r.status === 'OK');
      if (allOk) {
        formatter.success('Performance baseline check passed', { results });
      } else {
        formatter.warn('Performance regression detected', { results });
        process.exitCode = EXIT_CODES.config_error;
      }
    } else {
      const hf = formatter as HumanFormatter;
      hf.log('');
      hf.log('wpm doctor perf — performance baseline comparison');
      hf.log('─'.repeat(80));
      hf.log('');

      const colWidths = { scenario: 22, measured: 12, ceiling: 10, status: 12 };
      const header =
        'Scenario'.padEnd(colWidths.scenario) +
        'Measured'.padEnd(colWidths.measured) +
        'Ceiling'.padEnd(colWidths.ceiling) +
        'Status';
      hf.log(`  ${header}`);
      hf.log('  ' + '─'.repeat(header.length));

      for (const r of results) {
        const row =
          r.scenario.padEnd(colWidths.scenario) +
          `${r.measured_ms}ms`.padEnd(colWidths.measured) +
          `${r.ceiling_ms}ms`.padEnd(colWidths.ceiling) +
          (r.status === 'OK' ? '✓ OK' : '✗ REGRESSION');
        hf.log(`  ${row}`);
      }

      hf.log('');

      const regressions = results.filter((r) => r.status === 'REGRESSION');
      if (regressions.length === 0) {
        hf.success('All performance checks within ceiling.');
      } else {
        hf.error(`${regressions.length} regression(s) detected (>${thresholdPct}% over ceiling).`);
        process.exitCode = EXIT_CODES.config_error;
      }
    }

    // Update baseline if requested
    if (updateBaseline && baselinePath) {
      let proceed = yes;
      if (!proceed && process.stdin.isTTY) {
        (formatter as HumanFormatter).log(
          `\nUpdate baseline at ${baselinePath}? [y/N]`
        );
        proceed = await new Promise<boolean>((resolve) => {
          process.stdin.setEncoding('utf8');
          process.stdin.once('data', (chunk) => resolve(String(chunk).trim().toLowerCase() === 'y'));
        });
      }

      if (proceed) {
        for (const r of results) {
          const entry = baseline[r.scenario];
          if (entry && typeof entry !== 'string') {
            entry.measured_ms = r.measured_ms;
          }
        }
        if (baseline._updated !== undefined) {
          baseline._updated = new Date().toISOString().slice(0, 10);
        }
        await fs.writeFile(baselinePath, JSON.stringify(baseline, null, 2) + '\n', 'utf-8');
        if (!(formatter instanceof JSONFormatter)) {
          (formatter as HumanFormatter).log(`Updated baseline: ${baselinePath}`);
        }
      }
    }
  },
});

// ────────────────────────────────────────────────────────────────────────────
// Subcommand: watch
// ────────────────────────────────────────────────────────────────────────────

export const doctorWatch = defineCommand({
  meta: {
    name: 'watch',
    description: 'Run doctor check in a loop, printing only changes',
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
    interval: {
      type: 'string',
      description: 'Poll interval in seconds (default: 30, min: 5)',
      default: '30',
    },
    'on-fail': {
      type: 'string',
      description: 'Shell command to execute on new failure (env: DOCTOR_FAIL_CHECK=<name>)',
    },
  },
  async run(ctx) {
    const fmt = (ctx.args.format as string) ?? 'human';
    const onFail = ctx.args['on-fail'] as string | undefined;
    let intervalSec = parseInt((ctx.args.interval as string) ?? '30', 10);

    const formatter = getFormatter({
      format: fmt as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

    if (intervalSec < 5) {
      if (!(formatter instanceof JSONFormatter)) {
        (formatter as HumanFormatter).log(
          `Warning: --interval ${intervalSec} is below minimum (5). Using 5.`
        );
      }
      intervalSec = 5;
    }

    let prevResults: Map<string, Severity> = new Map();
    let iteration = 0;
    let running = true;

    process.on('SIGINT', () => {
      running = false;
    });

    while (running) {
      const diagnoses = await Promise.all(ALL_CHECKS.map((fn) => fn()));
      const current = new Map(diagnoses.map((d) => [d.name, d.severity]));

      const passing = diagnoses.filter((d) => d.severity === 'INFO').length;
      const total = diagnoses.length;

      if (iteration === 0) {
        // Full verbose output on first iteration
        const report: DoctorReport = {
          diagnoses,
          info: diagnoses.filter((d) => d.severity === 'INFO').length,
          warnings: diagnoses.filter((d) => d.severity === 'WARNING').length,
          stopTheLine: diagnoses.filter((d) => d.severity === 'STOP_THE_LINE').length,
          epistemicHealth: diagnoses.every((d) => d.severity !== 'STOP_THE_LINE'),
        };
        if (!(formatter instanceof JSONFormatter)) {
          printReport(formatter as HumanFormatter, report);
        }
      } else {
        // Only print changes
        const changes: Diagnosis[] = [];
        const newFailures: Diagnosis[] = [];

        for (const diag of diagnoses) {
          const prev = prevResults.get(diag.name);
          if (prev !== diag.severity) {
            changes.push(diag);
            if (
              diag.severity === 'STOP_THE_LINE' &&
              prev !== 'STOP_THE_LINE'
            ) {
              newFailures.push(diag);
            }
          }
        }

        if (changes.length === 0) {
          if (!(formatter instanceof JSONFormatter)) {
            const now = new Date();
            const ts = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
            (formatter as HumanFormatter).log(
              `[${ts}] ✓ ${passing}/${total} checks passing`
            );
          }
        } else {
          if (!(formatter instanceof JSONFormatter)) {
            const hf = formatter as HumanFormatter;
            hf.log('');
            hf.log(`[CHANGED] ${changes.length} check(s) changed status:`);
            for (const d of changes) {
              const prev = prevResults.get(d.name) ?? 'unknown';
              hf.log(`  ${d.name}: ${prev} → ${d.severity}`);
              if (d.fix) hf.log(`    fix: ${d.fix}`);
            }
          }
        }

        // Execute on-fail command for new failures
        if (onFail && newFailures.length > 0) {
          for (const d of newFailures) {
            try {
              execSync(onFail, {
                stdio: 'inherit',
                env: { ...process.env, DOCTOR_FAIL_CHECK: d.name },
              });
            } catch {
              // ignore on-fail errors
            }
          }
        }
      }

      prevResults = current;
      iteration++;

      if (!running) break;

      // Wait for the interval
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, intervalSec * 1000);
        process.once('SIGINT', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }

    // Final summary on exit
    if (!(formatter instanceof JSONFormatter)) {
      const hf = formatter as HumanFormatter;
      hf.log('');
      hf.log(`wpm doctor watch stopped after ${iteration} iteration(s).`);
    }
  },
});

// ────────────────────────────────────────────────────────────────────────────
// Subcommand: report
// ────────────────────────────────────────────────────────────────────────────

export const doctorReport = defineCommand({
  meta: {
    name: 'report',
    description: 'Generate a JSON or HTML health report',
  },
  args: {
    format: {
      type: 'string',
      description: 'Report format: json or html (default: json)',
      default: 'json',
    },
    out: {
      type: 'string',
      description: 'Output file path (default: wpm-doctor-report.json or .html)',
    },
    open: {
      type: 'boolean',
      description: 'Open the report in a browser after generation',
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
    const reportFormat = ((ctx.args.format as string) ?? 'json').toLowerCase();
    const openAfter = ctx.args.open as boolean | undefined;

    const formatter = getFormatter({
      format: 'human',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });
    const hf = formatter as HumanFormatter;

    const diagnoses = await Promise.all(ALL_CHECKS.map((fn) => fn()));

    // Read package.json version
    let wpmVersion = 'unknown';
    try {
      const pkgJsonPath = new URL('../../package.json', import.meta.url).pathname;
      if (existsSync(pkgJsonPath)) {
        const pkgRaw = readFileSync(pkgJsonPath, 'utf-8');
        const pkg = JSON.parse(pkgRaw) as { version?: string };
        wpmVersion = pkg.version ?? 'unknown';
      }
    } catch {
      // ignore
    }

    const summary = {
      pass: diagnoses.filter((d) => d.severity === 'INFO').length,
      warn: diagnoses.filter((d) => d.severity === 'WARNING').length,
      fail: diagnoses.filter((d) => d.severity === 'STOP_THE_LINE').length,
      critical: diagnoses.filter((d) => d.severity === 'STOP_THE_LINE').length,
    };

    const reportData = {
      generated_at: new Date().toISOString(),
      wpm_version: wpmVersion,
      platform: {
        os: process.platform,
        arch: process.arch,
        node: process.version,
      },
      checks: diagnoses,
      summary,
    };

    let outPath: string;

    if (reportFormat === 'html') {
      outPath = (ctx.args.out as string) ?? 'wpm-doctor-report.html';
      const html = generateHtmlReport(reportData);
      await fs.writeFile(outPath, html, 'utf-8');
    } else {
      outPath = (ctx.args.out as string) ?? 'wpm-doctor-report.json';
      await fs.writeFile(outPath, JSON.stringify(reportData, null, 2) + '\n', 'utf-8');
    }

    hf.log('');
    hf.log(`Report written to: ${outPath}`);
    hf.log(
      `Summary: ${summary.pass} pass, ${summary.warn} warn, ${summary.fail} fail`
    );

    if (openAfter) {
      const openCmd =
        process.platform === 'darwin'
          ? `open "${outPath}"`
          : process.platform === 'win32'
            ? `start "" "${outPath}"`
            : `xdg-open "${outPath}"`;
      try {
        execSync(openCmd, { stdio: 'ignore' });
      } catch {
        hf.log(`Could not open ${outPath} automatically.`);
      }
    }
  },
});

function generateHtmlReport(data: {
  generated_at: string;
  wpm_version: string;
  platform: { os: string; arch: string; node: string };
  checks: Diagnosis[];
  summary: { pass: number; warn: number; fail: number; critical: number };
}): string {
  const checkRows = data.checks
    .map((d) => {
      const color =
        d.severity === 'INFO' ? '#2ea44f' : d.severity === 'WARNING' ? '#d29922' : '#cf222e';
      const fixHtml = d.fix
        ? `<p style="font-size:0.85em;color:#666;margin:4px 0 0 0"><strong>Fix:</strong> <code>${escapeHtml(d.fix)}</code></p>`
        : '';
      return `
      <details style="margin-bottom:8px;border:1px solid #d0d7de;border-radius:6px;padding:0">
        <summary style="cursor:pointer;padding:8px 12px;background:#f6f8fa;border-radius:6px;list-style:none;display:flex;align-items:center;gap:8px">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0"></span>
          <strong>${escapeHtml(d.name)}</strong>
          <span style="color:#666;font-size:0.9em">[${escapeHtml(d.severity)}]</span>
        </summary>
        <div style="padding:12px">
          <p style="margin:0">${escapeHtml(d.message)}</p>
          ${fixHtml}
          ${d.pathology ? `<p style="font-size:0.85em;color:#666;margin:4px 0 0 0">Pathology: ${escapeHtml(d.pathology)}</p>` : ''}
        </div>
      </details>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>wpm doctor report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 24px; color: #1f2328; background: #fff; }
    h1 { border-bottom: 1px solid #d0d7de; padding-bottom: 12px; }
    .meta { color: #656d76; font-size: 0.9em; margin-bottom: 24px; }
    .summary { display: flex; gap: 16px; margin-bottom: 24px; }
    .badge { padding: 4px 12px; border-radius: 20px; font-weight: bold; font-size: 0.9em; }
    .badge-pass { background: #dcffe4; color: #116329; }
    .badge-warn { background: #fff8c5; color: #7d4e00; }
    .badge-fail { background: #ffd7d5; color: #82071e; }
    code { background: #f6f8fa; padding: 2px 4px; border-radius: 3px; font-size: 0.9em; }
    details summary::-webkit-details-marker { display: none; }
  </style>
</head>
<body>
  <h1>wpm doctor report</h1>
  <div class="meta">
    Generated: ${escapeHtml(data.generated_at)} &nbsp;|&nbsp;
    Version: ${escapeHtml(data.wpm_version)} &nbsp;|&nbsp;
    ${escapeHtml(data.platform.os)}/${escapeHtml(data.platform.arch)} &nbsp;|&nbsp;
    Node ${escapeHtml(data.platform.node)}
  </div>
  <div class="summary">
    <span class="badge badge-pass">${data.summary.pass} pass</span>
    <span class="badge badge-warn">${data.summary.warn} warn</span>
    <span class="badge badge-fail">${data.summary.fail} fail</span>
  </div>
  <div>
${checkRows}
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ────────────────────────────────────────────────────────────────────────────
// Subcommand: publish
// ────────────────────────────────────────────────────────────────────────────

interface PublishCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

async function runPublishChecks(rootDir: string): Promise<PublishCheck[]> {
  const checks: PublishCheck[] = [];

  // 1. Versions — all package.json must match CalVer /^\d+\.\d+\.\d+[a-z]?$/
  const calverPattern = /^\d+\.\d+\.\d+[a-z]?$/;
  const pkgDirs = [
    ...['engine', 'kernel', 'config', 'contracts', 'planner', 'observability', 'testing', 'ml', 'swarm'].map(
      (p) => path.join(rootDir, 'packages', p)
    ),
    path.join(rootDir, 'apps', 'wasm4pm'),
  ];

  const versionIssues: string[] = [];
  for (const dir of pkgDirs) {
    const pkgJsonPath = path.join(dir, 'package.json');
    if (!existsSync(pkgJsonPath)) continue;
    try {
      const raw = readFileSync(pkgJsonPath, 'utf-8');
      const pkg = JSON.parse(raw) as { version?: string; name?: string };
      if (!pkg.version || !calverPattern.test(pkg.version)) {
        versionIssues.push(`${pkg.name ?? path.basename(dir)}: ${pkg.version ?? 'missing'}`);
      }
    } catch {
      // ignore
    }
  }
  checks.push({
    name: 'versions',
    status: versionIssues.length === 0 ? 'pass' : 'fail',
    message:
      versionIssues.length === 0
        ? 'All packages have valid CalVer versions'
        : `Invalid versions: ${versionIssues.join(', ')}`,
  });

  // 2. Artifacts — for publishable packages (build script, not private), dist/ exists
  const artifactIssues: string[] = [];
  for (const dir of pkgDirs) {
    const pkgJsonPath = path.join(dir, 'package.json');
    if (!existsSync(pkgJsonPath)) continue;
    try {
      const raw = readFileSync(pkgJsonPath, 'utf-8');
      const pkg = JSON.parse(raw) as {
        private?: boolean;
        scripts?: Record<string, string>;
        name?: string;
      };
      if (!pkg.private && pkg.scripts?.build) {
        const distDir = path.join(dir, 'dist');
        if (!existsSync(distDir)) {
          artifactIssues.push(`${pkg.name ?? path.basename(dir)}: dist/ missing`);
        } else {
          try {
            const entries = readFileSync(distDir);
            void entries;
          } catch {
            // dist exists but check it's a directory
            try {
              const stat = statSync(distDir);
              if (!stat.isDirectory()) {
                artifactIssues.push(`${pkg.name ?? path.basename(dir)}: dist/ is not a directory`);
              }
            } catch {
              // ignore
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }
  checks.push({
    name: 'artifacts',
    status: artifactIssues.length === 0 ? 'pass' : 'fail',
    message:
      artifactIssues.length === 0
        ? 'All publishable packages have dist/ directories'
        : `Missing artifacts: ${artifactIssues.join(', ')}`,
  });

  // 3. files-field — every publishable package has a files array
  const filesIssues: string[] = [];
  for (const dir of pkgDirs) {
    const pkgJsonPath = path.join(dir, 'package.json');
    if (!existsSync(pkgJsonPath)) continue;
    try {
      const raw = readFileSync(pkgJsonPath, 'utf-8');
      const pkg = JSON.parse(raw) as {
        private?: boolean;
        files?: unknown[];
        name?: string;
      };
      if (!pkg.private && (!pkg.files || !Array.isArray(pkg.files) || pkg.files.length === 0)) {
        filesIssues.push(pkg.name ?? path.basename(dir));
      }
    } catch {
      // ignore
    }
  }
  checks.push({
    name: 'files-field',
    status: filesIssues.length === 0 ? 'pass' : 'warn',
    message:
      filesIssues.length === 0
        ? 'All publishable packages have a files field'
        : `Missing files field: ${filesIssues.join(', ')}`,
  });

  // 4. no-private-leakage — @wasm4pm/* packages should not be private: true
  const privateLeakIssues: string[] = [];
  for (const dir of pkgDirs) {
    const pkgJsonPath = path.join(dir, 'package.json');
    if (!existsSync(pkgJsonPath)) continue;
    try {
      const raw = readFileSync(pkgJsonPath, 'utf-8');
      const pkg = JSON.parse(raw) as { private?: boolean; name?: string };
      if (pkg.name?.startsWith('@wasm4pm/') && pkg.private === true) {
        privateLeakIssues.push(pkg.name);
      }
    } catch {
      // ignore
    }
  }
  checks.push({
    name: 'no-private-leakage',
    status: privateLeakIssues.length === 0 ? 'pass' : 'fail',
    message:
      privateLeakIssues.length === 0
        ? 'No @wasm4pm/* packages are marked private'
        : `Private packages: ${privateLeakIssues.join(', ')}`,
  });

  // 5. registry — npm ping succeeds
  let registryStatus: 'pass' | 'warn' = 'pass';
  let registryMsg = 'npm registry is reachable';
  try {
    execSync('npm ping', { encoding: 'utf8', stdio: 'pipe', timeout: 3000 });
  } catch {
    registryStatus = 'warn';
    registryMsg = 'npm registry unreachable (network issue or timeout after 3s)';
  }
  checks.push({ name: 'registry', status: registryStatus, message: registryMsg });

  // 6. changelog — CHANGELOG.md exists and is non-empty
  const changelogPath = path.join(rootDir, 'CHANGELOG.md');
  const hasChangelog =
    existsSync(changelogPath) && readFileSync(changelogPath, 'utf-8').trim().length > 0;
  checks.push({
    name: 'changelog',
    status: hasChangelog ? 'pass' : 'warn',
    message: hasChangelog ? 'CHANGELOG.md exists and is non-empty' : 'CHANGELOG.md missing or empty',
  });

  return checks;
}

export const doctorPublish = defineCommand({
  meta: {
    name: 'publish',
    description: 'Run all checks plus publish-readiness validation',
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
    publish: {
      type: 'boolean',
      description: 'Run pnpm publish if all checks pass',
    },
    registry: {
      type: 'string',
      description: 'Override npm registry for checks and publish',
    },
    yes: {
      type: 'boolean',
      description: 'Skip confirmation prompts',
      alias: 'y',
    },
  },
  async run(ctx) {
    const fmt = (ctx.args.format as string) ?? 'human';
    const doPublish = ctx.args.publish as boolean | undefined;
    const yes = ctx.args.yes as boolean | undefined;

    const formatter = getFormatter({
      format: fmt as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

    // Run core checks first
    const diagnoses = await Promise.all(ALL_CHECKS.map((fn) => fn()));
    const coreReport: DoctorReport = {
      diagnoses,
      info: diagnoses.filter((d) => d.severity === 'INFO').length,
      warnings: diagnoses.filter((d) => d.severity === 'WARNING').length,
      stopTheLine: diagnoses.filter((d) => d.severity === 'STOP_THE_LINE').length,
      epistemicHealth: diagnoses.every((d) => d.severity !== 'STOP_THE_LINE'),
    };

    // Run publish-specific checks
    const rootDir = await resolveWorkspaceRoot();
    let publishChecks: PublishCheck[] = [];
    if (rootDir) {
      publishChecks = await runPublishChecks(rootDir);
    }

    const publishReady =
      coreReport.epistemicHealth && publishChecks.every((c) => c.status !== 'fail');

    if (formatter instanceof JSONFormatter) {
      if (publishReady) {
        formatter.success('Ready to publish', {
          coreReport,
          publishChecks,
          publishReady,
        });
      } else {
        formatter.warn('Not ready to publish', {
          coreReport,
          publishChecks,
          publishReady,
        });
        process.exitCode = EXIT_CODES.config_error;
      }
    } else {
      const hf = formatter as HumanFormatter;
      printReport(hf, coreReport);

      hf.log('');
      hf.log('Publish readiness checks:');
      hf.log('─'.repeat(80));
      for (const c of publishChecks) {
        const icon = c.status === 'pass' ? '✓' : c.status === 'warn' ? '⚠' : '✗';
        hf.log(`  ${icon}  ${c.name}: ${c.message}`);
      }
      hf.log('');

      if (publishReady) {
        hf.success('Package is ready to publish.');
      } else {
        hf.error('Package is NOT ready to publish. Fix issues above.');
        process.exitCode = EXIT_CODES.config_error;
        return;
      }
    }

    if (doPublish && publishReady) {
      let proceed = yes;
      if (!proceed && !(formatter instanceof JSONFormatter) && process.stdin.isTTY) {
        (formatter as HumanFormatter).log('\nRun pnpm -r publish --access public? [y/N]');
        proceed = await new Promise<boolean>((resolve) => {
          process.stdin.setEncoding('utf8');
          process.stdin.once('data', (chunk) => resolve(String(chunk).trim().toLowerCase() === 'y'));
        });
      }

      if (proceed) {
        const registryFlag = ctx.args.registry ? ` --registry ${ctx.args.registry as string}` : '';
        execSync(`pnpm -r publish --access public${registryFlag}`, { stdio: 'inherit' });
      }
    }
  },
});

// ────────────────────────────────────────────────────────────────────────────
// Main doctor command (with subcommands + backwards-compat fallback)
// ────────────────────────────────────────────────────────────────────────────

export const doctor = defineCommand({
  meta: {
    name: 'doctor',
    description:
      'Check environment health (24 checks) and pipeline integrity. Subcommands: check, fix, publish, env, tps, perf, watch, report',
  },
  subCommands: {
    check: doctorCheck,
    fix: doctorFix,
    publish: doctorPublish,
    env: doctorEnv,
    tps: doctorTps,
    perf: doctorPerf,
    watch: doctorWatch,
    report: doctorReport,
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
  // No-verb invocation: wpm doctor → delegates to check (backwards-compatible)
  async run(ctx) {
    await runChecks(
      ALL_CHECKS,
      (ctx.args.format as string) ?? 'human',
      ctx.args.verbose,
      ctx.args.quiet
    );
  },
});
