/**
 * MCP Server for Van der Aalst Agents
 *
 * Exposes all 8 agents as MCP tools for Claude Desktop integration.
 * Uses a simple stdio transport for local development.
 */
import { agentToolDefinitions } from './tools.js';
/**
 * Handle an MCP tool invocation
 */
export declare function handleToolCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>>;
/**
 * Get the MCP server configuration for Claude Desktop
 */
export declare function getClaudeDesktopConfig(
  wasm4pmPath: string,
  options?: {
    auditPath?: string;
    registryPath?: string;
  }
): Record<string, unknown>;
export { agentToolDefinitions };
//# sourceMappingURL=server.d.ts.map
