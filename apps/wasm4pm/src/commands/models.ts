/**
 * wpm models — Process model repository manager
 *
 * Manages a file-system repository of saved process models in .wasm4pm/models/.
 * Each saved model stores discovery metadata, fitness, algorithm, and a reference
 * to the discovery result so it can be reloaded or compared.
 *
 * Subcommands:
 *   wpm models list                            # List all saved models
 *   wpm models save -i log.xes --name "my-model" --algorithm inductive_miner
 *   wpm models load --name "my-model"          # Print saved model metadata
 *   wpm models delete --name "my-model"        # Remove a saved model
 *   wpm models compare --name1 A --name2 B    # Compare two models side-by-side
 *   wpm models export --name "my-model" --export-format pnml
 */

import { defineCommand } from 'citty';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withSpan } from './_otel.js';
import { exitWithFlush } from '../otel/exit.js';

// ─── Model repository types ───────────────────────────────────────────────────

export interface SavedModel {
  name: string;
  algorithm: string;
  logFile: string;
  savedAt: string; // ISO-8601
  fitness?: number;
  precision?: number;
  activityCount?: number;
  traceCount?: number;
  eventCount?: number;
  /** Profile used during discovery. */
  profile?: string;
  /** Format of the model (dfg, petrinet, tree, etc.). */
  outputType?: string;
  tags?: string[];
}

// ─── Repository helpers ───────────────────────────────────────────────────────

async function getModelsDir(): Promise<string> {
  const dir = path.join(process.cwd(), '.wasm4pm', 'models');
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function loadAllModels(modelsDir: string): Promise<SavedModel[]> {
  let files: string[];
  try {
    files = await fs.readdir(modelsDir);
  } catch {
    return [];
  }
  const models: SavedModel[] = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(modelsDir, f), 'utf-8');
      models.push(JSON.parse(raw) as SavedModel);
    } catch {
      /* Skip corrupt files */
    }
  }
  return models.sort((a, b) => a.savedAt.localeCompare(b.savedAt));
}

function modelFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-. ]/g, '_').replace(/\s+/g, '-') + '.json';
}

// ─── Command definition ───────────────────────────────────────────────────────

export default defineCommand({
  meta: {
    name: 'models',
    description:
      'Process model repository manager. Save, list, compare, and export discovered models.\n\n' +
      'EXAMPLES:\n' +
      '  wpm models list\n' +
      '  wpm models save -i log.xes --name "hospital-q3" --algorithm inductive_miner\n' +
      '  wpm models load --name "hospital-q3"\n' +
      '  wpm models compare --name1 "hospital-q1-dfg" --name2 "hospital-q2-inductive"\n' +
      '  wpm models delete --name "hospital-q1-dfg"\n' +
      '  wpm models export --name "hospital-q2-inductive" --export-format pnml',
  },
  async run() {
    // Default: show list when invoked without subcommand
    const modelsDir = await getModelsDir();
    const models = await loadAllModels(modelsDir);

    const result = makeResult(
      'models',
      {
        hint: 'Use: wpm models list|save|load|delete|compare|export',
        total_models: models.length,
        models_dir: modelsDir,
      },
      0,
      EXIT_CODES.success
    );
    emitResult(result, { format: 'human' }, (_res, p) => {
      p.log('');
      p.log('Saved Process Models');
      p.log('====================');
      if (models.length === 0) {
        p.log('  (no saved models — use `wpm models save -i log.xes --name <name>`)');
      } else {
        p.log(`  ${models.length} model(s) in ${modelsDir}`);
        p.log('');
        p.log(`  ${'#'.padEnd(3)} ${'Name'.padEnd(28)} ${'Algorithm'.padEnd(22)} ${'Fitness'.padStart(8)}  ${'Saved'.padEnd(10)}`);
        p.log(`  ${'─'.repeat(78)}`);
        models.forEach((m, i) => {
          const fitnessStr = m.fitness !== undefined ? (m.fitness * 100).toFixed(0) + '%' : 'n/a';
          const dateStr = m.savedAt.slice(0, 10);
          p.log(
            `  ${String(i + 1).padEnd(3)} ${m.name.slice(0, 27).padEnd(28)} ` +
            `${m.algorithm.padEnd(22)} ${fitnessStr.padStart(8)}  ${dateStr}`
          );
        });
      }
      p.log('');
      p.log('Use `wpm models list` for full table, `wpm models save` to add a model.');
      p.log('');
    });
    return EXIT_CODES.success;
  },
  subCommands: {

    // ── list ────────────────────────────────────────────────────────────────

    list: defineCommand({
      meta: {
        name: 'list',
        description: 'List all saved process models',
      },
      args: {
        format: { type: 'string', description: 'Output format: human (default) or json' },
        algorithm: { type: 'string', description: 'Filter by algorithm name' },
      },
      async run(ctx) {
        const args = ctx.args as Record<string, unknown>;
        const format = (args.format as string | undefined) ?? 'human';
        const algorithmFilter = args.algorithm as string | undefined;
        const emitOptions = { format: format as 'human' | 'json' };

        return withSpan('models.list', { algorithm_filter: algorithmFilter ?? 'all' }, async () => {
          const modelsDir = await getModelsDir();
          let models = await loadAllModels(modelsDir);

          if (algorithmFilter) {
            models = models.filter(m =>
              m.algorithm.toLowerCase().includes(algorithmFilter.toLowerCase())
            );
          }

          const result = makeResult(
            'models.list',
            {
              total: models.length,
              filter_algorithm: algorithmFilter ?? null,
              models_dir: modelsDir,
              models: models.map(m => ({
                name: m.name,
                algorithm: m.algorithm,
                fitness: m.fitness,
                precision: m.precision,
                activity_count: m.activityCount,
                trace_count: m.traceCount,
                event_count: m.eventCount,
                saved_at: m.savedAt,
                output_type: m.outputType,
                log_file: m.logFile,
                tags: m.tags ?? [],
              })),
            },
            models.length,
            EXIT_CODES.success
          );

          emitResult(result, emitOptions, (_res, p) => {
            p.log('');
            p.log('Saved Process Models (.wasm4pm/models/)');
            p.log('=========================================');
            if (models.length === 0) {
              p.log('  (no saved models)');
              p.log('  Use: wpm models save -i log.xes --name <name> --algorithm <algo>');
            } else {
              p.log('');
              p.log(
                `  ${'#'.padEnd(3)} ${'Name'.padEnd(28)} ${'Algorithm'.padEnd(22)} ` +
                `${'Fitness'.padStart(8)} ${'Activities'.padStart(11)} ${'Saved'.padEnd(12)}`
              );
              p.log(`  ${'─'.repeat(92)}`);
              models.forEach((m, i) => {
                const fitnessStr = m.fitness !== undefined ? (m.fitness * 100).toFixed(0) + '%' : 'n/a';
                const actStr = m.activityCount !== undefined ? String(m.activityCount) : 'n/a';
                const dateStr = m.savedAt.slice(0, 10);
                p.log(
                  `  ${String(i + 1).padEnd(3)} ${m.name.slice(0, 27).padEnd(28)} ` +
                  `${m.algorithm.padEnd(22)} ${fitnessStr.padStart(8)} ${actStr.padStart(11)}  ${dateStr}`
                );
              });
            }
            p.log('');
          });

          return EXIT_CODES.success;
        });
      },
    }),

    // ── save ────────────────────────────────────────────────────────────────

    save: defineCommand({
      meta: {
        name: 'save',
        description: 'Save a process model entry to the repository',
      },
      args: {
        input: { type: 'positional', description: 'Path to event log (.xes)', required: false },
        file: { type: 'string', description: 'Path to event log', alias: 'i' },
        name: { type: 'string', description: 'Name for the saved model (required)', alias: 'n' },
        algorithm: {
          type: 'string',
          description: 'Discovery algorithm used (default: inductive_miner)',
          default: 'inductive_miner',
          alias: 'a',
        },
        profile: { type: 'string', description: 'Execution profile: fast|balanced|quality|stream', default: 'balanced' },
        fitness: { type: 'string', description: 'Fitness score to record (0.0-1.0)' },
        precision: { type: 'string', description: 'Precision score to record (0.0-1.0)' },
        tags: { type: 'string', description: 'Comma-separated tags (e.g. "production,q3")' },
        format: { type: 'string', description: 'Output format: human (default) or json' },
      },
      async run(ctx) {
        const args = ctx.args as Record<string, unknown>;
        const format = (args.format as string | undefined) ?? 'human';
        const emitOptions = { format: format as 'human' | 'json' };

        const inputPath = (args.input as string | undefined) ?? (args.file as string | undefined);
        const modelName = args.name as string | undefined;
        const algorithm = (args.algorithm as string | undefined) ?? 'inductive_miner';
        const profile = (args.profile as string | undefined) ?? 'balanced';
        const fitnessArg = args.fitness as string | undefined;
        const precisionArg = args.precision as string | undefined;
        const tagsArg = args.tags as string | undefined;

        if (!modelName) {
          const result = makeErrorResult(
            'models.save',
            new Error('Missing required --name flag.\n\n  Example: wpm models save -i log.xes --name "hospital-q3"'),
            EXIT_CODES.config_error,
            'MISSING_NAME'
          );
          emitResult(result, emitOptions);
          return await exitWithFlush(result.exit_code);
        }

        if (!inputPath) {
          const result = makeErrorResult(
            'models.save',
            new Error('No input file provided.\n\n  Example: wpm models save -i log.xes --name "hospital-q3"'),
            EXIT_CODES.source_error,
            'INPUT_REQUIRED'
          );
          emitResult(result, emitOptions);
          return await exitWithFlush(result.exit_code);
        }

        return withSpan('models.save', { algorithm, name: modelName }, async () => {
          let traceCount: number | undefined;
          let eventCount: number | undefined;
          let activityCount: number | undefined;
          try {
            const xes = await fs.readFile(inputPath, 'utf-8');
            const tc = (xes.match(/<trace[\s>]/g) ?? []).length;
            const ec = (xes.match(/<event[\s>]/g) ?? []).length;
            const acts = new Set<string>();
            const re = /key="concept:name"[^>]*value="([^"]+)"/g;
            let mm: RegExpExecArray | null;
            while ((mm = re.exec(xes)) !== null) acts.add(mm[1] as string);
            if (tc > 0) traceCount = tc;
            if (ec > 0) eventCount = ec;
            if (acts.size > 0) activityCount = acts.size;
          } catch {
            /* non-fatal */
          }

          const modelsDir = await getModelsDir();
          const savedModel: SavedModel = {
            name: modelName,
            algorithm,
            logFile: path.basename(inputPath),
            savedAt: new Date().toISOString(),
            fitness: fitnessArg !== undefined ? parseFloat(fitnessArg) : undefined,
            precision: precisionArg !== undefined ? parseFloat(precisionArg) : undefined,
            traceCount,
            eventCount,
            activityCount,
            profile,
            tags: tagsArg ? tagsArg.split(',').map(t => t.trim()).filter(Boolean) : [],
          };

          const filePath = path.join(modelsDir, modelFilename(modelName));
          await fs.writeFile(filePath, JSON.stringify(savedModel, null, 2), 'utf-8');

          const result = makeResult(
            'models.save',
            {
              name: modelName,
              algorithm,
              log_file: path.basename(inputPath),
              saved_at: savedModel.savedAt,
              file_path: filePath,
              fitness: savedModel.fitness,
              precision: savedModel.precision,
              activity_count: activityCount,
              trace_count: traceCount,
              event_count: eventCount,
            },
            1,
            EXIT_CODES.success
          );

          emitResult(result, emitOptions, (_res, p) => {
            p.log('');
            p.success(`Model saved: ${modelName}`);
            p.log(`  Algorithm: ${algorithm}`);
            p.log(`  Log file:  ${path.basename(inputPath)}`);
            if (savedModel.fitness !== undefined) p.log(`  Fitness:   ${(savedModel.fitness * 100).toFixed(1)}%`);
            if (savedModel.precision !== undefined) p.log(`  Precision: ${(savedModel.precision * 100).toFixed(1)}%`);
            if (activityCount) p.log(`  Activities: ${activityCount}`);
            p.log(`  Saved to:  ${filePath}`);
            p.log('');
          });

          return EXIT_CODES.success;
        });
      },
    }),

    // ── load ────────────────────────────────────────────────────────────────

    load: defineCommand({
      meta: {
        name: 'load',
        description: 'Load and display a saved process model\'s metadata',
      },
      args: {
        name: { type: 'string', description: 'Name of the model to load', alias: 'n', required: true },
        format: { type: 'string', description: 'Output format: human (default) or json' },
      },
      async run(ctx) {
        const args = ctx.args as Record<string, unknown>;
        const format = (args.format as string | undefined) ?? 'human';
        const modelName = args.name as string;
        const emitOptions = { format: format as 'human' | 'json' };

        return withSpan('models.load', { name: modelName }, async () => {
          const modelsDir = await getModelsDir();
          const filePath = path.join(modelsDir, modelFilename(modelName));

          let model: SavedModel;
          try {
            const raw = await fs.readFile(filePath, 'utf-8');
            model = JSON.parse(raw) as SavedModel;
          } catch {
            const result = makeErrorResult(
              'models.load',
              new Error(`Model not found: "${modelName}"\n\n  Use 'wpm models list' to see available models.`),
              EXIT_CODES.source_error,
              'MODEL_NOT_FOUND'
            );
            emitResult(result, emitOptions);
            return await exitWithFlush(result.exit_code);
          }

          const result = makeResult(
            'models.load',
            {
              name: model.name,
              algorithm: model.algorithm,
              log_file: model.logFile,
              saved_at: model.savedAt,
              fitness: model.fitness,
              precision: model.precision,
              activity_count: model.activityCount,
              trace_count: model.traceCount,
              event_count: model.eventCount,
              output_type: model.outputType,
              profile: model.profile,
              tags: model.tags ?? [],
            },
            1,
            EXIT_CODES.success
          );

          emitResult(result, emitOptions, (_res, p) => {
            p.log('');
            p.log(`Model: ${model.name}`);
            p.log('─'.repeat(40));
            p.log(`  Algorithm:   ${model.algorithm}`);
            p.log(`  Log file:    ${model.logFile}`);
            p.log(`  Saved at:    ${model.savedAt.slice(0, 19).replace('T', ' ')}`);
            if (model.fitness !== undefined)
              p.log(`  Fitness:     ${(model.fitness * 100).toFixed(1)}%`);
            if (model.precision !== undefined)
              p.log(`  Precision:   ${(model.precision * 100).toFixed(1)}%`);
            if (model.activityCount !== undefined)
              p.log(`  Activities:  ${model.activityCount}`);
            if (model.traceCount !== undefined)
              p.log(`  Traces:      ${model.traceCount.toLocaleString()}`);
            if (model.eventCount !== undefined)
              p.log(`  Events:      ${model.eventCount.toLocaleString()}`);
            if (model.outputType) p.log(`  Output type: ${model.outputType}`);
            if (model.profile) p.log(`  Profile:     ${model.profile}`);
            if (model.tags && model.tags.length > 0)
              p.log(`  Tags:        ${model.tags.join(', ')}`);
            p.log('');
            p.log(`  Re-run: wpm run ${model.logFile} --algorithm ${model.algorithm}`);
            p.log('');
          });

          return EXIT_CODES.success;
        });
      },
    }),

    // ── delete ──────────────────────────────────────────────────────────────

    delete: defineCommand({
      meta: {
        name: 'delete',
        description: 'Delete a saved process model from the repository',
      },
      args: {
        name: { type: 'string', description: 'Name of the model to delete', alias: 'n', required: true },
        format: { type: 'string', description: 'Output format: human (default) or json' },
      },
      async run(ctx) {
        const args = ctx.args as Record<string, unknown>;
        const format = (args.format as string | undefined) ?? 'human';
        const modelName = args.name as string;
        const emitOptions = { format: format as 'human' | 'json' };

        return withSpan('models.delete', { name: modelName }, async () => {
          const modelsDir = await getModelsDir();
          const filePath = path.join(modelsDir, modelFilename(modelName));

          try {
            await fs.access(filePath);
          } catch {
            const result = makeErrorResult(
              'models.delete',
              new Error(`Model not found: "${modelName}"\n\n  Use 'wpm models list' to see available models.`),
              EXIT_CODES.source_error,
              'MODEL_NOT_FOUND'
            );
            emitResult(result, emitOptions);
            return await exitWithFlush(result.exit_code);
          }

          await fs.unlink(filePath);

          const result = makeResult(
            'models.delete',
            { name: modelName, deleted: true, file_path: filePath },
            1,
            EXIT_CODES.success
          );

          emitResult(result, emitOptions, (_res, p) => {
            p.log('');
            p.success(`Model deleted: ${modelName}`);
            p.log('');
          });

          return EXIT_CODES.success;
        });
      },
    }),

    // ── compare ─────────────────────────────────────────────────────────────

    compare: defineCommand({
      meta: {
        name: 'compare',
        description: 'Compare two saved process models side-by-side',
      },
      args: {
        name1: { type: 'string', description: 'Name of first model', required: true },
        name2: { type: 'string', description: 'Name of second model', required: true },
        format: { type: 'string', description: 'Output format: human (default) or json' },
      },
      async run(ctx) {
        const args = ctx.args as Record<string, unknown>;
        const format = (args.format as string | undefined) ?? 'human';
        const name1 = args.name1 as string;
        const name2 = args.name2 as string;
        const emitOptions = { format: format as 'human' | 'json' };

        return withSpan('models.compare', { name1, name2 }, async () => {
          const modelsDir = await getModelsDir();

          const loadModel = async (name: string): Promise<SavedModel | null> => {
            try {
              const raw = await fs.readFile(path.join(modelsDir, modelFilename(name)), 'utf-8');
              return JSON.parse(raw) as SavedModel;
            } catch {
              return null;
            }
          };

          const [m1, m2] = await Promise.all([loadModel(name1), loadModel(name2)]);

          if (!m1) {
            const result = makeErrorResult(
              'models.compare',
              new Error(`Model not found: "${name1}"`),
              EXIT_CODES.source_error,
              'MODEL_NOT_FOUND'
            );
            emitResult(result, emitOptions);
            return await exitWithFlush(result.exit_code);
          }
          if (!m2) {
            const result = makeErrorResult(
              'models.compare',
              new Error(`Model not found: "${name2}"`),
              EXIT_CODES.source_error,
              'MODEL_NOT_FOUND'
            );
            emitResult(result, emitOptions);
            return await exitWithFlush(result.exit_code);
          }

          const fitnessDelta = m1.fitness !== undefined && m2.fitness !== undefined
            ? ((m2.fitness - m1.fitness) * 100).toFixed(1)
            : null;
          const precisionDelta = m1.precision !== undefined && m2.precision !== undefined
            ? ((m2.precision - m1.precision) * 100).toFixed(1)
            : null;
          const winner = fitnessDelta !== null
            ? (parseFloat(fitnessDelta) > 0 ? name2 : (parseFloat(fitnessDelta) < 0 ? name1 : 'tie'))
            : null;

          const payload = {
            model1: { name: m1.name, algorithm: m1.algorithm, fitness: m1.fitness, precision: m1.precision, saved_at: m1.savedAt },
            model2: { name: m2.name, algorithm: m2.algorithm, fitness: m2.fitness, precision: m2.precision, saved_at: m2.savedAt },
            delta_fitness: fitnessDelta !== null ? parseFloat(fitnessDelta) : null,
            delta_precision: precisionDelta !== null ? parseFloat(precisionDelta) : null,
            better_fitness: winner,
          };

          const result = makeResult('models.compare', payload, 2, EXIT_CODES.success);

          emitResult(result, emitOptions, (_res, p) => {
            const pad = 22;
            p.log('');
            p.log('Model Comparison');
            p.log('=================');
            p.log('');
            p.log(`  ${'Property'.padEnd(16)} ${name1.slice(0, pad).padEnd(pad + 2)} ${name2.slice(0, pad).padEnd(pad + 2)} Delta`);
            p.log(`  ${'─'.repeat(76)}`);

            const row = (label: string, v1: string, v2: string, delta?: string) => {
              p.log(`  ${label.padEnd(16)} ${v1.padEnd(pad + 2)} ${v2.padEnd(pad + 2)} ${delta ?? ''}`);
            };

            row('Algorithm', m1.algorithm, m2.algorithm);
            row('Log file', m1.logFile, m2.logFile);
            row('Saved at', m1.savedAt.slice(0, 10), m2.savedAt.slice(0, 10));

            const f1 = m1.fitness !== undefined ? (m1.fitness * 100).toFixed(1) + '%' : 'n/a';
            const f2 = m2.fitness !== undefined ? (m2.fitness * 100).toFixed(1) + '%' : 'n/a';
            const fd = fitnessDelta !== null ? (parseFloat(fitnessDelta) >= 0 ? '+' : '') + fitnessDelta + '%' : '';
            row('Fitness', f1, f2, fd);

            const p1 = m1.precision !== undefined ? (m1.precision * 100).toFixed(1) + '%' : 'n/a';
            const p2 = m2.precision !== undefined ? (m2.precision * 100).toFixed(1) + '%' : 'n/a';
            const pd = precisionDelta !== null ? (parseFloat(precisionDelta) >= 0 ? '+' : '') + precisionDelta + '%' : '';
            row('Precision', p1, p2, pd);

            const a1 = m1.activityCount !== undefined ? String(m1.activityCount) : 'n/a';
            const a2 = m2.activityCount !== undefined ? String(m2.activityCount) : 'n/a';
            row('Activities', a1, a2);

            p.log('');
            if (winner === 'tie') {
              p.log('  → Identical fitness');
            } else if (winner !== null) {
              p.log(`  → Better fitness: ${winner}`);
            }
            p.log('');
          });

          return EXIT_CODES.success;
        });
      },
    }),

    // ── export ──────────────────────────────────────────────────────────────

    export: defineCommand({
      meta: {
        name: 'export',
        description: 'Export a saved model\'s metadata (json, pnml, csv)',
      },
      args: {
        name: { type: 'string', description: 'Name of the model to export', alias: 'n', required: true },
        'export-format': {
          type: 'string',
          description: 'Export format: json (default), pnml, csv',
          default: 'json',
        },
        output: { type: 'string', description: 'Output file path (prints to stdout if omitted)', alias: 'o' },
        format: { type: 'string', description: 'CLI output format: human (default) or json' },
      },
      async run(ctx) {
        const args = ctx.args as Record<string, unknown>;
        const format = (args.format as string | undefined) ?? 'human';
        const modelName = args.name as string;
        const exportFormat = (args['export-format'] as string | undefined) ?? 'json';
        const outputPath = args.output as string | undefined;
        const emitOptions = { format: format as 'human' | 'json' };

        return withSpan('models.export', { name: modelName, export_format: exportFormat }, async () => {
          const modelsDir = await getModelsDir();
          const filePath = path.join(modelsDir, modelFilename(modelName));

          let model: SavedModel;
          try {
            const raw = await fs.readFile(filePath, 'utf-8');
            model = JSON.parse(raw) as SavedModel;
          } catch {
            const result = makeErrorResult(
              'models.export',
              new Error(`Model not found: "${modelName}"\n\n  Use 'wpm models list' to see available models.`),
              EXIT_CODES.source_error,
              'MODEL_NOT_FOUND'
            );
            emitResult(result, emitOptions);
            return await exitWithFlush(result.exit_code);
          }

          let exported: string;
          if (exportFormat === 'pnml') {
            exported = [
              '<?xml version="1.0" encoding="UTF-8"?>',
              '<pnml>',
              `  <!-- Model: ${model.name} | Algorithm: ${model.algorithm} | Saved: ${model.savedAt} -->`,
              '  <net id="net1" type="http://www.pnml.org/version-2009/grammar/pnmlcoremodel">',
              `    <name><text>${model.name}</text></name>`,
              `    <!-- Discovered from: ${model.logFile} -->`,
              `    <!-- Fitness: ${model.fitness ?? 'n/a'} | Precision: ${model.precision ?? 'n/a'} -->`,
              '    <!-- Use wpm run with the original log to re-discover and export full PNML -->',
              '  </net>',
              '</pnml>',
            ].join('\n');
          } else if (exportFormat === 'csv') {
            exported = [
              'name,algorithm,log_file,saved_at,fitness,precision,activity_count,trace_count,event_count',
              [
                model.name, model.algorithm, model.logFile, model.savedAt,
                model.fitness ?? '', model.precision ?? '',
                model.activityCount ?? '', model.traceCount ?? '', model.eventCount ?? '',
              ].join(','),
            ].join('\n');
          } else {
            exported = JSON.stringify(model, null, 2);
          }

          if (outputPath) {
            await fs.writeFile(outputPath, exported, 'utf-8');
          } else {
            process.stdout.write(exported + '\n');
          }

          const result = makeResult(
            'models.export',
            {
              name: modelName,
              export_format: exportFormat,
              output_path: outputPath ?? 'stdout',
              bytes: exported.length,
            },
            1,
            EXIT_CODES.success
          );

          if (outputPath) {
            emitResult(result, emitOptions, (_res, p) => {
              p.log('');
              p.success(`Exported: ${modelName} → ${outputPath} (${exportFormat})`);
              p.log('');
            });
          }

          return EXIT_CODES.success;
        });
      },
    }),
  },
});
