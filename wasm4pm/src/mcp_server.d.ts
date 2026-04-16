/**
 * MCP Server Integration for pictl
 *
 * Exposes pictl process mining capabilities as Model Context Protocol (MCP) tools.
 * Enables Claude and other MCP clients to use pictl for process discovery, analysis, and visualization.
 *
 * Usage:
 *   const server = new PictlMCPServer();
 *   await server.start();
 */
/**
 * pictl MCP Server
 *
 * Provides MCP interface to pictl functionality including:
 * - Process discovery (18 algorithms)
 * - Conformance checking
 * - Process analysis and visualization
 * - Event log import/export
 */
export declare class PictlMCPServer {
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
export default PictlMCPServer;
//# sourceMappingURL=mcp_server.d.ts.map