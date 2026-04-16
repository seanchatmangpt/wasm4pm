/**
 * Create a quiet observability layer that suppresses all CLI logs.
 * Used in JSON mode to prevent observability logs from corrupting JSON output.
 */
export function createQuietObservabilityLayer() {
    return {
        emitCli: () => {
            // suppress
        },
        enableJson: () => { },
        enableOtel: () => { },
        emitJson: () => { },
        emitOtel: () => { },
    };
}
//# sourceMappingURL=observability-util.js.map