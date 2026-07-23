/**
 * Conformance engine barrel. See `readers/index.ts` (format detection +
 * dialect normalization — fixes defects #2 and #4), `replayers/*` (per
 * model-type WASM wrappers), and `verdict.ts` (fail-closed aggregation —
 * the other half of the defect #2 fix: `checked === 0` is never a pass).
 */
export * from './types.js';
export * from './verdict.js';
export * from './readers/index.js';
export * as petriReplayer from './replayers/petri.js';
export * as dfgReplayer from './replayers/dfg.js';
export * as powlReplayer from './replayers/powl.js';
export * as ocpnReplayer from './replayers/ocpn.js';
