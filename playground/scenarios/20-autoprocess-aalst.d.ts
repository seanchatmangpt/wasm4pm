/**
 * Scenario 20 (Aalst): AutoProcess Validation via Process Mining
 *
 * JTBD: "I want to verify my autonomic control loop actually works as designed."
 *
 * Doctrine: If the code says it worked but the event log cannot prove a lawful process
 * happened, then it did not work. (van der Aalst)
 *
 * Methodology:
 * 1. Run autoprocess command
 * 2. Verify exit code indicates success (0) or expected failure (1-3)
 * 3. Validate output structure contains declared phases
 * 4. Verify no panics/corruption in stderr
 * 5. Real-scale test: BPI 2020 processes without timeout/panic
 *
 * Test evidence is measurable output + exit codes, not internal assertions.
 */
export {};
//# sourceMappingURL=20-autoprocess-aalst.d.ts.map