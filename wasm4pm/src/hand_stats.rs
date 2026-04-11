//! Hand-rolled statistics to replace statrs dependency
//!
//! This provides median and percentile calculations without
//! pulling in nalgebra and the full statrs library (~200KB savings).

use chrono::{DateTime, TimeZone, Utc};
use std::ops::Deref;

/// Data struct matching statrs::statistics::Data interface
///
/// This provides a compatible API with statrs::statistics::Data
/// for code that uses `Data::new(vec).median()` pattern.
#[derive(Clone, Debug)]
pub struct DataContainer {
    data: Vec<f64>,
}

impl DataContainer {
    /// Create a new DataContainer from a Vec<f64>
    pub fn new(data: Vec<f64>) -> Self {
        Self { data }
    }

    /// Calculate median of the data
    pub fn median(&self) -> f64 {
        median(&mut self.data.clone()).unwrap_or(0.0)
    }

    /// Calculate mean of the data
    pub fn mean(&self) -> f64 {
        mean(&self.data).unwrap_or(0.0)
    }

    /// Calculate arbitrary percentile
    pub fn percentile(&self, p: f64) -> f64 {
        percentile(&mut self.data.clone(), p).unwrap_or(0.0)
    }

    /// Calculate standard deviation
    pub fn std_deviation(&self) -> f64 {
        std_deviation(&self.data).unwrap_or(0.0)
    }

    /// Get the underlying data
    pub fn as_slice(&self) -> &[f64] {
        &self.data
    }
}

// Implement Data trait for DataContainer
impl Data for DataContainer {
    fn median(&self) -> Option<f64> {
        Some(median(&mut self.data.clone()).unwrap_or(0.0))
    }

    fn mean(&self) -> Option<f64> {
        mean(&self.data)
    }

    fn percentile(&self, p: f64) -> Option<f64> {
        Some(percentile(&mut self.data.clone(), p).unwrap_or(0.0))
    }

    fn std_deviation(&self) -> Option<f64> {
        std_deviation(&self.data)
    }
}

// Type alias for compatibility
pub use DataContainer as Data_new;

/// Calculate median of a slice of f64 values
///
/// # Examples
/// ```
/// let mut data = vec![5.0, 2.0, 8.0, 1.0, 9.0];
/// assert_eq!(median(&mut data), Some(5.0));
/// ```
pub fn median(data: &mut [f64]) -> Option<f64> {
    if data.is_empty() {
        return None;
    }
    data.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let len = data.len();
    if len.is_multiple_of(2) {
        Some((data[len / 2 - 1] + data[len / 2]) / 2.0)
    } else {
        Some(data[len / 2])
    }
}

/// Calculate mean of a slice of f64 values
pub fn mean(data: &[f64]) -> Option<f64> {
    if data.is_empty() {
        return None;
    }
    Some(data.iter().sum::<f64>() / data.len() as f64)
}

/// Calculate p95 (95th percentile) of a slice
pub fn percentile_95(data: &mut [f64]) -> Option<f64> {
    percentile(data, 95.0)
}

/// Calculate arbitrary percentile
///
/// # Arguments
/// * `data` - Mutable slice of f64 values (will be sorted in place)
/// * `p` - Percentile to calculate (0.0 to 100.0)
///
/// # Examples
/// ```
/// let mut data = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0];
/// assert_eq!(percentile(&mut data, 95.0), Some(10.0));
/// ```
pub fn percentile(data: &mut [f64], p: f64) -> Option<f64> {
    if data.is_empty() || !(0.0..=100.0).contains(&p) {
        return None;
    }
    data.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let idx = (p / 100.0 * (data.len() - 1) as f64).round() as usize;
    Some(data[idx.min(data.len() - 1)])
}

/// Calculate standard deviation of a slice
pub fn std_deviation(data: &[f64]) -> Option<f64> {
    if data.is_empty() {
        return None;
    }
    let avg = mean(data)?;
    let variance = data.iter().map(|&x| (x - avg).powi(2)).sum::<f64>() / data.len() as f64;
    Some(variance.sqrt())
}

/// Calculate minimum value in a slice
pub fn min(data: &[f64]) -> Option<f64> {
    if data.is_empty() {
        return None;
    }
    data.iter().copied().reduce(|a, b| a.min(b))
}

/// Calculate maximum value in a slice
pub fn max(data: &[f64]) -> Option<f64> {
    if data.is_empty() {
        return None;
    }
    data.iter().copied().reduce(|a, b| a.max(b))
}

/// Calculate median of timestamp values
///
/// Converts timestamps to milliseconds since epoch for calculation
pub fn median_timestamp(data: &mut [DateTime<Utc>]) -> Option<DateTime<Utc>> {
    if data.is_empty() {
        return None;
    }
    let mut ms: Vec<i64> = data
        .iter()
        .map(|ts: &DateTime<Utc>| ts.timestamp_millis())
        .collect();
    ms.sort();
    let len = ms.len();
    let median_ms = if len.is_multiple_of(2) {
        (ms[len / 2 - 1] + ms[len / 2]) / 2
    } else {
        ms[len / 2]
    };
    Some(Utc.timestamp_millis_opt(median_ms).unwrap())
}

/// Statistics trait matching statrs::statistics::Data interface
///
/// This trait provides a compatible API with statrs::statistics::Data
/// to allow easy switching between statrs and hand-rolled statistics.
pub trait Data {
    /// Calculate median of the data
    fn median(&self) -> Option<f64>;

    /// Calculate mean of the data
    fn mean(&self) -> Option<f64>;

    /// Calculate arbitrary percentile
    fn percentile(&self, p: f64) -> Option<f64>;

    /// Calculate standard deviation
    fn std_deviation(&self) -> Option<f64>;
}

/// Median trait matching statrs::statistics::Median interface
///
/// This trait provides a compatible API with statrs::statistics::Median
/// for computing median values on mutable data references.
pub trait Median<T> {
    /// Compute the median value of the data
    fn median(&mut self) -> Option<T>;
}

impl Median<f64> for Vec<f64> {
    fn median(&mut self) -> Option<f64> {
        median(self)
    }
}

impl Median<f64> for &mut [f64] {
    fn median(&mut self) -> Option<f64> {
        median(self)
    }
}

impl Data for Vec<f64> {
    fn median(&self) -> Option<f64> {
        let mut sorted = self.clone();
        median(&mut sorted)
    }

    fn mean(&self) -> Option<f64> {
        mean(self)
    }

    fn percentile(&self, p: f64) -> Option<f64> {
        let mut sorted = self.clone();
        percentile(&mut sorted, p)
    }

    fn std_deviation(&self) -> Option<f64> {
        std_deviation(self)
    }
}

impl Data for &[f64] {
    fn median(&self) -> Option<f64> {
        let mut sorted = self.to_vec();
        median(&mut sorted)
    }

    fn mean(&self) -> Option<f64> {
        mean(self)
    }

    fn percentile(&self, p: f64) -> Option<f64> {
        let mut sorted = self.to_vec();
        percentile(&mut sorted, p)
    }

    fn std_deviation(&self) -> Option<f64> {
        std_deviation(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_median() {
        let mut data = vec![5.0, 2.0, 8.0, 1.0, 9.0];
        assert_eq!(median(&mut data), Some(5.0));
    }

    #[test]
    fn test_median_even() {
        let mut data = vec![5.0, 2.0, 8.0, 1.0];
        assert_eq!(median(&mut data), Some(3.5));
    }

    #[test]
    fn test_median_empty() {
        let mut data: Vec<f64> = vec![];
        assert_eq!(median(&mut data), None);
    }

    #[test]
    fn test_percentile_95() {
        let mut data = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0];
        assert_eq!(percentile_95(&mut data), Some(10.0));
    }

    #[test]
    fn test_percentile_50() {
        let mut data = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        assert_eq!(percentile(&mut data, 50.0), Some(3.0));
    }

    #[test]
    fn test_percentile_invalid() {
        let mut data = vec![1.0, 2.0, 3.0];
        assert_eq!(percentile(&mut data, -1.0), None);
        assert_eq!(percentile(&mut data, 101.0), None);
    }

    #[test]
    fn test_mean() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        assert_eq!(mean(&data), Some(3.0));
    }

    #[test]
    fn test_mean_empty() {
        let data: Vec<f64> = vec![];
        assert_eq!(mean(&data), None);
    }

    #[test]
    fn test_std_deviation() {
        let data = vec![2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0];
        // Mean = 5.0, Variance = 4.0, StdDev = 2.0
        assert_eq!(std_deviation(&data), Some(2.0));
    }

    #[test]
    fn test_min_max() {
        let data = vec![5.0, 2.0, 8.0, 1.0, 9.0];
        assert_eq!(min(&data), Some(1.0));
        assert_eq!(max(&data), Some(9.0));
    }

    #[test]
    fn test_data_trait_median() {
        let data = vec![5.0, 2.0, 8.0, 1.0, 9.0];
        assert_eq!(data.median(), Some(5.0));
    }

    #[test]
    fn test_data_trait_mean() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        assert_eq!(data.mean(), Some(3.0));
    }

    #[test]
    fn test_data_trait_percentile() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0];
        assert_eq!(data.percentile(95.0), Some(10.0));
    }

    #[test]
    fn test_data_trait_std_deviation() {
        let data = vec![2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0];
        assert_eq!(data.std_deviation(), Some(2.0));
    }
}
