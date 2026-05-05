import type { OutputOptions } from '../output.js';
export interface TemporalOptions extends OutputOptions {
  input?: string;
  threshold?: number;
  activityKey?: string;
  timestampKey?: string;
}
export declare const temporal: import('citty').CommandDef<{
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
  threshold: {
    type: 'string';
    description: string;
    default: string;
  };
  'activity-key': {
    type: 'string';
    description: string;
    default: string;
  };
  'timestamp-key': {
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
//# sourceMappingURL=temporal.d.ts.map
