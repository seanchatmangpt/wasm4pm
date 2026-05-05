/**
 * JSON Schema definitions for connector configurations
 *
 * Used for validation of user-supplied connector config in wasm4pm.toml or CLI args.
 */
/**
 * JSON Schema for FileSourceConfig
 */
export const FileSourceConfigSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'FileSourceConfig',
    description: 'Configuration for the file source adapter',
    type: 'object',
    properties: {
        filePath: {
            type: 'string',
            description: 'Absolute or relative path to the event log file',
        },
        format: {
            type: 'string',
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
    type: 'object',
    properties: {
        url: {
            type: 'string',
            format: 'uri',
            description: 'URL of the HTTP endpoint serving event log data',
        },
        method: {
            type: 'string',
            enum: ['GET', 'POST'],
            default: 'GET',
            description: 'HTTP method',
        },
        headers: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Additional HTTP headers to include in the request',
        },
        body: {
            type: 'string',
            description: 'Request body (only used with POST)',
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
                    enum: ['none', 'basic', 'bearer'],
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
    type: 'object',
    properties: {
        label: {
            type: 'string',
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
            type: 'object',
            properties: {
                kind: { const: 'file' },
                config: { $ref: '#/$defs/FileSourceConfig' },
            },
            required: ['kind', 'config'],
        },
        {
            type: 'object',
            properties: {
                kind: { const: 'http' },
                config: { $ref: '#/$defs/HttpSourceConfig' },
            },
            required: ['kind', 'config'],
        },
        {
            type: 'object',
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
//# sourceMappingURL=schemas.js.map