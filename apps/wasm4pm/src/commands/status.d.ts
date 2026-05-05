import type { OutputOptions } from '../output.js';
export interface StatusOptions extends OutputOptions {
  verbose?: boolean;
}
export declare const status: import('citty').CommandDef<{
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
//# sourceMappingURL=status.d.ts.map
