import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const CHECKSUM_PATTERN = /^[0-9a-f]{64}$/;
const MAX_SERVER_LOG_BYTES = 32_000;
const MAX_HTTP_BODY_BYTES = 2_000_000;

const PASSING_TWO_SUM_SOURCE = [
  'def two_sum(nums, target):',
  '    seen = {}',
  '    for index, value in enumerate(nums):',
  '        complement = target - value',
  '        if complement in seen:',
  '            return [seen[complement], index]',
  '        seen[value] = index',
  '    return []',
  '',
  'if __name__ == "__main__":',
  '    print(two_sum([2, 7, 11, 15], 9))',
  '',
].join('\n');

interface ReceiptJson {
  label?: string;
  used: string[];
  generated?: string;
  derivedFrom?: string;
  relation?: string;
  checksum: {
    algorithm: 'BLAKE3';
    checksumValue: string;
  };
}

interface HttpResult {
  status: number;
  body: unknown;
  raw: string;
}

interface StageEvidence {
  stage: 'admission' | 'cognition-run' | 'sandbox-execution' | 'test-result' | 'accessibility-projection';
  http_status: number;
  receipt: ReceiptJson;
}

export interface InterviewAssistRunOptions {
  workspace: string;
  evidencePath: string;
  port?: number;
  timeoutMs: number;
  env: NodeJS.ProcessEnv;
}

export interface InterviewAssistRunResult {
  status: 'verified';
  evidence_path: string;
  receipt_count: number;
  stages: StageEvidence['stage'][];
  chain_head: string;
  chain_tail: string;
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${context} did not return a JSON object`);
  }
  return value as Record<string, unknown>;
}

function asReceipt(value: unknown, context: string): ReceiptJson {
  const record = asRecord(value, context);
  const checksum = asRecord(record.checksum, `${context}.checksum`);
  if (checksum.algorithm !== 'BLAKE3' || typeof checksum.checksumValue !== 'string') {
    throw new Error(`${context} did not contain a BLAKE3 checksum`);
  }
  if (!CHECKSUM_PATTERN.test(checksum.checksumValue)) {
    throw new Error(`${context} checksum was not lowercase BLAKE3 hex-64`);
  }
  if (!Array.isArray(record.used) || !record.used.every((item) => typeof item === 'string')) {
    throw new Error(`${context}.used was not a string array`);
  }
  for (const key of ['label', 'generated', 'derivedFrom', 'relation'] as const) {
    if (record[key] !== undefined && typeof record[key] !== 'string') {
      throw new Error(`${context}.${key} was not a string`);
    }
  }
  return record as unknown as ReceiptJson;
}

function assertContinuousChain(stages: readonly StageEvidence[]): void {
  if (stages.length !== 5) throw new Error(`expected five receipt stages, observed ${stages.length}`);
  const checksums = new Set<string>();
  for (let index = 0; index < stages.length; index += 1) {
    const current = stages[index]!.receipt;
    const checksum = current.checksum.checksumValue;
    if (checksums.has(checksum)) throw new Error(`receipt checksum repeated at stage ${stages[index]!.stage}`);
    checksums.add(checksum);
    if (index === 0) {
      if (current.derivedFrom !== undefined || current.relation !== undefined) {
        throw new Error('admission receipt unexpectedly had a predecessor');
      }
      continue;
    }
    const predecessor = stages[index - 1]!.receipt.checksum.checksumValue;
    if (current.derivedFrom !== predecessor || current.relation !== predecessor) {
      throw new Error(`receipt predecessor mismatch at stage ${stages[index]!.stage}`);
    }
  }
}

function requestJson(url: string, method: 'GET' | 'POST', body: unknown, timeoutMs: number): Promise<HttpResult> {
  return new Promise<HttpResult>((resolvePromise, rejectPromise) => {
    const target = new URL(url);
    const encoded = body === undefined ? undefined : JSON.stringify(body);
    const req = request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method,
        headers:
          encoded === undefined
            ? undefined
            : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(encoded) },
      },
      (response) => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          raw += chunk;
          if (raw.length > MAX_HTTP_BODY_BYTES) {
            req.destroy(new Error(`HTTP response exceeded ${MAX_HTTP_BODY_BYTES} bytes`));
          }
        });
        response.on('end', () => {
          let parsed: unknown = undefined;
          if (raw.trim().length > 0) {
            try {
              parsed = JSON.parse(raw) as unknown;
            } catch {
              parsed = undefined;
            }
          }
          resolvePromise({ status: response.statusCode ?? 0, body: parsed, raw });
        });
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`HTTP request timed out after ${timeoutMs}ms`)));
    req.once('error', rejectPromise);
    if (encoded !== undefined) req.write(encoded);
    req.end();
  });
}

async function postJson(url: string, body: unknown, timeoutMs: number): Promise<HttpResult> {
  const result = await requestJson(url, 'POST', body, timeoutMs);
  if (result.body === undefined) {
    throw new Error(`POST ${url} returned non-JSON body (HTTP ${result.status}): ${result.raw.slice(0, 300)}`);
  }
  return result;
}

async function reservePort(): Promise<number> {
  const server = createServer();
  server.unref();
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => resolvePromise());
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : undefined;
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.close((error) => (error ? rejectPromise(error) : resolvePromise()));
  });
  if (port === undefined) throw new Error('unable to reserve a local TCP port');
  return port;
}

function appendServerLog(current: string, chunk: Buffer | string): string {
  const next = current + chunk.toString();
  return next.length <= MAX_SERVER_LOG_BYTES ? next : next.slice(next.length - MAX_SERVER_LOG_BYTES);
}

async function waitForServer(
  baseUrl: string,
  child: ChildProcess,
  timeoutMs: number,
  readLog: () => string,
  readSpawnError: () => Error | undefined,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'server did not answer';
  while (Date.now() < deadline) {
    const spawnError = readSpawnError();
    if (spawnError) throw new Error(`Next server failed to start: ${spawnError.message}\n${readLog()}`);
    if (child.exitCode !== null) throw new Error(`Next server exited with code ${child.exitCode}\n${readLog()}`);
    try {
      const result = await requestJson(`${baseUrl}/api/admission`, 'GET', undefined, 2_000);
      if (result.status > 0 && result.status < 500) return;
      lastError = `readiness endpoint returned HTTP ${result.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(250);
  }
  throw new Error(`Next server readiness timed out: ${lastError}\n${readLog()}`);
}

async function terminateProcessTree(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  const exited = once(child, 'exit').then(() => undefined).catch(() => undefined);
  const signal = (name: NodeJS.Signals): void => {
    try {
      if (process.platform !== 'win32' && typeof child.pid === 'number') process.kill(-child.pid, name);
      else child.kill(name);
    } catch {
      child.kill(name);
    }
  };
  signal('SIGTERM');
  await Promise.race([exited, delay(3_000)]);
  if (child.exitCode === null) {
    signal('SIGKILL');
    await Promise.race([exited, delay(2_000)]);
  }
}

export async function runInterviewAssistSession(options: InterviewAssistRunOptions): Promise<InterviewAssistRunResult> {
  const appDirectory = join(options.workspace, 'examples', 'interview-assist');
  const nextBinary = join(appDirectory, 'node_modules', 'next', 'dist', 'bin', 'next');
  await access(nextBinary).catch((error) => {
    throw new Error(`installed Next binary not found at ${nextBinary}: ${error instanceof Error ? error.message : String(error)}`);
  });

  const port = options.port ?? (await reservePort());
  const baseUrl = `http://127.0.0.1:${port}`;
  let serverLog = '';
  let spawnError: Error | undefined;
  const child = spawn(
    process.execPath,
    [nextBinary, 'dev', '--hostname', '127.0.0.1', '--port', String(port)],
    {
      cwd: options.workspace,
      env: { ...options.env, NEXT_TELEMETRY_DISABLED: '1' },
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.once('error', (error) => {
    spawnError = error;
    serverLog = appendServerLog(serverLog, error.message);
  });
  child.stdout?.on('data', (chunk: Buffer) => {
    serverLog = appendServerLog(serverLog, chunk);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    serverLog = appendServerLog(serverLog, chunk);
  });

  try {
    await waitForServer(baseUrl, child, Math.min(options.timeoutMs, 60_000), () => serverLog, () => spawnError);
    const requestTimeoutMs = Math.max(10_000, Math.min(30_000, Math.floor(options.timeoutMs / 4)));

    const admissionResponse = await postJson(
      `${baseUrl}/api/admission`,
      { state: { phase: 'CREATED' }, event: { family: 'SessionEvent', targetPhase: 'PREPARING' } },
      requestTimeoutMs,
    );
    const admissionBody = asRecord(admissionResponse.body, 'admission response');
    const admissionResult = asRecord(admissionBody.result, 'admission response.result');
    if (admissionResponse.status !== 200 || admissionResult.status !== 'admitted') {
      throw new Error(`admission was not admitted (HTTP ${admissionResponse.status}): ${admissionResponse.raw.slice(0, 500)}`);
    }
    const admissionReceipt = asReceipt(admissionBody.receipt, 'admission response.receipt');

    const cognitionResponse = await postJson(
      `${baseUrl}/api/cognition`,
      { intent: 'I have an array of numbers to search through', prevReceipt: admissionReceipt },
      requestTimeoutMs,
    );
    const cognitionBody = asRecord(cognitionResponse.body, 'cognition response');
    if (cognitionResponse.status !== 200 || cognitionBody.status !== 'matched') {
      throw new Error(`cognition did not match (HTTP ${cognitionResponse.status}): ${cognitionResponse.raw.slice(0, 500)}`);
    }
    const cognitionReceipt = asReceipt(cognitionBody.receipt, 'cognition response.receipt');

    const runResponse = await postJson(
      `${baseUrl}/api/run`,
      {
        capability: 'execute_python',
        files: { 'solution.py': PASSING_TWO_SUM_SOURCE },
        timeoutMs: 10_000,
        prevReceipt: cognitionReceipt,
      },
      requestTimeoutMs,
    );
    const runBody = asRecord(runResponse.body, 'run response');
    if (runBody.refusal !== undefined) throw new Error(`sandbox execution was refused: ${JSON.stringify(runBody.refusal)}`);
    const execution = asRecord(runBody.receipt, 'run response.receipt');
    if (runResponse.status !== 200 || execution.exitCode !== 0) {
      throw new Error(`sandbox execution failed (HTTP ${runResponse.status}): ${runResponse.raw.slice(0, 500)}`);
    }
    const executionReceipt = asReceipt(execution.transitionReceipt, 'run response.receipt.transitionReceipt');

    const testResponse = await postJson(
      `${baseUrl}/api/test`,
      { testKind: 'visible', code: PASSING_TWO_SUM_SOURCE, timeoutMs: 15_000, prevReceipt: executionReceipt },
      requestTimeoutMs,
    );
    const testBody = asRecord(testResponse.body, 'test response');
    if (testBody.refusal !== undefined) throw new Error(`pytest execution was refused: ${JSON.stringify(testBody.refusal)}`);
    const testExecution = asRecord(testBody.receipt, 'test response.receipt');
    if (testResponse.status !== 200 || testExecution.exitCode !== 0) {
      throw new Error(`pytest execution failed (HTTP ${testResponse.status}): ${testResponse.raw.slice(0, 800)}`);
    }
    const testReceipt = asReceipt(testExecution.transitionReceipt, 'test response.receipt.transitionReceipt');

    const accessibilityResponse = await postJson(
      `${baseUrl}/api/accessibility`,
      { key: 'high-contrast-projection', value: true, prevReceipt: testReceipt },
      requestTimeoutMs,
    );
    const accessibilityBody = asRecord(accessibilityResponse.body, 'accessibility response');
    if (accessibilityResponse.status !== 200) {
      throw new Error(`accessibility projection failed (HTTP ${accessibilityResponse.status}): ${accessibilityResponse.raw.slice(0, 500)}`);
    }
    const accessibilityReceipt = asReceipt(accessibilityBody.receipt, 'accessibility response.receipt');

    const stages: StageEvidence[] = [
      { stage: 'admission', http_status: admissionResponse.status, receipt: admissionReceipt },
      { stage: 'cognition-run', http_status: cognitionResponse.status, receipt: cognitionReceipt },
      { stage: 'sandbox-execution', http_status: runResponse.status, receipt: executionReceipt },
      { stage: 'test-result', http_status: testResponse.status, receipt: testReceipt },
      { stage: 'accessibility-projection', http_status: accessibilityResponse.status, receipt: accessibilityReceipt },
    ];
    assertContinuousChain(stages);

    const evidence = {
      schema_version: 'wasm4pm.interview-assist.session-evidence.v1',
      status: 'verified',
      command: 'wpm lab interview-assist',
      workspace: options.workspace,
      stages,
      cognition: {
        status: cognitionBody.status,
        selected: cognitionBody.selected,
        run_id: cognitionBody.runId ?? cognitionBody.run_id,
      },
      execution: { exit_code: execution.exitCode, stdout: execution.stdout, stderr: execution.stderr },
      visible_test: { exit_code: testExecution.exitCode, stdout: testExecution.stdout, stderr: testExecution.stderr },
    };
    await mkdir(dirname(options.evidencePath), { recursive: true });
    await writeFile(options.evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

    return {
      status: 'verified',
      evidence_path: options.evidencePath,
      receipt_count: stages.length,
      stages: stages.map((stage) => stage.stage),
      chain_head: admissionReceipt.checksum.checksumValue,
      chain_tail: accessibilityReceipt.checksum.checksumValue,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const logSuffix = serverLog.trim().length > 0 ? `\nNext server log:\n${serverLog.slice(-4_000)}` : '';
    const wrapped = new Error(`${message}${logSuffix}`);
    (wrapped as Error & { cause?: unknown }).cause = error;
    throw wrapped;
  } finally {
    await terminateProcessTree(child);
  }
}
