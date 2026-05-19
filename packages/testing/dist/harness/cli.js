/**
 * CLI integration test helpers.
 *
 * Provides utilities to spawn wpm as a child process, capture stdout/stderr,
 * and assert on exit codes without depending on the actual CLI implementation.
 */
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
/**
 * Known exit codes — must match wpm exit-codes.ts.
 *
 * Both UPPERCASE and lowercase aliases are exported. Older tests use SCREAMING_SNAKE
 * style (`EXIT_CODES.SUCCESS`); newer tests use lowercase (`EXIT_CODES.success`).
 * Both are valid; the lowercase form matches the contract names used in the JSON
 * envelope's `error.code` field.
 */
export const EXIT_CODES = {
    success: 0,
    config_error: 1,
    source_error: 2,
    execution_error: 3,
    partial_failure: 4,
    system_error: 5,
    conformance_fail: 6,
};
/**
 * Create an isolated temp environment for CLI tests.
 */
export async function createCliTestEnv(configContent) {
    const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wasm4pm-cli-'));
    const outputDir = path.join(tempDir, 'output');
    await fs.mkdir(outputDir, { recursive: true });
    const configPath = path.join(tempDir, 'wasm4pm.json');
    if (configContent) {
        await fs.writeFile(configPath, configContent, 'utf-8');
    }
    return {
        tempDir,
        configPath,
        outputDir,
        env: {},
        cleanup: async () => {
            try {
                // Remove test temp directory
                await fs.rm(tempDir, { recursive: true, force: true });
            }
            catch {
                // best effort
            }
            try {
                // Remove global .wasm4pm/ artifacts (results, receipts, cache) to prevent cross-test pollution
                await fs.rm('.wasm4pm', { recursive: true, force: true });
            }
            catch {
                // best effort — .wasm4pm may not exist
            }
        },
    };
}
/**
 * Run a CLI command and capture output.
 */
export function runCli(args, options) {
    // Default: directly invoke the built CLI binary to avoid npx resolution issues.
    // Tests can override via options.cliPath. Falls back to 'wpm' if dist not found.
    const defaultBinary = (() => {
        const candidates = [
            path.resolve(process.cwd(), 'apps/wasm4pm/dist/bin/wpm.js'),
            path.resolve(process.cwd(), '../../apps/wasm4pm/dist/bin/wpm.js'),
            path.resolve(process.cwd(), '../apps/wasm4pm/dist/bin/wpm.js'),
        ];
        for (const c of candidates)
            if (existsSync(c))
                return c;
        return undefined;
    })();
    // When user explicitly provides cliPath, honor it as the executable verbatim.
    // When falling back to defaultBinary, run via `node <binary>`.
    let exec;
    let fullArgs;
    if (options?.cliPath) {
        exec = options.cliPath;
        fullArgs = args;
    }
    else if (defaultBinary) {
        exec = process.execPath;
        fullArgs = [defaultBinary, ...args];
    }
    else {
        exec = 'npx';
        fullArgs = ['wasm4pm', ...args];
    }
    const timeout = options?.timeout ?? 30000;
    return new Promise((resolve) => {
        const start = Date.now();
        // Build minimal env to avoid vitest's process.env interference with child process stdout
        const env = { PATH: process.env.PATH || '', HOME: process.env.HOME || '', ...(options?.env || {}) };
        const child = execFile(exec, fullArgs, {
            cwd: options?.cwd,
            env,
            timeout,
            maxBuffer: 10 * 1024 * 1024,
        }, (error, stdout, stderr) => {
            const durationMs = Date.now() - start;
            const exitCode = error && 'code' in error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
            resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '', durationMs });
        });
        // Handle process timeout
        child.on('error', () => {
            resolve({
                exitCode: EXIT_CODES.system_error,
                stdout: '',
                stderr: 'Process failed to start',
                durationMs: Date.now() - start,
            });
        });
    });
}
/**
 * Assert that a CLI result matches expected exit code.
 *
 * When the assertion fails, output is truncated at 500 chars with an explicit
 * "[... N chars truncated]" trailer so the practitioner knows there is more
 * context available rather than seeing a cliff-edge mid-word.
 */
export function assertExitCode(result, expected) {
    if (result.exitCode !== expected) {
        const truncate = (s, limit = 500) => s.length > limit ? s.slice(0, limit) + `\n[... ${s.length - limit} chars truncated]` : s;
        throw new Error(`Exit code mismatch: expected ${expected}, got ${result.exitCode} (${result.durationMs}ms)\n` +
            `stdout: ${truncate(result.stdout)}\n` +
            `stderr: ${truncate(result.stderr)}`);
    }
}
/**
 * Assert that stdout contains expected JSON.
 */
export function assertJsonOutput(result) {
    try {
        return JSON.parse(result.stdout);
    }
    catch {
        throw new Error(`Expected JSON stdout, got: ${result.stdout.slice(0, 500)}`);
    }
}
/**
 * Assert that stderr contains an error code.
 */
export function assertErrorCode(result, errorCode) {
    if (!result.stderr.includes(errorCode) && !result.stdout.includes(errorCode)) {
        throw new Error(`Expected error code '${errorCode}' in output\n` +
            `stdout: ${result.stdout.slice(0, 500)}\n` +
            `stderr: ${result.stderr.slice(0, 500)}`);
    }
}
/**
 * Write a config file and return its path.
 */
export async function writeTestConfig(dir, config, filename = 'wasm4pm.json') {
    const filePath = path.join(dir, filename);
    await fs.writeFile(filePath, JSON.stringify(config, null, 2), 'utf-8');
    return filePath;
}
/**
 * Read a receipt file from the output directory.
 */
export async function readReceipt(outputDir, filename = 'receipt.json') {
    const content = await fs.readFile(path.join(outputDir, filename), 'utf-8');
    return JSON.parse(content);
}
//# sourceMappingURL=cli.js.map