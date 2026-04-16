/**
 * Scenario: predict command — pictl predict <task> -i <log.xes>
 *
 * Dev action simulated: "I added a new WASM dispatch for remaining-time or
 * changed how tasks are validated. Does each task name still route correctly?
 * Does an unknown task exit 2 (source_error), not 1 or 3? Does JSON output
 * carry the right shape for each task?"
 *
 * Key contracts verified:
 *   - Unknown task name → exit 2 (source_error), not 1 (config) or 3 (execution)
 *   - Unknown task validation runs before file-access check (line 93 vs 119 in predict.ts)
 *   - Missing -i with valid task → exit 2 (source_error)
 *   - All 6 valid task slugs from VALID_PREDICT_CLI_TASKS exit 0 or 3 (never 1 or 2)
 *   - VALID_PREDICT_CLI_TASKS has exactly 6 entries, all hyphen-form (no underscores)
 *   - remaining-time without --prefix → returns message, not prediction (model-only mode)
 *
 * Binary: apps/pictl/dist/bin/pictl.js (must be built first)
 */
export {};
//# sourceMappingURL=10-predict-command.d.ts.map