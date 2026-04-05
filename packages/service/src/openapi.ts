/**
 * openapi.ts
 * OpenAPI/Swagger schema generation for the service
 */

export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{
    url: string;
    description: string;
  }>;
  paths: Record<string, Record<string, unknown>>;
  components: {
    schemas: Record<string, unknown>;
  };
}

/**
 * Generates OpenAPI 3.0.0 specification for the service
 */
export function generateOpenAPISpec(baseUrl: string): OpenAPISpec {
  return {
    openapi: '3.0.0',
    info: {
      title: 'wasm4pm Service API',
      version: '26.4.5',
      description: 'HTTP service API for wasm4pm process mining engine',
    },
    servers: [
      {
        url: baseUrl,
        description: 'Service endpoint',
      },
    ],
    paths: {
      '/status': {
        get: {
          operationId: 'getStatus',
          summary: 'Get server and system status',
          description: 'Returns health status, uptime, current run info, and queue stats',
          tags: ['Status'],
          responses: {
            '200': {
              description: 'Status information',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/StatusResponse',
                  },
                },
              },
            },
          },
        },
      },
      '/run': {
        post: {
          operationId: 'submitRun',
          summary: 'Submit a new process mining run',
          description:
            'Queues a process mining execution. Returns immediately with run_id. Only one run executes at a time; additional runs are queued (max 10).',
          tags: ['Execution'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/RunRequest',
                },
              },
            },
          },
          responses: {
            '202': {
              description: 'Run queued or started',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/RunResponse',
                  },
                },
              },
            },
            '400': {
              description: 'Invalid request',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
            '503': {
              description: 'Service at capacity (queue full)',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
          },
        },
      },
      '/run/{run_id}': {
        get: {
          operationId: 'getRunStatus',
          summary: 'Get status and receipt for a specific run',
          description: 'Returns execution status, progress, and receipt when complete',
          tags: ['Execution'],
          parameters: [
            {
              name: 'run_id',
              in: 'path',
              required: true,
              schema: {
                type: 'string',
                pattern: '^run_[a-zA-Z0-9_-]+$',
              },
              description: 'Run ID returned from /run endpoint',
            },
          ],
          responses: {
            '200': {
              description: 'Run status and metadata',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/RunStatusResponse',
                  },
                },
              },
            },
            '404': {
              description: 'Run not found',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
          },
        },
        delete: {
          operationId: 'cancelRun',
          summary: 'Cancel a queued or running execution',
          description: 'Cancels execution if still queued. Returns error if already running.',
          tags: ['Execution'],
          parameters: [
            {
              name: 'run_id',
              in: 'path',
              required: true,
              schema: {
                type: 'string',
              },
            },
          ],
          responses: {
            '200': {
              description: 'Run cancelled',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      run_id: { type: 'string' },
                      status: { type: 'string', enum: ['cancelled'] },
                      timestamp: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
            '404': {
              description: 'Run not found',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
            '409': {
              description: 'Cannot cancel - run already in progress',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
          },
        },
      },
      '/watch/{run_id}': {
        get: {
          operationId: 'watchRun',
          summary: 'Watch execution progress via WebSocket',
          description:
            'Upgrades to WebSocket connection and streams execution events as JSONL (newline-delimited JSON)',
          tags: ['Streaming'],
          parameters: [
            {
              name: 'run_id',
              in: 'path',
              required: true,
              schema: {
                type: 'string',
              },
            },
          ],
          responses: {
            '101': {
              description: 'WebSocket upgrade',
            },
            '404': {
              description: 'Run not found',
            },
          },
        },
      },
      '/explain': {
        post: {
          operationId: 'explain',
          summary: 'Generate explanation without executing',
          description: 'Analyzes configuration and generates explanation. Does not execute any runs.',
          tags: ['Analysis'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ExplainRequest',
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Explanation generated',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ExplainResponse',
                  },
                },
              },
            },
            '400': {
              description: 'Invalid configuration',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
          },
        },
      },
      '/api/docs': {
        get: {
          operationId: 'getDocs',
          summary: 'Get API documentation (this schema)',
          description: 'Returns OpenAPI 3.0.0 specification in JSON format',
          tags: ['Documentation'],
          responses: {
            '200': {
              description: 'OpenAPI specification',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        RunRequest: {
          type: 'object',
          required: ['config'],
          properties: {
            config: {
              type: 'string',
              description: 'Process mining configuration as TOML string',
              example: '[section]\nkey = "value"',
            },
            input_file: {
              type: 'string',
              description: 'Optional path to input event log file',
              example: '/path/to/log.xes',
            },
            profile: {
              type: 'string',
              description: 'Optional execution profile (e.g. "production", "debug")',
              example: 'production',
            },
          },
        },
        RunResponse: {
          type: 'object',
          required: ['run_id', 'status', 'started_at'],
          properties: {
            run_id: {
              type: 'string',
              description: 'Unique run identifier',
              example: 'run_2026-04-04T12-34-56-789Z_abc1',
            },
            status: {
              type: 'string',
              enum: ['queued', 'running'],
              description: 'Current execution status',
            },
            started_at: {
              type: 'string',
              format: 'date-time',
              description: 'When the run started or was queued',
            },
          },
        },
        RunStatusResponse: {
          type: 'object',
          required: ['run_id', 'status', 'progress', 'started_at'],
          properties: {
            run_id: {
              type: 'string',
              description: 'Run identifier',
            },
            status: {
              type: 'string',
              enum: ['queued', 'running', 'completed', 'failed', 'cancelled'],
              description: 'Current execution status',
            },
            progress: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              description: 'Execution progress percentage',
            },
            started_at: {
              type: 'string',
              format: 'date-time',
              description: 'When the run started',
            },
            finished_at: {
              type: 'string',
              format: 'date-time',
              description: 'When the run finished (only if completed/failed)',
            },
            duration_ms: {
              type: 'number',
              description: 'Total execution duration in milliseconds',
            },
            receipt: {
              type: 'object',
              description: 'Execution receipt with results (only if completed)',
            },
            error: {
              type: 'object',
              description: 'Error information if run failed',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                timestamp: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
        StatusResponse: {
          type: 'object',
          required: ['server', 'uptime_ms', 'queued', 'completed', 'failed', 'timestamp'],
          properties: {
            server: {
              type: 'string',
              enum: ['healthy', 'degraded'],
              description: 'Server health status',
            },
            uptime_ms: {
              type: 'number',
              description: 'Server uptime in milliseconds',
            },
            current_run: {
              type: 'object',
              description: 'Current running execution (if any)',
              properties: {
                run_id: { type: 'string' },
                status: { type: 'string' },
                progress: { type: 'number' },
                elapsed_ms: { type: 'number' },
              },
            },
            queued: {
              type: 'number',
              description: 'Number of queued runs',
            },
            completed: {
              type: 'number',
              description: 'Number of completed runs in this session',
            },
            failed: {
              type: 'number',
              description: 'Number of failed runs in this session',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'When this status was generated',
            },
          },
        },
        ExplainRequest: {
          type: 'object',
          required: ['config'],
          properties: {
            config: {
              type: 'string',
              description: 'Process mining configuration as TOML string',
            },
            mode: {
              type: 'string',
              enum: ['brief', 'full'],
              default: 'brief',
              description: 'Level of detail in explanation',
            },
          },
        },
        ExplainResponse: {
          type: 'object',
          required: ['explanation', 'mode', 'config', 'timestamp'],
          properties: {
            explanation: {
              type: 'string',
              description: 'Generated explanation of the configuration',
            },
            mode: {
              type: 'string',
              enum: ['brief', 'full'],
              description: 'Explanation detail level',
            },
            config: {
              type: 'string',
              description: 'The configuration that was explained',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'When explanation was generated',
            },
          },
        },
        ErrorResponse: {
          type: 'object',
          required: ['error', 'code', 'timestamp'],
          properties: {
            error: {
              type: 'string',
              description: 'Human-readable error message',
            },
            code: {
              type: 'string',
              description: 'Machine-readable error code',
            },
            details: {
              type: 'object',
              description: 'Additional error details (validation errors, etc)',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'When error occurred',
            },
          },
        },
      },
    },
  };
}
