import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { runCli, CliTestEnv, EXIT_CODES, CliResult } from '../harness/cli';
import { ReceiptValidator, createReceiptValidator } from './receipt-validator';

export interface TestTelemetry {
  spans: any[];
}

export interface TestContext {
  env: CliTestEnv;
  harness: {
    run: (args: string[], options?: Parameters<typeof runCli>[1]) => Promise<CliResult>;
    assertRefusal: (args: string[], expectedCode: number, errorPattern: RegExp) => Promise<void>;
  };
  telemetry: TestTelemetry;
  receipts: ReceiptValidator;
  cleanup: () => Promise<void>;
}

export async function createTestContext(): Promise<TestContext> {
  const env = await createIsolatedEnv();
  const telemetry: TestTelemetry = { spans: [] };
  
  return {
    env,
    harness: {
      run: async (args, options) => {
        // Auto-instrumentation: inject telemetry/env vars
        const result = await runCli(args, { 
          ...options, 
          cwd: env.tempDir,
          env: { ...options?.env, WASM4PM_OTEL_ENABLED: 'true' }
        });
        // In a real implementation, we'd parse .wasm4pm/spans.jsonl here to populate telemetry.spans
        return result;
      },
      assertRefusal: async (args, expectedCode, errorPattern) => {
        // Direct call to runCli (imported from ./cli) instead of ctx.harness.run
        const result = await runCli(args, { cwd: env.tempDir });
        if (result.exitCode !== expectedCode) {
          throw new Error(`Expected refusal code ${expectedCode}, got ${result.exitCode}`);
        }
        const output = result.stdout + result.stderr;
        if (!errorPattern.test(output)) {
          throw new Error(`Expected refusal pattern ${errorPattern} not found in: ${output}`);
        }
      }
    },
    telemetry,
    receipts: createReceiptValidator(),
    cleanup: env.cleanup,
  };
}

async function createIsolatedEnv(): Promise<CliTestEnv> {
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wasm4pm-test-'));
  const outputDir = path.join(tempDir, 'output');
  await fs.mkdir(outputDir, { recursive: true });

  return {
    tempDir,
    configPath: path.join(tempDir, 'wasm4pm.json'),
    outputDir,
    env: {},
    cleanup: async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        await fs.rm('.wasm4pm', { recursive: true, force: true });
      } catch {
        // best effort
      }
    },
  };
}
