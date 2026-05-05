import type { OutputOptions } from '../output.js';
export interface SimulateOptions extends OutputOptions {
  input?: string;
  cases?: number;
  time?: number;
  seed?: number;
  activityKey?: string;
}
export declare const simulate: import('citty').CommandDef<{
  input: {
    type: 'positional';
    description: string;
    required: false;
  };
  file: {
    type: 'string';
    description: string;
    alias: string;
  };
  cases: {
    type: 'string';
    description: string;
    default: string;
  };
  time: {
    type: 'string';
    description: string;
    default: string;
  };
  seed: {
    type: 'string';
    description: string;
  };
  'activity-key': {
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
//# sourceMappingURL=simulate.d.ts.map
