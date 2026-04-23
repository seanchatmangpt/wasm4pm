/**
 * Scenario: Explain/run parity — PRD §11 invariant
 *
 * Dev action simulated: "I just added a step to getDefaultPipeline('fast') and
 * want to verify explain() still describes what plan() will actually do."
 *
 * A dev breaks this by:
 *   - Adding a step to getDefaultPipeline() without updating explain()
 *   - Removing a step from plan() but leaving a mention in explain()
 *   - Reordering steps inside getDefaultPipeline()
 *
 * When this fails, output tells you exactly which step(s) drifted and in which
 * direction so you know whether to fix plan() or explain().
 */
export {};
//# sourceMappingURL=02-parity.d.ts.map