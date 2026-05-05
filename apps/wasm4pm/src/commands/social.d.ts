import type { OutputOptions } from '../output.js';
export interface SocialOptions extends OutputOptions {
  input?: string;
  metric?: 'handover' | 'working-together' | 'similar-task';
  resourceKey?: string;
  activityKey?: string;
}
export declare const social: import('citty').CommandDef<{
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
  metric: {
    type: 'string';
    description: string;
    default: string;
  };
  'resource-key': {
    type: 'string';
    description: string;
    default: string;
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
//# sourceMappingURL=social.d.ts.map
