import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { emitResult, makeResult, makeErrorResult, ConsoleProjection } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import {
  getExampleTomlConfig,
  getExampleJsonConfig,
  getPublicPresetConfig,
  getExamplePresetConfig,
  getExampleEnvFile,
  type PublicPreset,
} from '@wasm4pm/config';
import { exitWithFlush } from '../otel/exit.js';
import { withSpan, withSpanRaw } from './_otel.js';

// getEnvExampleContent is sourced from @wasm4pm/config (getExampleEnvFile) so it always
// stays in sync with the full set of WASM4PM_* variables the resolver actually handles.

function getGitignoreContent(): string {
  return `# Node modules
node_modules/
.npm

# Build outputs
dist/
build/
*.tsbuildinfo

# Configuration and secrets
.env
.env.local
.env.*.local
config.local.*

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# OS files
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# Project files
results/
*.pid
*.seed
`;
}

function getReadmeContent(): string {
  return `# wasm4pm Project

This is a wasm4pm process mining project initialized with wasm4pm (wpm).

## Setup

1. Install dependencies:
   \`\`\`bash
   pnpm install
   \`\`\`

2. Copy and configure environment:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

3. Edit \`wasm4pm.toml\` or \`wasm4pm.json\` to customize configuration

## Usage

### Run process discovery
\`\`\`bash
wpm run --config wasm4pm.toml --algorithm dfg --input data/log.xes
\`\`\`

### Watch mode
\`\`\`bash
wpm watch --config wasm4pm.toml --interval 1000
\`\`\`

### Check status
\`\`\`bash
wpm status --format human
\`\`\`

### Explain algorithm
\`\`\`bash
wpm explain --algorithm genetic --level detailed
\`\`\`

## Configuration

Configuration is resolved in this order (highest to lowest priority):
1. CLI arguments (--config, --profile, etc.)
2. \`wasm4pm.toml\` in current directory
3. \`wasm4pm.json\` in current directory
4. Environment variables with \`WASM4PM_\` prefix
5. Default values

## Documentation

For more information on wasm4pm, see:
- [Configuration Reference](https://github.com/seanchatmangpt/wasm4pm/tree/main/docs/reference/config-schema.md)
- [Algorithm Reference](https://github.com/seanchatmangpt/wasm4pm/tree/main/docs/reference/algorithms.md)
- [API Documentation](https://github.com/seanchatmangpt/wasm4pm/tree/main/docs/reference/http-api.md)
`;
}

/**
 * Tagged write-file errors — map to specific exit codes in the caller.
 */
export class InitFileSystemError extends Error {
  constructor(
    public exitCode: number,
    public filepath: string,
    public cause: NodeJS.ErrnoException
  ) {
    super(`Failed to write ${filepath}: ${cause.code ?? 'UNKNOWN'} ${cause.message}`);
    this.name = 'InitFileSystemError';
  }
}

export class InitTomlSerializeError extends Error {
  constructor(
    public filepath: string,
    public cause: Error
  ) {
    super(`TOML serialization error for ${filepath}: ${cause.message}`);
    this.name = 'InitTomlSerializeError';
  }
}

/**
 * Write file with safety checks — returns true if written, false if skipped.
 *
 * Throws InitFileSystemError on EACCES/ENOSPC so the caller can map to
 * EXIT_CODES.system_error. Other I/O errors propagate as ordinary errors
 * (default catch path → EXIT_CODES.execution_error).
 */
async function safeWriteFile(
  filepath: string,
  content: string,
  force: boolean,
  projection: ConsoleProjection
): Promise<boolean> {
  if (existsSync(filepath) && !force) {
    projection.warn(`File already exists: ${filepath} (use --force to overwrite)`);
    return false;
  }

  try {
    await fs.writeFile(filepath, content, 'utf-8');
    return true;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e && (e.code === 'EACCES' || e.code === 'ENOSPC')) {
      throw new InitFileSystemError(EXIT_CODES.system_error, filepath, e);
    }
    throw err;
  }
}

/**
 * Validate configuration files by attempting to load them.
 * CRITICAL: Config errors are not recoverable — must propagate to fail fast.
 */
async function validateConfigFiles(dirpath: string): Promise<boolean> {
  const tomlPath = path.join(dirpath, 'wasm4pm.toml');
  const jsonPath = path.join(dirpath, 'wasm4pm.json');

  if (existsSync(tomlPath)) {
    try {
      const { resolveConfig } = await import('@wasm4pm/config');
      await resolveConfig({ configSearchPaths: [dirpath] });
      return true;
    } catch (error) {
      throw new Error(
        `Configuration validation failed for ${tomlPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (existsSync(jsonPath)) {
    try {
      const { resolveConfig } = await import('@wasm4pm/config');
      await resolveConfig({ configSearchPaths: [dirpath] });
      return true;
    } catch (error) {
      throw new Error(
        `Configuration validation failed for ${jsonPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return true;
}

// Presets that have both TOML templates and a full BaseConfig object (JSON serialisable).
const PUBLIC_PRESETS_WITH_JSON: ReadonlyArray<string> = ['fast', 'balanced', 'quality'];

// Domain-specific preset aliases that map to a technical preset.
// These give practitioners a vocabulary closer to their industry without
// requiring knowledge of algorithm names up front.
const DOMAIN_PRESET_MAP: Record<string, string> = {
  hospital: 'balanced',       // inductive_miner + conformance focus for clinical pathways
  financial: 'quality',       // ilp + full ML for audit-grade accuracy
  manufacturing: 'fast',      // DFG for real-time shop-floor monitoring
  streaming: 'streaming',     // explicitly kept as alias identity for clarity
};

// Human-readable descriptions for domain presets (overrides technical preset description).
const DOMAIN_PRESET_DESCRIPTIONS: Record<string, string> = {
  hospital:
    'Balanced profile tuned for clinical pathways — inductive_miner for sound process trees, ML for case classification, conformance for guideline adherence.',
  financial:
    'Quality profile for audit-grade analysis — ILP Petri-net discovery, full ML suite, and RL orchestration. Highest accuracy for regulatory compliance.',
  manufacturing:
    'Fast profile for real-time shop-floor monitoring — DFG for sub-second discovery on high-volume event streams, minimal overhead.',
};

// Algorithm hints for domain presets.
const DOMAIN_ALGO_HINTS: Record<string, string> = {
  hospital: 'inductive_miner (sound process tree) or heuristic_miner (noise-tolerant)',
  financial: 'ilp (provably optimal) or genetic_algorithm (flexible quality)',
  manufacturing: 'dfg (fastest) or simd_streaming_dfg (SIMD-accelerated real-time)',
};

// All supported init preset names (technical + domain aliases).
const VALID_PRESETS: ReadonlyArray<string> = [
  'fast',
  'balanced',
  'quality',
  'conformance',
  'streaming',
  'hospital',
  'financial',
  'manufacturing',
];

type AllPresets = 'fast' | 'balanced' | 'quality' | 'conformance' | 'streaming';

export const init = defineCommand({
  meta: {
    name: 'init',
    description: 'Initialize wasm4pm configuration in current directory',
  },
  args: {
    'config-format': {
      type: 'string',
      description: 'Config format (toml or json)',
      alias: 'c',
      default: 'toml',
    },
    force: {
      type: 'boolean',
      description: 'Overwrite existing files',
      alias: 'F',
    },
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      description: 'Enable verbose logging',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
      alias: 'q',
    },
    preset: {
      type: 'string',
      description:
        'Initialize with a preset: fast (DFG, no ML/prediction), balanced (heuristic+ML+prediction), quality (ILP+full ML+RL), conformance (alignment-based fitness check), streaming (SIMD DFG + drift detection). Domain presets: hospital (balanced, clinical pathways), financial (quality, audit-grade), manufacturing (fast, shop-floor monitoring)',
      alias: 'p',
    },
    'profile-guide': {
      type: 'boolean',
      description: 'Run interactive profile guide to recommend deployment profile',
    },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const profileGuide = Boolean(ctx.args['profile-guide']);

    // If --profile-guide requested, run the interactive questionnaire and exit
    if (profileGuide) {
      const { profileGuideQuestionnaire, recommendProfile, formatRecommendation } = await import(
        '../profile-guide.js'
      );
      const response = await profileGuideQuestionnaire();
      const recommendation = recommendProfile(response);
      const formatted = formatRecommendation(recommendation);

      if (format === 'json') {
        // JSON output for scripting
        const jsonOutput = {
          status: 'profile_guide_recommendation',
          profile: recommendation.profile,
          reasoning: recommendation.reasoning,
          size_estimate: recommendation.sizeEstimate,
          features: recommendation.features,
          tradeoffs: recommendation.tradeoffs,
          next_steps: recommendation.nextSteps,
        };
        console.log(JSON.stringify(jsonOutput, null, 2));
      } else {
        // Human output with formatting
        console.log(formatted);
      }

      return await exitWithFlush(EXIT_CODES.success);
    }

    const configFormat = (
      (ctx.args.configFormat as string) ||
      (ctx.args['config-format'] as string) ||
      'toml'
    ).toLowerCase();
    // Resolve domain preset aliases to their underlying technical preset.
    // Keep the original name for user-facing output (description, hint),
    // but use the technical name for config file generation.
    const rawPreset = ctx.args.preset as string | undefined;
    const domainPreset = rawPreset && DOMAIN_PRESET_MAP[rawPreset] ? rawPreset : undefined;
    const preset = domainPreset ? DOMAIN_PRESET_MAP[domainPreset] as string : rawPreset;
    const force = Boolean(ctx.args.force);

    return withSpan(
      'init',
      { config_format: configFormat, preset: preset ?? '', force, format },
      async () => {
        // Use a temporary projection for early validation warnings before the result is built
        const earlyProjection = new ConsoleProjection({ verbose, quiet });

        try {
          const cwd = process.cwd();

          if (configFormat !== 'toml' && configFormat !== 'json') {
            const result = makeErrorResult(
              'init',
              new Error(`Invalid format: ${configFormat}. Must be 'toml' or 'json'`),
              EXIT_CODES.config_error,
              'INVALID_FORMAT'
            );
            emitResult(result, { format, verbose, quiet });
            return await exitWithFlush(result.exit_code);
          }

          if (preset && !VALID_PRESETS.includes(preset)) {
            const result = makeErrorResult(
              'init',
              new Error(`Invalid preset: ${preset}. Must be one of: ${VALID_PRESETS.join(', ')}`),
              EXIT_CODES.config_error,
              'INVALID_PRESET'
            );
            emitResult(result, { format, verbose, quiet });
            return await exitWithFlush(result.exit_code);
          }

          // Create config file.
          // conformance and streaming presets are workflow-specific templates — they only have a
          // TOML representation and do not map to a full BaseConfig object. When those presets are
          // requested with --config-format json, we silently fall back to TOML so the generated
          // file is valid and human-readable.
          const tomlOnlyPreset = preset !== undefined && !PUBLIC_PRESETS_WITH_JSON.includes(preset);
          const effectiveFormat = tomlOnlyPreset ? 'toml' : configFormat;
          const configFilename = effectiveFormat === 'toml' ? 'wasm4pm.toml' : 'wasm4pm.json';
          const configPath = path.join(cwd, configFilename);

          let configContent: string;
          try {
            if (preset) {
              if (tomlOnlyPreset && configFormat === 'json') {
                earlyProjection.warn(
                  `The "${preset}" preset is a workflow template and only supports TOML format. Generating wasm4pm.toml instead of wasm4pm.json.`
                );
              }
              if (effectiveFormat === 'toml') {
                configContent = getExamplePresetConfig(preset as AllPresets);
              } else {
                // JSON format: only reachable for fast / balanced / quality
                configContent = JSON.stringify(
                  getPublicPresetConfig(preset as PublicPreset),
                  null,
                  2
                );
              }
            } else {
              configContent =
                configFormat === 'toml' ? getExampleTomlConfig() : getExampleJsonConfig();
            }
          } catch (serErr) {
            throw new InitTomlSerializeError(
              configPath,
              serErr instanceof Error ? serErr : new Error(String(serErr))
            );
          }

          const { filesCreated, isValid, wasm4pmDirCreated } = await withSpanRaw(
            'init.scaffold',
            { 'init.preset': preset ?? '', 'init.format': effectiveFormat, 'init.force': force },
            async () => {
              const configCreated = await safeWriteFile(
                configPath,
                configContent,
                force,
                earlyProjection
              );

              // .env.example: use getExampleEnvFile() from @wasm4pm/config so every WASM4PM_* variable
              // that the resolver understands is listed with a description.
              const envPath = path.join(cwd, '.env.example');
              const envCreated = await safeWriteFile(
                envPath,
                getExampleEnvFile(),
                force,
                earlyProjection
              );

              const gitignorePath = path.join(cwd, '.gitignore');
              const gitignoreCreated = !existsSync(gitignorePath)
                ? await safeWriteFile(gitignorePath, getGitignoreContent(), force, earlyProjection)
                : false;

              const readmePath = path.join(cwd, 'README.md');
              const readmeCreated = !existsSync(readmePath)
                ? await safeWriteFile(readmePath, getReadmeContent(), force, earlyProjection)
                : false;

              // Ensure .wasm4pm/ directory exists — wpm run and other commands auto-save
              // results here. Creating it during init avoids surprise ENOENT errors on first run.
              const wasm4pmDir = path.join(cwd, '.wasm4pm');
              let wasm4pmDirCreated = false;
              if (!existsSync(wasm4pmDir)) {
                try {
                  await fs.mkdir(wasm4pmDir, { recursive: true });
                  wasm4pmDirCreated = true;
                } catch (dirErr) {
                  const dirErrTyped = dirErr as NodeJS.ErrnoException;
                  if (
                    dirErrTyped &&
                    (dirErrTyped.code === 'EACCES' || dirErrTyped.code === 'ENOSPC')
                  ) {
                    throw new InitFileSystemError(EXIT_CODES.system_error, wasm4pmDir, dirErrTyped);
                  }
                  // Non-fatal: log a warning but do not abort init
                  earlyProjection.warn(
                    `Could not create .wasm4pm/ directory: ${dirErrTyped.message ?? String(dirErr)}`
                  );
                }
              }

              const valid = await validateConfigFiles(cwd);

              const created: string[] = [];
              if (configCreated) created.push(configFilename);
              if (envCreated) created.push('.env.example');
              if (gitignoreCreated) created.push('.gitignore');
              if (readmeCreated) created.push('README.md');
              if (wasm4pmDirCreated) created.push('.wasm4pm/');

              return { filesCreated: created, isValid: valid, wasm4pmDirCreated };
            }
          );

          // Algorithm guidance tailored to the chosen preset.
          // Domain presets override with domain-specific hints.
          const algorithmHint = (() => {
            if (domainPreset && DOMAIN_ALGO_HINTS[domainPreset]) return DOMAIN_ALGO_HINTS[domainPreset];
            if (preset === 'conformance')
              return 'etconformance_precision (fast) or alignments (exact)';
            if (preset === 'streaming') return 'simd_streaming_dfg (fastest) or dfg (default)';
            if (preset === 'quality')
              return 'ilp (highest quality) or genetic_algorithm (flexible)';
            if (preset === 'balanced')
              return 'heuristic_miner (default) or inductive_miner (structured)';
            return 'dfg (fastest) → heuristic_miner (balanced) → ilp (highest quality)';
          })();

          // Practical description of what the chosen preset actually does.
          // Domain presets override with domain-specific descriptions.
          const presetDescription = (() => {
            if (domainPreset && DOMAIN_PRESET_DESCRIPTIONS[domainPreset])
              return DOMAIN_PRESET_DESCRIPTIONS[domainPreset];
            if (preset === 'fast')
              return 'Directly-Follows Graph only — sub-second discovery, no ML or prediction. Start here.';
            if (preset === 'balanced')
              return 'Heuristic miner + ML classification + next-activity prediction. Good all-round choice.';
            if (preset === 'quality')
              return 'ILP Petri-net discovery + full ML suite + RL orchestration. Highest accuracy, slower.';
            if (preset === 'conformance')
              return 'Alignment-based fitness check against a normative model. Use when you have a target process.';
            if (preset === 'streaming')
              return 'SIMD-accelerated DFG + EWMA drift detection. Use for high-throughput or live log feeds.';
            return null;
          })();

          const payload = {
            format: effectiveFormat,
            preset: domainPreset ?? preset ?? null,
            preset_description: presetDescription,
            files_created: filesCreated,
            wasm4pm_dir_created: wasm4pmDirCreated,
            valid: isValid,
            log_file_needed: true,
            instructions: [
              '1. Get a log file  — you need a real .xes or .ocel event log to run discovery.',
              '   Example: cp /path/to/your/process.xes ./data/process.xes',
              `2. Run: wpm run <log.xes>       — discover a process model (algorithm: ${algorithmHint})`,
              `3. Edit ${configFilename}: set [source] path to persist log location across runs`,
              '4. Run: wpm explain             — compare algorithms and choose one for your situation',
              '5. Run: wpm doctor              — verify your environment is correctly configured',
              '6. Copy .env.example to .env — it lists ALL WASM4PM_* env vars with descriptions',
            ],
          };

          if (!isValid) {
            const result = makeErrorResult(
              'init',
              new Error('Configuration validation failed. Please review your config file.'),
              EXIT_CODES.execution_error,
              'CONFIG_INVALID'
            );
            emitResult(result, { format, verbose, quiet });
            return await exitWithFlush(result.exit_code);
          }

          const result = makeResult('init', payload, performance.now() - t0, EXIT_CODES.success);
          emitResult(result, { format, verbose, quiet }, (res, projection) => {
            const p = res.payload as typeof payload;
            if (p.files_created.length > 0) {
              const presetLabel = p.preset ? ` with ${p.preset} preset` : '';
              projection.success(`Configuration initialized successfully${presetLabel}`);

              // Surface the practical meaning of the chosen preset so a first-time user
              // understands what they opted into without reading docs.
              if (p.preset_description) {
                projection.info(`Preset "${p.preset}": ${p.preset_description}`);
              }

              projection.log('\nCreated files:');
              p.files_created.forEach((file) => {
                projection.log(`  ✓ ${file}`);
              });

              // Warn clearly that a log file is a prerequisite before any discovery can run.
              projection.log(
                '\n  NOTE: You need a real .xes or .ocel event log file to run discovery.'
              );
              projection.log(
                '        wasm4pm does not bundle sample logs — point it at your own data.'
              );

              projection.log('\nNext steps:');
              p.instructions.forEach((instruction) => {
                projection.log(`  ${instruction}`);
              });
            } else {
              projection.info('All files already exist (use --force to overwrite)');
            }
          });
          return await exitWithFlush(result.exit_code);
        } catch (error) {
          let exitCode: number = EXIT_CODES.execution_error;
          let code = 'INIT_ERROR';
          if (error instanceof InitFileSystemError) {
            exitCode = EXIT_CODES.system_error;
            code = 'INIT_FILESYSTEM_ERROR';
          } else if (error instanceof InitTomlSerializeError) {
            exitCode = EXIT_CODES.config_error;
            code = 'INIT_CONFIG_SERIALIZE_ERROR';
          }
          const result = makeErrorResult('init', error, exitCode, code);
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }
      }
    ); // end withSpan
  },
});
