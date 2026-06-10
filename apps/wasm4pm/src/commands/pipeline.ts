/**
 * wpm pipeline — Chain process mining operations into reusable workflows.
 *
 * Subcommands:
 *   wpm pipeline run <pipeline.json> -i <log.xes>   Execute a pipeline definition
 *   wpm pipeline create --name <name>               Create a new pipeline definition
 *   wpm pipeline list                               Show available pipelines
 *   wpm pipeline validate <pipeline.json>           Validate a pipeline definition
 */

import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';
import { emitResult, makeResult, makeErrorResult } from '../output.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PipelineStep {
  step: string;
  args?: Record<string, unknown>;
  optional?: boolean;
  description?: string;
}

export interface PipelineDefinition {
  name: string;
  description?: string;
  steps: PipelineStep[];
  /** Output filename template; supports {{name}} and {{timestamp}} */
  output?: string;
}

export interface StepResult {
  step: string;
  index: number;
  status: 'success' | 'failed' | 'skipped';
  exit_code: number;
  duration_ms: number;
  summary?: string;
}

export interface PipelineRunPayload {
  pipeline_name: string;
  input?: string;
  steps_total: number;
  steps_completed: number;
  steps_failed: number;
  steps_skipped: number;
  duration_ms: number;
  step_results: StepResult[];
  output_path?: string;
}

// ─── Built-in pipeline presets ────────────────────────────────────────────────

const BUILTIN_PIPELINES: Record<string, PipelineDefinition> = {
  quick: {
    name: 'quick',
    description: 'Fast 2-step: validate + DFG discovery',
    steps: [
      { step: 'validate', args: {}, description: 'Validate event log structure' },
      { step: 'run', args: { algorithm: 'dfg' }, description: 'Discover DFG model' },
    ],
  },
  full: {
    name: 'full',
    description: '6-step complete process mining analysis',
    steps: [
      { step: 'validate', args: { full: true }, description: 'Full log validation' },
      { step: 'run', args: { algorithm: 'inductive_miner' }, description: 'Discover process model' },
      { step: 'quality', args: {}, description: 'Assess model quality (4 dimensions)' },
      { step: 'temporal', args: {}, description: 'Analyze temporal profiles' },
      { step: 'social', args: {}, description: 'Mine social/resource networks' },
      { step: 'predict', args: { task: 'next-activity' }, description: 'Predict next activities' },
    ],
  },
  compliance: {
    name: 'compliance',
    description: '4-step conformance-focused pipeline',
    steps: [
      { step: 'validate', args: {}, description: 'Validate event log' },
      { step: 'conformance', args: { 'model-from': 'dfg' }, description: 'Check log-to-model conformance' },
      { step: 'quality', args: {}, description: 'Assess overall quality' },
      { step: 'prolog8', args: { subcommand: 'show' }, optional: true, description: 'Show proof engine status' },
    ],
  },
  discovery: {
    name: 'discovery',
    description: '3-step discovery and quality pipeline',
    steps: [
      { step: 'validate', args: {}, description: 'Validate event log' },
      { step: 'compare', args: { algorithms: 'dfg,heuristic_miner,inductive_miner' }, description: 'Compare top algorithms' },
      { step: 'quality', args: {}, description: 'Assess model quality' },
    ],
  },
  analyze: {
    name: 'analyze',
    description: 'Guided 3-step analysis: validate + auto-select discovery + quality',
    steps: [
      { step: 'validate', args: {}, description: 'Validate event log structure' },
      { step: 'run', args: { algorithm: 'inductive_miner' }, description: 'Discover process model (auto-selected)' },
      { step: 'quality', args: {}, description: 'Assess model quality (4 dimensions)' },
    ],
  },
};

// ─── Known valid pipeline steps ───────────────────────────────────────────────

const KNOWN_STEPS = new Set([
  'validate', 'run', 'quality', 'conformance', 'temporal', 'social',
  'predict', 'ml', 'diff', 'simulate', 'compare', 'prolog8', 'swarm',
  'autoprocess', 'drift-watch', 'doctor', 'batch',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function interpolateTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getPipelinesDir(): string {
  return path.join('.wasm4pm', 'pipelines');
}

async function loadPipelineFile(pipelinePath: string): Promise<PipelineDefinition | null> {
  try {
    const content = await fs.readFile(pipelinePath, 'utf-8');
    return JSON.parse(content) as PipelineDefinition;
  } catch {
    return null;
  }
}

async function listUserPipelines(): Promise<{ name: string; path: string; def: PipelineDefinition }[]> {
  const dir = getPipelinesDir();
  try {
    const files = await fs.readdir(dir);
    const results: { name: string; path: string; def: PipelineDefinition }[] = [];
    for (const f of files) {
      if (!f.endsWith('.pipeline.json') && !f.endsWith('.json')) continue;
      const fullPath = path.join(dir, f);
      const def = await loadPipelineFile(fullPath);
      if (def) results.push({ name: f.replace(/\.pipeline\.json$|\.json$/, ''), path: fullPath, def });
    }
    return results;
  } catch {
    return [];
  }
}

function getCliEntryPoint(): string {
  const url = new URL(import.meta.url);
  const commandsDir = path.dirname(url.pathname);
  const srcDir = path.dirname(commandsDir);
  const appDir = path.dirname(srcDir);
  return path.join(appDir, 'dist', 'cli.js');
}

/**
 * Execute a single pipeline step by spawning a child wpm process.
 */
function executeStep(
  step: PipelineStep,
  input: string | undefined,
): StepResult {
  const t0 = performance.now();

  const argv: string[] = [step.step];

  // Steps that accept an -i input flag
  const stepsWithInput = new Set([
    'validate', 'run', 'quality', 'conformance', 'temporal', 'social',
    'predict', 'ml', 'diff', 'simulate', 'compare', 'autoprocess',
    'drift-watch', 'batch',
  ]);
  if (input && stepsWithInput.has(step.step)) {
    argv.push('-i', input);
  }

  // Add step-specific args
  if (step.args) {
    for (const [key, val] of Object.entries(step.args)) {
      if (val === true || val === undefined) {
        argv.push(`--${key}`);
      } else if (val !== false && val !== null) {
        argv.push(`--${key}`, String(val));
      }
    }
  }

  // Always request JSON output so we can extract a summary
  argv.push('--format', 'json');

  const cliEntry = getCliEntryPoint();

  const spawnResult = spawnSync(process.execPath, [cliEntry, ...argv], {
    encoding: 'utf-8',
    timeout: 120_000,
    env: { ...process.env, NO_COLOR: '1' },
  });

  const duration_ms = performance.now() - t0;
  const exit_code = spawnResult.status ?? 1;

  // Extract a short summary from JSON output
  let summary: string | undefined;
  if (spawnResult.stdout) {
    try {
      const parsed = JSON.parse(spawnResult.stdout) as { message?: string; status?: string };
      if (parsed.message) summary = parsed.message;
      else if (parsed.status) summary = parsed.status;
    } catch {
      const firstLine = spawnResult.stdout.trim().split('\n')[0];
      if (firstLine) summary = firstLine.slice(0, 120);
    }
  }

  const status: StepResult['status'] =
    exit_code === 0 ? 'success' : step.optional ? 'skipped' : 'failed';

  return {
    step: step.step,
    index: 0, // caller sets this
    status,
    exit_code,
    duration_ms,
    summary,
  };
}

// ─── Subcommand: pipeline run ─────────────────────────────────────────────────

export const pipelineRun = defineCommand({
  meta: {
    name: 'run',
    description:
      'Execute a pipeline definition file or built-in preset. Ex: wpm pipeline run full -i log.xes',
  },
  args: {
    pipeline: {
      type: 'positional',
      description:
        'Path to pipeline JSON file, or built-in preset: quick, full, compliance, discovery',
      required: true,
    },
    input: {
      type: 'string',
      alias: 'i',
      description: 'Input event log file (XES, OCEL, JSON)',
    },
    format: {
      type: 'string',
      description: 'Output format: human (default) or json',
      default: 'human',
    },
    'no-save': {
      type: 'boolean',
      description: 'Skip saving the pipeline report',
    },
    'fail-fast': {
      type: 'boolean',
      description: 'Stop pipeline on first step failure (default: continue)',
    },
  },
  async run(ctx) {
    const pipelineArg = ctx.args.pipeline as string;
    const input = ctx.args.input as string | undefined;
    const format = ((ctx.args.format as string) || 'human') as 'human' | 'json';
    const failFast = ctx.args['fail-fast'] as boolean | undefined;

    // Resolve pipeline definition
    let pipelineDef: PipelineDefinition | null = null;

    if (BUILTIN_PIPELINES[pipelineArg]) {
      pipelineDef = BUILTIN_PIPELINES[pipelineArg];
    } else {
      pipelineDef = await loadPipelineFile(pipelineArg);
      if (!pipelineDef) {
        const inDir = path.join(getPipelinesDir(), pipelineArg);
        pipelineDef = await loadPipelineFile(inDir);
        if (!pipelineDef) {
          pipelineDef = await loadPipelineFile(inDir + '.pipeline.json');
        }
      }
    }

    if (!pipelineDef) {
      const result = makeErrorResult(
        'pipeline run',
        new Error(
          `Pipeline not found: "${pipelineArg}". Use a file path or built-in: ${Object.keys(BUILTIN_PIPELINES).join(', ')}`
        ),
        EXIT_CODES.config_error,
        'PIPELINE_NOT_FOUND'
      );
      emitResult(result, { format });
      return exitWithFlush(EXIT_CODES.config_error);
    }

    const t0 = performance.now();
    const stepResults: StepResult[] = [];
    let stepsCompleted = 0;
    let stepsFailed = 0;
    let stepsSkipped = 0;

    // Human-mode header
    if (format !== 'json') {
      const BOLD = '\x1b[1m';
      const CYAN = '\x1b[36m';
      const DIM = '\x1b[2m';
      const RESET = '\x1b[0m';
      const bar = '='.repeat(Math.max(10, pipelineDef.name.length + 10));
      process.stdout.write(`\n${BOLD}Pipeline: ${pipelineDef.name}${RESET}\n${bar}\n`);
      if (pipelineDef.description)
        process.stdout.write(`${DIM}${pipelineDef.description}${RESET}\n`);
      if (input) process.stdout.write(`${CYAN}Input:${RESET} ${input}\n`);
      process.stdout.write('\n');
    }

    // Execute steps
    const totalSteps = pipelineDef.steps.length;
    for (let i = 0; i < totalSteps; i++) {
      const stepDef = pipelineDef.steps[i];
      const stepNum = i + 1;

      if (format !== 'json') {
        const padNum = `[${stepNum}/${totalSteps}]`;
        process.stdout.write(`${padNum} ${stepDef.step.padEnd(18)} `);
      }

      const stepResult = executeStep(stepDef, input);
      stepResult.index = i;
      stepResults.push(stepResult);

      if (stepResult.status === 'success') {
        stepsCompleted++;
        if (format !== 'json') {
          const GREEN = '\x1b[32m';
          const DIM = '\x1b[2m';
          const RESET = '\x1b[0m';
          const dur = formatDuration(stepResult.duration_ms);
          const tail = stepResult.summary ? ` | ${stepResult.summary}` : '';
          process.stdout.write(`${GREEN}✔${RESET} ${DIM}(${dur})${tail}${RESET}\n`);
        }
      } else if (stepResult.status === 'skipped' || stepDef.optional) {
        stepsSkipped++;
        stepResult.status = 'skipped';
        if (format !== 'json') {
          const YELLOW = '\x1b[33m';
          const RESET = '\x1b[0m';
          process.stdout.write(`${YELLOW}⚠ skipped (optional)${RESET}\n`);
        }
      } else {
        stepsFailed++;
        if (format !== 'json') {
          const RED = '\x1b[31m';
          const DIM = '\x1b[2m';
          const RESET = '\x1b[0m';
          const dur = formatDuration(stepResult.duration_ms);
          const errMsg = stepResult.summary || 'failed';
          process.stdout.write(`${RED}✗${RESET} ${DIM}(${dur}) ${errMsg}${RESET}\n`);
        }
        if (failFast) break;
      }
    }

    const totalMs = performance.now() - t0;

    // Save report
    let outputPath: string | undefined;
    if (!ctx.args['no-save']) {
      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const template = pipelineDef.output ?? `{{name}}-report-{{timestamp}}.json`;
      const filename = interpolateTemplate(template, {
        name: pipelineDef.name,
        timestamp,
        input: input ? path.basename(input, path.extname(input)) : 'log',
      });
      const resultsDir = path.join('.wasm4pm', 'results');
      try {
        await fs.mkdir(resultsDir, { recursive: true });
        outputPath = path.join(resultsDir, filename);
        const report = {
          pipeline_name: pipelineDef.name,
          description: pipelineDef.description,
          input,
          timestamp: new Date().toISOString(),
          steps_total: totalSteps,
          steps_completed: stepsCompleted,
          steps_failed: stepsFailed,
          steps_skipped: stepsSkipped,
          duration_ms: totalMs,
          step_results: stepResults,
        };
        await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
      } catch {
        outputPath = undefined;
      }
    }

    const payload: PipelineRunPayload = {
      pipeline_name: pipelineDef.name,
      input,
      steps_total: totalSteps,
      steps_completed: stepsCompleted,
      steps_failed: stepsFailed,
      steps_skipped: stepsSkipped,
      duration_ms: totalMs,
      step_results: stepResults,
      output_path: outputPath,
    };

    if (format !== 'json') {
      const BOLD = '\x1b[1m';
      const GREEN = '\x1b[32m';
      const RED = '\x1b[31m';
      const DIM = '\x1b[2m';
      const RESET = '\x1b[0m';
      process.stdout.write('\n');
      if (stepsFailed === 0) {
        process.stdout.write(
          `${GREEN}${BOLD}Pipeline complete!${RESET} ${stepsCompleted}/${totalSteps} steps succeeded.`
        );
      } else {
        process.stdout.write(
          `${RED}${BOLD}Pipeline finished with failures.${RESET} ${stepsCompleted}/${totalSteps} succeeded, ${stepsFailed} failed.`
        );
      }
      if (outputPath) {
        process.stdout.write(`\n${DIM}Report saved: ${outputPath}${RESET}`);
      }
      process.stdout.write('\n');
    }

    const exitCode =
      stepsFailed > 0
        ? stepsCompleted > 0
          ? EXIT_CODES.partial_failure
          : EXIT_CODES.execution_error
        : EXIT_CODES.success;

    const message =
      stepsFailed === 0
        ? `Pipeline "${pipelineDef.name}" completed: ${stepsCompleted}/${totalSteps} steps succeeded`
        : `Pipeline "${pipelineDef.name}" finished with ${stepsFailed} failure(s): ${stepsCompleted}/${totalSteps} succeeded`;

    const result = makeResult('pipeline run', payload, totalMs, exitCode, message);

    if (format === 'json') {
      emitResult(result, { format });
    }

    return exitWithFlush(exitCode);
  },
});

// ─── Subcommand: pipeline create ─────────────────────────────────────────────

export const pipelineCreate = defineCommand({
  meta: {
    name: 'create',
    description:
      'Create a new pipeline definition file. Ex: wpm pipeline create --name my-analysis --steps validate,run,quality',
  },
  args: {
    name: {
      type: 'string',
      description: 'Pipeline name',
      required: true,
    },
    steps: {
      type: 'string',
      description:
        'Comma-separated list of steps: validate,run,quality,temporal,social,predict,conformance',
    },
    description: {
      type: 'string',
      description: 'Human-readable pipeline description',
    },
    algorithm: {
      type: 'string',
      description: 'Algorithm for run step (default: inductive_miner)',
    },
    output: {
      type: 'string',
      description: 'Output directory for the pipeline JSON file (default: .wasm4pm/pipelines/)',
    },
    format: {
      type: 'string',
      description: 'Output format: human or json',
      default: 'human',
    },
  },
  async run(ctx) {
    const name = ctx.args.name as string;
    const stepsArg = (ctx.args.steps as string) || 'validate,run,quality';
    const description = (ctx.args.description as string) || `${name} pipeline`;
    const algorithm = (ctx.args.algorithm as string) || 'inductive_miner';
    const format = ((ctx.args.format as string) || 'human') as 'human' | 'json';

    const stepNames = stepsArg
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const steps: PipelineStep[] = stepNames.map((stepName) => {
      const args: Record<string, unknown> = {};
      if (stepName === 'run') args['algorithm'] = algorithm;
      if (stepName === 'predict') args['task'] = 'next-activity';
      return { step: stepName, args };
    });

    const def: PipelineDefinition = {
      name,
      description,
      steps,
      output: `{{name}}-report-{{timestamp}}.json`,
    };

    const outDir = (ctx.args.output as string) || getPipelinesDir();
    await fs.mkdir(outDir, { recursive: true });
    const outFile = path.join(outDir, `${name}.pipeline.json`);
    await fs.writeFile(outFile, JSON.stringify(def, null, 2));

    const t0 = performance.now();
    const payload = {
      name,
      steps_count: steps.length,
      steps: stepNames,
      output_file: outFile,
    };

    const result = makeResult(
      'pipeline create',
      payload,
      performance.now() - t0,
      EXIT_CODES.success,
      `Created pipeline "${name}" with ${steps.length} steps`
    );

    if (format !== 'json') {
      const BOLD = '\x1b[1m';
      const GREEN = '\x1b[32m';
      const CYAN = '\x1b[36m';
      const DIM = '\x1b[2m';
      const RESET = '\x1b[0m';
      process.stdout.write(`\n${GREEN}${BOLD}Created:${RESET} ${outFile}\n`);
      process.stdout.write(`${DIM}Steps (${steps.length}):${RESET} ${stepNames.join(' → ')}\n`);
      process.stdout.write(
        `\n${CYAN}Run with:${RESET} wpm pipeline run ${outFile} -i log.xes\n\n`
      );
    } else {
      emitResult(result, { format });
    }

    return exitWithFlush(EXIT_CODES.success);
  },
});

// ─── Subcommand: pipeline list ────────────────────────────────────────────────

export const pipelineList = defineCommand({
  meta: {
    name: 'list',
    description:
      'Show available pipeline definitions (built-in and user-defined). Ex: wpm pipeline list',
  },
  args: {
    format: {
      type: 'string',
      description: 'Output format: human or json',
      default: 'human',
    },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = ((ctx.args.format as string) || 'human') as 'human' | 'json';
    const userPipelines = await listUserPipelines();

    const builtinList = Object.entries(BUILTIN_PIPELINES).map(([id, def]) => ({
      id,
      name: def.name,
      steps: def.steps.length,
      description: def.description || '',
      type: 'builtin' as const,
    }));

    const userList = userPipelines.map(({ name, path: p, def }) => ({
      id: name,
      name: def.name || name,
      steps: def.steps.length,
      description: def.description || '',
      path: p,
      type: 'user' as const,
    }));

    const payload = { builtin: builtinList, user: userList };

    if (format === 'json') {
      const result = makeResult(
        'pipeline list',
        payload,
        performance.now() - t0,
        EXIT_CODES.success,
        `${builtinList.length} built-in, ${userList.length} user pipelines`
      );
      emitResult(result, { format });
      return exitWithFlush(EXIT_CODES.success);
    }

    const BOLD = '\x1b[1m';
    const GREEN = '\x1b[32m';
    const CYAN = '\x1b[36m';
    const DIM = '\x1b[2m';
    const RESET = '\x1b[0m';

    process.stdout.write(`\n${BOLD}Available Pipelines${RESET}\n`);
    process.stdout.write('='.repeat(50) + '\n');

    process.stdout.write(`\n${BOLD}Built-in pipelines:${RESET}\n`);
    for (const p of builtinList) {
      process.stdout.write(
        `  ${GREEN}${p.id.padEnd(16)}${RESET} ${DIM}${p.steps} steps${RESET}  ${p.description}\n`
      );
    }
    process.stdout.write(`\n${DIM}Run with: wpm pipeline run <name> -i log.xes${RESET}\n`);

    if (userList.length > 0) {
      process.stdout.write(`\n${BOLD}User pipelines${RESET} ${DIM}(.wasm4pm/pipelines/)${RESET}:\n`);
      for (const p of userList) {
        process.stdout.write(
          `  ${CYAN}${p.id.padEnd(16)}${RESET} ${DIM}${p.steps} steps${RESET}  ${p.description}\n`
        );
        process.stdout.write(`    ${DIM}→ ${p.path}${RESET}\n`);
      }
    } else {
      process.stdout.write(`\n${DIM}No user pipelines found in .wasm4pm/pipelines/${RESET}\n`);
      process.stdout.write(
        `${DIM}Create one: wpm pipeline create --name my-analysis --steps validate,run,quality${RESET}\n`
      );
    }

    process.stdout.write('\n');
    return exitWithFlush(EXIT_CODES.success);
  },
});

// ─── Subcommand: pipeline validate ───────────────────────────────────────────

export const pipelineValidate = defineCommand({
  meta: {
    name: 'validate',
    description:
      'Validate a pipeline definition file for correctness. Ex: wpm pipeline validate my-pipeline.json',
  },
  args: {
    pipeline: {
      type: 'positional',
      description: 'Path to the pipeline JSON file to validate',
      required: true,
    },
    format: {
      type: 'string',
      description: 'Output format: human or json',
      default: 'human',
    },
  },
  async run(ctx) {
    const t0 = performance.now();
    const pipelinePath = ctx.args.pipeline as string;
    const format = ((ctx.args.format as string) || 'human') as 'human' | 'json';

    interface ValidationIssue {
      level: 'error' | 'warning' | 'info';
      message: string;
    }

    const issues: ValidationIssue[] = [];
    let def: PipelineDefinition | null = null;

    // Check file exists and is valid JSON
    try {
      const content = await fs.readFile(pipelinePath, 'utf-8');
      try {
        def = JSON.parse(content) as PipelineDefinition;
      } catch {
        issues.push({ level: 'error', message: 'File is not valid JSON' });
      }
    } catch {
      issues.push({ level: 'error', message: `File not found: ${pipelinePath}` });
    }

    if (!def) {
      const payload = { valid: false, issues, errors: issues.length, warnings: 0 };
      if (format !== 'json') {
        const RED = '\x1b[31m';
        const RESET = '\x1b[0m';
        process.stdout.write(`\nPipeline Validation: ${path.basename(pipelinePath)}\n`);
        process.stdout.write('='.repeat(40) + '\n');
        for (const issue of issues) {
          process.stdout.write(`${RED}✗${RESET} ${issue.message}\n`);
        }
        process.stdout.write('\nValidation: INVALID\n\n');
      } else {
        const result = makeResult(
          'pipeline validate',
          payload,
          performance.now() - t0,
          EXIT_CODES.config_error,
          issues[0]?.message ?? 'Invalid pipeline'
        );
        emitResult(result, { format });
      }
      return exitWithFlush(EXIT_CODES.config_error);
    }

    // Structural checks
    if (!def.name) issues.push({ level: 'error', message: 'Missing required field: name' });
    if (!def.steps || !Array.isArray(def.steps)) {
      issues.push({ level: 'error', message: 'Missing or invalid field: steps (must be an array)' });
    } else if (def.steps.length === 0) {
      issues.push({ level: 'error', message: 'Pipeline has no steps' });
    } else {
      for (let i = 0; i < def.steps.length; i++) {
        const step = def.steps[i];
        if (!step.step) {
          issues.push({ level: 'error', message: `Step ${i + 1}: missing "step" field` });
        } else if (!KNOWN_STEPS.has(step.step)) {
          issues.push({
            level: 'warning',
            message: `Step ${i + 1} ("${step.step}"): unknown step name — may not work`,
          });
        }
      }

      const slowSteps = ['simulate', 'swarm', 'autoprocess', 'ml'];
      for (const step of def.steps) {
        if (slowSteps.includes(step.step)) {
          issues.push({ level: 'warning', message: `Step "${step.step}" may take >30s on large logs` });
        }
      }
    }

    // Check output path
    if (def.output) {
      const dir = path.dirname(def.output.replace(/\{\{[^}]+\}\}/g, 'x'));
      try {
        await fs.access(dir);
      } catch {
        issues.push({
          level: 'info',
          message: `Output directory "${dir}" does not exist yet — will be created on run`,
        });
      }
    }

    const errors = issues.filter((i) => i.level === 'error');
    const warnings = issues.filter((i) => i.level === 'warning');
    const isValid = errors.length === 0;

    const payload = {
      valid: isValid,
      name: def.name,
      steps_count: def.steps?.length ?? 0,
      errors: errors.length,
      warnings: warnings.length,
      issues,
    };

    if (format !== 'json') {
      const BOLD = '\x1b[1m';
      const GREEN = '\x1b[32m';
      const RED = '\x1b[31m';
      const YELLOW = '\x1b[33m';
      const DIM = '\x1b[2m';
      const RESET = '\x1b[0m';

      process.stdout.write(`\n${BOLD}Pipeline Validation: ${path.basename(pipelinePath)}${RESET}\n`);
      process.stdout.write('='.repeat(40) + '\n');

      if (issues.length === 0) {
        process.stdout.write(`${GREEN}✔${RESET} Valid JSON structure\n`);
        process.stdout.write(`${GREEN}✔${RESET} All steps are known commands\n`);
        process.stdout.write(`${GREEN}✔${RESET} ${def.steps?.length} steps defined\n`);
      } else {
        for (const issue of issues) {
          const icon =
            issue.level === 'error'
              ? `${RED}✗${RESET}`
              : issue.level === 'warning'
                ? `${YELLOW}⚠${RESET}`
                : `${DIM}ℹ${RESET}`;
          process.stdout.write(`${icon} ${issue.message}\n`);
        }
      }

      process.stdout.write('\n');
      if (isValid) {
        process.stdout.write(`${GREEN}${BOLD}Validation: VALID${RESET}`);
        if (warnings.length > 0)
          process.stdout.write(` (${warnings.length} warning${warnings.length !== 1 ? 's' : ''})`);
      } else {
        process.stdout.write(
          `${RED}${BOLD}Validation: INVALID${RESET} (${errors.length} error${errors.length !== 1 ? 's' : ''})`
        );
      }
      process.stdout.write('\n\n');
    } else {
      const exitCode = isValid ? EXIT_CODES.success : EXIT_CODES.config_error;
      const message = isValid
        ? `Pipeline "${def.name}" is valid`
        : `Pipeline has ${errors.length} error(s)`;
      const result = makeResult('pipeline validate', payload, performance.now() - t0, exitCode, message);
      emitResult(result, { format });
    }

    return exitWithFlush(isValid ? EXIT_CODES.success : EXIT_CODES.config_error);
  },
});

// ─── Top-level pipeline command ───────────────────────────────────────────────

export const pipeline = defineCommand({
  meta: {
    name: 'pipeline',
    description: `Chain process mining operations into reusable workflows.

Subcommands:
  wpm pipeline run <pipeline.json|preset> -i log.xes  Execute a pipeline
  wpm pipeline create --name <name> --steps a,b,c      Create a new pipeline
  wpm pipeline list                                     Show all available pipelines
  wpm pipeline validate <pipeline.json>                 Validate a pipeline definition

Built-in presets: quick, full, compliance, discovery

Example:
  wpm pipeline run full -i hospital.xes
  wpm pipeline run my-analysis.pipeline.json -i log.xes
  wpm pipeline create --name my-flow --steps validate,run,quality`,
  },
  subCommands: {
    run: pipelineRun,
    create: pipelineCreate,
    list: pipelineList,
    validate: pipelineValidate,
  },
});

export default pipeline;
