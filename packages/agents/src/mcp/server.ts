/**
 * MCP Server for Van der Aalst Agents
 *
 * Exposes all 8 agents as MCP tools for Claude Desktop integration.
 * Uses a simple stdio transport for local development.
 */

import { AgentOrchestrator } from '../orchestration.js';
import { AuditStore } from '../audit.js';
import { AgentRegistry } from '../registry.js';
import { agentToolDefinitions } from './tools.js';
import type { AgentExecutionContext } from '../orchestration.js';

/**
 * Handle an MCP tool invocation
 */
export async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const orchestrator = new AgentOrchestrator();

  switch (toolName) {
    case 'agent_execute': {
      const result = await orchestrator.executeAgent(args.agent as string, {
        artifact_id: (args.artifact_id as string) || 'mcp-execution',
        input_file: args.input_file as string | undefined,
        dry_run: args.dry_run as boolean | undefined,
        traces: args.traces as Record<string, unknown>[] | undefined,
        ocel_events: args.ocel_events as Record<string, unknown>[] | undefined,
        receipts: args.receipts as Record<string, unknown>[] | undefined,
      });
      return result as unknown as Record<string, unknown>;
    }

    case 'agent_list': {
      const registry = orchestrator.getAgentRegistry();
      const filter = args.filter as 'continuous' | 'on_demand' | undefined;
      const agents = registry.listAgents(filter);
      return {
        agents,
        summary: registry.getSummary(),
      };
    }

    case 'agent_audit': {
      const audit = orchestrator.getAuditStore();
      const entries = audit.query({
        agent: args.agent as string | undefined,
        limit: typeof args.limit === 'number' ? args.limit : 10,
        since: args.since as string | undefined,
      });
      return {
        entries,
        summary: audit.getSummary(),
      };
    }

    case 'agent_status': {
      const registry = orchestrator.getAgentRegistry();
      if (args.agent) {
        const agent = registry.getAgent(args.agent as string);
        return { agent: agent || null };
      }
      return { summary: registry.getSummary() };
    }

    case 'agent_mapek_cycle': {
      const result = await orchestrator.runMapekCycle({
        artifact_id: args.artifact_id as string,
        input_file: args.input_file as string | undefined,
        dry_run: args.dry_run as boolean | undefined,
        gate_name: args.gate_name as string | undefined,
      });
      return result as unknown as Record<string, unknown>;
    }

    case 'agent_multi_surface_corroboration': {
      const monitor = await orchestrator.monitor({
        artifact_id: args.artifact_id as string,
        traces: args.traces as Record<string, unknown>[] | undefined,
        ocel_events: args.ocel_events as Record<string, unknown>[] | undefined,
        receipts: args.receipts as Record<string, unknown>[] | undefined,
      });

      const surfaces = [
        { name: 'execution', valid: monitor.execution.valid },
        { name: 'telemetry', valid: monitor.telemetry.valid },
        { name: 'state', valid: monitor.state.valid },
        { name: 'process', valid: monitor.process.valid },
      ];

      const passed = surfaces.filter((s) => s.valid).length;

      return {
        surfaces_passed: passed,
        total_surfaces: 4,
        corroborated: passed >= 3,
        details: surfaces,
      };
    }

    default:
      return {
        error: `Unknown tool: ${toolName}`,
        available_tools: agentToolDefinitions.map((t) => t.name),
      };
  }
}

/**
 * Get the MCP server configuration for Claude Desktop
 */
export function getClaudeDesktopConfig(
  wasm4pmPath: string,
  options?: {
    auditPath?: string;
    registryPath?: string;
  }
): Record<string, unknown> {
  return {
    mcpServers: {
      'wasm4pm-agents': {
        command: 'node',
        args: [`${wasm4pmPath}/packages/agents/dist/mcp/server.js`],
        env: {
          WASM4PM_AGENT_AUDIT_PATH: options?.auditPath || '',
          WASM4PM_AGENT_REGISTRY_PATH: options?.registryPath || '',
        },
      },
    },
  };
}

// Export for programmatic use
export { agentToolDefinitions };
