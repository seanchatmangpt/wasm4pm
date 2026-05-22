/**
 * feature-gates.ts
 * Feature flag validation system for deployment profiles
 *
 * Validates that a deployed WASM binary matches its claimed profile.
 * Each profile has a set of required and optional features that can be validated
 * by calling marker functions exported from the WASM module.
 */

import type { DeploymentProfile } from './registry.js';
import type { WasmModule } from './handlers.js';

/**
 * Validation result for a feature or profile
 */
export interface FeatureValidationResult {
  feature: string;
  available: boolean;
  error?: string;
}

/**
 * Deployment profile validation result
 */
export interface DeploymentProfileValidationResult {
  profile: DeploymentProfile;
  valid: boolean;
  features: FeatureValidationResult[];
  missingRequired: string[];
  unexpectedExtra: string[];
  confidence: number; // 0-1, 1 = perfect match
}

/**
 * Marker function names in WASM binary for each feature
 * These functions exist only in profiles that enable the feature
 */
const FEATURE_MARKERS: Record<string, string> = {
  genetic_discovery: '__test_genetic_discovery_available',
  ilp_discovery: '__test_ilp_discovery_available',
  ml_classify: '__test_ml_classify_available',
  ml_cluster: '__test_ml_cluster_available',
  ml_forecast: '__test_ml_forecast_available',
  ml_anomaly: '__test_ml_anomaly_available',
  ml_regress: '__test_ml_regress_available',
  ml_pca: '__test_ml_pca_available',
  ocel: '__test_ocel_available',
  powl: '__test_powl_available',
  streaming_simd: '__test_streaming_simd_available',
  streaming_basic: '__test_streaming_basic_available',
  conformance_alignments: '__test_conformance_alignments_available',
  gpu: '__test_gpu_available',
};

/**
 * Feature requirements per deployment profile
 * Format: { feature: { required: true/false } }
 */
const PROFILE_FEATURES: Record<DeploymentProfile, Record<string, { required: boolean }>> = {
  mobile: {
    genetic_discovery: { required: false },
    ilp_discovery: { required: false },
    ml_classify: { required: false },
    ml_cluster: { required: false },
    ml_forecast: { required: false },
    ml_anomaly: { required: false },
    ml_regress: { required: false },
    ml_pca: { required: false },
    ocel: { required: false },
    powl: { required: false },
    streaming_simd: { required: false },
    streaming_basic: { required: false },
    conformance_alignments: { required: false },
    gpu: { required: false },
  },
  iot: {
    genetic_discovery: { required: false },
    ilp_discovery: { required: false },
    ml_classify: { required: false },
    ml_cluster: { required: false },
    ml_forecast: { required: false },
    ml_anomaly: { required: false },
    ml_regress: { required: false },
    ml_pca: { required: false },
    ocel: { required: false },
    powl: { required: false },
    streaming_simd: { required: false },
    streaming_basic: { required: false },
    conformance_alignments: { required: false },
    gpu: { required: false },
  },
  edge: {
    genetic_discovery: { required: false },
    ilp_discovery: { required: false },
    ml_classify: { required: false },
    ml_cluster: { required: false },
    ml_forecast: { required: false },
    ml_anomaly: { required: false },
    ml_regress: { required: false },
    ml_pca: { required: false },
    ocel: { required: false },
    powl: { required: false },
    streaming_simd: { required: false },
    streaming_basic: { required: true },
    conformance_alignments: { required: false },
    gpu: { required: false },
  },
  fog: {
    genetic_discovery: { required: true },
    ilp_discovery: { required: true },
    ml_classify: { required: false },
    ml_cluster: { required: true },
    ml_forecast: { required: true },
    ml_anomaly: { required: true },
    ml_regress: { required: true },
    ml_pca: { required: true },
    ocel: { required: true },
    powl: { required: false },
    streaming_simd: { required: true },
    streaming_basic: { required: true },
    conformance_alignments: { required: true },
    gpu: { required: false },
  },
  browser: {
    genetic_discovery: { required: true },
    ilp_discovery: { required: true },
    ml_classify: { required: false },
    ml_cluster: { required: true },
    ml_forecast: { required: true },
    ml_anomaly: { required: true },
    ml_regress: { required: true },
    ml_pca: { required: true },
    ocel: { required: true },
    powl: { required: true },
    streaming_simd: { required: true },
    streaming_basic: { required: true },
    conformance_alignments: { required: true },
    gpu: { required: false },
  },
};

/**
 * Check if a feature is available in the WASM module
 * by attempting to call its marker function
 */
function checkFeatureAvailable(wasm: WasmModule, feature: string): boolean {
  const markerName = FEATURE_MARKERS[feature];
  if (!markerName) {
    return false;
  }

  try {
    const fn = (wasm as unknown as Record<string, unknown>)[markerName];
    if (typeof fn === 'function') {
      (fn as () => void)();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Validate a deployment profile against the WASM module
 * Returns detailed information about which features are present/missing
 */
export function validateDeploymentProfile(
  wasm: WasmModule,
  profile: DeploymentProfile
): DeploymentProfileValidationResult {
  const requiredFeatures = PROFILE_FEATURES[profile];
  const features: FeatureValidationResult[] = [];
  const missingRequired: string[] = [];
  const unexpectedExtra: string[] = [];

  // Check each known feature
  for (const [feature, requirement] of Object.entries(requiredFeatures)) {
    const available = checkFeatureAvailable(wasm, feature);
    features.push({ feature, available });

    if (requirement.required && !available) {
      missingRequired.push(feature);
    }
  }

  // Calculate confidence score (how well the binary matches the claimed profile)
  const expectedFeatureCount = Object.values(requiredFeatures).filter((r) => r.required).length;
  const foundRequiredCount = features.filter((f) => f.available && requiredFeatures[f.feature]?.required).length;
  const confidence = expectedFeatureCount > 0 ? foundRequiredCount / expectedFeatureCount : 1;

  const valid = missingRequired.length === 0;

  return {
    profile,
    valid,
    features,
    missingRequired,
    unexpectedExtra,
    confidence,
  };
}

/**
 * Validate all profiles and return the best-matching one
 * Walks from most-specific to least-specific profile
 */
export function detectDeploymentProfile(wasm: WasmModule): {
  detected: DeploymentProfile;
  confidence: number;
  validations: DeploymentProfileValidationResult[];
} {
  const profiles: DeploymentProfile[] = ['browser', 'fog', 'edge', 'iot', 'mobile'];
  const validations: DeploymentProfileValidationResult[] = [];

  for (const profile of profiles) {
    const validation = validateDeploymentProfile(wasm, profile);
    validations.push(validation);
    if (validation.valid) {
      return { detected: profile, confidence: validation.confidence, validations };
    }
  }

  // If no profile fully validates, return the best-confidence match
  const best = validations.reduce((a, b) => (a.confidence > b.confidence ? a : b));
  return { detected: best.profile, confidence: best.confidence, validations };
}

/**
 * Get human-readable description of which features are in a profile
 */
export function describeProfile(profile: DeploymentProfile): {
  name: string;
  description: string;
  size: string;
  features: string[];
} {
  const profileDescriptions: Record<
    DeploymentProfile,
    { name: string; description: string; size: string }
  > = {
    mobile: {
      name: 'Mobile',
      description: 'Minimal features for mobile devices',
      size: '~500KB',
    },
    iot: {
      name: 'IoT',
      description: 'Basic discovery and conformance for IoT devices',
      size: '~1MB',
    },
    edge: {
      name: 'Edge',
      description: 'Advanced discovery and basic streaming for edge servers',
      size: '~1.5MB',
    },
    fog: {
      name: 'Fog',
      description: 'Full features except POWL for fog computing',
      size: '~2MB',
    },
    browser: {
      name: 'Browser',
      description: 'Full feature set with all algorithms',
      size: '~2.7MB',
    },
  };

  const desc = profileDescriptions[profile];
  const requiredFeatures = Object.entries(PROFILE_FEATURES[profile])
    .filter(([_, req]) => req.required)
    .map(([feature]) => feature);

  return {
    name: desc.name,
    description: desc.description,
    size: desc.size,
    features: requiredFeatures,
  };
}
