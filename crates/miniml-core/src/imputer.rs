use wasm_bindgen::prelude::*;

/// Simple Imputer - Missing value imputation
/// Uses NaN as missing value indicator
#[wasm_bindgen]
pub struct SimpleImputer {
    strategy: String,  // "mean", "median", "most_frequent", "constant"
    fill_value: f64,
    statistics: Vec<f64>,
    n_features: usize,
    fitted: bool,
}

#[wasm_bindgen]
impl SimpleImputer {
    #[wasm_bindgen(getter, js_name = "nFeatures")]
    pub fn n_features(&self) -> usize { self.n_features }

    #[wasm_bindgen(getter, js_name = "strategy")]
    pub fn strategy_js(&self) -> String { self.strategy.clone() }

    /// Fit imputer to data (compute imputation values per feature)
    #[wasm_bindgen]
    pub fn fit(&mut self, data: &[f64]) -> Result<(), JsError> {
        let n = data.len() / self.n_features;

        for f in 0..self.n_features {
            let values: Vec<f64> = (0..n)
                .map(|i| data[i * self.n_features + f])
                .filter(|&v| !v.is_nan())
                .collect();

            let stat = match self.strategy.as_str() {
                "mean" => {
                    if values.is_empty() { 0.0 }
                    else { values.iter().sum::<f64>() / values.len() as f64 }
                }
                "median" => {
                    if values.is_empty() { 0.0 }
                    else {
                        let mut sorted = values.clone();
                        sorted.sort_unstable_by(|a, b| a.partial_cmp(b).unwrap());
                        if sorted.len().is_multiple_of(2) {
                            (sorted[sorted.len() / 2 - 1] + sorted[sorted.len() / 2]) / 2.0
                        } else {
                            sorted[sorted.len() / 2]
                        }
                    }
                }
                "most_frequent" => {
                    if values.is_empty() { 0.0 }
                    else {
                        let mut counts: Vec<(f64, usize)> = Vec::new();
                        for &v in &values {
                            if let Some(entry) = counts.iter_mut().find(|(val, _)| (*val - v).abs() < 1e-10) {
                                entry.1 += 1;
                            } else {
                                counts.push((v, 1));
                            }
                        }
                        counts.sort_by_key(|(_, c)| *c);
                        counts.last().map(|&(v, _)| v).unwrap_or(0.0)
                    }
                }
                "constant" => self.fill_value,
                _ => 0.0,
            };

            if f >= self.statistics.len() {
                self.statistics.push(stat);
            } else {
                self.statistics[f] = stat;
            }
        }

        self.fitted = true;
        Ok(())
    }

    /// Transform data by imputing missing values
    #[wasm_bindgen]
    pub fn transform(&self, data: &[f64]) -> Vec<f64> {
        let n = data.len() / self.n_features;
        let mut result = Vec::with_capacity(data.len());

        for i in 0..n {
            for f in 0..self.n_features {
                let val = data[i * self.n_features + f];
                result.push(if val.is_nan() {
                    self.statistics[f]
                } else {
                    val
                });
            }
        }

        result
    }

    /// Fit and transform in one operation
    #[wasm_bindgen(js_name = "fitTransform")]
    pub fn fit_transform(&mut self, data: &[f64]) -> Result<Vec<f64>, JsError> {
        self.fit(data)?;
        Ok(self.transform(data))
    }

    #[wasm_bindgen(js_name = "toString")]
    pub fn to_string_js(&self) -> String {
        format!("SimpleImputer(strategy={}, fitted={})", self.strategy, self.fitted)
    }
}

#[wasm_bindgen(js_name = "simpleImputer")]
pub fn simple_imputer(n_features: usize, strategy: String, fill_value: f64) -> SimpleImputer {
    let strategy_valid = match strategy.to_lowercase().as_str() {
        "mean" | "median" | "most_frequent" | "constant" => strategy.to_lowercase(),
        _ => "mean".to_string(),
    };

    SimpleImputer {
        strategy: strategy_valid,
        fill_value,
        statistics: vec![0.0; n_features],
        n_features,
        fitted: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mean_imputation() {
        let data = vec![
            1.0, f64::NAN,
            2.0, 4.0,
            3.0, 6.0,
        ];
        let mut imputer = simple_imputer(2, "mean".to_string(), 0.0);
        let result = imputer.fit_transform(&data).unwrap();

        // Feature 0 mean = 2, Feature 1 mean = 5
        assert_eq!(result[0], 1.0);
        assert_eq!(result[1], 5.0);  // NaN replaced with 5
        assert_eq!(result[2], 2.0);
        assert_eq!(result[3], 4.0);
    }

    #[test]
    fn test_median_imputation() {
        let data = vec![
            1.0, f64::NAN,
            2.0, 2.0,
            100.0, 8.0,
        ];
        let mut imputer = simple_imputer(2, "median".to_string(), 0.0);
        let result = imputer.fit_transform(&data).unwrap();

        // Feature 0 median = 2, Feature 1 median = 5
        assert_eq!(result[0], 1.0);
        assert_eq!(result[1], 5.0);  // NaN replaced with median 5
    }

    #[test]
    fn test_constant_imputation() {
        let data = vec![1.0, f64::NAN, 3.0];
        let mut imputer = simple_imputer(1, "constant".to_string(), -1.0);
        let result = imputer.fit_transform(&data).unwrap();

        assert_eq!(result[0], 1.0);
        assert_eq!(result[1], -1.0);  // NaN replaced with -1
        assert_eq!(result[2], 3.0);
    }

    #[test]
    fn test_most_frequent_imputation() {
        let data = vec![
            1.0, f64::NAN,
            1.0, 2.0,
            2.0, 2.0,
        ];
        let mut imputer = simple_imputer(2, "most_frequent".to_string(), 0.0);
        let result = imputer.fit_transform(&data).unwrap();

        // Feature 0 most frequent = 1, Feature 1 most frequent = 2
        assert_eq!(result[0], 1.0);
        assert_eq!(result[1], 2.0);  // NaN replaced with 2
    }
}
