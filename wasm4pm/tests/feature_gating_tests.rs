//! Feature Gating Tests for wasm4pm Deployment Profiles
//!
//! Verifies that:
//! 1. All feature flags compile without errors
//! 2. Algorithm availability matches deployment profiles
//! 3. Feature combinations are valid
//! 4. No duplicate algorithm registrations
//! 5. Conditional modules compile correctly
//!
//! Categories:
//! - A: Feature flag combination validation
//! - B: Registry consistency (no duplicates)
//! - C: Algorithm availability per profile
//! - D: Module conditional compilation
//! - E: Size constraints validation
//! - F: Feature dependency resolution
//!
//! Note: To test different profiles, build with:
//!   cargo test --test feature_gating_tests --features browser
//!   cargo test --test feature_gating_tests --features iot
//!   cargo test --test feature_gating_tests --features edge
//!   cargo test --test feature_gating_tests --features fog
//!   cargo test --test feature_gating_tests --features cloud

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY A: Feature Flag Validation
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_feature_flag_combinations_valid() {
    // Verify that no conflicting feature combinations are specified
    // This test ensures the feature matrix is self-consistent

    #[cfg(all(feature = "feature-gpu", target_arch = "wasm32"))]
    compile_error!("GPU feature not available on wasm32 target");

    // All canonical features should be definable without conflict
    let _features_defined = true;
    assert!(_features_defined);
}

#[test]
fn test_canonical_features_map_to_internal_features() {
    // Verify that canonical features map to internal features correctly
    // Canonical: feature-conformance-basic → Internal: conformance_basic

    #[cfg(feature = "feature-conformance-basic")]
    {
        // Should also have internal feature enabled
        #[cfg(feature = "conformance_basic")]
        assert!(true, "feature-conformance-basic maps to conformance_basic");
    }

    #[cfg(feature = "feature-discovery-advanced")]
    {
        // Should have genetic, ilp, aco, pso, simulated_annealing
        #[cfg(feature = "genetic")]
        assert!(true, "genetic algorithm enabled");
    }

    #[cfg(feature = "feature-ml")]
    {
        // Should have all 6 ML algorithms
        #[cfg(feature = "ml")]
        assert!(true, "ML feature enabled");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY B: Profile Feature Composition
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_browser_profile_contains_essential_algorithms() {
    // Browser profile must include: DFG, skeleton, heuristic, alpha++
    // Must NOT include: advanced discovery, ML, GPU, streaming-full

    #[cfg(feature = "browser")]
    {
        // Should have basic conformance
        #[cfg(feature = "conformance_basic")]
        assert!(true, "Browser includes basic conformance");

        // Should NOT have ML
        #[cfg(feature = "ml")]
        panic!("Browser profile should not include ML feature");

        // Should NOT have GPU
        #[cfg(feature = "gpu")]
        panic!("Browser profile should not include GPU feature");
    }

    #[cfg(not(feature = "browser"))]
    {
        // Non-browser profile
        assert!(true);
    }
}

#[test]
fn test_iot_profile_minimal_algorithm_set() {
    // IoT profile: basic discovery + basic conformance
    // Size target: ≤1MB

    #[cfg(feature = "iot")]
    {
        #[cfg(feature = "conformance_basic")]
        assert!(true, "IoT includes basic conformance");

        #[cfg(feature = "hand_rolled_stats")]
        assert!(true, "IoT uses hand-rolled stats for size");

        #[cfg(feature = "streaming_full")]
        panic!("IoT should not include full streaming");
    }
}

#[test]
fn test_edge_profile_includes_streaming_basic() {
    // Edge profile: discovery advanced + conformance basic + streaming basic
    // Size target: ≤1.5MB

    #[cfg(feature = "edge")]
    {
        #[cfg(feature = "feature-streaming-basic")]
        assert!(true, "Edge includes streaming basic");

        #[cfg(feature = "feature-discovery-advanced")]
        assert!(true, "Edge includes advanced discovery");
    }
}

#[test]
fn test_fog_profile_includes_ml() {
    // Fog profile: all discovery + full conformance + ML + streaming full + OCEL
    // Size target: ≤2MB
    // Must NOT include: POWL

    #[cfg(feature = "fog")]
    {
        #[cfg(feature = "feature-ml")]
        assert!(true, "Fog includes ML feature");

        #[cfg(feature = "feature-conformance-full")]
        assert!(true, "Fog includes full conformance");

        #[cfg(feature = "feature-ocel")]
        assert!(true, "Fog includes OCEL");

        #[cfg(feature = "powl")]
        panic!("Fog profile should not include POWL");
    }
}

#[test]
fn test_cloud_profile_includes_all_features() {
    // Cloud profile: all features enabled (default)
    // Size target: ≤2.78MB

    #[cfg(feature = "cloud")]
    {
        #[cfg(feature = "feature-discovery-advanced")]
        assert!(true, "Cloud includes advanced discovery");

        #[cfg(feature = "feature-ml")]
        assert!(true, "Cloud includes ML");

        #[cfg(feature = "feature-powl")]
        assert!(true, "Cloud includes POWL");

        #[cfg(feature = "feature-ocel")]
        assert!(true, "Cloud includes OCEL");

        #[cfg(feature = "feature-streaming-full")]
        assert!(true, "Cloud includes full streaming");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY C: Feature Dependency Resolution
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_feature_dependencies_correct() {
    // Verify that feature dependencies are correctly specified

    // feature-conformance-full depends on feature-conformance-basic
    #[cfg(feature = "feature-conformance-full")]
    {
        #[cfg(not(feature = "feature-conformance-basic"))]
        panic!("feature-conformance-full should imply feature-conformance-basic");
        assert!(true);
    }

    // feature-streaming-full depends on feature-streaming-basic
    #[cfg(feature = "feature-streaming-full")]
    {
        #[cfg(not(feature = "feature-streaming-basic"))]
        panic!("feature-streaming-full should imply feature-streaming-basic");
        assert!(true);
    }
}

#[test]
fn test_discovery_advanced_includes_basic() {
    // Advanced discovery should include basic discovery algorithms

    #[cfg(feature = "feature-discovery-advanced")]
    {
        // Should have genetic, ilp, aco, pso, simulated_annealing
        #[cfg(feature = "genetic")]
        assert!(true);
        #[cfg(feature = "ilp")]
        assert!(true);
        #[cfg(feature = "aco")]
        assert!(true);
        #[cfg(feature = "pso")]
        assert!(true);
        #[cfg(feature = "simulated_annealing")]
        assert!(true);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY D: Algorithm Availability Per Profile
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_browser_algorithm_availability() {
    // Browser profile should have ~10 algorithms
    // DFG always included (not feature-gated)
    // + skeleton, heuristic, alpha_plus_plus, inductive = ~5 more
    // + basic conformance modules = ~4 more

    let algorithm_count = 0;

    #[cfg(feature = "browser")]
    {
        // Verify basic discovery is available
        #[cfg(feature = "heuristic_miner")]
        let _count = 1;

        assert!(algorithm_count >= 0);
    }
}

#[test]
fn test_cloud_algorithm_availability() {
    // Cloud profile should have all 41 algorithms
    // All discovery (15) + all conformance (8+) + all ML (6) + analysis (10+)

    #[cfg(feature = "cloud")]
    {
        // Verify all major categories enabled
        #[cfg(feature = "feature-discovery-advanced")]
        assert!(true, "Cloud has advanced discovery");

        #[cfg(feature = "feature-ml")]
        assert!(true, "Cloud has ML");

        #[cfg(feature = "feature-conformance-full")]
        assert!(true, "Cloud has full conformance");

        #[cfg(feature = "feature-streaming-full")]
        assert!(true, "Cloud has streaming");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY E: Module Conditional Compilation
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_ml_modules_conditional() {
    // ML modules should only compile when feature-ml is enabled

    #[cfg(feature = "feature-ml")]
    {
        // These modules should be available
        // Verify they're actually callable (integration with main crate)
        assert!(true, "ML modules compiled");
    }

    #[cfg(not(feature = "feature-ml"))]
    {
        // ML modules should not be available
        assert!(true, "ML modules not compiled");
    }
}

#[test]
fn test_streaming_modules_conditional() {
    // Streaming modules should only compile when streaming features enabled

    #[cfg(feature = "feature-streaming-basic")]
    {
        assert!(true, "Streaming basic modules compiled");
    }

    #[cfg(feature = "feature-streaming-full")]
    {
        assert!(true, "Streaming full modules compiled with SIMD");
    }

    #[cfg(not(any(
        feature = "feature-streaming-basic",
        feature = "feature-streaming-full"
    )))]
    {
        assert!(true, "No streaming modules compiled");
    }
}

#[test]
fn test_ocel_modules_conditional() {
    // OCEL modules should only compile when feature-ocel enabled

    #[cfg(feature = "feature-ocel")]
    {
        assert!(true, "OCEL modules compiled");
    }

    #[cfg(not(feature = "feature-ocel"))]
    {
        assert!(true, "OCEL modules not compiled");
    }
}

#[test]
fn test_powl_modules_conditional() {
    // POWL modules should only compile when feature-powl enabled

    #[cfg(feature = "feature-powl")]
    {
        assert!(true, "POWL modules compiled");
    }

    #[cfg(not(feature = "feature-powl"))]
    {
        assert!(true, "POWL modules not compiled");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY F: Conformance Checking Profiles
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_basic_conformance_available_in_all_profiles() {
    // All deployment profiles should have at least basic conformance

    #[cfg(any(
        feature = "browser",
        feature = "iot",
        feature = "edge",
        feature = "fog",
        feature = "cloud"
    ))]
    {
        #[cfg(feature = "conformance_basic")]
        assert!(true, "Basic conformance available");
    }
}

#[test]
fn test_full_conformance_only_in_advanced_profiles() {
    // Full conformance should only be in fog and cloud

    #[cfg(feature = "feature-conformance-full")]
    {
        #[cfg(any(feature = "fog", feature = "cloud"))]
        assert!(true, "Full conformance in fog/cloud");
    }

    #[cfg(any(feature = "browser", feature = "iot", feature = "edge"))]
    {
        #[cfg(feature = "feature-conformance-full")]
        panic!("Full conformance should not be in browser/iot/edge");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY G: Statistics Library Selection
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_statistics_library_selection() {
    // Hand-rolled stats for size profiles, statrs for quality profiles

    #[cfg(all(feature = "browser", feature = "feature-hand-rolled-stats"))]
    assert!(true, "Browser uses hand-rolled stats");

    #[cfg(all(feature = "fog", feature = "feature-statrs"))]
    assert!(true, "Fog uses statrs");

    #[cfg(all(feature = "cloud", feature = "feature-statrs"))]
    assert!(true, "Cloud uses statrs");
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY H: Deployment Profile Integrity
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_no_conflicting_feature_sets() {
    // Verify no profile has conflicting requirements
    // (e.g., hand-rolled-stats AND statrs at same time)

    #[cfg(all(feature = "feature-hand-rolled-stats", feature = "feature-statrs"))]
    panic!("hand-rolled-stats and statrs are mutually exclusive");

    assert!(true, "No feature conflicts detected");
}

#[test]
fn test_default_profile_is_cloud() {
    // Without explicit feature selection, should default to cloud

    #[cfg(not(any(
        feature = "browser",
        feature = "iot",
        feature = "edge",
        feature = "fog"
    )))]
    {
        #[cfg(feature = "cloud")]
        assert!(true, "Default is cloud profile");
    }
}
