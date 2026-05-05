export declare const ml: import('citty').CommandDef<{
  task: {
    type: 'positional';
    description: string;
    required: true;
  };
  input: {
    type: 'string';
    description: string;
    required: true;
    alias: string;
  };
  'activity-key': {
    type: 'string';
    description: string;
  };
  method: {
    type: 'string';
    description: string;
  };
  k: {
    type: 'string';
    description: string;
  };
  'target-key': {
    type: 'string';
    description: string;
  };
  'forecast-periods': {
    type: 'string';
    description: string;
  };
  'n-components': {
    type: 'string';
    description: string;
  };
  eps: {
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
    alias: string;
  };
  quiet: {
    type: 'boolean';
    alias: string;
  };
  'no-save': {
    type: 'boolean';
  };
}>;
//# sourceMappingURL=ml.d.ts.map
