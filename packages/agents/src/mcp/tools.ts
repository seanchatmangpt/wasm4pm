/**
 * MCP Tool Definitions for Van der Aalst Agents
 *
 * Exposes all 8 agents as MCP tools for Claude integration.
 * Follows the Model Context Protocol specification for tool schemas.
 */

export const agentToolDefinitions = [
  {
    name: 'agent_execute',
    description:
      'Execute a Van der Aalst process mining agent to detect violations and optionally apply autonomous corrections',
    inputSchema: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          enum: [
            'mock-interceptor',
            'config-drift-guardian',
            'receipt-chain-attacker',
            'gate-independence-verifier',
            'evidence-fabrication-detector',
            'process-mining-skeptic',
            'theater-detector',
            'authority-escalation-watcher',
          ],
          description: 'Agent to execute',
        },
        artifact_id: {
          type: 'string',
          description: 'Artifact ID to validate',
        },
        input_file: {
          type: 'string',
          description: 'Path to event log (XES, OCEL, CSV)',
        },
        dry_run: {
          type: 'boolean',
          description: 'Detect violations without applying corrections',
          default: false,
        },
        traces: {
          type: 'array',
          description: 'OTel trace data (optional, auto-fetched if omitted)',
          items: { type: 'object' },
        },
        ocel_events: {
          type: 'array',
          description: 'OCEL event data (optional)',
          items: { type: 'object' },
        },
        receipts: {
          type: 'array',
          description: 'BLAKE3 receipt chain data (optional)',
          items: { type: 'object' },
        },
      },
      required: ['agent'],
    },
  },
  {
    name: 'agent_list',
    description: 'List all registered Van der Aalst agents with their status and capabilities',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          enum: ['continuous', 'on_demand'],
          description: 'Filter by execution mode',
        },
      },
    },
  },
  {
    name: 'agent_audit',
    description: 'View the autonomous correction audit trail',
    inputSchema: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          description: 'Filter by agent name',
        },
        limit: {
          type: 'number',
          description: 'Number of recent entries (default: 10)',
          default: 10,
        },
        since: {
          type: 'string',
          description: 'Start timestamp (ISO string)',
        },
      },
    },
  },
  {
    name: 'agent_status',
    description: 'Check health and runtime statistics for an agent or the full registry',
    inputSchema: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          description: 'Specific agent name (omit for full registry summary)',
        },
      },
    },
  },
  {
    name: 'agent_mapek_cycle',
    description:
      'Run a full MAPE-K autonomic cycle (Monitor → Analyze → Plan → Execute → Learn) for an artifact',
    inputSchema: {
      type: 'object',
      properties: {
        artifact_id: {
          type: 'string',
          description: 'Artifact ID to validate',
        },
        input_file: {
          type: 'string',
          description: 'Path to event log (XES, OCEL, CSV)',
        },
        dry_run: {
          type: 'boolean',
          description: 'Detect violations without applying corrections',
          default: false,
        },
        gate_name: {
          type: 'string',
          description: 'Specific proof gate being evaluated (triggers on-demand agents)',
        },
      },
      required: ['artifact_id'],
    },
  },
  {
    name: 'agent_multi_surface_corroboration',
    description:
      'Validate evidence alignment across 4 surfaces (execution, telemetry, state, process)',
    inputSchema: {
      type: 'object',
      properties: {
        artifact_id: {
          type: 'string',
          description: 'Artifact ID to validate',
        },
        traces: {
          type: 'array',
          description: 'OTel trace data',
          items: { type: 'object' },
        },
        ocel_events: {
          type: 'array',
          description: 'OCEL event data',
          items: { type: 'object' },
        },
        receipts: {
          type: 'array',
          description: 'Receipt chain data',
          items: { type: 'object' },
        },
      },
      required: ['artifact_id'],
    },
  },
];
