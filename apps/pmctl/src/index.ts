/**
 * pmctl - High-performance process mining CLI
 */

export { main } from './cli.js';
export { run, watch, status, explain, init } from './cli.js';

export { getFormatter, HumanFormatter, JSONFormatter, StreamingOutput } from './output.js';
export type { OutputOptions } from './output.js';

export { EXIT_CODES } from './exit-codes.js';
export type { ExitCode } from './exit-codes.js';

export {
  PmctlError,
  ConfigError,
  SourceError,
  ExecutionError,
  PartialFailureError,
  SystemError,
  handleError,
} from './errors.js';

export { resolveConfigPath, readConfigFile } from './config/resolver.js';
export type { ResolvedConfigPath } from './config/resolver.js';

// Export command types for external use
export type { RunOptions } from './commands/run.js';
export type { WatchOptions } from './commands/watch.js';
export type { StatusOptions } from './commands/status.js';
export type { ExplainOptions } from './commands/explain.js';
