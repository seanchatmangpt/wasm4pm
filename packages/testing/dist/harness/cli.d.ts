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
/** Known exit codes — must match wpm exit-codes.ts */
export declare const EXIT_CODES: {
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