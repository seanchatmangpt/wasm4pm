/**
 * Scenario: Conformance Command Alive
 *
 * JTBD: "Verify the conformance command is integrated and callable without crashing."
 *
 * Van der Aalst doctrine: A command that crashes or is missing from the CLI is not a usable
 * process mining tool. This scenario validates that `pictl conformance` exists, is callable,
 * and either returns valid results or fails gracefully with proper error handling.
 *
 * Test phases:
 * 1. Command exists and runs without hanging/crashing
 * 2. Command returns an exit code (0 = success, 3 = execution error, etc. — but not crashes)
 * 3. Output (success or error) is well-formed JSON
 */
export {};
//# sourceMappingURL=23-conformance-alive.d.ts.map