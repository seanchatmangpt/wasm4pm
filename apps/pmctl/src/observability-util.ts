/**
 * Create a quiet observability layer that suppresses all CLI logs.
 * Used in JSON mode to prevent observability logs from corrupting JSON output.
 */
export function createQuietObservabilityLayer(): any {
  return {
    emitCli: () => {
      // suppress
    },
    enableJson: () => {},
    enableOtel: () => {},
    emitJson: () => {},
    emitOtel: () => {},
  };
}
