import type { OutputOptions } from '../output.js';
export interface AutoProcessOptions extends OutputOptions {
  'activity-key'?: string;
  config?: string;
}
export declare const autoprocess: import('citty').CommandDef<{
  input: {
    type: 'positional';
    description: string;
    required: true;
  };
  'activity-key': {
    type: 'string';
    description: string;
    default: string;
    alias: string;
  };
  config: {
    type: 'string';
    description: string;
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
//# sourceMappingURL=autoprocess.d.ts.map
