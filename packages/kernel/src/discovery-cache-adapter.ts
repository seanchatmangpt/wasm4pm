/**
 * discovery-cache-adapter.ts
 *
 * Optional adapter docs for integrating @wasm4pm/observability discovery cache.
 * The DiscoveryCache is consumed directly by @wasm4pm/observability package,
 * not by kernel (to avoid circular dependency).
 *
 * See: @wasm4pm/observability/src/discovery-cache.ts for cache implementation
 * See: apps/wasm4pm/src/commands/cache.ts for CLI integration
 */

/**
 * Placeholder for future kernel-aware caching.
 * Currently, caching is managed at the CLI/observability layer, not kernel layer.
 */
export const CACHE_ADAPTER_INFO = {
  description:
    'Discovery caching is managed by @wasm4pm/observability.DiscoveryCache, not by kernel',
  defaultTtlMs: 24 * 60 * 60 * 1000,
  defaultMaxEntries: 1000,
  usage: 'Use getDiscoveryCache() from @wasm4pm/observability to cache results',
};
