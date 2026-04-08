/**
 * JSON Schema definitions for connector configurations
 *
 * Used for validation of user-supplied connector config in pictl.toml or CLI args.
 */

/**
 * JSON Schema for FileSourceConfig
 */
export const FileSourceConfigSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'FileSourceConfig',
  description: 'Configuration for the file source adapter',
  type: 'object' as const,
  properties: {
    filePath: {
      type: 'string' as const,
      description: 'Absolute or relative path to the event log file',
    },
    format: {
      type: 'string' as const,
      enum: ['xes', 'json', 'ocel', 'auto'],
      default: 'auto',
      description: 'File format. Use "auto" for automatic detection.',
    },
  },
  required: ['filePath'],
  additionalProperties: false,
};

/**
 * JSON Schema for HttpSourceConfig
 */
export const HttpSourceConfigSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'HttpSourceConfig',
  description: 'Configuration for the HTTP source adapter',
  type: 'object' as const,
  properties: {
    url: {
      type: 'string' as const,
      format: 'uri',
      description: 'URL of the HTTP endpoint serving event log data',
    },
    method: {
      type: 'string' as const,
      enum: ['GET', 'POST'],
      default: 'GET',
      description: 'HTTP method',
    },
    headers: {
      type: 'object' as const,
      additionalProperties: { type: 'string' as const },
      description: 'Additional HTTP headers to include in the request',
    },
    body: {
      type: 'string' as const,
      description: 'Request body (only used with POST)',
    },
    timeoutMs: {
      type: 'number' as const,
      minimum: 0,
      default: 30000,
      description: 'Request timeout in milliseconds',
    },
    auth: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string' as const,
          enum: ['none', 'basic', 'bearer'],
          description: 'Authentication type',
        },
        token: {
          type: 'string' as const,
          description: 'Bearer token (when type is "bearer")',
        },
        username: {
          type: 'string' as const,
          description: 'Username (when type is "basic")',
        },
        password: {
          type: 'string' as const,
          description: 'Password (when type is "basic")',
        },
      },
      required: ['type'],
      additionalProperties: false,
    },
  },
  required: ['url'],
  additionalProperties: false,
};

/**
 * JSON Schema for StreamSourceConfig
 */
export const StreamSourceConfigSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'StreamSourceConfig',
  description: 'Configuration for the stream (stdin) source adapter',
  type: 'object' as const,
  properties: {
    label: {
      type: 'string' as const,
      description: 'Label for fingerprinting when stream has no identity',
    },
  },
  additionalProperties: false,
};

/**
 * Combined schema for all source adapter configurations
 */
export const SourceConfigSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'SourceConfig',
  description: 'Source adapter configuration — discriminated by kind',
  oneOf: [
    {
      type: 'object' as const,
      properties: {
        kind: { const: 'file' },
        config: { $ref: '#/$defs/FileSourceConfig' },
      },
      required: ['kind', 'config'],
    },
    {
      type: 'object' as const,
      properties: {
        kind: { const: 'http' },
        config: { $ref: '#/$defs/HttpSourceConfig' },
      },
      required: ['kind', 'config'],
    },
    {
      type: 'object' as const,
      properties: {
        kind: { const: 'stream' },
        config: { $ref: '#/$defs/StreamSourceConfig' },
      },
      required: ['kind', 'config'],
    },
  ],
  $defs: {
    FileSourceConfig: FileSourceConfigSchema,
    HttpSourceConfig: HttpSourceConfigSchema,
    StreamSourceConfig: StreamSourceConfigSchema,
  },
};
