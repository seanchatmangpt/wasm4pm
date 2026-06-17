/**
 * validation-config.ts
 *
 * Module-level flag that controls whether Zod boundary validation runs.
 * Evaluated once at import time so V8 can dead-code-eliminate the guarded
 * blocks when validation is off.
 *
 * Opt out: WASM4PM_SKIP_ZOD=1  (or "true" / "yes")
 *
 * Default: ON — every external WASM boundary is validated.
 * Hot-path callers guard with:
 *   if (ZOD_VALIDATION_ENABLED) validateWasmPayload(id, result);
 */
const raw = process.env['WASM4PM_SKIP_ZOD'] ?? '';
export const ZOD_VALIDATION_ENABLED = raw !== '1' && raw !== 'true' && raw !== 'yes';
