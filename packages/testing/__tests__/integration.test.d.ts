/**
 * Comprehensive Three-Layer Integration Tests
 *
 * Validates the complete pictl architecture working together:
 * - Application Layer (Config + ExecutionPlan)
 * - Control Plane (EventLogIR + ModelIR)
 * - Execution Substrate (WASM kernel + backends)
 *
 * 8 test suites, 50+ test cases covering:
 * - EventLogIR round-trip serialization and deterministic hashing
 * - ModelIR bidirectional conversions (DFG, Petri Net, POWL)
 * - ProvenanceChain audit trail propagation
 * - FederationController backend selection rules
 * - End-to-end discovery pipelines
 * - Cross-layer contract validation
 *
 * Doctrine: If the code says it worked but the event log cannot prove
 * a lawful process happened, then it did not work.
 */
export {};
//# sourceMappingURL=integration.test.d.ts.map