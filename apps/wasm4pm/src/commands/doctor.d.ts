import type { OutputOptions } from '../output.js';
export interface DoctorOptions extends OutputOptions {
  fix?: boolean;
}
export declare const doctor: import('citty').CommandDef<{
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
//# sourceMappingURL=doctor.d.ts.map
