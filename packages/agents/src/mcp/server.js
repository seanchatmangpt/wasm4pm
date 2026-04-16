/**
 * MCP Server for Van der Aalst Agents
 *
 * Exposes all 8 agents as MCP tools for Claude Desktop integration.
 * Uses a simple stdio transport for local development.
 */
import { AgentOrchestrator } from '../orchestration.js';
import { agentToolDefinitions } from './tools.js';
/**
 * Handle an MCP tool invocation
 */
export async function handleToolCall(toolName, args) {
    const orchestrator = new AgentOrchestrator();
    switch (toolName) {
        case 'agent_execute': {
            const result = await orchestrator.executeAgent(args.agent, {
                artifact_id: args.artifact_id || 'mcp-execution',
                input_file: args.input_file,
                dry_run: args.dry_run,
                traces: args.traces,
                ocel_events: args.ocel_events,
                receipts: args.receipts,
            });
            return result;
        }
        case 'agent_list': {
            const registry = orchestrator.getAgentRegistry();
            const filter = args.filter;
            const agents = registry.listAgents(filter);
            return {
                agents,
                summary: registry.getSummary(),
            };
        }
        case 'agent_audit': {
            const audit = orchestrator.getAuditStore();
            const entries = audit.query({
                agent: args.agent,
                limit: typeof args.limit === 'number' ? args.limit : 10,
                since: args.since,
            });
            return {
                entries,
                summary: audit.getSummary(),
            };
        }
        case 'agent_status': {
            const registry = orchestrator.getAgentRegistry();
            if (args.agent) {
                const agent = registry.getAgent(args.agent);
                return { agent: agent || null };
            }
            return { summary: registry.getSummary() };
        }
        case 'agent_mapek_cycle': {
            const result = await orchestrator.runMapekCycle({
                artifact_id: args.artifact_id,
                input_file: args.input_file,
                dry_run: args.dry_run,
                gate_name: args.gate_name,
            });
            return result;
        }
        case 'agent_multi_surface_corroboration': {
            const monitor = await orchestrator.monitor({
                artifact_id: args.artifact_id,
                traces: args.traces,
                ocel_events: args.ocel_events,
                receipts: args.receipts,
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
export function getClaudeDesktopConfig(pictlPath, options) {
    return {
        mcpServers: {
            'pictl-agents': {
                command: 'node',
                args: [`${pictlPath}/packages/agents/dist/mcp/server.js`],
                env: {
                    PICTL_AGENT_AUDIT_PATH: options?.auditPath || '',
                    PICTL_AGENT_REGISTRY_PATH: options?.registryPath || '',
                },
            },
        },
    };
}
// Export for programmatic use
export { agentToolDefinitions };
//# sourceMappingURL=server.js.map