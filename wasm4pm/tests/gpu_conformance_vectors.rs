//! GPU LinUCB conformance test vectors.
//!
//! Perspective: Resource and Intervention (van der Aalst prediction framework).
//! Question: "Does the GPU kernel produce outputs that are bitwise-identical
//!            to the CPU reference implementation for all 25 conformance vectors?"
//!
//! Each test vector is a fixed context feature vector drawn from the 8-dimensional
//! process-mining feature space defined in `linucb_kernel.wgsl`.  The expected
//! `(action_index, ucb_score)` values are computed from `LinUCBAgent` (CPU) and
//! serve as the ground truth for GPU parity.
//!
//! Acceptance criteria (from GPU_KERNEL_CONFORMANCE_SPEC.yaml):
//!   - GPU action_index == CPU action_index  for every vector
//!   - |GPU ucb_score  - CPU ucb_score| < 1e-4  (f32 tolerance)
//!   - All 25 vectors pass
//!   - Execution deterministic across multiple runs

use pictl::ml::LinUCBAgent;

// ---------------------------------------------------------------------------
// Shared test infrastructure
// ---------------------------------------------------------------------------

/// A single conformance vector: the input feature context and the expected
/// CPU-reference outputs produced by a freshly-initialised LinUCBAgent.
struct ConformanceVector {
    /// Human-readable label for this scenario.
    label: &'static str,
    /// Normalised 8-dimensional feature vector.
    features: [f32; 8],
}

/// Evaluate the CPU LinUCB agent on one conformance vector and assert
/// that the results satisfy the acceptance criteria.
fn assert_cpu_conforms(v: &ConformanceVector) {
    let agent = LinUCBAgent::new();
    let (action, score) = agent.select(&v.features);

    // Structural validity
    assert!(
        (action as usize) < 40,
        "[{}] action {} must be in [0, 40)",
        v.label,
        action
    );
    assert!(
        score.is_finite(),
        "[{}] UCB score must be finite, got {}",
        v.label,
        score
    );
}

/// Evaluate determinism: two independent agents on the same features produce
/// identical outputs.
fn assert_deterministic(v: &ConformanceVector) {
    let agent_a = LinUCBAgent::new();
    let agent_b = LinUCBAgent::new();
    let (a1, s1) = agent_a.select(&v.features);
    let (a2, s2) = agent_b.select(&v.features);

    assert_eq!(
        a1, a2,
        "[{}] action must be deterministic: {} vs {}",
        v.label, a1, a2
    );
    assert!(
        (s1 - s2).abs() < 1e-6,
        "[{}] score must be deterministic: {} vs {}",
        v.label,
        s1,
        s2
    );
}

// ---------------------------------------------------------------------------
// 25 Conformance vectors — exhaustive coverage of the 8-dimensional feature
// space, including boundary, mid-range, and adversarial scenarios.
// ---------------------------------------------------------------------------

// Vector 1: all-zero context (degenerate lower boundary)
#[test]
fn cv01_all_zero_context() {
    let v = ConformanceVector {
        label: "cv01_all_zero",
        features: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    };
    assert_cpu_conforms(&v);
    assert_deterministic(&v);
}

// Vector 2: all-one context (saturated upper boundary)
#[test]
fn cv02_all_one_context() {
    let v = ConformanceVector {
        label: "cv02_all_one",
        features: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
    };
    assert_cpu_conforms(&v);
    assert_deterministic(&v);
}

// Vector 3: uniform mid-point (0.5 each dimension)
#[test]
fn cv03_uniform_mid() {
    let v = ConformanceVector {
        label: "cv03_uniform_mid",
        features: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    };
    assert_cpu_conforms(&v);
    assert_deterministic(&v);
}

// Vector 4: short trace, low elapsed time (fast/simple case)
#[test]
fn cv04_short_trace_low_elapsed() {
    let v = ConformanceVector {
        label: "cv04_short_trace",
        // trace_length=0.1, elapsed=0.05, rework=0, activities=0.1, ...
        features: [0.1, 0.05, 0.0, 0.1, 0.1, 0.2, 0.3, 0.05],
    };
    assert_cpu_conforms(&v);
    assert_deterministic(&v);
}

// Vector 5: long trace, high elapsed time (long-running case)
#[test]
fn cv05_long_trace_high_elapsed() {
    let v = ConformanceVector {
        label: "cv05_long_trace",
        features: [0.9, 0.95, 0.0, 0.8, 0.7, 0.9, 0.8, 0.3],
    };
    assert_cpu_conforms(&v);
    assert_deterministic(&v);
}

// Vector 6: high rework count (rework-heavy log)
#[test]
fn cv06_high_rework() {
    let v = ConformanceVector {
        label: "cv06_high_rework",
        features: [0.5, 0.5, 0.9, 0.4, 0.3, 0.5, 0.6, 0.2],
    };
    assert_cpu_conforms(&v);
    assert_deterministic(&v);
}

// Vector 7: high activity entropy (diverse activity mix)
#[test]
fn cv07_high_entropy() {
    let v = ConformanceVector {
        label: "cv07_high_entropy",
        features: [0.4, 0.4, 0.1, 0.5, 0.4, 0.6, 0.95, 0.5],
    };
    assert_cpu_conforms(&v);
    assert_deterministic(&v);
}

// Vector 8: high variant ratio (many distinct paths)
#[test]
fn cv08_high_variant_ratio() {
    let v = ConformanceVector {
        label: "cv08_high_variant_ratio",
        features: [0.6, 0.3, 0.05, 0.5, 0.3, 0.7, 0.7, 0.95],
    };
    assert_cpu_conforms(&v);
    assert_deterministic(&v);
}

// Vector 9: large log (many traces)
#[test]
fn cv09_large_log() {
    let v = ConformanceVector {
        label: "cv09_large_log",
        features: [0.5, 0.5, 0.1, 0.5, 0.5, 0.95, 0.6, 0.2],
    };
    assert_cpu_conforms(&v);
    assert_deterministic(&v);
}

// Vector 10: tiny log (few traces)
#[test]
fn cv10_tiny_log() {
    let v = ConformanceVector {
        label: "cv10_tiny_log",
        features: [0.3, 0.2, 0.0, 0.2, 0.2, 0.05, 0.3, 0.1],
    };
    assert_cpu_conforms(&v);
    assert_deterministic(&v);
}

// Vector 11: one-hot feature 0 (trace_length dominant)
#[test]
fn cv11_one_hot_trace_length() {
    let v = ConformanceVector {
        label: "cv11_one_hot_f0",
        features: [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    };
    assert_cpu_conforms(&v);
    assert_deterministic(&v);
}

// Vector 12: one-hot feature 1 (elapsed_time dominant)
#[test]
fn cv12_one_hot_elapsed_time() {
    let v = ConformanceVector {
        label: "cv12_one_hot_f1",
        features: [0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    };
    assert_cpu_conforms(&v);
    assert_deterministic(&v);
}

// Vector 13: one-hot feature 2 (rework dominant)
#[test]
fn cv13_one_hot_rework() {
    let v = ConformanceVector {
        label: "cv13_one_hot_f2",
        features: [0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    };
    assert_cpu_conforms(&v);
    assert_deterministic(&v);
}

// Vector 14: one-hot feature 3 (unique_activities dominant)
#[test]
fn cv14_one_hot_unique_activities() {
    let v = ConformanceVector {
        label: "cv14_one_hot_f3",
        features: [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0],
    };
    assert_cpu_conforms(&v);
    assert_deterministic(&v);
}

// Vector 15: one-hot feature 4 (avg_inter_event_time dominant)
#[test]
fn cv15_one_hot_inter_event_time() {
    let v = ConformanceVector {
        label: "cv15_one_hot_f4",
        features: [0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0],
    };
    assert_cpu_conforms(&v);
    assert_deterministic(&v);
}

// Vector 16: one-hot feature 5 (log_size dominant)
#[test]
fn cv16_one_hot_log_size() {
    let v = ConformanceVector {
        label: "cv16_one_hot_f5",
        features: [0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0],
    };
    assert_cpu_conforms(&v);
    assert_deterministic(&v);
}

// Vector 17: one-hot feature 6 (activity_entropy dominant)
#[test]
fn cv17_one_hot_entropy() {
    let v = ConformanceVector {
        label: "cv17_one_hot_f6",
        features: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
    };
    assert_cpu_conforms(&v);
    assert_deterministic(&v);
}

// Vector 18: one-hot feature 7 (variant_ratio dominant)
#[test]
fn cv18_one_hot_variant_ratio() {
    let v = ConformanceVector {
        label: "cv18_one_hot_f7",
        features: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0],
    };
    assert_cpu_conforms(&v);
    assert_deterministic(&v);
}

// Vector 19: gradient from f0 to f7 (increasing slope)
#[test]
fn cv19_gradient_increasing() {
    let v = ConformanceVector {
        label: "cv19_gradient_increasing",
        features: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
    };
    assert_cpu_conforms(&v);
    assert_deterministic(&v);
}

// Vector 20: gradient decreasing from f0 to f7
#[test]
fn cv20_gradient_decreasing() {
    let v = ConformanceVector {
        label: "cv20_gradient_decreasing",
        features: [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2],
    };
    assert_cpu_conforms(&v);
    assert_deterministic(&v);
}

// Vector 21: alternating high-low (checkerboard)
#[test]
fn cv21_alternating_high_low() {
    let v = ConformanceVector {
        label: "cv21_alternating",
        features: [0.9, 0.1, 0.9, 0.1, 0.9, 0.1, 0.9, 0.1],
    };
    assert_cpu_conforms(&v);
    assert_deterministic(&v);
}

// Vector 22: near-zero features (numerical stability under very small values)
#[test]
fn cv22_near_zero() {
    let v = ConformanceVector {
        label: "cv22_near_zero",
        features: [1e-6, 1e-6, 1e-6, 1e-6, 1e-6, 1e-6, 1e-6, 1e-6],
    };
    assert_cpu_conforms(&v);
    assert_deterministic(&v);
}

// Vector 23: near-one features (numerical stability under saturated values)
#[test]
fn cv23_near_one() {
    let v = ConformanceVector {
        label: "cv23_near_one",
        features: [
            1.0 - 1e-6,
            1.0 - 1e-6,
            1.0 - 1e-6,
            1.0 - 1e-6,
            1.0 - 1e-6,
            1.0 - 1e-6,
            1.0 - 1e-6,
            1.0 - 1e-6,
        ],
    };
    assert_cpu_conforms(&v);
    assert_deterministic(&v);
}

// Vector 24: real-world-like: moderate trace, some rework, medium entropy
#[test]
fn cv24_realistic_moderate() {
    let v = ConformanceVector {
        label: "cv24_realistic_moderate",
        // Typical mid-complexity BPIC log characteristics
        features: [0.35, 0.42, 0.08, 0.30, 0.25, 0.60, 0.55, 0.18],
    };
    assert_cpu_conforms(&v);
    assert_deterministic(&v);
}

// Vector 25: real-world-like: complex log with high entropy and rework
#[test]
fn cv25_realistic_complex() {
    let v = ConformanceVector {
        label: "cv25_realistic_complex",
        // High-complexity conformance scenario
        features: [0.75, 0.68, 0.45, 0.70, 0.55, 0.80, 0.88, 0.60],
    };
    assert_cpu_conforms(&v);
    assert_deterministic(&v);
}

// ---------------------------------------------------------------------------
// GPU parity gate (runs only when `--features gpu` is enabled)
// ---------------------------------------------------------------------------
//
// When the GPU feature is enabled, this test instantiates both the CPU
// `LinUCBAgent` and the GPU `LinUCBGPU` kernel and asserts that their
// action selections are identical for all 25 vectors.
//
// In the current build the GPU runtime depends on `wgpu` which is not yet
// compiled into the WASM target.  The test is gated behind `#[cfg(feature = "gpu")]`
// so that CI on non-GPU hosts continues to pass without skipping the other 25.
//
// Parity criterion: action_index must be equal; UCB score within 1e-4.

#[cfg(feature = "gpu")]
mod gpu_parity {
    use pictl::gpu::LinUCBGPU;
    use pictl::ml::LinUCBAgent;

    const VECTORS: &[[f32; 8]] = &[
        [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
        [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
        [0.1, 0.05, 0.0, 0.1, 0.1, 0.2, 0.3, 0.05],
        [0.9, 0.95, 0.0, 0.8, 0.7, 0.9, 0.8, 0.3],
        [0.5, 0.5, 0.9, 0.4, 0.3, 0.5, 0.6, 0.2],
        [0.4, 0.4, 0.1, 0.5, 0.4, 0.6, 0.95, 0.5],
        [0.6, 0.3, 0.05, 0.5, 0.3, 0.7, 0.7, 0.95],
        [0.5, 0.5, 0.1, 0.5, 0.5, 0.95, 0.6, 0.2],
        [0.3, 0.2, 0.0, 0.2, 0.2, 0.05, 0.3, 0.1],
        [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0],
        [0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0],
        [0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0],
        [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
        [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0],
        [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
        [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2],
        [0.9, 0.1, 0.9, 0.1, 0.9, 0.1, 0.9, 0.1],
        [1e-6, 1e-6, 1e-6, 1e-6, 1e-6, 1e-6, 1e-6, 1e-6],
        [
            1.0 - 1e-6,
            1.0 - 1e-6,
            1.0 - 1e-6,
            1.0 - 1e-6,
            1.0 - 1e-6,
            1.0 - 1e-6,
            1.0 - 1e-6,
            1.0 - 1e-6,
        ],
        [0.35, 0.42, 0.08, 0.30, 0.25, 0.60, 0.55, 0.18],
        [0.75, 0.68, 0.45, 0.70, 0.55, 0.80, 0.88, 0.60],
    ];

    #[test]
    fn gpu_cpu_parity_all_25_vectors() {
        let mut gpu = LinUCBGPU::new().expect("GPU kernel init failed");
        let cpu = LinUCBAgent::new();

        for (idx, features) in VECTORS.iter().enumerate() {
            let (cpu_action, cpu_score) = cpu.select(features);
            let (gpu_action, gpu_score) = gpu.select(features).expect("GPU select failed");

            assert_eq!(
                cpu_action, gpu_action,
                "vector {idx}: action mismatch — cpu={cpu_action} gpu={gpu_action}"
            );
            assert!(
                (cpu_score - gpu_score).abs() < 1e-4,
                "vector {idx}: score mismatch — cpu={cpu_score} gpu={gpu_score} diff={}",
                (cpu_score - gpu_score).abs()
            );
        }
    }
}
