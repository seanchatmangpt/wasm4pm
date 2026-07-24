import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { defineVerb, NounVerbError } from '@wasm4pm/noun-verb';
import { runInterviewAssistSession } from './interview-assist-runtime.js';

const DEFAULT_TIMEOUT_MS = 120_000;

function parsePositiveInteger(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw NounVerbError.invalidInput(`${name} must be a positive integer`);
  }
  return parsed;
}

export const interviewAssistVerb = defineVerb({
  noun: 'lab',
  verb: 'interview-assist',
  summary: 'Run the real InterviewAssist HTTP receipt chain and persist independently readable evidence',
  stability: 'experimental',
  args: {
    workspace: { type: 'string', description: 'wasm4pm repository root (defaults to the current directory)' },
    output: { type: 'string', description: 'Evidence JSON path relative to the command working directory' },
    port: { type: 'string', description: 'Local Next server port (defaults to an available ephemeral port)' },
    'timeout-ms': { type: 'string', description: 'Overall server/startup timeout in milliseconds' },
  } as const,
  handler: async (args, ctx) => {
    const workspace = resolve(ctx.cwd, typeof args.workspace === 'string' && args.workspace.trim() ? args.workspace : '.');
    const appPackage = join(workspace, 'examples', 'interview-assist', 'package.json');
    try {
      await access(appPackage);
    } catch (error) {
      throw NounVerbError.invalidInput(`InterviewAssist package not found at ${appPackage}`, {
        workspace,
        cause: error instanceof Error ? error.message : String(error),
      });
    }

    const port = parsePositiveInteger(args.port, '--port');
    if (port !== undefined && (port < 1024 || port > 65535)) {
      throw NounVerbError.invalidInput('--port must be between 1024 and 65535');
    }
    const timeoutMs = parsePositiveInteger(args['timeout-ms'], '--timeout-ms') ?? DEFAULT_TIMEOUT_MS;
    const evidencePath = resolve(
      ctx.cwd,
      typeof args.output === 'string' && args.output.trim()
        ? args.output
        : join('.wasm4pm', 'interview-assist', 'latest.json'),
    );

    try {
      return await runInterviewAssistSession({
        workspace,
        evidencePath,
        port,
        timeoutMs,
        env: { ...process.env, ...ctx.env },
      });
    } catch (error) {
      throw NounVerbError.executionError(
        `InterviewAssist verification failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  },
});
