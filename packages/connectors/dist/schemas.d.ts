/**
 * JSON Schema definitions for connector configurations
 *
 * Used for validation of user-supplied connector config in wasm4pm.toml or CLI args.
 */
/**
 * JSON Schema for FileSourceConfig
 */
export declare const FileSourceConfigSchema: {
    $schema: string;
    title: string;
    description: string;
    type: "object";
    properties: {
        filePath: {
            type: "string";
            description: string;
        };
        format: {
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
 * JSON Schema for HttpSourceConfig
 */
export declare const HttpSourceConfigSchema: {
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
        body: {
            type: "string";
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
    };
    required: string[];
    additionalProperties: boolean;
};
/**
 * JSON Schema for StreamSourceConfig
 */
export declare const StreamSourceConfigSchema: {
    $schema: string;
    title: string;
    description: string;
    type: "object";
    properties: {
        label: {
            type: "string";
            description: string;
        };
    };
    additionalProperties: boolean;
};
/**
 * Combined schema for all source adapter configurations
 */
export declare const SourceConfigSchema: {
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
        FileSourceConfig: {
            $schema: string;
            title: string;
            description: string;
            type: "object";
            properties: {
                filePath: {
                    type: "string";
                    description: string;
                };
                format: {
                    type: "string";
                    enum: string[];
                    default: string;
                    description: string;
                };
            };
            required: string[];
            additionalProperties: boolean;
        };
        HttpSourceConfig: {
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
                body: {
                    type: "string";
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
            };
            required: string[];
            additionalProperties: boolean;
        };
        StreamSourceConfig: {
            $schema: string;
            title: string;
            description: string;
            type: "object";
            properties: {
                label: {
                    type: "string";
                    description: string;
                };
            };
            additionalProperties: boolean;
        };
    };
};
//# sourceMappingURL=schemas.d.ts.map