import type { OutputOptions } from '../output.js';
export interface ValidateOptions extends OutputOptions {
  input?: string;
  activityKey?: string;
  'case-id-key'?: string;
  'timestamp-key'?: string;
  'resource-key'?: string;
}
export declare const validate: import('citty').CommandDef<{
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
  format: {
    type: 'string';
    description: string;
    default: string;
  };
  'activity-key': {
    type: 'string';
    description: string;
    default: string;
  };
  'case-id-key': {
    type: 'string';
    description: string;
    default: string;
  };
  'timestamp-key': {
    type: 'string';
    description: string;
    default: string;
  };
  'resource-key': {
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
//# sourceMappingURL=validate.d.ts.map
