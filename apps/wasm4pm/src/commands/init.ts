import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { emitResult, makeResult, makeErrorResult, ConsoleProjection } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { getExampleTomlConfig, getExampleJsonConfig, getPublicPresetConfig, getExamplePresetConfig, type PublicPreset } from '@wasm4pm/config';
import { exitWithFlush } from '../otel/exit.js';

// Template content generators
function getEnvExampleContent(): string {
  return `# Environment variables for wasm4pm
# Copy to .env and adjust as needed

# Execution profile: fast, balanced, quality, stream
WASM4PM_PROFILE=balanced

# Logging level: debug, info, warn, error
WASM4PM_LOG_LEVEL=info

# Enable watch mode
WASM4PM_WATCH=false

# Output format: human, json
WASM4PM_OUTPUT_FORMAT=human

# Output destination: stdout, stderr, or file path
WASM4PM_OUTPUT_DESTINATION=stdout
`;
}

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
  constructor(public exitCode: number, public filepath: string, public cause: NodeJS.ErrnoException) {
    super(`Failed to write ${filepath}: ${cause.code ?? 'UNKNOWN'} ${cause.message}`);
    this.name = 'InitFileSystemError';
  }
}

export class InitTomlSerializeError extends Error {
  constructor(public filepath: string, public cause: Error) {
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
      description: 'Initialize with a preset (fast, balanced, quality)',
      alias: 'p',
    },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    // Use a temporary projection for early validation warnings before the result is built
    const earlyProjection = new ConsoleProjection({ verbose, quiet });

    try {
      const cwd = process.cwd();
      // Accept both camelCase (--configFormat) and kebab-case (--config-format).
      const configFormat = ((ctx.args.configFormat as string) || (ctx.args['config-format'] as string) || 'toml').toLowerCase();
      const force = ctx.args.force ?? false;
      const preset = ctx.args.preset as string | undefined;

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

      const VALID_PRESETS = ['fast', 'balanced', 'quality'];
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

      // Create config file
      const configFilename = configFormat === 'toml' ? 'wasm4pm.toml' : 'wasm4pm.json';
      const configPath = path.join(cwd, configFilename);
      let configContent: string;
      try {
        if (preset) {
          configContent = configFormat === 'toml'
            ? getExamplePresetConfig(preset as PublicPreset)
            : JSON.stringify(getPublicPresetConfig(preset as PublicPreset), null, 2);
        } else {
          configContent = configFormat === 'toml' ? getExampleTomlConfig() : getExampleJsonConfig();
        }
      } catch (serErr) {
        throw new InitTomlSerializeError(
          configPath,
          serErr instanceof Error ? serErr : new Error(String(serErr))
        );
      }

      const configCreated = await safeWriteFile(configPath, configContent, force, earlyProjection);

      const envPath = path.join(cwd, '.env.example');
      const envCreated = await safeWriteFile(envPath, getEnvExampleContent(), force, earlyProjection);

      const gitignorePath = path.join(cwd, '.gitignore');
      const gitignoreCreated = !existsSync(gitignorePath)
        ? await safeWriteFile(gitignorePath, getGitignoreContent(), force, earlyProjection)
        : false;

      const readmePath = path.join(cwd, 'README.md');
      const readmeCreated = !existsSync(readmePath)
        ? await safeWriteFile(readmePath, getReadmeContent(), force, earlyProjection)
        : false;

      const isValid = await validateConfigFiles(cwd);

      const filesCreated: string[] = [];
      if (configCreated) filesCreated.push(configFilename);
      if (envCreated) filesCreated.push('.env.example');
      if (gitignoreCreated) filesCreated.push('.gitignore');
      if (readmeCreated) filesCreated.push('README.md');

      const payload = {
        format: configFormat,
        preset: preset ?? null,
        files_created: filesCreated,
        valid: isValid,
        instructions: [
          `1. Edit ${configFilename}: set source.path to your .xes log file and pick an algorithm`,
          '2. Run: wpm algorithms          — list all 36+ available algorithms with speed/quality scores',
          '3. Run: wpm run <log.xes>       — discover a process model (uses config defaults)',
          '4. Run: wpm doctor              — verify your environment is correctly configured',
          '5. Copy .env.example to .env and add any secret values (OTEL endpoints, etc.)',
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
          projection.log('\nCreated files:');
          p.files_created.forEach((file) => {
            projection.log(`  ✓ ${file}`);
          });
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
  },
});
