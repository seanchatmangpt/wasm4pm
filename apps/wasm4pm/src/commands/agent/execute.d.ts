export interface AgentExecuteOptions {
  format?: 'human' | 'json';
  verbose?: boolean;
  quiet?: boolean;
}
export declare const execute: import('citty').CommandDef<{
  agent: {
    type: 'positional';
    description: string;
    required: true;
  };
  input: {
    type: 'string';
    alias: string;
    description: string;
  };
  'dry-run': {
    type: 'boolean';
    description: string;
  };
  format: {
    type: 'string';
    description: string;
    default: string;
  };
  verbose: {
    type: 'boolean';
    alias: string;
    description: string;
  };
  quiet: {
    type: 'boolean';
    alias: string;
    description: string;
  };
}>;
//# sourceMappingURL=execute.d.ts.map
