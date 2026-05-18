import type { ObservabilityLayer } from '@wasm4pm/observability';

/**
 * Create a quiet observability layer that suppresses all CLI logs.
 * Used in JSON mode to prevent observability logs from corrupting JSON output.
 */
export function createQuietObservabilityLayer(): ObservabilityLayer {
  return {
    emitCli: () => {
      // suppress
    },
    enableJson: () => {},
    enableOtel: () => {},
    emitJson: () => {},
    emitOtel: () => {},
  } as unknown as ObservabilityLayer;
}
