//! Ported from knhk/rust/knhk-dflss/src/internal/
//!
//! Western Electric SPC Rules for special cause detection
//! and Process Capability calculations (Cp, Cpk, Sigma level, DPMO).
//!
//! Pure Rust stdlib math -- trivially WASM-compatible.

// ---------------------------------------------------------------------------
// Types (ported from knhk internal/chart.rs)
// ---------------------------------------------------------------------------

/// A single observation on a control chart.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ChartData {
    /// ISO-8601 timestamp or label.
    pub timestamp: String,
    /// Measured value.
    pub value: f64,
    /// Upper Control Limit.
    pub ucl: f64,
    /// Center Line (process mean).
    pub cl: f64,
    /// Lower Control Limit.
    pub lcl: f64,
    /// Optional subgroup raw values.
    pub subgroup_data: Option<Vec<f64>>,
}

/// Direction of a shift relative to the center line.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum ShiftDirection {
    Above,
    Below,
}

/// Direction of a trend.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum TrendDirection {
    Increasing,
    Decreasing,
}

/// A detected special-cause signal.
#[derive(Debug, Clone, PartialEq)]
#[allow(dead_code)]
pub enum SpecialCause {
    /// Rule 1: Point beyond UCL or LCL.
    OutOfControl { value: f64, ucl: f64, lcl: f64 },
    /// Rule 2: N consecutive points on same side of CL.
    Shift {
        direction: ShiftDirection,
        count: usize,
    },
    /// Rule 3: N consecutive points increasing or decreasing.
    Trend {
        direction: TrendDirection,
        count: usize,
    },
}

// ---------------------------------------------------------------------------
// Western Electric Rules (ported from knhk rules.rs)
// ---------------------------------------------------------------------------

/// Check the four classic Western Electric special-cause rules against the
/// trailing window of chart data.
///
/// Rules evaluated:
/// 1. Point beyond UCL or LCL.
/// 2. 9 consecutive points on same side of center line.
/// 3. 6 consecutive points increasing or decreasing.
///
/// Returns all signals found (may be empty).
#[allow(dead_code)]
pub fn check_western_electric_rules(data: &[ChartData]) -> Vec<SpecialCause> {
    let mut alerts = Vec::new();

    if data.len() < 9 {
        return alerts;
    }

    let recent = &data[data.len().saturating_sub(9)..];
    let latest = recent.last().unwrap();

    // Rule 1: Point beyond UCL or LCL
    if latest.value > latest.ucl || latest.value < latest.lcl {
        alerts.push(SpecialCause::OutOfControl {
            value: latest.value,
            ucl: latest.ucl,
            lcl: latest.lcl,
        });
    }

    // Rule 2: 9 consecutive points on same side of center line
    if recent.len() >= 9 {
        let above_cl = recent.iter().all(|d| d.value > d.cl);
        let below_cl = recent.iter().all(|d| d.value < d.cl);

        if above_cl {
            alerts.push(SpecialCause::Shift {
                direction: ShiftDirection::Above,
                count: 9,
            });
        } else if below_cl {
            alerts.push(SpecialCause::Shift {
                direction: ShiftDirection::Below,
                count: 9,
            });
        }
    }

    // Rule 3: 6 consecutive points increasing or decreasing
    if recent.len() >= 6 {
        let last_6 = &recent[recent.len() - 6..];
        let values: Vec<f64> = last_6.iter().map(|d| d.value).collect();

        let increasing = values.windows(2).all(|w| w[1] > w[0]);
        let decreasing = values.windows(2).all(|w| w[1] < w[0]);

        if increasing {
            alerts.push(SpecialCause::Trend {
                direction: TrendDirection::Increasing,
                count: 6,
            });
        } else if decreasing {
            alerts.push(SpecialCause::Trend {
                direction: TrendDirection::Decreasing,
                count: 6,
            });
        }
    }

    alerts
}

// ---------------------------------------------------------------------------
// Process Capability (ported from knhk capability.rs)
// ---------------------------------------------------------------------------

/// Computed process capability indices.
#[derive(Debug, Clone, PartialEq)]
#[allow(dead_code)]
pub struct ProcessCapability {
    pub cp: f64,
    pub cpk: f64,
    pub sigma_level: f64,
    pub dpmo: f64,
    pub mean: f64,
    pub std_dev: f64,
    pub usl: f64,
    pub lsl: f64,
}

/// Errors returned by capability calculations.
#[derive(Debug, Clone, PartialEq)]
#[allow(dead_code)]
pub enum CapabilityError {
    EmptyData,
    InvalidLimits,
}

impl std::fmt::Display for CapabilityError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CapabilityError::EmptyData => write!(f, "Cannot calculate capability with empty data"),
            CapabilityError::InvalidLimits => {
                write!(
                    f,
                    "Invalid specification limits: USL must be greater than LSL"
                )
            }
        }
    }
}

impl std::error::Error for CapabilityError {}

impl ProcessCapability {
    /// Calculate Cp, Cpk, sigma level, and DPMO from observed data and
    /// specification limits.
    #[allow(dead_code)]
    pub fn calculate(data: &[f64], usl: f64, lsl: f64) -> Result<Self, CapabilityError> {
        if data.is_empty() {
            return Err(CapabilityError::EmptyData);
        }

        if usl <= lsl {
            return Err(CapabilityError::InvalidLimits);
        }

        let mean = spc_mean(data);
        let std_dev = spc_std_dev(data);

        if std_dev == 0.0 {
            // All data points are identical.
            let is_within_limits = data.iter().all(|&x| x >= lsl && x <= usl);
            return Ok(Self {
                cp: if is_within_limits { f64::INFINITY } else { 0.0 },
                cpk: if is_within_limits { f64::INFINITY } else { 0.0 },
                sigma_level: if is_within_limits { 6.0 } else { 0.0 },
                dpmo: if is_within_limits { 0.0 } else { 1_000_000.0 },
                mean,
                std_dev,
                usl,
                lsl,
            });
        }

        // Cp: Process Potential Capability
        let cp = (usl - lsl) / (6.0 * std_dev);

        // Cpk: Process Performance Capability
        let cpk_usl = (usl - mean) / (3.0 * std_dev);
        let cpk_lsl = (mean - lsl) / (3.0 * std_dev);
        let cpk = cpk_usl.min(cpk_lsl);

        // DPMO and Sigma Level
        let z_usl = (usl - mean) / std_dev;
        let z_lsl = (lsl - mean) / std_dev;

        let p_usl = 1.0 - normal_cdf(z_usl);
        let p_lsl = normal_cdf(z_lsl);
        let p_defective = p_usl + p_lsl;

        let dpmo = p_defective * 1_000_000.0;
        let sigma_level = dpmo_to_sigma(dpmo);

        Ok(Self {
            cp,
            cpk,
            sigma_level,
            dpmo,
            mean,
            std_dev,
            usl,
            lsl,
        })
    }
}

// ---------------------------------------------------------------------------
// Statistics helpers (ported from knhk statistics.rs)
// ---------------------------------------------------------------------------

#[allow(dead_code)]
pub fn spc_mean(data: &[f64]) -> f64 {
    if data.is_empty() {
        return 0.0;
    }
    data.iter().sum::<f64>() / data.len() as f64
}

#[allow(dead_code)]
pub fn spc_std_dev(data: &[f64]) -> f64 {
    if data.len() < 2 {
        return 0.0;
    }
    let m = spc_mean(data);
    let variance = data.iter().map(|&x| (x - m).powi(2)).sum::<f64>() / (data.len() - 1) as f64;
    variance.sqrt()
}

// ---------------------------------------------------------------------------
// Normal CDF / inverse CDF (hand-written, no statrs dependency)
// ---------------------------------------------------------------------------

/// Abramowitz & Stegun approximation of the standard normal CDF.
#[allow(dead_code)]
pub fn normal_cdf(z: f64) -> f64 {
    let t = 1.0 / (1.0 + 0.2316419 * z.abs());
    let d = 0.39894228 * (-z * z / 2.0).exp();
    let prob = 1.0
        - d * t
            * (0.319381530
                + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    if z > 0.0 {
        prob
    } else {
        1.0 - prob
    }
}

/// Rational approximation of the standard normal inverse CDF (Peter Acklam's
/// algorithm).  Handles all three regions: low tail, central, high tail.
/// Maximum absolute error ≈ 1.15 × 10⁻⁹.
#[allow(dead_code)]
pub fn inverse_normal_cdf(p: f64) -> f64 {
    if p <= 0.0 {
        return f64::NEG_INFINITY;
    }
    if p >= 1.0 {
        return f64::INFINITY;
    }

    // Acklam's rational approximation coefficients.
    const A: [f64; 6] = [
        -3.969_683_028_665_376e+01,
        2.209_460_984_245_205e+02,
        -2.759_285_104_469_687e+02,
        1.383_577_518_672_69e2,
        -3.066_479_806_614_716e+01,
        2.506_628_277_459_239e+00,
    ];
    const B: [f64; 5] = [
        -5.447_609_879_822_406e+01,
        1.615_858_368_580_409e+02,
        -1.556_989_798_598_866e+02,
        6.680_131_188_771_972e+01,
        -1.328_068_155_288_572e+01,
    ];
    const C: [f64; 6] = [
        -7.784_894_002_430_293e-03,
        -3.223_964_580_411_365e-01,
        -2.400_758_277_161_838e+00,
        -2.549_732_539_343_734e+00,
        4.374_664_141_464_968e+00,
        2.938_163_982_698_783e+00,
    ];
    const D: [f64; 4] = [
        7.784_695_709_041_462e-03,
        3.224_671_290_700_398e-01,
        2.445_134_137_142_996e+00,
        3.754_408_661_907_416e+00,
    ];

    const P_LOW: f64 = 0.02425;
    const P_HIGH: f64 = 1.0 - P_LOW;

    if p < P_LOW {
        // Lower region.
        let q = (-2.0 * p.ln()).sqrt();
        (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5])
            / ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1.0)
    } else if p <= P_HIGH {
        // Central region.
        let q = p - 0.5;
        let r = q * q;
        q * (((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5])
            / (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1.0)
    } else {
        // Upper region.
        let q = (-2.0 * (1.0 - p).ln()).sqrt();
        -(((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5])
            / ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1.0)
    }
}

/// Public wrapper for normal CDF (used by benchmarks and JTBD validation).
#[allow(dead_code)]
pub fn normal_cdf_public(z: f64) -> f64 {
    normal_cdf(z)
}

/// Public wrapper for inverse normal CDF (used by benchmarks and JTBD validation).
#[allow(dead_code)]
pub fn inverse_normal_cdf_public(p: f64) -> f64 {
    inverse_normal_cdf(p)
}

/// Convert DPMO to Six-Sigma level (includes 1.5-sigma long-term shift).
#[allow(dead_code)]
pub fn dpmo_to_sigma(dpmo: f64) -> f64 {
    if dpmo <= 0.0 {
        return 6.0;
    }
    if dpmo >= 1_000_000.0 {
        return 0.0;
    }

    let p_defective = dpmo / 1_000_000.0;
    let z_score = inverse_normal_cdf(1.0 - p_defective);
    z_score + 1.5 // Add 1.5 sigma shift for short-term vs long-term
}

// Tests consolidated in tests/autonomic_tests.rs (spc_tests module)
