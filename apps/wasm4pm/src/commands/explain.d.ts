import type { OutputOptions } from '../output.js';
export interface ExplainOptions extends OutputOptions {
  config?: string;
  model?: string;
  algorithm?: string;
  level?: 'brief' | 'detailed' | 'academic';
}
export declare const explain: import('citty').CommandDef<{
  config: {
    type: 'string';
    description: string;
  };
  model: {
    type: 'string';
    description: string;
    alias: string;
  };
  algorithm: {
    type: 'string';
    description: string;
    alias: string;
  };
  level: {
    type: 'string';
    description: string;
    default: string;
  };
  format: {
    type: 'string';
    description: string;
    default: string;
  };
  verbose: {
    type: 'boolean';
    description: string;
    alias: string;
  };
  quiet: {
    type: 'boolean';
    description: string;
    alias: string;
  };
}>;
//# sourceMappingURL=explain.d.ts.map
