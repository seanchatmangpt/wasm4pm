import { defineCommand } from 'citty';
import { getFormatter, JSONFormatter } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { AgentRegistry } from '@wasm4pm/agents';
import type { AgentConfig } from '@wasm4pm/agents';
import { readFileSync } from 'fs';

export const register = defineCommand({
  meta: {
    name: 'register',
    description: 'Register a custom agent from configuration file',
  },
  args: {
    config: {
      type: 'positional',
      description: 'Path to agent configuration (JSON)',
      required: true,
    },
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
  },
  async run(ctx) {
    const formatter = getFormatter({
      format: ctx.args.format as 'human' | 'json',
    });

    try {
      const configPath = ctx.args.config as string;
      const raw = readFileSync(configPath, 'utf-8');
      const config: AgentConfig = JSON.parse(raw);

      // Validate required fields
      if (!config.name) {
        formatter.error('Agent config missing "name" field');
        process.exit(EXIT_CODES.config_error);
      }
      if (!config.description) {
        formatter.error('Agent config missing "description" field');
        process.exit(EXIT_CODES.config_error);
      }

      const registry = new AgentRegistry();
      registry.registerAgent(config);

      if (formatter instanceof JSONFormatter) {
        formatter.success('Agent registered', config);
      } else {
        formatter.success(`Registered agent: ${config.name}`);
        formatter.log(`  Description: ${config.description}`);
        formatter.log(`  Mode: ${config.mode || 'on_demand'}`);
      }

      process.exit(EXIT_CODES.success);
    } catch (error) {
      if (error instanceof SyntaxError) {
        if (formatter instanceof JSONFormatter) {
          formatter.error('Invalid JSON in agent config', { path: ctx.args.config });
        } else {
          formatter.error(`Invalid JSON in agent config: ${ctx.args.config}`);
        }
        process.exit(EXIT_CODES.config_error);
      } else {
        if (formatter instanceof JSONFormatter) {
          formatter.error('Failed to register agent', error);
        } else {
          formatter.error(`Failed to register agent: ${error instanceof Error ? error.message : String(error)}`);
        }
        process.exit(EXIT_CODES.execution_error);
      }
    }
  },
});
