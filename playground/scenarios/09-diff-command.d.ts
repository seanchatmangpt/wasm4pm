/**
 * Scenario: diff command — wasm4pm diff log1.xes log2.xes
 *
 * Dev action simulated: "I refactored the Jaccard computation or changed how
 * computeDiff normalises variant keys. Does same-file diff still produce 1.0?
 * Do missing files exit 2? Does --format json round-trip the diff field?"
 *
 * Key contracts verified:
 *   - Missing log1 or log2 → exit 2 (source_error)
 *   - --format json on error → { status: 'error', message: string }
 *   - Same file vs itself → Jaccard 1.0, zero added/removed activities/edges
 *   - Different files → Jaccard < 1.0 when processes differ structurally
 *   - Human output contains the "Structural similarity" banner
 *
 * Binary: apps/wasm4pm/dist/bin/wasm4pm.js (must be built first)
 */
export {};
//# sourceMappingURL=09-diff-command.d.ts.map