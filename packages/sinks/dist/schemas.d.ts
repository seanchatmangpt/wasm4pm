/**
 * JSON Schema definitions for sink configurations
 *
 * Used for validation of user-supplied sink config in wasm4pm.toml or CLI args.
 */
/**
 * JSON Schema for FileLogSinkConfig
 */
export declare const FileLogSinkConfigSchema: {
    $schema: string;
    title: string;
    description: string;
    type: "object";
    properties: {
        directory: {
            type: "string";
            description: string;
        };
        onExists: {
            type: "string";
            enum: string[];
            default: string;
            description: string;
        };
        failureMode: {
            type: "string";
            enum: string[];
            default: string;
            description: string;
        };
    };
    required: string[];
    additionalProperties: boolean;
};
/**
 * JSON Schema for StdoutSinkConfig
 */
export declare const StdoutSinkConfigSchema: {
    $schema: string;
    title: string;
    description: string;
    type: "object";
    properties: {
        pretty: {
            type: "boolean";
            default: boolean;
            description: string;
        };
        separator: {
            type: "string";
            default: string;
            description: string;
        };
    };
    additionalProperties: boolean;
};
/**
 * JSON Schema for HttpSinkConfig
 */
export declare const HttpSinkConfigSchema: {
    $schema: string;
    title: string;
    description: string;
    type: "object";
    properties: {
        url: {
            type: "string";
            format: string;
            description: string;
        };
        method: {
            type: "string";
            enum: string[];
            default: string;
            description: string;
        };
        headers: {
            type: "object";
            additionalProperties: {
                type: "string";
            };
            description: string;
        };
        timeoutMs: {
            type: "number";
            minimum: number;
            default: number;
            description: string;
        };
        auth: {
            type: "object";
            properties: {
                type: {
                    type: "string";
                    enum: string[];
                    description: string;
                };
                token: {
                    type: "string";
                    description: string;
                };
                username: {
                    type: "string";
                    description: string;
                };
                password: {
                    type: "string";
                    description: string;
                };
            };
            required: string[];
            additionalProperties: boolean;
        };
        onExists: {
            type: "string";
            enum: string[];
            default: string;
            description: string;
        };
        failureMode: {
            type: "string";
            enum: string[];
            default: string;
            description: string;
        };
    };
    required: string[];
    additionalProperties: boolean;
};
/**
 * Combined schema for all sink adapter configurations
 */
export declare const SinkConfigSchema: {
    $schema: string;
    title: string;
    description: string;
    oneOf: {
        type: "object";
        properties: {
            kind: {
                const: string;
            };
            config: {
                $ref: string;
            };
        };
        required: string[];
    }[];
    $defs: {
        FileLogSinkConfig: {
            $schema: string;
            title: string;
            description: string;
            type: "object";
            properties: {
                directory: {
                    type: "string";
                    description: string;
                };
                onExists: {
                    type: "string";
                    enum: string[];
                    default: string;
                    description: string;
                };
                failureMode: {
                    type: "string";
                    enum: string[];
                    default: string;
                    description: string;
                };
            };
            required: string[];
            additionalProperties: boolean;
        };
        StdoutSinkConfig: {
            $schema: string;
            title: string;
            description: string;
            type: "object";
            properties: {
                pretty: {
                    type: "boolean";
                    default: boolean;
                    description: string;
                };
                separator: {
                    type: "string";
                    default: string;
                    description: string;
                };
            };
            additionalProperties: boolean;
        };
        HttpSinkConfig: {
            $schema: string;
            title: string;
            description: string;
            type: "object";
            properties: {
                url: {
                    type: "string";
                    format: string;
                    description: string;
                };
                method: {
                    type: "string";
                    enum: string[];
                    default: string;
                    description: string;
                };
                headers: {
                    type: "object";
                    additionalProperties: {
                        type: "string";
                    };
                    description: string;
                };
                timeoutMs: {
                    type: "number";
                    minimum: number;
                    default: number;
                    description: string;
                };
                auth: {
                    type: "object";
                    properties: {
                        type: {
                            type: "string";
                            enum: string[];
                            description: string;
                        };
                        token: {
                            type: "string";
                            description: string;
                        };
                        username: {
                            type: "string";
                            description: string;
                        };
                        password: {
                            type: "string";
                            description: string;
                        };
                    };
                    required: string[];
                    additionalProperties: boolean;
                };
                onExists: {
                    type: "string";
                    enum: string[];
                    default: string;
                    description: string;
                };
                failureMode: {
                    type: "string";
                    enum: string[];
                    default: string;
                    description: string;
                };
            };
            required: string[];
            additionalProperties: boolean;
        };
    };
};
//# sourceMappingURL=schemas.d.ts.map