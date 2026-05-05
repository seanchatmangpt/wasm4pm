import type { OutputOptions } from '../output.js';
export interface ConformanceOptions extends OutputOptions {
  input?: string;
  model?: string;
  activityKey?: string;
  method?: 'token-replay' | 'alignment';
  threshold?: number;
}
export declare const conformance: import('citty').CommandDef<{
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
  model: {
    type: 'string';
    description: string;
    alias: string;
  };
  method: {
    type: 'string';
    description: string;
    default: string;
  };
  'activity-key': {
    type: 'string';
    description: string;
    default: string;
  };
  threshold: {
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
//# sourceMappingURL=conformance.d.ts.map
