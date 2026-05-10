import { defineCommand } from 'citty';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { AgentRegistry } from '@wasm4pm/agents';
import { withSpanRaw } from '../_otel.js';
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
    return withSpanRaw('wasm4pm.command.agent.register', {
      command: 'agent', subcommand: 'register',
      config: String(ctx.args.config ?? ''),
    }, async () => {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = false;
    const quiet = false;

    try {
      const configPath = ctx.args.config as string;
      const raw = readFileSync(configPath, 'utf-8');
      const config: AgentConfig = JSON.parse(raw);

      if (!config.name) {
        const errResult = makeErrorResult(
          'agent register',
          new Error('Agent config missing "name" field'),
          EXIT_CODES.config_error,
          'MISSING_NAME'
        );
        emitResult(errResult, { format, verbose, quiet });
        process.exit(errResult.exit_code);
      }
      if (!config.description) {
        const errResult = makeErrorResult(
          'agent register',
          new Error('Agent config missing "description" field'),
          EXIT_CODES.config_error,
          'MISSING_DESCRIPTION'
        );
        emitResult(errResult, { format, verbose, quiet });
        process.exit(errResult.exit_code);
      }

      const registry = new AgentRegistry();
      registry.registerAgent(config);

      const result = makeResult(
        'agent register',
        { registered: config },
        performance.now() - t0,
        EXIT_CODES.success
      );
      emitResult(result, { format, verbose, quiet }, (res, projection) => {
        const cfg = (res.payload as { registered: AgentConfig }).registered;
        projection.success(`Registered agent: ${cfg.name}`);
        projection.log(`  Description: ${cfg.description}`);
        projection.log(`  Mode: ${cfg.mode || 'on_demand'}`);
      });
      process.exit(result.exit_code);
    } catch (error) {
      if (error instanceof SyntaxError) {
        const errResult = makeErrorResult(
          'agent register',
          new Error(`Invalid JSON in agent config: ${ctx.args.config}`),
          EXIT_CODES.config_error,
          'INVALID_JSON'
        );
        emitResult(errResult, { format, verbose, quiet });
        process.exit(errResult.exit_code);
      }
      const errResult = makeErrorResult(
        'agent register',
        error,
        EXIT_CODES.execution_error,
        'AGENT_REGISTER_ERROR'
      );
      emitResult(errResult, { format, verbose, quiet });
      process.exit(errResult.exit_code);
    }
    });
  },
});
