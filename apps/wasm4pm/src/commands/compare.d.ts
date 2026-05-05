export declare const compare: import('citty').CommandDef<{
  algorithms: {
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
  'cache-stats': {
    type: 'boolean';
    description: string;
  };
}>;
//# sourceMappingURL=compare.d.ts.map
