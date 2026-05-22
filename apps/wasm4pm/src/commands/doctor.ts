import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import {
  existsSync,
  readFileSync,
  statSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'fs';
import { execSync, spawnSync } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import { emitResult, makeResult, makeErrorResult, ConsoleProjection } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';
import { withSpan } from './_otel.js';

export interface DoctorOptions {
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
    const version = execSync('pnpm --version', {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 3000,
    }).trim();
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

  const wasmFile = path.join(wasmPkgDir, 'wasm4pm_bg.wasm');
  const jsFile = path.join(wasmPkgDir, 'wasm4pm.js');

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

  const jsFile = path.join(wasmPkgDir, 'wasm4pm.js');
  if (!existsSync(jsFile)) {
    return {
      name: 'WASM loads',
      pathology: 'ENVIRONMENT_FAULT',
      severity: 'STOP_THE_LINE',
      message: 'wasm4pm.js not found — module not built',
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
    // WebAssembly SIMD is detected by compiling a module that uses v128.const (fd 0c).
    // The module: () -> v128 { v128.const (16 zero bytes) }
    // v128.const requires exactly 16 immediate bytes — runtimes without SIMD reject it at compile.
    const simdModule = new Uint8Array([
      0x00,
      0x61,
      0x73,
      0x6d,
      0x01,
      0x00,
      0x00,
      0x00, // magic + version
      0x01,
      0x05,
      0x01,
      0x60,
      0x00,
      0x01,
      0x7b, // type: () -> v128
      0x03,
      0x02,
      0x01,
      0x00, // function section
      0x0a,
      0x16,
      0x01,
      0x14,
      0x00, // code section (body=20 bytes, 0 locals)
      0xfd,
      0x0c, // v128.const
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00, // 16 immediate bytes (zero vector)
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x0b, // end
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
  // Only scan inside the workspace root. If there is no workspace root (e.g.
  // when invoked from os.tmpdir() in tests), skip immediately rather than
  // scanning an arbitrarily large directory tree that may contain thousands of
  // unrelated files and take 30+ seconds.
  const workspaceRoot = resolveWorkspaceRoot();
  if (!workspaceRoot) {
    return {
      name: 'XES event logs',
      pathology: 'REPRODUCIBILITY_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — not inside the wasm4pm workspace',
    };
  }

  const cwd = workspaceRoot;
  const found: string[] = [];
  // Limit total entries scanned to prevent hangs on large directories.
  let scannedEntries = 0;
  const MAX_ENTRIES = 5000;

  async function scanDir(dir: string, depth: number): Promise<void> {
    if (depth > 2 || scannedEntries >= MAX_ENTRIES) return;
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
      if (scannedEntries >= MAX_ENTRIES) break;
      scannedEntries++;
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
      severity: 'STOP_THE_LINE',
      message: 'No .xes files found — AAT requires real event log data, not synthetic fixtures',
      fix: 'Add a real XES event log to bench_data/ (e.g. sepsis.xes, bpi2012.xes)',
    };
  }

  // Validate files are real XES (not placeholders like "404: Not Found")
  const realXes: string[] = [];
  for (const f of found) {
    try {
      const content = await fs.readFile(path.join(cwd, f), { encoding: 'utf-8' });
      if (content.includes('<log') || content.includes('<?xml')) realXes.push(f);
    } catch {
      // unreadable — skip
    }
  }

  if (realXes.length === 0) {
    return {
      name: 'XES event logs',
      pathology: 'REPRODUCIBILITY_TRUTH_FAULT',
      severity: 'STOP_THE_LINE',
      message: `${found.length} .xes file(s) found but none contain valid XES XML — AAT requires real data`,
      fix: 'Replace placeholder files with real XES event logs',
    };
  }

  const preview =
    realXes.slice(0, 3).join(', ') + (realXes.length > 3 ? ` (+${realXes.length - 3} more)` : '');
  return {
    name: 'XES event logs',
    pathology: 'REPRODUCIBILITY_TRUTH_FAULT',
    severity: 'INFO',
    message: `${realXes.length} real XES file(s): ${preview}`,
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
  const rootDir = resolveWorkspaceRoot();
  if (!rootDir) {
    return {
      name: 'TypeScript compilation',
      pathology: 'EPISTEMIC_FAULT',
      severity: 'INFO',
      message: 'Skipped — workspace root not found',
    };
  }

  // Run pnpm lint asynchronously with a hard 4-second cap.
  // Using async spawn (not spawnSync) so the event loop stays free for
  // other parallel ENV_CHECKS while lint runs in a child process.
  // 4 s keeps the total `doctor env` wall-clock under 10 s (the test SLA).
  const LINT_TIMEOUT_MS = 4000;

  const { spawn } = await import('child_process');

  return new Promise<Diagnosis>((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const child = spawn('pnpm', ['lint'], {
      cwd: rootDir,
      stdio: 'pipe',
      shell: false,
    });

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      resolve({
        name: 'TypeScript compilation',
        pathology: 'EPISTEMIC_FAULT',
        severity: 'WARNING',
        message: `pnpm lint skipped — timed out after ${LINT_TIMEOUT_MS / 1000}s (run manually: pnpm lint)`,
        fix: 'Fix per-package TypeScript errors: pnpm lint',
      });
    }, LINT_TIMEOUT_MS);

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        name: 'TypeScript compilation',
        pathology: 'EPISTEMIC_FAULT',
        severity: 'WARNING',
        message: `pnpm lint could not run: ${err.message}`,
        fix: 'Fix per-package TypeScript errors: pnpm lint',
      });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({
          name: 'TypeScript compilation',
          pathology: 'EPISTEMIC_FAULT',
          severity: 'INFO',
          message: 'pnpm lint passes (per-package tsc --noEmit clean)',
        });
        return;
      }
      const combined = stdout + stderr;
      const errorLines = combined
        .split('\n')
        .filter((l) => /error TS\d+|ELIFECYCLE|RECURSIVE_RUN_FIRST_FAIL/.test(l));
      resolve({
        name: 'TypeScript compilation',
        pathology: 'EPISTEMIC_FAULT',
        severity: 'WARNING',
        message: `pnpm lint failed (${errorLines.length} error line(s)) — run: pnpm lint for details`,
        fix: 'Fix per-package TypeScript errors: pnpm lint',
      });
    });
  });
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
  const rootDir = resolveWorkspaceRoot();
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

  const jsFile = path.join(wasmPkgDir, 'wasm4pm.js');
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

    // Known algorithm functions (actual wasm_bindgen export names)
    const expected: string[] = [
      'discover_dfg',
      'extract_process_skeleton',
      'discover_alpha_plus_plus',
      'discover_heuristic_miner',
      'discover_inductive_miner',
      'discover_hill_climbing',
      'discover_declare',
      'discover_simulated_annealing',
      'discover_astar',
      'discover_aco_algorithm',
      'discover_pso_algorithm',
      'discover_genetic_algorithm',
      'discover_ilp_petri_net',
      'discover_powl_from_log',
    ];

    const missing = expected.filter((name) => typeof mod[name] !== 'function');

    if (missing.length === 0) {
      return {
        name: 'Algorithm registry',
        pathology: 'ENVIRONMENT_FAULT',
        severity: 'INFO',
        message: `All ${expected.length} core WASM exports verified (kernel registry has more)`,
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
  const rootDir = resolveWorkspaceRoot();
  if (!rootDir) {
    return {
      name: 'Workspace integrity',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — workspace root not found',
    };
  }

  const expectedPackages = [
    'packages/agents',
    'packages/cognition',
    'packages/config',
    'packages/contracts',
    'packages/engine',
    'packages/kernel',
    'packages/ml',
    'packages/observability',
    'packages/planner',
    'packages/swarm',
    'packages/testing',
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
// ────────────────────────────────────────────────────────────────────────────
// Claude Code Integration Checks (bleeding-edge best practices)
//
// These validate the Claude Code configuration itself: hook wiring, CLAUDE.md
// project context, and the memory index health. A broken hook is silent — it
// fires, does nothing, and Claude operates without its TPS enforcement layer.
// ────────────────────────────────────────────────────────────────────────────

// Check 18: .claude/settings.json present and valid JSON
async function checkClaudeCodeSettings(): Promise<Diagnosis> {
  const rootDir = resolveWorkspaceRoot();
  if (!rootDir) {
    return {
      name: 'Claude Code settings',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — workspace root not found',
    };
  }

  const settingsPath = path.join(rootDir, '.claude', 'settings.json');
  if (!existsSync(settingsPath)) {
    return {
      name: 'Claude Code settings',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'STOP_THE_LINE',
      message: '.claude/settings.json missing — Claude Code hooks will not fire',
      fix: 'Create .claude/settings.json with hooks configuration',
    };
  }

  try {
    const raw = readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const hookEvents = Object.keys((parsed.hooks as Record<string, unknown>) ?? {});
    return {
      name: 'Claude Code settings',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'INFO',
      message: `.claude/settings.json valid — ${hookEvents.length} hook event(s): ${hookEvents.join(', ')}`,
    };
  } catch {
    return {
      name: 'Claude Code settings',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'STOP_THE_LINE',
      message:
        '.claude/settings.json is invalid JSON — Claude Code cannot parse hook configuration',
      fix: 'Fix JSON syntax in .claude/settings.json',
    };
  }
}

// Check 19: Wired hook files present on disk and executable
async function checkHookFiles(): Promise<Diagnosis> {
  const rootDir = resolveWorkspaceRoot();
  if (!rootDir) {
    return {
      name: 'Hook files',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — workspace root not found',
    };
  }

  const settingsPath = path.join(rootDir, '.claude', 'settings.json');
  if (!existsSync(settingsPath)) {
    return {
      name: 'Hook files',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — no .claude/settings.json',
    };
  }

  let hooks: Record<
    string,
    Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>
  >;
  try {
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf8')) as { hooks?: typeof hooks };
    hooks = parsed.hooks ?? {};
  } catch {
    return {
      name: 'Hook files',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — settings.json parse error',
    };
  }

  if (Object.keys(hooks).length === 0) {
    return {
      name: 'Hook files',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'WARNING',
      message: 'No hooks wired in .claude/settings.json — TPS enforcement gates inactive',
      fix: 'Add hook configuration to .claude/settings.json',
    };
  }

  const missing: string[] = [];
  const notExecutable: string[] = [];

  for (const eventHooks of Object.values(hooks)) {
    for (const entry of eventHooks) {
      for (const hook of entry.hooks ?? []) {
        // Resolve "$CLAUDE_PROJECT_DIR" placeholder (may be quoted in the string)
        const resolved = hook.command.replace(/"?\$CLAUDE_PROJECT_DIR"?/g, rootDir);
        const scriptMatch = resolved.match(/(\S+\.sh)/);
        if (!scriptMatch) continue;
        const scriptPath = scriptMatch[1];
        if (!existsSync(scriptPath)) {
          missing.push(path.relative(rootDir, scriptPath));
        } else if (!(statSync(scriptPath).mode & 0o111)) {
          notExecutable.push(path.relative(rootDir, scriptPath));
        }
      }
    }
  }

  if (missing.length > 0) {
    return {
      name: 'Hook files',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'STOP_THE_LINE',
      message: `${missing.length} wired hook(s) missing from disk: ${missing.slice(0, 3).join(', ')}`,
      fix: 'Restore missing hook files or remove from .claude/settings.json',
    };
  }
  if (notExecutable.length > 0) {
    return {
      name: 'Hook files',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'WARNING',
      message: `${notExecutable.length} hook(s) not executable: ${notExecutable.join(', ')}`,
      fix: `chmod +x ${notExecutable.join(' ')}`,
    };
  }

  const total = Object.values(hooks).flatMap((ev) => ev.flatMap((e) => e.hooks ?? [])).length;
  return {
    name: 'Hook files',
    pathology: 'DEPLOYABILITY_TRUTH_FAULT',
    severity: 'INFO',
    message: `${total} wired hook(s) present and executable`,
  };
}

// Check 20: CLAUDE.md present (project context for Claude Code)
async function checkClaudeMd(): Promise<Diagnosis> {
  const rootDir = resolveWorkspaceRoot();
  if (!rootDir) {
    return {
      name: 'CLAUDE.md',
      pathology: 'EPISTEMIC_FAULT',
      severity: 'INFO',
      message: 'Skipped — workspace root not found',
    };
  }

  const claudeMdPath = path.join(rootDir, 'CLAUDE.md');
  if (!existsSync(claudeMdPath)) {
    return {
      name: 'CLAUDE.md',
      pathology: 'EPISTEMIC_FAULT',
      severity: 'STOP_THE_LINE',
      message: 'CLAUDE.md missing — Claude Code operates without project context',
      fix: 'Create CLAUDE.md or run: wpm init',
    };
  }

  const content = readFileSync(claudeMdPath, 'utf8');
  if (content.trim().length < 100) {
    return {
      name: 'CLAUDE.md',
      pathology: 'EPISTEMIC_FAULT',
      severity: 'WARNING',
      message: 'CLAUDE.md appears to be a stub (< 100 chars)',
      fix: 'Populate CLAUDE.md with project architecture and Claude Code configuration',
    };
  }

  return {
    name: 'CLAUDE.md',
    pathology: 'EPISTEMIC_FAULT',
    severity: 'INFO',
    message: `CLAUDE.md present (${(content.length / 1024).toFixed(1)} KB)`,
  };
}

// Check 21: Memory index within 200-line limit
async function checkMemoryIndex(): Promise<Diagnosis> {
  const rootDir = resolveWorkspaceRoot();
  if (!rootDir) {
    return {
      name: 'Memory index',
      pathology: 'EPISTEMIC_FAULT',
      severity: 'INFO',
      message: 'Skipped — workspace root not found',
    };
  }

  // Project-scoped memory: ~/.claude/projects/<encoded-path>/memory/MEMORY.md
  // Claude Code encodes paths by replacing '/' with '-' (leading '-' is preserved)
  const encoded = rootDir.replace(/\//g, '-');
  const memoryPath = path.join(os.homedir(), '.claude', 'projects', encoded, 'memory', 'MEMORY.md');

  if (!existsSync(memoryPath)) {
    return {
      name: 'Memory index',
      pathology: 'EPISTEMIC_FAULT',
      severity: 'INFO',
      message:
        'No project memory index — Claude Code starts each session without persistent context',
    };
  }

  const content = readFileSync(memoryPath, 'utf8');
  const lines = content.split('\n').length;
  if (lines > 200) {
    return {
      name: 'Memory index',
      pathology: 'EPISTEMIC_FAULT',
      severity: 'WARNING',
      message: `MEMORY.md is ${lines} lines — content past line 200 is truncated by Claude Code`,
      fix: `Prune stale entries in ${memoryPath}`,
    };
  }

  const entryCount = (content.match(/^- \[/gm) ?? []).length;
  return {
    name: 'Memory index',
    pathology: 'EPISTEMIC_FAULT',
    severity: 'INFO',
    message: `Memory index healthy (${lines}/200 lines, ${entryCount} entries)`,
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

export const CLAUDE_CODE_CHECKS: Array<() => Promise<Diagnosis>> = [
  checkClaudeCodeSettings,
  checkHookFiles,
  checkClaudeMd,
  checkMemoryIndex,
];

export const ALL_CHECKS = [...ENV_CHECKS, ...TPS_CHECKS, ...CLAUDE_CODE_CHECKS];

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function resolveWorkspaceRoot(): string | null {
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
// Formatting helpers (used in ConsoleRenderers and interactive subcommands)
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
  formatter.log('wasm4pm doctor — epistemic diagnostician & autonomic governor');
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
          } else if (fixText.includes('wasm4pm init')) {
              inferredRepairMode = 'SCAFFOLD_CONFIG';
              inferredRepairCmd = 'wasm4pm init';
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
  formatter.log(`Result: ${report.info} INFO  ${report.warnings} WARNINGS  ${report.stopTheLine} STOP_THE_LINE`);
  formatter.log('');

  if (report.epistemicHealth) {
    formatter.success('System is epistemically healthy and operationally ready.');
  } else {
    formatter.error('STOP THE LINE: System is epistemically unhealthy or missing critical deployment artifacts.');
  }
  formatter.log('');
}

// ────────────────────────────────────────────────────────────────────────────
// Command definition
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
    hooks: doctorHooks,
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
});
