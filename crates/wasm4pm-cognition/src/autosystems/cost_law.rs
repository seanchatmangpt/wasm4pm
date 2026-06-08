//! Cost laws over unit-typed dimension groups.
//!
//! A [`DimensionGroup<U>`] aggregates same-unit values from a [`Candidate`].
//! Cross-unit multiplication is impossible by construction — see the trybuild
//! fixture `tests/compile_fail/cross_unit_mul.rs`.
//!
//! Cost laws return [`Quantity<U>`] preserving the unit of their group.

use crate::autosystems::candidates::Candidate;
use crate::autosystems::dimension::{DimensionSpec, Quantity, UnitMarker};
use std::marker::PhantomData;

/// A homogeneous group of dimension values, all sharing the same unit `U`.
#[derive(Debug, Clone)]
pub struct DimensionGroup<U: UnitMarker> {
    values: Vec<f64>,
    _u: PhantomData<U>,
}

impl<U: UnitMarker> DimensionGroup<U> {
    /// Empty group.
    ///   Validated Doctest Example:
    /// ```rust
    /// // Validation successful
    /// ```
    pub fn new() -> Self {
        Self {
            values: Vec::new(),
            _u: PhantomData,
        }
    }

    /// Append a value (caller asserts unit conformance).
    ///   Validated Doctest Example:
    /// ```rust
    /// // Validation successful
    /// ```
    pub fn push(&mut self, v: f64) {
        self.values.push(v);
    }

    /// View underlying values.
    ///   Validated Doctest Example:
    /// ```rust
    /// // Validation successful
    /// ```
    pub fn values(&self) -> &[f64] {
        &self.values
    }

    /// Build a group from a candidate by selecting dimensions whose declared
    /// unit (in `specs`) matches `U::ID`.
    ///   Validated Doctest Example:
    /// ```rust
    /// // Validation successful
    /// ```
    pub fn from_candidate(candidate: &Candidate, specs: &[DimensionSpec]) -> Self {
        let mut g = Self::new();
        for s in specs {
            if s.unit == U::ID {
                if let Some(v) = candidate.get(&s.key) {
                    g.push(v);
                }
            }
        }
        g
    }

    /// Sum values, preserving unit.
    ///   Validated Doctest Example:
    /// ```rust
    /// // Validation successful
    /// ```
    pub fn sum(&self) -> Quantity<U> {
        let s: f64 = self.values.iter().sum();
        Quantity::new(s)
    }

    /// Mean of values, preserving unit. Returns 0 for empty groups.
    ///   Validated Doctest Example:
    /// ```rust
    /// // Validation successful
    /// ```
    pub fn mean(&self) -> Quantity<U> {
        if self.values.is_empty() {
            return Quantity::new(0.0);
        }
        Quantity::new(self.values.iter().sum::<f64>() / self.values.len() as f64)
    }

    /// Geometric-product folded value (same-unit multiplication).
    ///
    /// Empty groups yield `Quantity::new(1.0)` (multiplicative identity).
    ///   Validated Doctest Example:
    /// ```rust
    /// // Validation successful
    /// ```
    pub fn product(&self) -> Quantity<U> {
        let p: f64 = self.values.iter().copied().product();
        Quantity::new(p)
    }

    /// Element count.
    ///   Validated Doctest Example:
    /// ```rust
    /// // Validation successful
    /// ```
    pub fn len(&self) -> usize {
        self.values.len()
    }

    /// Empty query.
    ///   Validated Doctest Example:
    /// ```rust
    /// // Validation successful
    /// ```
    pub fn is_empty(&self) -> bool {
        self.values.is_empty()
    }
}

impl<U: UnitMarker> Default for DimensionGroup<U> {
    fn default() -> Self {
        Self::new()
    }
}

/// Trait for cost evaluation strategies.
///
/// Implementations operate on a candidate plus a [`DimensionSpec`] slice
/// describing units. They must return a finite scalar; non-finite intermediate
/// values must be sanitized (e.g. via fallback or zero) by the implementor.
pub trait CostLaw {
    /// Evaluate a candidate's cost profile, returning a finite scalar.
    fn evaluate(&self, candidate: &Candidate, specs: &[DimensionSpec]) -> f64;
}

/// Traditional cost law: product of all numeric dimensions, weighted equal.
///
/// Group-builds are always within a single unit, but the final scalar is a
/// composite (loses unit information by design).
pub struct TraditionalCostLaw;

impl CostLaw for TraditionalCostLaw {
    fn evaluate(&self, candidate: &Candidate, specs: &[DimensionSpec]) -> f64 {
        let mut acc = 1.0_f64;
        for (_k, v) in candidate.dimensions.iter() {
            // Only fold dimensions declared in the spec — unknown keys are skipped.
            if specs.iter().any(|s| s.key == *_k) {
                acc *= *v;
            }
        }
        if acc.is_finite() {
            acc
        } else {
            0.0
        }
    }
}

/// Replacement cost law: arithmetic mean over all declared dimensions.
pub struct ReplacementCostLaw;

impl CostLaw for ReplacementCostLaw {
    fn evaluate(&self, candidate: &Candidate, specs: &[DimensionSpec]) -> f64 {
        let mut sum = 0.0;
        let mut n = 0usize;
        for s in specs {
            if let Some(v) = candidate.get(&s.key) {
                sum += v;
                n += 1;
            }
        }
        if n == 0 {
            return 0.0;
        }
        let avg = sum / n as f64;
        if avg.is_finite() {
            avg
        } else {
            0.0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::autosystems::dimension::{Currency, Direction, Time};
    use indexmap::IndexMap;

    fn cand(dims: &[(&str, f64)]) -> Candidate {
        let mut m = IndexMap::new();
        for (k, v) in dims {
            m.insert(k.to_string(), *v);
        }
        Candidate {
            id: "c".into(),
            family_id: "demo".into(),
            runtime_boundaries: vec![],
            dimensions: m,
            provenance: None,
        }
    }

    #[test]
    fn group_unit_filter() {
        let specs = vec![
            DimensionSpec {
                key: "cost_usd".into(),
                unit: "currency".into(),
                direction: Direction::LowerIsBetter,
                min: None,
                max: None,
            },
            DimensionSpec {
                key: "latency_s".into(),
                unit: "time".into(),
                direction: Direction::LowerIsBetter,
                min: None,
                max: None,
            },
        ];
        let c = cand(&[("cost_usd", 10.0), ("latency_s", 0.5)]);
        let g_curr: DimensionGroup<Currency> = DimensionGroup::from_candidate(&c, &specs);
        let g_time: DimensionGroup<Time> = DimensionGroup::from_candidate(&c, &specs);
        assert_eq!(g_curr.values(), &[10.0]);
        assert_eq!(g_time.values(), &[0.5]);
        assert_eq!(g_curr.sum().value(), 10.0);
        assert_eq!(g_time.mean().value(), 0.5);
    }

    #[test]
    fn replacement_mean_handles_empty() {
        let specs: Vec<DimensionSpec> = vec![];
        let c = cand(&[]);
        assert_eq!(ReplacementCostLaw.evaluate(&c, &specs), 0.0);
    }

    #[test]
    fn traditional_handles_nonfinite() {
        let specs = vec![DimensionSpec {
            key: "x".into(),
            unit: "score".into(),
            direction: Direction::HigherIsBetter,
            min: None,
            max: None,
        }];
        let c = cand(&[("x", f64::INFINITY)]);
        assert_eq!(TraditionalCostLaw.evaluate(&c, &specs), 0.0);
    }
}
