/**
 * Logger utility for pictl
 *
 * Provides structured logging with prefixes and optional JSON formatting.
 */

export function createLogger(name) {
  const prefix = `[${name}]`;
  const timestamp = () => new Date().toISOString();

  return {
    info: (msg, ctx) => {
      const logMsg = ctx ? `${prefix} ${timestamp()} INFO: ${msg}` : `${prefix} ${timestamp()} INFO: ${msg}`;
      console.log(logMsg);
      if (ctx) console.log(JSON.stringify(ctx, null, 2));
    },

    warn: (msg, ctx) => {
      const logMsg = ctx ? `${prefix} ${timestamp()} WARN: ${msg}` : `${prefix} ${timestamp()} WARN: ${msg}`;
      console.warn(logMsg);
      if (ctx) console.warn(JSON.stringify(ctx, null, 2));
    },

    error: (msg, ctx) => {
      const logMsg = ctx ? `${prefix} ${timestamp()} ERROR: ${msg}` : `${prefix} ${timestamp()} ERROR: ${msg}`;
      console.error(logMsg);
      if (ctx) console.error(JSON.stringify(ctx, null, 2));
    },

    debug: (msg, ctx) => {
      if (process.env.DEBUG) {
        const logMsg = ctx ? `${prefix} ${timestamp()} DEBUG: ${msg}` : `${prefix} ${timestamp()} DEBUG: ${msg}`;
        console.log(logMsg);
        if (ctx) console.log(JSON.stringify(ctx, null, 2));
      }
    },
  };
}
