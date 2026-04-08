import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { getFormatter } from '../output.js';
import type { OutputOptions } from '../output.js';
import type { HumanFormatter, JSONFormatter } from '../output.js';
import { getExampleTomlConfig, getExampleJsonConfig } from '@pictl/config';

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
  return `# pictl Project

This is a wasm4pm process mining project initialized with pictl.

## Setup

1. Install dependencies:
   \`\`\`bash
   pnpm install
   \`\`\`

2. Copy and configure environment:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

3. Edit \`pictl.toml\` or \`wasm4pm.json\` to customize configuration

## Usage

### Run process discovery
\`\`\`bash
pictl run --config pictl.toml --algorithm dfg --input data/log.xes
\`\`\`

### Watch mode
\`\`\`bash
pictl watch --config pictl.toml --interval 1000
\`\`\`

### Check status
\`\`\`bash
pictl status --format human
\`\`\`

### Explain algorithm
\`\`\`bash
pictl explain --algorithm genetic --level detailed
\`\`\`

## Configuration

Configuration is resolved in this order (highest to lowest priority):
1. CLI arguments (--config, --profile, etc.)
2. \`pictl.toml\` in current directory
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
 * Write file with safety checks
 */
async function safeWriteFile(
  filepath: string,
  content: string,
  force: boolean,
  formatter: HumanFormatter | JSONFormatter,
  outputFormat: 'human' | 'json'
): Promise<boolean> {
  if (existsSync(filepath) && !force) {
    if (outputFormat === 'human') {
      (formatter as HumanFormatter).warn(`File already exists: ${filepath} (use --force to overwrite)`);
    }
    return false;
  }

  await fs.writeFile(filepath, content, 'utf-8');
  return true;
}

/**
 * Create directory safely
 */
async function ensureDirectory(dirpath: string): Promise<void> {
  await fs.mkdir(dirpath, { recursive: true });
}

/**
 * Validate configuration files by attempting to load them
 */
async function validateConfigFiles(dirpath: string, formatter: HumanFormatter | JSONFormatter, outputFormat: 'human' | 'json'): Promise<boolean> {
  const tomlPath = path.join(dirpath, 'pictl.toml');
  const jsonPath = path.join(dirpath, 'wasm4pm.json');

  try {
    // Try to load TOML if it exists
    if (existsSync(tomlPath)) {
      const { resolveConfig } = await import('@pictl/config');
      await resolveConfig({ configSearchPaths: [dirpath] });
      if (outputFormat === 'human') {
        (formatter as HumanFormatter).debug(`✓ TOML config is valid: ${tomlPath}`);
      }
      return true;
    }

    // Try to load JSON if it exists
    if (existsSync(jsonPath)) {
      const { resolveConfig } = await import('@pictl/config');
      await resolveConfig({ configSearchPaths: [dirpath] });
      if (outputFormat === 'human') {
        (formatter as HumanFormatter).debug(`✓ JSON config is valid: ${jsonPath}`);
      }
      return true;
    }

    return true;
  } catch (error) {
    if (outputFormat === 'human') {
      (formatter as HumanFormatter).warn(`Configuration validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    return false;
  }
}

export const init = defineCommand({
  meta: {
    name: 'init',
    description: 'Initialize wasm4pm configuration in current directory',
  },
  args: {
    configFormat: {
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
  },
  async run(ctx) {
    const outputFormat = ctx.args.format as 'human' | 'json';
    const formatter = getFormatter({
      format: outputFormat,
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

    try {
      const cwd = process.cwd();
      const configFormat = (ctx.args.configFormat as string || 'toml').toLowerCase();
      const force = ctx.args.force ?? false;

      if (configFormat !== 'toml' && configFormat !== 'json') {
        formatter.error(`Invalid format: ${configFormat}. Must be 'toml' or 'json'`);
        const { EXIT_CODES } = await import('../exit-codes.js');
        process.exit(EXIT_CODES.config_error);
      }

      // Create config file
      const configFilename = configFormat === 'toml' ? 'pictl.toml' : 'wasm4pm.json';
      const configPath = path.join(cwd, configFilename);
      const configContent = configFormat === 'toml' ? getExampleTomlConfig() : getExampleJsonConfig();

      const configCreated = await safeWriteFile(configPath, configContent, force, formatter, outputFormat);

      // Create .env.example
      const envPath = path.join(cwd, '.env.example');
      const envCreated = await safeWriteFile(envPath, getEnvExampleContent(), force, formatter, outputFormat);

      // Create .gitignore if it doesn't exist
      const gitignorePath = path.join(cwd, '.gitignore');
      const gitignoreCreated = !existsSync(gitignorePath)
        ? await safeWriteFile(gitignorePath, getGitignoreContent(), force, formatter, outputFormat)
        : false;

      // Create README.md if it doesn't exist
      const readmePath = path.join(cwd, 'README.md');
      const readmeCreated = !existsSync(readmePath)
        ? await safeWriteFile(readmePath, getReadmeContent(), force, formatter, outputFormat)
        : false;

      // Validate configuration files
      const isValid = await validateConfigFiles(cwd, formatter, outputFormat);

      // Prepare result
      const filesCreated = [];
      if (configCreated) filesCreated.push(configFilename);
      if (envCreated) filesCreated.push('.env.example');
      if (gitignoreCreated) filesCreated.push('.gitignore');
      if (readmeCreated) filesCreated.push('README.md');

      const initResult = {
        format: configFormat,
        files_created: filesCreated,
        valid: isValid,
        instructions: [
          `1. Review and edit ${configFilename} to customize your configuration`,
          '2. Copy .env.example to .env and add any secret values',
          '3. Use "pictl run --help" to see available options',
        ],
      };

      if (outputFormat === 'json') {
        (formatter as JSONFormatter).success('Configuration initialized', initResult);
      } else {
        const humanFormatter = formatter as HumanFormatter;
        if (filesCreated.length > 0) {
          humanFormatter.success('Configuration initialized successfully');
          humanFormatter.log(`\nCreated files:`);
          filesCreated.forEach((file) => {
            humanFormatter.log(`  ✓ ${file}`);
          });
          humanFormatter.log(`\nNext steps:`);
          initResult.instructions.forEach((instruction) => {
            humanFormatter.log(`  ${instruction}`);
          });
          if (!isValid) {
            humanFormatter.warn(`\n⚠ Configuration validation found issues. Please review your config file.`);
          }
        } else {
          humanFormatter.info('All files already exist (use --force to overwrite)');
        }
      }
    } catch (error) {
      if (outputFormat === 'json') {
        (formatter as JSONFormatter).error('Initialization failed', error);
      } else {
        formatter.error(`Initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      const { EXIT_CODES } = await import('../exit-codes.js');
      process.exit(EXIT_CODES.system_error);
    }
  },
});
