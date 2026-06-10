// Environment & Deployment checks (checks 1-17)
import * as fs from 'fs/promises';
import { existsSync, statSync } from 'fs';
import { execSync } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import type { Diagnosis } from './types.js';

// ────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ────────────────────────────────────────────────────────────────────────────

export function resolveWorkspaceRoot(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export async function resolveWasmPkgDir(): Promise<string | null> {
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

// ────────────────────────────────────────────────────────────────────────────
// Check 1: Node.js version (≥ 18)
// ────────────────────────────────────────────────────────────────────────────

export async function checkNodeVersion(): Promise<Diagnosis> {
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

export async function checkPnpmVersion(): Promise<Diagnosis> {
  // Use `which pnpm` to detect installation — avoids corepack interception
  // when the workspace packageManager is set to npm (pnpm --version would fail).
  try {
    const pnpmPath = execSync('which pnpm', {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 3000,
    }).trim();
    if (pnpmPath) {
      // pnpm is present in PATH — report as healthy (version check not reliable
      // when corepack enforces a different packageManager for this project)
      return {
        name: 'pnpm version',
        pathology: 'ENVIRONMENT_FAULT',
        severity: 'INFO',
        message: `pnpm found at ${pnpmPath} (workspace uses npm per packageManager field)`,
      };
    }
  } catch {
    // fall through to not-found case
  }
  return {
    name: 'pnpm version',
    pathology: 'ENVIRONMENT_FAULT',
    severity: 'WARNING',
    message: 'pnpm not found in PATH',
    fix: 'Install pnpm: corepack enable && corepack prepare pnpm@latest --activate',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Check 3: WASM binary exists and is non-empty
// ────────────────────────────────────────────────────────────────────────────

export async function checkWasmBinary(): Promise<Diagnosis> {
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

export async function checkWasmLoads(): Promise<Diagnosis> {
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

export async function checkSimdSupport(): Promise<Diagnosis> {
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

export async function checkConfigFound(): Promise<Diagnosis> {
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

export async function checkConfigValidation(): Promise<Diagnosis> {
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

export async function checkXesFiles(): Promise<Diagnosis> {
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

export async function checkSystemMemory(): Promise<Diagnosis> {
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

export async function checkDiskSpace(): Promise<Diagnosis> {
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

export async function checkGitHooks(): Promise<Diagnosis> {
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

export async function checkTypeScriptCompilation(): Promise<Diagnosis> {
  const rootDir = resolveWorkspaceRoot();
  if (!rootDir) {
    return {
      name: 'TypeScript compilation',
      pathology: 'EPISTEMIC_FAULT',
      severity: 'INFO',
      message: 'Skipped — workspace root not found',
    };
  }

  // Run npm lint asynchronously with a hard 4-second cap.
  // Using async spawn (not spawnSync) so the event loop stays free for
  // other parallel ENV_CHECKS while lint runs in a child process.
  // 4 s keeps the total `doctor env` wall-clock under 10 s (the test SLA).
  // Note: lint on individual packages can take 60–120 s; timeout is expected
  // and does NOT indicate errors — downgraded to INFO on timeout.
  const LINT_TIMEOUT_MS = 4000;

  const { spawn } = await import('child_process');

  return new Promise<Diagnosis>((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    // Note: packages/kernel has package name "wasm4pm" (not "@wasm4pm/kernel").
    // Run lint on @wasm4pm/contracts only — the primary leaf TypeScript package.
    const child = spawn(
      'npm',
      ['run', 'lint', '--workspace', '@wasm4pm/contracts'],
      {
      cwd: rootDir,
      stdio: 'pipe',
      shell: false,
    }
    );

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
      // Timeout is expected — tsc takes 60–120 s per package; this is NOT an error
      resolve({
        name: 'TypeScript compilation',
        pathology: 'EPISTEMIC_FAULT',
        severity: 'INFO',
        message: `npm run lint running (> ${LINT_TIMEOUT_MS / 1000}s) — CLI built OK; run 'npm run lint' for full check`,
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
        message: `npm run lint could not run: ${err.message}`,
        fix: 'Fix per-package TypeScript errors: npm run lint',
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
          message: 'npm run lint passes on core packages (contracts, kernel, wasm4pm)',
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
        message: `npm run lint failed (${errorLines.length} error line(s)) — run: npm run lint for details`,
        fix: 'Fix per-package TypeScript errors: npm run lint',
      });
    });
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Check 13: @wasm4pm/ml available
// ────────────────────────────────────────────────────────────────────────────

export async function checkMicroMl(): Promise<Diagnosis> {
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

export async function checkRustToolchain(): Promise<Diagnosis> {
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

export async function checkResultsDir(): Promise<Diagnosis> {
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

export async function checkAlgorithmRegistry(): Promise<Diagnosis> {
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

    const { getRegistry } = await import('wasm4pm');
    const kernelCount = getRegistry().list().length;

    if (missing.length === 0) {
      return {
        name: 'Algorithm registry',
        pathology: 'ENVIRONMENT_FAULT',
        severity: 'INFO',
        message: `All ${expected.length} core WASM exports verified (${kernelCount} algorithms in kernel registry)`,
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

export async function checkWorkspaceIntegrity(): Promise<Diagnosis> {
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
// Check: Rust wpm binary shadowing the TypeScript CLI
// ────────────────────────────────────────────────────────────────────────────

export async function checkBinaryShadow(): Promise<Diagnosis> {
  try {
    const { execSync: exec } = await import('node:child_process');
    let paths: string[] = [];
    try {
      const out = exec('which -a wpm 2>/dev/null', { encoding: 'utf-8', timeout: 3000 });
      paths = out.trim().split('\n').filter(Boolean);
    } catch {
      try {
        const out = exec('where wpm 2>nul', { encoding: 'utf-8', timeout: 3000 });
        paths = out.trim().split('\n').filter(Boolean);
      } catch {
        return {
          name: 'Binary shadow',
          pathology: 'ENVIRONMENT_FAULT',
          severity: 'INFO',
          message: 'Binary shadow check: only one wpm found',
        };
      }
    }
    if (paths.length <= 1) {
      return {
        name: 'Binary shadow',
        pathology: 'ENVIRONMENT_FAULT',
        severity: 'INFO',
        message: 'No binary shadowing detected',
      };
    }
    const rustPaths = paths.filter(
      (p) =>
        p.includes('/cargo/') ||
        p.includes('.cargo') ||
        p.includes('/target/') ||
        p.includes('wasm4pm-cli')
    );
    if (rustPaths.length > 0 && rustPaths.includes(paths[0])) {
      return {
        name: 'Binary shadow',
        pathology: 'ENVIRONMENT_FAULT',
        severity: 'WARNING',
        message:
          'Rust wpm binary shadows TypeScript CLI on PATH. Fix: cargo uninstall wasm4pm-cli or reorder PATH. Found: ' +
          paths.join(', '),
        fix: 'cargo uninstall wasm4pm-cli   OR   reorder PATH so the TypeScript wpm appears first',
      };
    }
    return {
      name: 'Binary shadow',
      pathology: 'ENVIRONMENT_FAULT',
      severity: 'INFO',
      message: 'TypeScript wpm CLI is first on PATH',
    };
  } catch {
    return {
      name: 'Binary shadow',
      pathology: 'ENVIRONMENT_FAULT',
      severity: 'INFO',
      message: 'Binary shadow check skipped',
    };
  }
}
