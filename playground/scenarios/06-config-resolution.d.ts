/**
 * Scenario: Config resolution — layer priority and provenance
 *
 * Dev action simulated: "I changed the config resolver. Does the precedence
 * still work? Does provenance correctly report where each field came from?"
 *
 * Resolution order (highest priority first):
 *   CLI overrides → TOML file → JSON file → ENV vars → defaults
 *
 * COMMON MISCONCEPTION: ENV vars do NOT beat file config. They only beat
 * defaults. A TOML file with profile="balanced" overrides WASM4PM_PROFILE=stream.
 */
export {};
//# sourceMappingURL=06-config-resolution.d.ts.map