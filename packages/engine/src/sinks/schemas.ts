/**
 * JSON Schema definitions for sink configurations
 *
 * Used for validation of user-supplied sink config in pictl.toml or CLI args.
 */

/**
 * JSON Schema for FileLogSinkConfig
 */
export const FileLogSinkConfigSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'FileLogSinkConfig',
  description: 'Configuration for the file log sink adapter',
  type: 'object' as const,
  properties: {
    directory: {
      type: 'string' as const,
      description: 'Directory where artifacts will be written',
    },
    onExists: {
      type: 'string' as const,
      enum: ['skip', 'overwrite', 'append', 'error'],
      default: 'skip',
      description: 'Behavior when an artifact file already exists',
    },
    failureMode: {
      type: 'string' as const,
      enum: ['fail', 'degrade', 'ignore'],
      default: 'fail',
      description: 'How to handle write failures',
    },
  },
  required: ['directory'],
  additionalProperties: false,
};

/**
 * JSON Schema for StdoutSinkConfig
 */
export const StdoutSinkConfigSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'StdoutSinkConfig',
  description: 'Configuration for the stdout sink adapter',
  type: 'object' as const,
  properties: {
    pretty: {
      type: 'boolean' as const,
      default: true,
      description: 'Whether to pretty-print JSON output',
    },
    separator: {
      type: 'string' as const,
      default: '\n',
      description: 'String inserted between artifacts in output',
    },
  },
  additionalProperties: false,
};

/**
 * JSON Schema for HttpSinkConfig
 */
export const HttpSinkConfigSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'HttpSinkConfig',
  description: 'Configuration for the HTTP sink adapter',
  type: 'object' as const,
  properties: {
    url: {
      type: 'string' as const,
      format: 'uri',
      description: 'URL to POST/PUT artifacts to',
    },
    method: {
      type: 'string' as const,
      enum: ['POST', 'PUT'],
      default: 'POST',
      description: 'HTTP method to use',
    },
    headers: {
      type: 'object' as const,
      additionalProperties: { type: 'string' as const },
      description: 'Additional HTTP headers',
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
          enum: ['none', 'bearer', 'basic'],
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
    onExists: {
      type: 'string' as const,
      enum: ['skip', 'overwrite', 'append', 'error'],
      default: 'overwrite',
      description: 'Behavior on conflict (semantics depend on server)',
    },
    failureMode: {
      type: 'string' as const,
      enum: ['fail', 'degrade', 'ignore'],
      default: 'fail',
      description: 'How to handle write failures',
    },
  },
  required: ['url'],
  additionalProperties: false,
};

/**
 * Combined schema for all sink adapter configurations
 */
export const SinkConfigSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'SinkConfig',
  description: 'Sink adapter configuration — discriminated by kind',
  oneOf: [
    {
      type: 'object' as const,
      properties: {
        kind: { const: 'file' },
        config: { $ref: '#/$defs/FileLogSinkConfig' },
      },
      required: ['kind', 'config'],
    },
    {
      type: 'object' as const,
      properties: {
        kind: { const: 'stdout' },
        config: { $ref: '#/$defs/StdoutSinkConfig' },
      },
      required: ['kind', 'config'],
    },
    {
      type: 'object' as const,
      properties: {
        kind: { const: 'http' },
        config: { $ref: '#/$defs/HttpSinkConfig' },
      },
      required: ['kind', 'config'],
    },
  ],
  $defs: {
    FileLogSinkConfig: FileLogSinkConfigSchema,
    StdoutSinkConfig: StdoutSinkConfigSchema,
    HttpSinkConfig: HttpSinkConfigSchema,
  },
};
