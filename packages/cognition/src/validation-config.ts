/**
 * validation-config.ts
 * Same env var as kernel: WASM4PM_SKIP_ZOD=1 disables Zod guards at WASM boundaries.
 */
const raw = process.env['WASM4PM_SKIP_ZOD'] ?? '';
export const ZOD_VALIDATION_ENABLED = raw !== '1' && raw !== 'true' && raw !== 'yes';
