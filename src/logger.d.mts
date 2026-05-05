/**
 * Logger utility for wasm4pm
 *
 * Provides structured logging with prefixes and optional JSON formatting.
 */
export function createLogger(name: any): {
    info: (msg: any, ctx: any) => void;
    warn: (msg: any, ctx: any) => void;
    error: (msg: any, ctx: any) => void;
    debug: (msg: any, ctx: any) => void;
};
//# sourceMappingURL=logger.d.mts.map