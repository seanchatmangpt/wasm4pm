/**
 * wasm4pm/introspection
 *
 * Comprehensive introspection APIs for ML, prediction, and RL systems.
 *
 * Modules:
 * - algorithms: ML algorithm discovery and metadata
 * - perspectives: Prediction perspective registry and documentation
 * - diagnostics: Error message generation with actionable suggestions
 * - datasets: Sample log loading for quick start
 * - validators: Zod schemas for ML/prediction inputs
 * - rl-agents: RL agent metadata and LinUCB debugging (when available)
 */

// General algorithm registry introspection
export {
  getAlgorithmMetadata,
  listAlgorithmsByProfile,
  validateAlgorithmInProfile,
  getProfileCapabilities,
} from './general.js';
export type { ValidationResult, ProfileCapabilities } from './general.js';

// WASM pre-flight check
export { validateWasmReadiness } from './preflight.js';
export type { WasmReadinessResult } from './preflight.js';

// ML algorithm discovery
export { getMlRegistry, _resetMlRegistry } from './algorithms.js';
export type { MlAlgorithmMetadata, AlgorithmParameter, MlAlgorithmId } from './algorithms.js';

// Prediction perspective discovery
export { getPerspectiveRegistry, _resetPerspectiveRegistry } from './perspectives.js';
export type { PerspectiveMetadata } from './perspectives.js';

// Diagnostics and error suggestions
export { DiagnosticsEngine, getDiagnostic, formatDiagnostic, diagnoseError } from './diagnostics.js';
export type { DiagnosticError } from './diagnostics.js';

// Sample datasets
export { loadPublicDataset, getAvailableDatasets, getAllDatasets } from './datasets.js';
export type { PublicDataset } from './datasets.js';

// Validators
export { getConfigValidators } from './validators.js';
export type { ValidatorResult } from './validators.js';

/**
 * Quick start: Get algorithm metadata
 *
 * @example
 * ```typescript
 * import { getMlRegistry } from 'wasm4pm/introspection';
 *
 * const registry = getMlRegistry();
 * const classify = registry.getAlgorithmMetadata('classify');
 * console.log(classify?.useCases);  // ["Outcome prediction", ...]
 * ```
 */

/**
 * Quick start: Discover prediction perspectives
 *
 * @example
 * ```typescript
 * import { getPerspectiveRegistry } from 'wasm4pm/introspection';
 *
 * const registry = getPerspectiveRegistry();
 * const perspectives = registry.getAllPerspectives();
 * perspectives.forEach(p => console.log(p.question));
 * ```
 */

/**
 * Quick start: Get actionable error suggestions
 *
 * @example
 * ```typescript
 * import { getDiagnostic, formatDiagnostic } from 'wasm4pm/introspection';
 *
 * const diagnostic = getDiagnostic('parameterOutOfBounds', {
 *   paramName: 'k',
 *   value: 1000,
 *   min: 2,
 *   max: 20,
 *   algorithmId: 'cluster'
 * });
 *
 * console.error(formatDiagnostic(diagnostic));
 * ```
 */

/**
 * Quick start: Load sample data
 *
 * @example
 * ```typescript
 * import { loadPublicDataset, getAvailableDatasets } from 'wasm4pm/introspection';
 *
 * console.log(getAvailableDatasets());  // ["simple", "bpi2020", "synthetic"]
 *
 * const { log, description } = await loadPublicDataset('simple');
 * console.log(log.traces.length);  // 10 traces for quick testing
 * ```
 */
