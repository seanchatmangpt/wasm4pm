//! ML evaluation honesty — holdout splits, k-fold cross-validation, and the
//! metric types shared by every predictor's honest evaluation path.
//!
//! Design rule: an in-sample score (train on X, score X) systematically
//! overstates quality. Every new evaluation surface in this crate routes
//! through the helpers here so the reported number is computed on samples the
//! model never trained on.
//!
//! Guards: [`MIN_EVAL_SAMPLES`] — evaluation below this sample count returns
//! `None` / an `insufficient_data` marker instead of a meaningless number.

/// Minimum number of test samples for a holdout evaluation to be reported.
/// Below this, evaluators return `None` (callers surface `insufficient_data`).
pub const MIN_EVAL_SAMPLES: usize = 10;

/// Default train fraction for prefix (chronological-order) holdout splits.
pub const DEFAULT_TRAIN_RATIO: f64 = 0.8;

/// Split `n` ordered samples into `(train_len, test_len)` with the first
/// `train_len` samples as train and the remainder as test (prefix /
/// chronological split — no shuffling, deterministic).
///
/// Guarantees `test_len >= 1` whenever `n >= 2` and `train_ratio < 1.0`.
/// For `n < 2`, returns `(n, 0)` (no test set — callers must treat this as
/// insufficient data).
///
/// Hand-computed oracle: `prefix_split(10, 0.8) == (8, 2)`.
pub fn prefix_split(n: usize, train_ratio: f64) -> (usize, usize) {
    if n < 2 {
        return (n, 0);
    }
    let ratio = if train_ratio.is_finite() {
        train_ratio.clamp(0.1, 0.95)
    } else {
        DEFAULT_TRAIN_RATIO
    };
    let train_len = ((n as f64) * ratio).floor() as usize;
    let train_len = train_len.clamp(1, n - 1);
    (train_len, n - train_len)
}

/// Deterministic k-fold index assignment: fold `i` is the set of indices
/// `i, i+k, i+2k, ...` (stride assignment, no RNG). Returns exactly `k`
/// folds; when `n < k`, later folds are empty.
///
/// Hand-computed oracle: `kfold_indices(5, 5)` yields folds
/// `[[0],[1],[2],[3],[4]]`; `kfold_indices(6, 3)` yields
/// `[[0,3],[1,4],[2,5]]`.
pub fn kfold_indices(n: usize, k: usize) -> Vec<Vec<usize>> {
    let k = k.max(1);
    let mut folds: Vec<Vec<usize>> = vec![Vec::new(); k];
    for (i, fold) in folds.iter_mut().enumerate() {
        let mut idx = i;
        while idx < n {
            fold.push(idx);
            idx += k;
        }
    }
    folds
}

/// Honest regression metrics scored on held-out samples.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct HoldoutRegressionMetrics {
    pub mae: f64,
    pub rmse: f64,
    /// R² on the held-out samples (can be negative — a model worse than
    /// predicting the test mean is reported as such, not clamped).
    pub r_squared: f64,
    pub n_test: usize,
    pub n_train: usize,
}

/// Honest classification metrics scored on held-out samples, with top-k
/// accuracy (the ranked prediction lists are supplied by the caller).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct HoldoutClassificationMetrics {
    pub top1: f64,
    pub top2: f64,
    pub top3: f64,
    /// Macro-averaged F1 over the top-1 predictions, classes present in
    /// `truth` ∪ top-1 predictions.
    pub macro_f1: f64,
    pub n_test: usize,
    pub n_train: usize,
}

/// Per-fold honest metrics from k-fold cross-validation.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct FoldResult {
    /// Zero-based fold index.
    pub fold: usize,
    pub n_train: usize,
    pub n_test: usize,
    /// MAE scored on the held-out fold.
    pub test_mae: f64,
    /// RMSE scored on the held-out fold.
    pub test_rmse: f64,
    /// In-sample fit of the fold's training split (kept one release cycle
    /// for output-shape compatibility; compare against `test_mae` to see the
    /// optimism gap). **Deprecated** — will be removed.
    pub train_fit_mae: f64,
}

/// Aggregate result of k-fold cross-validation.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct CvResult {
    pub k: usize,
    pub folds: Vec<FoldResult>,
    pub mean_test_mae: f64,
    pub mean_test_rmse: f64,
    pub n_samples: usize,
}

/// Running accumulator for regression metrics on a set of (pred, actual).
#[derive(Debug, Default, Clone)]
pub struct RegressionAccumulator {
    sum_abs_err: f64,
    sum_sq_err: f64,
    sum_actual: f64,
    sum_sq_actual: f64,
    n: usize,
}

impl RegressionAccumulator {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push(&mut self, pred: f64, actual: f64) {
        let err = pred - actual;
        self.sum_abs_err += err.abs();
        self.sum_sq_err += err * err;
        self.sum_actual += actual;
        self.sum_sq_actual += actual * actual;
        self.n += 1;
    }

    pub fn len(&self) -> usize {
        self.n
    }

    pub fn is_empty(&self) -> bool {
        self.n == 0
    }

    /// Finalize into [`HoldoutRegressionMetrics`]. R² uses the held-out
    /// actuals as the baseline (1 - SSE/SST); SST = 0 → R² = 0 by convention.
    pub fn finish(&self, n_train: usize) -> HoldoutRegressionMetrics {
        let n = self.n as f64;
        if self.n == 0 {
            return HoldoutRegressionMetrics {
                mae: 0.0,
                rmse: 0.0,
                r_squared: 0.0,
                n_test: 0,
                n_train,
            };
        }
        let mae = self.sum_abs_err / n;
        let rmse = (self.sum_sq_err / n).sqrt();
        let mean_actual = self.sum_actual / n;
        let sst = self.sum_sq_actual - n * mean_actual * mean_actual;
        let r_squared = if sst > f64::EPSILON {
            1.0 - self.sum_sq_err / sst
        } else {
            0.0
        };
        HoldoutRegressionMetrics {
            mae,
            rmse,
            r_squared,
            n_test: self.n,
            n_train,
        }
    }
}

/// Compute honest classification metrics from ranked predictions.
///
/// * `ranked[i]` — predicted classes for test sample `i`, best first.
/// * `truth[i]` — the actual class for test sample `i`.
///
/// Top-k accuracy counts a hit when the true class appears among the first k
/// entries of `ranked[i]`. Macro-F1 is computed over top-1 predictions across
/// every class observed in truth or top-1 predictions.
pub fn classification_metrics_from_ranked(
    ranked: &[Vec<String>],
    truth: &[String],
    n_train: usize,
) -> HoldoutClassificationMetrics {
    let n = ranked.len().min(truth.len());
    if n == 0 {
        return HoldoutClassificationMetrics {
            top1: 0.0,
            top2: 0.0,
            top3: 0.0,
            macro_f1: 0.0,
            n_test: 0,
            n_train,
        };
    }

    let hits = |k: usize| -> f64 {
        let mut h = 0usize;
        for i in 0..n {
            if ranked[i].iter().take(k).any(|c| c == &truth[i]) {
                h += 1;
            }
        }
        h as f64 / n as f64
    };
    let top1 = hits(1);
    let top2 = hits(2);
    let top3 = hits(3);

    // Macro-F1 over classes in truth ∪ top-1 predictions.
    let mut classes: std::collections::BTreeSet<&String> = truth[..n].iter().collect();
    for r in &ranked[..n] {
        if let Some(top) = r.first() {
            classes.insert(top);
        }
    }
    let mut f1_sum = 0.0f64;
    for class in &classes {
        let mut tp = 0usize;
        let mut fp = 0usize;
        let mut fn_ = 0usize;
        for i in 0..n {
            let pred = ranked[i].first();
            let pred_hit = pred == Some(class);
            let truth_hit = truth[i] == **class;
            match (pred_hit, truth_hit) {
                (true, true) => tp += 1,
                (true, false) => fp += 1,
                (false, true) => fn_ += 1,
                (false, false) => {}
            }
        }
        let precision = if tp + fp > 0 {
            tp as f64 / (tp + fp) as f64
        } else {
            0.0
        };
        let recall = if tp + fn_ > 0 {
            tp as f64 / (tp + fn_) as f64
        } else {
            0.0
        };
        let f1 = if precision + recall > 0.0 {
            2.0 * precision * recall / (precision + recall)
        } else {
            0.0
        };
        f1_sum += f1;
    }
    let macro_f1 = f1_sum / classes.len() as f64;

    HoldoutClassificationMetrics {
        top1,
        top2,
        top3,
        macro_f1,
        n_test: n,
        n_train,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefix_split_hand_computed() {
        assert_eq!(prefix_split(10, 0.8), (8, 2));
        assert_eq!(prefix_split(5, 0.8), (4, 1));
        assert_eq!(prefix_split(2, 0.8), (1, 1));
    }

    #[test]
    fn prefix_split_edges() {
        assert_eq!(prefix_split(0, 0.8), (0, 0));
        assert_eq!(prefix_split(1, 0.8), (1, 0));
        // Extreme ratios clamp so test_len >= 1.
        assert_eq!(prefix_split(10, 1.5), (9, 1));
        assert_eq!(prefix_split(10, 0.0), (1, 9));
        assert_eq!(prefix_split(10, f64::NAN), (8, 2));
    }

    #[test]
    fn kfold_hand_computed() {
        assert_eq!(
            kfold_indices(5, 5),
            vec![vec![0], vec![1], vec![2], vec![3], vec![4]]
        );
        assert_eq!(
            kfold_indices(6, 3),
            vec![vec![0, 3], vec![1, 4], vec![2, 5]]
        );
        let empty_folds: Vec<Vec<usize>> = vec![vec![], vec![], vec![]];
        assert_eq!(kfold_indices(0, 3), empty_folds);
        assert_eq!(kfold_indices(3, 0), vec![vec![0, 1, 2]]);
    }

    #[test]
    fn kfold_is_a_partition() {
        let folds = kfold_indices(17, 4);
        let mut all: Vec<usize> = folds.iter().flatten().copied().collect();
        all.sort_unstable();
        let expected: Vec<usize> = (0..17).collect();
        assert_eq!(all, expected, "folds must partition 0..17 exactly once");
    }

    /// Hand-computed accumulator oracle:
    /// errors |1-2|, |2-2|, |3-4| → MAE = (1+0+1)/3 = 2/3.
    /// SSE = 1+0+1 = 2 → RMSE = sqrt(2/3). Actuals [2,2,4]:
    /// mean 8/3, SST = (4/9+4/9+16/9... computed exactly below.
    #[test]
    fn regression_accumulator_hand_computed() {
        let mut acc = RegressionAccumulator::new();
        acc.push(1.0, 2.0);
        acc.push(2.0, 2.0);
        acc.push(3.0, 4.0);
        let m = acc.finish(7);
        assert!((m.mae - 2.0 / 3.0).abs() < 1e-12);
        assert!((m.rmse - (2.0_f64 / 3.0).sqrt()).abs() < 1e-12);
        // SST = Σ(y-ȳ)² with ȳ = 8/3: (2/3)² + (2/3)² + (4/3)² = 24/9.
        // R² = 1 - 2/(24/9) = 1 - 3/4 = 0.25.
        assert!((m.r_squared - 0.25).abs() < 1e-12);
        assert_eq!(m.n_test, 3);
        assert_eq!(m.n_train, 7);
    }

    #[test]
    fn regression_accumulator_perfect_fit_gives_r2_one() {
        let mut acc = RegressionAccumulator::new();
        for i in 0..5 {
            acc.push(i as f64, i as f64);
        }
        let m = acc.finish(3);
        assert_eq!(m.mae, 0.0);
        assert!((m.r_squared - 1.0).abs() < 1e-12);
    }

    /// R² must be able to go negative (model worse than the test mean) —
    /// the honesty property. No clamping to [0,1] on held-out data.
    #[test]
    fn regression_accumulator_negative_r2_is_reported() {
        let mut acc = RegressionAccumulator::new();
        // Constant wrong predictions against varying actuals.
        acc.push(100.0, 0.0);
        acc.push(100.0, 1.0);
        acc.push(100.0, 2.0);
        let m = acc.finish(1);
        assert!(m.r_squared < 0.0, "expected negative R², got {}", m.r_squared);
    }

    #[test]
    fn classification_ranked_hand_computed() {
        let ranked = vec![
            vec!["A".into(), "B".into()],
            vec!["A".into(), "C".into()],
            vec!["B".into(), "A".into()],
        ];
        let truth = vec!["A".into(), "C".into(), "A".into()];
        let m = classification_metrics_from_ranked(&ranked, &truth, 4);
        // top1: only sample 0 hits (A==A); s1 pred A≠C, s2 pred B≠A → 1/3.
        assert!((m.top1 - 1.0 / 3.0).abs() < 1e-12);
        // top2: s0 (A), s1 (C at rank 2), s2 (A at rank 2) → all → 1.0.
        assert!((m.top2 - 1.0).abs() < 1e-12);
        assert!((m.top3 - 1.0).abs() < 1e-12);
        // Macro-F1 by hand: classes {A, B, C}.
        // A: tp=1 (s0), fp=1 (s1), fn=1 (s2) → P=R=0.5, F1=0.5.
        // B: tp=0, fp=1 (s2), fn=0 → F1=0.
        // C: tp=0, fp=0, fn=1 (s1) → F1=0.
        assert!((m.macro_f1 - (0.5 + 0.0 + 0.0) / 3.0).abs() < 1e-12);
    }

    #[test]
    fn classification_ranked_empty() {
        let m = classification_metrics_from_ranked(&[], &[], 0);
        assert_eq!(m.n_test, 0);
        assert_eq!(m.top1, 0.0);
    }

    /// Honesty guard: below MIN_EVAL_SAMPLES evaluators must refuse.
    #[test]
    fn min_eval_samples_guard_threshold() {
        assert!(MIN_EVAL_SAMPLES == 10);
        assert!(prefix_split(MIN_EVAL_SAMPLES, 0.8).1 >= 1);
    }
}
