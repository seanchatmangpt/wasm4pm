/**
 * Artifact Type Definitions
 *
 * Concrete TypeScript interfaces for each artifact type that sinks handle.
 * These provide typed alternatives to the `unknown` artifact parameter in SinkAdapter.write().
 */
/**
 * Type guard: check if artifact matches expected receipt shape
 */
export function isReceiptArtifact(artifact) {
    const a = artifact;
    return (typeof a === 'object' &&
        a !== null &&
        typeof a.run_id === 'string' &&
        typeof a.timestamp === 'string' &&
        typeof a.algorithm === 'string' &&
        typeof a.status === 'string');
}
/**
 * Type guard: check if artifact matches expected model shape
 */
export function isModelArtifact(artifact) {
    const a = artifact;
    return typeof a === 'object' && a !== null && typeof a.name === 'string';
}
/**
 * Type guard: check if artifact matches expected report shape
 */
export function isReportArtifact(artifact) {
    const a = artifact;
    return (typeof a === 'object' &&
        a !== null &&
        typeof a.name === 'string' &&
        typeof a.format === 'string' &&
        typeof a.content === 'string');
}
//# sourceMappingURL=artifacts.js.map