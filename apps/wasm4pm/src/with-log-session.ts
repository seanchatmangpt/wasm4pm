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

  // Extension check — accept XES and JSON-based logs (not OCEL; those are handled
  // by runOcelDiscovery before withLogSession is ever called).
  const ext = path.extname(inputPath).toLowerCase();
  if (ext && !['.xes', '.xml', '.json'].includes(ext)) {
    const result = makeErrorResult(
      commandName,
      new Error(
        `Unsupported file extension '${ext}' — this command accepts: .xes, .xml, .json\n\n` +
        `  Given: ${inputPath}\n\n` +
        `  For OCEL 2.0 object-centric logs, use: wpm run log.ocel.json\n` +
        `  XES (.xes) is the IEEE standard for process mining event logs.\n` +
        `  See: https://www.xes-standard.org/`
      ),
      EXIT_CODES.source_error,
      'INVALID_EXTENSION'
    );
    emitResult(result, emitOptions);
    process.exit(result.exit_code);
  }

  // WASM init — failure is a WASM runtime error (exit 3), not a source error
  const loader = WasmLoader.getInstance();
  try {
    await loader.init();
  } catch (initError) {
    const msg = initError instanceof Error ? initError.message : String(initError);
    const result = makeErrorResult(
      commandName,
      new Error(
        `WASM initialization failed: ${msg}\n\n` +
        `  Diagnostic steps:\n` +
        `    1. Run "wpm doctor" to check all environment requirements\n` +
        `    2. Ensure the WASM binary is compiled: cd wasm4pm && npm run build\n` +
        `    3. Reinstall if the package is corrupt: npm install @wasm4pm/engine`
      ),
      EXIT_CODES.execution_error,
      'WASM_INIT_FAILED'
    );
    emitResult(result, emitOptions);
    process.exit(result.exit_code);
  }
  const wasm = loader.get() as Record<string, unknown>;

  // Read + validate XES
  const xesContent = await fs.readFile(inputPath, 'utf-8');
  if (xesContent.trim() === '') {
    const result = makeErrorResult(
      commandName,
      new Error(
        `Input file is empty: ${inputPath}\n\n` +
        `  The file exists but contains no data. Check that you supplied the correct path.`
      ),
      EXIT_CODES.source_error,
      'EMPTY_INPUT'
    );
    emitResult(result, emitOptions);
    process.exit(result.exit_code);
  }

  const looksLikeXes = xesContent.includes('<log') || xesContent.includes('<trace') || xesContent.includes('<event');
  if (!looksLikeXes) {
    const result = makeErrorResult(
      commandName,
      new Error(
        `File does not appear to be a valid XES event log: ${inputPath}\n\n` +
        `  A valid XES file must contain XML elements such as <log>, <trace>, or <event>.\n` +
        `  XES is the IEEE standard for process mining event logs.\n\n` +
        `  If your data is in a different format:\n` +
        `    CSV   → convert with pm4py: pm4py.format_dataframe() + pm4py.write_xes()\n` +
        `    JSON  → rename to .json and use "wpm run <file.json>"\n` +
        `  See: https://www.xes-standard.org/`
      ),
      EXIT_CODES.source_error,
      'INVALID_XES'
    );
    emitResult(result, emitOptions);
    process.exit(result.exit_code);
  }

  const isWellFormed = xesContent.includes('</log>') || xesContent.includes('</trace>');
  if (looksLikeXes && !isWellFormed) {
    const result = makeErrorResult(
      commandName,
      new Error(
        `XES file is malformed (missing closing tags): ${inputPath}\n\n` +
        `  The file starts with XES elements (<log>, <trace>, etc.) but is missing ` +
        `closing tags (</log> or </trace>).\n` +
        `  This usually means the file was truncated during export or transfer.\n\n` +
        `  Try: re-exporting the log from your process mining tool, or validate the XML with:\n` +
        `    xmllint --noout ${inputPath}`
      ),
      EXIT_CODES.source_error,
      'MALFORMED_XES'
    );
    emitResult(result, emitOptions);
    process.exit(result.exit_code);
  }

  const logHandle = (wasm['load_eventlog_from_xes'] as (s: string) => string)(xesContent);
  if (!logHandle) {
    const result = makeErrorResult(
      commandName,
      new Error(
        `Failed to parse XES event log: ${inputPath}\n\n` +
        `  The file appears to be valid XML but the WASM parser could not load it.\n` +
        `  Possible causes:\n` +
        `    - Non-standard XES attributes or encoding (expected UTF-8)\n` +
        `    - Corrupted or incomplete XML\n\n` +
        `  Try validating the file: xmllint --noout ${inputPath}`
      ),
      EXIT_CODES.source_error,
      'PARSE_FAILED'
    );
    emitResult(result, emitOptions);
    process.exit(result.exit_code);
  }

  const traceCount = (xesContent.match(/<trace[\s>]/g) ?? []).length;
  if (traceCount === 0) {
    (wasm['delete_object'] as (h: string) => void)(logHandle);
    const result = makeErrorResult(
      commandName,
      new Error(
        `XES file contains no traces: ${inputPath}\n\n` +
        `  Process discovery requires at least one <trace> element in the log.\n` +
        `  The file was parsed successfully but contained 0 traces — nothing to discover.\n\n` +
        `  Check that the correct file was supplied, or that the export included trace data.`
      ),
      EXIT_CODES.source_error,
      'NO_TRACES'
    );
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
