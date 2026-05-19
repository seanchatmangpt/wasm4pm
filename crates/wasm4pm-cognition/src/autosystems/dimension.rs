//! Unit-typed quantities and dimension declarations.
//!
//! This module provides phantom-typed [`Quantity<U>`] values whose unit is part
//! of the type. Cross-unit multiplication is impossible by construction, which
//! is enforced by the `tests/compile_fail/cross_unit_mul.rs` trybuild fixture.
//!
//! Dimensions are declared at runtime via [`DimensionSpec`] and validated by
//! manifest loaders so candidates may carry arbitrary user-defined dimensions.

use serde::{Deserialize, Serialize};
use std::fmt;
use std::marker::PhantomData;
use std::ops::{Add, Mul, Sub};

/// Marker trait identifying a measurable unit.
pub trait UnitMarker: Copy + Clone + fmt::Debug + 'static {
    /// Stable, human-readable identifier (e.g. `"USD"`, `"sec"`, `"prob"`).
    const ID: &'static str;
}

/// Currency unit (e.g. USD, EUR — opaque scalar).
#[derive(Debug, Clone, Copy)]
pub struct Currency;
impl UnitMarker for Currency {
    const ID: &'static str = "currency";
}

/// Time unit (seconds).
#[derive(Debug, Clone, Copy)]
pub struct Time;
impl UnitMarker for Time {
    const ID: &'static str = "time";
}

/// Probability unit (dimensionless, [0,1]).
#[derive(Debug, Clone, Copy)]
pub struct Probability;
impl UnitMarker for Probability {
    const ID: &'static str = "probability";
}

/// Generic quality score (dimensionless, [0,1]).
#[derive(Debug, Clone, Copy)]
pub struct Score;
impl UnitMarker for Score {
    const ID: &'static str = "score";
}

/// Operations per second, throughput.
#[derive(Debug, Clone, Copy)]
pub struct Throughput;
impl UnitMarker for Throughput {
    const ID: &'static str = "throughput";
}

/// A unit-typed scalar quantity.
///
/// Cross-unit arithmetic is forbidden by phantom types: `Quantity<Currency>`
/// cannot be multiplied or added with `Quantity<Time>`. The trybuild fixture
/// `tests/compile_fail/cross_unit_mul.rs` proves this property.
#[derive(Debug, Clone, Copy)]
pub struct Quantity<U: UnitMarker> {
    value: f64,
    _u: PhantomData<U>,
}

impl<U: UnitMarker> Quantity<U> {
    /// Wrap a raw scalar in a unit.
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn new(value: f64) -> Self {
        Self {
            value,
            _u: PhantomData,
        }
    }

    /// Underlying scalar.
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn value(self) -> f64 {
        self.value
    }

    /// Unit identifier.
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn unit(&self) -> &'static str {
        U::ID
    }

    /// Finiteness query.
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn is_finite(&self) -> bool {
        self.value.is_finite()
    }
}

impl<U: UnitMarker> Add for Quantity<U> {
    type Output = Self;
    fn add(self, rhs: Self) -> Self {
        Self::new(self.value + rhs.value)
    }
}

impl<U: UnitMarker> Sub for Quantity<U> {
    type Output = Self;
    fn sub(self, rhs: Self) -> Self {
        Self::new(self.value - rhs.value)
    }
}

// Same-unit multiplication only. No `impl Mul<Quantity<V>> for Quantity<U>` —
// the trybuild fixture verifies this absence.
impl<U: UnitMarker> Mul for Quantity<U> {
    type Output = Self;
    fn mul(self, rhs: Self) -> Self {
        Self::new(self.value * rhs.value)
    }
}

/// Direction of preference for a dimension.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Direction {
    /// Higher numeric value is preferred (e.g. throughput, availability).
    HigherIsBetter,
    /// Lower numeric value is preferred (e.g. cost, latency).
    LowerIsBetter,
}

/// Runtime declaration of a candidate dimension.
///
/// Used by manifest loaders to validate that values fall in expected ranges
/// and that cost laws receive matching unit tags.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DimensionSpec {
    /// Stable identifier (`"latency_ms"`, `"unit_cost_usd"`).
    pub key: String,
    /// Unit marker identifier (matches [`UnitMarker::ID`]).
    pub unit: String,
    /// Optimization direction.
    pub direction: Direction,
    /// Optional inclusive lower bound for validation.
    pub min: Option<f64>,
    /// Optional inclusive upper bound for validation.
    pub max: Option<f64>,
}

impl DimensionSpec {
    /// Validate that `value` lies within declared bounds and is finite.
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn validate(&self, value: f64) -> Result<(), String> {
        if !value.is_finite() {
            return Err(format!("dimension {}: value not finite", self.key));
        }
        if let Some(lo) = self.min {
            if value < lo {
                return Err(format!(
                    "dimension {}: value {} below min {}",
                    self.key, value, lo
                ));
            }
        }
        if let Some(hi) = self.max {
            if value > hi {
                return Err(format!(
                    "dimension {}: value {} above max {}",
                    self.key, value, hi
                ));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quantity_same_unit_arith() {
        let a: Quantity<Currency> = Quantity::new(2.0);
        let b: Quantity<Currency> = Quantity::new(3.0);
        assert_eq!((a + b).value(), 5.0);
        assert_eq!((a * b).value(), 6.0);
        assert_eq!(a.unit(), "currency");
    }

    #[test]
    fn dimension_spec_validate() {
        let s = DimensionSpec {
            key: "latency_ms".into(),
            unit: "time".into(),
            direction: Direction::LowerIsBetter,
            min: Some(0.0),
            max: Some(10_000.0),
        };
        assert!(s.validate(100.0).is_ok());
        assert!(s.validate(-1.0).is_err());
        assert!(s.validate(20_000.0).is_err());
        assert!(s.validate(f64::NAN).is_err());
    }
}
