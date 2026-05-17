import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { WasmLoader } from '@wasm4pm/engine';
import { makeErrorResult, emitResult } from './output.js';
import { EXIT_CODES } from './exit-codes.js';
import type { EmitOptions } from './output.js';

export interface LogSessionOptions {
  inputPath: string;
  activityKey?: string;
  commandName: string;
  emitOptions: EmitOptions;
}

/**
 * Shared setup/teardown for all commands that operate on an XES log file.
 * Handles: file existence, extension check, WASM init, XES parse, handle cleanup.
 * The callback receives the live WASM module and a valid log handle.
 */
export async function withLogSession<T>(
  opts: LogSessionOptions,
  fn: (wasm: Record<string, unknown>, logHandle: string) => Promise<T>
): Promise<T> {
  const { inputPath, commandName, emitOptions } = opts;

  // File existence
  try {
    await fs.access(inputPath);
  } catch {
    const result = makeErrorResult(
      commandName,
      new Error(`Input file not found: ${inputPath}\n\nCheck that the path is correct and the file is readable.`),
      EXIT_CODES.source_error,
      'INPUT_NOT_FOUND'
    );
    emitResult(result, emitOptions);
    process.exit(result.exit_code);
  }

  // Extension check
  const ext = path.extname(inputPath).toLowerCase();
  if (ext && !['.xes', '.xml'].includes(ext)) {
    const result = makeErrorResult(
      commandName,
      new Error(
        `Unsupported file extension '${ext}' — this command accepts: .xes, .xml\n\n` +
        `  Given: ${inputPath}\n\n` +
        `  XES (.xes) is the IEEE standard for process mining event logs.\n` +
        `  See: https://www.xes-standard.org/`
      ),
      EXIT_CODES.source_error,
      'INVALID_EXTENSION'
    );
    emitResult(result, emitOptions);
    process.exit(result.exit_code);
  }

  // WASM init
  const loader = WasmLoader.getInstance();
  await loader.init();
  const wasm = loader.get() as Record<string, unknown>;

  // Read + validate XES
  const xesContent = await fs.readFile(inputPath, 'utf-8');
  if (xesContent.trim() === '') {
    const result = makeErrorResult(commandName, new Error('Input file is empty'), EXIT_CODES.source_error, 'EMPTY_INPUT');
    emitResult(result, emitOptions);
    process.exit(result.exit_code);
  }

  const looksLikeXes = xesContent.includes('<log') || xesContent.includes('<trace') || xesContent.includes('<event');
  if (!looksLikeXes) {
    const result = makeErrorResult(commandName, new Error('Input does not appear to be a valid XES event log'), EXIT_CODES.source_error, 'INVALID_XES');
    emitResult(result, emitOptions);
    process.exit(result.exit_code);
  }

  const isWellFormed = xesContent.includes('</log>') || xesContent.includes('</trace>');
  if (looksLikeXes && !isWellFormed) {
    const result = makeErrorResult(commandName, new Error('XES file is malformed — missing closing tags'), EXIT_CODES.source_error, 'MALFORMED_XES');
    emitResult(result, emitOptions);
    process.exit(result.exit_code);
  }

  const logHandle = (wasm['load_eventlog_from_xes'] as (s: string) => string)(xesContent);
  if (!logHandle) {
    const result = makeErrorResult(commandName, new Error('Failed to parse XES event log — file may be corrupted or malformed'), EXIT_CODES.source_error, 'PARSE_FAILED');
    emitResult(result, emitOptions);
    process.exit(result.exit_code);
  }

  const traceCount = (xesContent.match(/<trace[\s>]/g) ?? []).length;
  if (traceCount === 0) {
    (wasm['delete_object'] as (h: string) => void)(logHandle);
    const result = makeErrorResult(commandName, new Error('XES file contains no traces — nothing to discover'), EXIT_CODES.source_error, 'NO_TRACES');
    emitResult(result, emitOptions);
    process.exit(result.exit_code);
  }

  // Execute with guaranteed handle cleanup
  try {
    return await fn(wasm, logHandle);
  } finally {
    try {
      (wasm['delete_object'] as (h: string) => void)(logHandle);
    } catch {
      // Best-effort cleanup — do not mask the original error
    }
  }
}
