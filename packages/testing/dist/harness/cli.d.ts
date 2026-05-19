/**
 * CLI integration test helpers.
 *
 * Provides utilities to spawn wpm as a child process, capture stdout/stderr,
 * and assert on exit codes without depending on the actual CLI implementation.
 */
export interface CliResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    durationMs: number;
}
export interface CliTestEnv {
    tempDir: string;
    configPath: string;
    outputDir: string;
    env?: Record<string, string>;
    cleanup: () => Promise<void>;
}
/**
 * Known exit codes — must match wpm exit-codes.ts.
 *
 * Both UPPERCASE and lowercase aliases are exported. Older tests use SCREAMING_SNAKE
 * style (`EXIT_CODES.SUCCESS`); newer tests use lowercase (`EXIT_CODES.success`).
 * Both are valid; the lowercase form matches the contract names used in the JSON
 * envelope's `error.code` field.
 */
export declare const EXIT_CODES: {
    readonly SUCCESS: 0;
    readonly CONFIG_ERROR: 1;
    readonly SOURCE_ERROR: 2;
    readonly EXECUTION_ERROR: 3;
    readonly PARTIAL_FAILURE: 4;
    readonly SYSTEM_ERROR: 5;
    readonly success: 0;
    readonly config_error: 1;
    readonly source_error: 2;
    readonly execution_error: 3;
    readonly partial_failure: 4;
    readonly system_error: 5;
    readonly conformance_fail: 6;
};
export type ExitCodeName = keyof typeof EXIT_CODES;
/**
 * Create an isolated temp environment for CLI tests.
 */
export declare function createCliTestEnv(configContent?: string): Promise<CliTestEnv>;
/**
 * Run a CLI command and capture output.
 */
export declare function runCli(args: string[], options?: {
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
    cliPath?: string;
}): Promise<CliResult>;
/**
 * Assert that a CLI result matches expected exit code.
 *
 * When the assertion fails, output is truncated at 500 chars with an explicit
 * "[... N chars truncated]" trailer so the practitioner knows there is more
 * context available rather than seeing a cliff-edge mid-word.
 */
export declare function assertExitCode(result: CliResult, expected: number): void;
/**
 * Assert that stdout contains expected JSON.
 */
export declare function assertJsonOutput(result: CliResult): unknown;
/**
 * Assert that stderr contains an error code.
 */
export declare function assertErrorCode(result: CliResult, errorCode: string): void;
/**
 * Write a config file and return its path.
 */
export declare function writeTestConfig(dir: string, config: Record<string, unknown>, filename?: string): Promise<string>;
/**
 * Read a receipt file from the output directory.
 */
export declare function readReceipt(outputDir: string, filename?: string): Promise<Record<string, unknown>>;
//# sourceMappingURL=cli.d.ts.map