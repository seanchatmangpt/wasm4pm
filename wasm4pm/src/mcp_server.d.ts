/**
 * MCP Server Integration for wasm4pm
 *
 * Exposes wasm4pm process mining capabilities as Model Context Protocol (MCP) tools.
 * Enables Claude and other MCP clients to use wasm4pm for process discovery, analysis, and visualization.
 *
 * Usage:
 *   const server = new Wasm4pmMCPServer();
 *   await server.start();
 */
/**
 * wasm4pm MCP Server
 *
 * Provides MCP interface to wasm4pm functionality including:
 * - Process discovery (18 algorithms)
 * - Conformance checking
 * - Process analysis and visualization
 * - Event log import/export
 */
export declare class Wasm4pmMCPServer {
  private server;
  private transport;
  constructor();
  private setupHandlers;
  /**
   * Get all available MCP tools
   */
  private getAvailableTools;
  /**
   * Execute a tool by name
   */
  private executeTool;
  /**
   * Compare multiple algorithms on the same log
   */
  private compareAlgorithms;
  /**
   * Start the MCP server
   */
  start(): Promise<void>;
}
export default Wasm4pmMCPServer;
//# sourceMappingURL=mcp_server.d.ts.map
