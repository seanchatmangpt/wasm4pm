/**
 * `wpm prolog8` — Byte-capped proof engine CLI
 *
 * Exposes the Prolog8 engine (crates/prolog8) to practitioners via three
 * sub-commands:
 *
 *   wpm prolog8 show               — Report engine capabilities
 *   wpm prolog8 query  -i <input.json>   — Evaluate a query
 *   wpm prolog8 replay -i <input.json>   — Verify a receipt
 *
 * Input files follow the documented WASM API schema (WASM_API.md, Prolog8
 * section). See `wpm prolog8 query --help` for the full input shape.
 *
 * The command resolves the prolog8 WASM package from the workspace. Run
 * `wasm-pack build --target nodejs --out-dir pkg` in `crates/prolog8/` first.
 */

import { defineCommand } from 'citty';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';
import { withSpan } from './_otel.js';

// ── WASM resolution ───────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Locate the prolog8 compiled WASM package. Searches from the workspace root
 * upwards from the CLI's location.
 */
function findProlog8Pkg(): string | null {
  // __dirname resolves to:
  //   src layout: apps/wasm4pm/src/commands  → 4 ups reaches workspace root
  //   dist layout: apps/wasm4pm/dist/commands → 4 ups reaches workspace root
  const wsRoot = path.resolve(__dirname, '../../../..');
  const candidate = path.join(wsRoot, 'crates/prolog8/pkg/prolog8.js');
  if (fs.existsSync(candidate)) return candidate;
  return null;
}

interface Prolog8Module {
  prolog8_show(): unknown;
  prolog8_query(input_json: string): unknown;
  prolog8_replay(input_json: string): unknown;
}

function loadProlog8(): Prolog8Module {
  const pkgPath = findProlog8Pkg();
  if (!pkgPath) {
    throw new Error(
      'Prolog8 WASM package not found. Build it first:\n' +
        '  cd crates/prolog8\n' +
        '  wasm-pack build --target nodejs --out-dir pkg'
    );
  }
  // ESM-safe require: createRequire lets us synchronously load the wasm-pack
  // CommonJS shim that prolog8.js emits for the nodejs target.
  const req = createRequire(import.meta.url);
  return req(pkgPath) as Prolog8Module;
}

function parseResult(raw: unknown): unknown {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

// ── Sub-commands ──────────────────────────────────────────────────────────────

const showCmd = defineCommand({
  meta: {
    name: 'show',
    description: 'Report Prolog8 engine version and byte-cap capabilities',
  },
  args: {
    format: { type: 'string', description: 'Output format (human or json)', default: 'human' },
  },
  async run(ctx) {
    const fmt = (ctx.args.format as 'json' | 'human') ?? 'human';
    return withSpan('prolog8.show', {}, async () => {
      let caps: unknown;
      try {
        const wasm = loadProlog8();
        caps = parseResult(wasm.prolog8_show());
      } catch (err) {
        const result = makeErrorResult(
          'prolog8 show',
          String(err),
          EXIT_CODES.source_error,
          'source_error'
        );
        emitResult(result, { format: fmt });
        return exitWithFlush(EXIT_CODES.source_error);
      }

      const result = makeResult('prolog8 show', { capabilities: caps }, 0, EXIT_CODES.success);
      emitResult(result, { format: fmt }, (_res, p) => {
        const c = caps as Record<string, unknown>;
        p.log('');
        p.log('Prolog8 — Byte-Capped Proof Engine');
        p.log('');
        if (c && typeof c === 'object') {
          p.log(`  Engine:   ${c['engine'] ?? 'prolog8'}`);
          p.log(`  Version:  ${c['version'] ?? 'unknown'}`);
          const caps2 = c['caps'] as Record<string, unknown> | undefined;
          if (caps2) {
            p.log('');
            p.log('  Byte caps:');
            p.log(`    arity          : ${caps2['arity']} (args per predicate)`);
            p.log(`    body           : ${caps2['body']} (atoms per rule body)`);
            p.log(`    vars           : ${caps2['vars']} (variables per rule)`);
            p.log(`    binding_patterns: ${caps2['binding_patterns']} (2^arity)`);
            p.log(`    max_answers    : ${caps2['max_answers']} (query result cap)`);
          }
        }
        p.log('');
        p.log('Build: cd crates/prolog8 && wasm-pack build --target nodejs --out-dir pkg');
        p.log('');
      });
      return exitWithFlush(EXIT_CODES.success);
    });
  },
});

const queryCmd = defineCommand({
  meta: {
    name: 'query',
    description: 'Evaluate a Prolog8 query and emit Allow/Deny/Invalid with proof',
  },
  args: {
    input: {
      type: 'string',
      alias: 'i',
      description: 'Path to query input JSON file (see WASM_API.md for schema)',
      required: true,
    },
    format: { type: 'string', description: 'Output format (human or json)', default: 'human' },
    verbose: { type: 'boolean', alias: 'v', description: 'Show full proof DAG' },
    'max-bytes': {
      type: 'string',
      description:
        'Maximum byte budget for the proof engine (positive integer). ' +
        'Overrides the engine default. Use to limit resource consumption for large catalogs.',
    },
  },
  async run(ctx) {
    const fmt = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const inputPath = ctx.args.input as string;

    // Validate --max-bytes when provided: must be a positive integer.
    const maxBytesRaw = ctx.args['max-bytes'] as string | undefined;
    if (maxBytesRaw !== undefined) {
      const maxBytesNum = Number(maxBytesRaw);
      if (!Number.isInteger(maxBytesNum) || maxBytesNum <= 0) {
        const result = makeErrorResult(
          'prolog8 query',
          `--max-bytes must be a positive integer, got: ${JSON.stringify(maxBytesRaw)}`,
          EXIT_CODES.config_error,
          'config_error'
        );
        emitResult(result, { format: fmt });
        return exitWithFlush(EXIT_CODES.config_error);
      }
    }

    let decision = 'unknown';
    let answerCount = 0;

    return withSpan(
      'prolog8.query',
      { input: inputPath, ...(maxBytesRaw !== undefined ? { max_bytes: maxBytesRaw } : {}) },
      async () => {
        let inputJson: string;
        try {
          inputJson = fs.readFileSync(inputPath, 'utf-8');
        } catch (err) {
          const result = makeErrorResult(
            'prolog8 query',
            `cannot read ${inputPath}: ${err}`,
            EXIT_CODES.source_error,
            'source_error'
          );
          emitResult(result, { format: fmt });
          return exitWithFlush(EXIT_CODES.source_error);
        }

        let queryResult: unknown;
        try {
          let wasm: Prolog8Module;
          try {
            wasm = loadProlog8();
          } catch (loadErr) {
            const result = makeErrorResult(
              'prolog8 query',
              String(loadErr),
              EXIT_CODES.source_error,
              'source_error'
            );
            emitResult(result, { format: fmt });
            return exitWithFlush(EXIT_CODES.source_error);
          }
          queryResult = parseResult(wasm.prolog8_query(inputJson));
        } catch (err) {
          // WASM loaded but engine threw during execution (e.g. malformed input)
          const result = makeErrorResult(
            'prolog8 query',
            String(err),
            EXIT_CODES.execution_error,
            'execution_error'
          );
          emitResult(result, { format: fmt });
          return exitWithFlush(EXIT_CODES.execution_error);
        }

        const r = queryResult as Record<string, unknown>;
        const isAnswered = 'Answered' in r || 'TruncatedAnswers' in r;
        const isDenied = 'Denied' in r;
        const isInvalid = 'Invalid' in r;
        const exitCode = isAnswered || isDenied ? EXIT_CODES.success : EXIT_CODES.execution_error;

        decision = isAnswered ? 'Allow' : isDenied ? 'Deny' : 'Invalid';

        const result = makeResult('prolog8 query', { result: queryResult }, 0, exitCode);
        emitResult(result, { format: fmt, verbose }, (_res, p) => {
          p.log('');
          if (isAnswered) {
            const key = 'Answered' in r ? 'Answered' : 'TruncatedAnswers';
            const answers = r[key] as unknown[];
            const truncated = key === 'TruncatedAnswers';
            answerCount = answers.length;
            p.log(
              `  Decision : Allow (${answers.length} answer${answers.length !== 1 ? 's' : ''}${truncated ? ', truncated' : ''})`
            );
            p.log('');
            p.log('  Interpretation: Query satisfied — the process trace is consistent');
            p.log('  with all stated Horn-clause rules. Each answer below represents one');
            p.log('  binding of rule variables that satisfies the query goal.');
            if (truncated) {
              p.log('');
              p.log('  Note: result set was truncated at the engine byte cap (128 answers).');
              p.log('  Narrow the query goal to retrieve the full binding set.');
            }
            for (let i = 0; i < answers.length; i++) {
              const ans = answers[i] as Record<string, unknown>;
              const receipt = ans['receipt'] as Record<string, unknown> | undefined;
              if (receipt) {
                p.log('');
                p.log(`  Answer ${i + 1}:`);
                p.log(`    receipt_hash : ${String(receipt['receipt_hash']).slice(0, 16)}...`);
                if (verbose) {
                  p.log(
                    `    proof nodes  : ${(ans['proof'] as unknown[] | undefined)?.length ?? 0}`
                  );
                  p.log(`    bindings     : ${JSON.stringify(ans['bindings'] ?? [])}`);
                }
              }
            }
          } else if (isDenied) {
            const d = r['Denied'] as Record<string, unknown> | undefined;
            const receipt = d?.['receipt'] as Record<string, unknown> | undefined;
            p.log(`  Decision : Deny`);
            p.log('');
            p.log('  Interpretation: Query failed — the process trace violates at least one');
            p.log('  stated Horn-clause rule. No variable binding satisfies the query goal.');
            p.log('  Check the trace against the declared Horn clauses; a required activity');
            p.log('  may be missing, out of order, or its preconditions are unmet.');
            if (receipt) {
              p.log('');
              p.log(`    receipt_hash : ${String(receipt['receipt_hash']).slice(0, 16)}...`);
            }
            if (verbose && d) {
              p.log(`    proof nodes  : ${(d['proof'] as unknown[] | undefined)?.length ?? 0}`);
            }
          } else if (isInvalid) {
            p.log(`  Decision : Invalid — ${r['Invalid']}`);
            p.log('');
            p.log('  Interpretation: The query input did not parse into a valid Prolog8');
            p.log('  goal. Check the input JSON against the schema in WASM_API.md.');
          } else {
            p.log(`  Result   : ${JSON.stringify(queryResult)}`);
          }
          p.log('');
        });

        return exitWithFlush(exitCode);
      },
      () => ({ decision, answer_count: answerCount })
    );
  },
});

const replayCmd = defineCommand({
  meta: {
    name: 'replay',
    description: 'Verify a Prolog8 receipt — detect tampering in the proof chain',
  },
  args: {
    input: {
      type: 'string',
      alias: 'i',
      description: 'Path to replay input JSON file (query input + receipt field)',
      required: true,
    },
    format: { type: 'string', description: 'Output format (human or json)', default: 'human' },
  },
  async run(ctx) {
    const fmt = (ctx.args.format as 'json' | 'human') ?? 'human';
    const inputPath = ctx.args.input as string;
    let replayStatus = 'unknown';

    return withSpan(
      'prolog8.replay',
      { input: inputPath },
      async () => {
        let inputJson: string;
        try {
          inputJson = fs.readFileSync(inputPath, 'utf-8');
        } catch (err) {
          const result = makeErrorResult(
            'prolog8 replay',
            `cannot read ${inputPath}: ${err}`,
            EXIT_CODES.source_error,
            'source_error'
          );
          emitResult(result, { format: fmt });
          return exitWithFlush(EXIT_CODES.source_error);
        }

        let replayResult: unknown;
        try {
          let wasm: Prolog8Module;
          try {
            wasm = loadProlog8();
          } catch (loadErr) {
            const result = makeErrorResult(
              'prolog8 replay',
              String(loadErr),
              EXIT_CODES.source_error,
              'source_error'
            );
            emitResult(result, { format: fmt });
            return exitWithFlush(EXIT_CODES.source_error);
          }
          replayResult = parseResult(wasm.prolog8_replay(inputJson));
        } catch (err) {
          // WASM loaded but engine threw during replay (e.g. malformed JSON input)
          const result = makeErrorResult(
            'prolog8 replay',
            String(err),
            EXIT_CODES.execution_error,
            'execution_error'
          );
          emitResult(result, { format: fmt });
          return exitWithFlush(EXIT_CODES.execution_error);
        }

        const verified = replayResult === 'Verified';
        replayStatus = String(replayResult);
        const exitCode = verified ? EXIT_CODES.success : EXIT_CODES.conformance_fail;

        const result = makeResult('prolog8 replay', { status: replayResult }, 0, exitCode);
        emitResult(result, { format: fmt }, (_res, p) => {
          p.log('');
          if (verified) {
            p.log('  Status : Verified — receipt intact, proof replays correctly');
            p.log('');
            p.log('  Interpretation: The BLAKE3 proof chain is intact. Every rule, fact,');
            p.log('  catalog, and inference step matches the originally recorded receipt.');
            p.log('  This manufacturing route can be considered cryptographically proven.');
          } else {
            p.log(`  Status : ${replayResult} — receipt verification failed`);
            p.log('');
            p.log('  Interpretation: The proof chain has been broken. This means the receipt');
            p.log('  or its referenced artifacts were modified after the original proof was');
            p.log('  recorded. This route cannot be admitted — raise an AndonPull.');
            p.log('');
            p.log('  Mismatch codes:');
            p.log('    ReceiptInvalid      — receipt_hash tampering detected');
            p.log('    Mismatch            — proof/catalog/rule/fact root tampering');
            p.log(
              '    VersionIncompatible — engine version mismatch (re-prove with current engine)'
            );
            p.log('    MissingArtifact     — required fact or rule not present in catalog');
          }
          p.log('');
        });

        return exitWithFlush(exitCode);
      },
      () => ({ replay_status: replayStatus })
    );
  },
});

// ── Top-level command ─────────────────────────────────────────────────────────

const PROLOG8_VALID_SUBCOMMANDS = ['show', 'query', 'replay'] as const;

export const prolog8 = defineCommand({
  meta: {
    name: 'prolog8',
    description: 'Byte-capped proof engine: fact admission, Horn rule chaining, BLAKE3 receipts',
  },
  args: {
    format: { type: 'string', description: 'Output format (human or json)', default: 'human' },
  },
  async run(ctx) {
    const fmt = (ctx.args.format as 'json' | 'human') ?? 'human';

    // Detect unknown subcommands: citty passes positional extras in ctx.args._
    // When citty finds an unknown subcommand it throws a CLIError (exit 1) before
    // calling run(). However, if this run() is reached via a positional arg that
    // didn't match a subcommand, we handle it here to emit a structured error.
    const positionals = (ctx.args._ as string[] | undefined) ?? [];
    const unknownSub = positionals[0];
    if (unknownSub && !(PROLOG8_VALID_SUBCOMMANDS as readonly string[]).includes(unknownSub)) {
      const result = makeErrorResult(
        'prolog8',
        `Unknown subcommand: "${unknownSub}". Valid subcommands: ${PROLOG8_VALID_SUBCOMMANDS.join(', ')}`,
        EXIT_CODES.config_error,
        'INVALID_SUBCOMMAND'
      );
      emitResult(result, { format: fmt });
      return exitWithFlush(EXIT_CODES.config_error);
    }

    process.stdout.write(`
wpm prolog8 — Byte-Capped Proof Engine

  wpm prolog8 show                   Report engine version and capabilities
  wpm prolog8 query  -i <input.json> Evaluate a query (Allow / Deny / Invalid)
  wpm prolog8 replay -i <input.json> Verify a receipt (detect tampering)

Engine limits: arity ≤ 8, body atoms ≤ 8, variables ≤ 8, answers ≤ 128
Receipt chain: BLAKE3 over 6 domain-separated roots (catalog, rule, fact,
               input, proof, output)

Build the engine first (one-time):
  cd crates/prolog8
  wasm-pack build --target nodejs --out-dir pkg

Input schema: see WASM_API.md (Prolog8 section) or crates/prolog8/README.md
`);
    return exitWithFlush(EXIT_CODES.success);
  },
  subCommands: {
    show: showCmd,
    query: queryCmd,
    replay: replayCmd,
  },
});
