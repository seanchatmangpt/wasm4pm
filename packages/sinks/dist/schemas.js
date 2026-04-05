/**
 * JSON Schema definitions for sink configurations
 *
 * Used for validation of user-supplied sink config in wasm4pm.toml or CLI args.
 */
/**
 * JSON Schema for FileLogSinkConfig
 */
export const FileLogSinkConfigSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'FileLogSinkConfig',
    description: 'Configuration for the file log sink adapter',
    type: 'object',
    properties: {
        directory: {
            type: 'string',
            description: 'Directory where artifacts will be written',
        },
        onExists: {
            type: 'string',
            enum: ['skip', 'overwrite', 'append', 'error'],
            default: 'skip',
            description: 'Behavior when an artifact file already exists',
        },
        failureMode: {
            type: 'string',
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
    type: 'object',
    properties: {
        pretty: {
            type: 'boolean',
            default: true,
            description: 'Whether to pretty-print JSON output',
        },
        separator: {
            type: 'string',
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
    type: 'object',
    properties: {
        url: {
            type: 'string',
            format: 'uri',
            description: 'URL to POST/PUT artifacts to',
        },
        method: {
            type: 'string',
            enum: ['POST', 'PUT'],
            default: 'POST',
            description: 'HTTP method to use',
        },
        headers: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Additional HTTP headers',
        },
        timeoutMs: {
            type: 'number',
            minimum: 0,
            default: 30000,
            description: 'Request timeout in milliseconds',
        },
        auth: {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    enum: ['none', 'bearer', 'basic'],
                    description: 'Authentication type',
                },
                token: {
                    type: 'string',
                    description: 'Bearer token (when type is "bearer")',
                },
                username: {
                    type: 'string',
                    description: 'Username (when type is "basic")',
                },
                password: {
                    type: 'string',
                    description: 'Password (when type is "basic")',
                },
            },
            required: ['type'],
            additionalProperties: false,
        },
        onExists: {
            type: 'string',
            enum: ['skip', 'overwrite', 'append', 'error'],
            default: 'overwrite',
            description: 'Behavior on conflict (semantics depend on server)',
        },
        failureMode: {
            type: 'string',
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
            type: 'object',
            properties: {
                kind: { const: 'file' },
                config: { $ref: '#/$defs/FileLogSinkConfig' },
            },
            required: ['kind', 'config'],
        },
        {
            type: 'object',
            properties: {
                kind: { const: 'stdout' },
                config: { $ref: '#/$defs/StdoutSinkConfig' },
            },
            required: ['kind', 'config'],
        },
        {
            type: 'object',
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
//# sourceMappingURL=schemas.js.map