/**
 * MCP Tool Definitions for Van der Aalst Agents
 *
 * Exposes all 8 agents as MCP tools for Claude integration.
 * Follows the Model Context Protocol specification for tool schemas.
 */
export declare const agentToolDefinitions: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            agent: {
                type: string;
                enum: string[];
                description: string;
            };
            artifact_id: {
                type: string;
                description: string;
            };
            input_file: {
                type: string;
                description: string;
            };
            dry_run: {
                type: string;
                description: string;
                default: boolean;
            };
            traces: {
                type: string;
                description: string;
                items: {
                    type: string;
                };
            };
            ocel_events: {
                type: string;
                description: string;
                items: {
                    type: string;
                };
            };
            receipts: {
                type: string;
                description: string;
                items: {
                    type: string;
                };
            };
            filter?: undefined;
            limit?: undefined;
            since?: undefined;
            gate_name?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            filter: {
                type: string;
                enum: string[];
                description: string;
            };
            agent?: undefined;
            artifact_id?: undefined;
            input_file?: undefined;
            dry_run?: undefined;
            traces?: undefined;
            ocel_events?: undefined;
            receipts?: undefined;
            limit?: undefined;
            since?: undefined;
            gate_name?: undefined;
        };
        required?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            agent: {
                type: string;
                description: string;
                enum?: undefined;
            };
            limit: {
                type: string;
                description: string;
                default: number;
            };
            since: {
                type: string;
                description: string;
            };
            artifact_id?: undefined;
            input_file?: undefined;
            dry_run?: undefined;
            traces?: undefined;
            ocel_events?: undefined;
            receipts?: undefined;
            filter?: undefined;
            gate_name?: undefined;
        };
        required?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            agent: {
                type: string;
                description: string;
                enum?: undefined;
            };
            artifact_id?: undefined;
            input_file?: undefined;
            dry_run?: undefined;
            traces?: undefined;
            ocel_events?: undefined;
            receipts?: undefined;
            filter?: undefined;
            limit?: undefined;
            since?: undefined;
            gate_name?: undefined;
        };
        required?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            artifact_id: {
                type: string;
                description: string;
            };
            input_file: {
                type: string;
                description: string;
            };
            dry_run: {
                type: string;
                description: string;
                default: boolean;
            };
            gate_name: {
                type: string;
                description: string;
            };
            agent?: undefined;
            traces?: undefined;
            ocel_events?: undefined;
            receipts?: undefined;
            filter?: undefined;
            limit?: undefined;
            since?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            artifact_id: {
                type: string;
                description: string;
            };
            traces: {
                type: string;
                description: string;
                items: {
                    type: string;
                };
            };
            ocel_events: {
                type: string;
                description: string;
                items: {
                    type: string;
                };
            };
            receipts: {
                type: string;
                description: string;
                items: {
                    type: string;
                };
            };
            agent?: undefined;
            input_file?: undefined;
            dry_run?: undefined;
            filter?: undefined;
            limit?: undefined;
            since?: undefined;
            gate_name?: undefined;
        };
        required: string[];
    };
})[];
//# sourceMappingURL=tools.d.ts.map