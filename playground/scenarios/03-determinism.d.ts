/**
 * Scenario: Determinism — same input → stable hash
 *
 * Dev action simulated: "I just added a new field to ExecutionPlan. Is it
 * stable (same value every run) or unstable (like a UUID or timestamp)?
 * If unstable, I need to add it to the UNSTABLE_FIELDS set in determinism.ts."
 *
 * checkDeterminism() runs the producer N times and compares stable hashes.
 * If a field's value changes between runs it shows up in result.unstableFields.
 */
export {};
//# sourceMappingURL=03-determinism.d.ts.map