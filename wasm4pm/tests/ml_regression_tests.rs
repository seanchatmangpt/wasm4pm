use wasm4pm::ml::regression::regression_internal;

#[test]
fn test_regression_internal_basic() {
    let x = [1.0, 2.0, 3.0, 4.0, 5.0];
    let y = [2.0, 4.0, 6.0, 8.0, 10.0];

    let result = regression_internal(&x, &y);

    assert!((result.slope - 2.0).abs() < 1e-10);
    assert!(result.intercept.abs() < 1e-10);
    assert!((result.r_squared - 1.0).abs() < 1e-10);
}

#[test]
fn test_regression_internal_with_intercept() {
    let x = [1.0, 2.0, 3.0, 4.0, 5.0];
    let y = [3.0, 5.0, 7.0, 9.0, 11.0];

    let result = regression_internal(&x, &y);

    assert!((result.slope - 2.0).abs() < 1e-10);
    assert!((result.intercept - 1.0).abs() < 1e-10);
    assert!((result.r_squared - 1.0).abs() < 1e-10);
}

#[test]
fn test_regression_internal_unrolled() {
    // 6 points to test unrolling + remainder
    let x = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
    let y = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0];

    let result = regression_internal(&x, &y);

    assert!((result.slope - 1.0).abs() < 1e-10);
    assert!(result.intercept.abs() < 1e-10);
    assert!((result.r_squared - 1.0).abs() < 1e-10);
}

#[test]
fn test_regression_internal_empty() {
    let x: [f64; 0] = [];
    let y: [f64; 0] = [];

    let result = regression_internal(&x, &y);

    assert_eq!(result.slope, 0.0);
    assert_eq!(result.intercept, 0.0);
    assert_eq!(result.r_squared, 0.0);
    assert_eq!(result.mae, 0.0);
    assert_eq!(result.rmse, 0.0);
    assert_eq!(result.residual_std, 0.0);
}

// ---------------------------------------------------------------------------
// Rank-2 domain-contract tests for the new MAE / RMSE / residual_std fields.
// ---------------------------------------------------------------------------

/// Domain contract: a perfect linear fit has zero residual error on every
/// metric. RMSE ≥ MAE always (Jensen's inequality), with equality iff every
/// residual has the same magnitude — including the zero-residual case here.
#[test]
fn perfect_fit_has_zero_error_metrics() {
    let x = [1.0, 2.0, 3.0, 4.0, 5.0];
    let y = [2.0, 4.0, 6.0, 8.0, 10.0]; // y = 2x
    let result = regression_internal(&x, &y);

    assert!(
        result.mae < 1e-12,
        "perfect fit MAE should be 0, got {}",
        result.mae
    );
    assert!(
        result.rmse < 1e-12,
        "perfect fit RMSE should be 0, got {}",
        result.rmse
    );
    assert!(
        result.residual_std < 1e-12,
        "perfect fit residual_std should be 0, got {}",
        result.residual_std
    );
}

/// Domain contract (Jensen's inequality): for any sample of residuals,
/// RMSE >= MAE. Equality holds only when |residuals| are constant.
#[test]
fn rmse_dominates_mae_for_noisy_fit() {
    let x = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0];
    let y = [2.5, 3.6, 6.4, 7.5, 10.6, 11.2, 14.3, 15.9];
    let result = regression_internal(&x, &y);
    assert!(result.mae > 0.0, "noisy fit must have nonzero MAE");
    assert!(
        result.rmse >= result.mae - 1e-12,
        "Jensen's inequality violated: rmse={} < mae={}",
        result.rmse,
        result.mae
    );
}

/// Domain contract: residual_std uses the n-2 denominator (degrees of freedom
/// minus 2 free parameters: slope + intercept), so it is strictly larger than
/// the biased rmse for the same residuals. For n=4, ratio is sqrt(4/2) = sqrt(2).
#[test]
fn residual_std_uses_unbiased_denominator() {
    let x = [1.0, 2.0, 3.0, 4.0];
    let y = [1.0, 2.1, 2.9, 4.1]; // close to y=x, small residuals
    let result = regression_internal(&x, &y);

    // residual_std^2 * (n - 2) = rmse^2 * n  →  ratio = sqrt(n / (n-2))
    let expected_ratio = (4.0_f64 / 2.0).sqrt();
    let actual_ratio = result.residual_std / result.rmse;
    assert!(
        (actual_ratio - expected_ratio).abs() < 1e-9,
        "residual_std/rmse should equal sqrt(n/(n-2))={}, got {}",
        expected_ratio,
        actual_ratio
    );
}

/// Edge case: n <= 2 leaves residual_std undefined (0 dof), so it returns 0.0.
#[test]
fn residual_std_returns_zero_for_underdetermined_fit() {
    let r = regression_internal(&[1.0, 2.0], &[3.0, 5.0]);
    assert!(r.mae < 1e-12 && r.rmse < 1e-12);
    assert_eq!(r.residual_std, 0.0);
}

#[test]
fn test_regression_internal_noisy() {
    let x = [1.0, 2.0, 3.0, 4.0, 5.0];
    let y = [2.1, 3.9, 6.2, 7.8, 10.1];

    let result = regression_internal(&x, &y);

    // Roughly slope 2.0
    assert!((result.slope - 2.0).abs() < 0.1);
    assert!(result.r_squared > 0.9);
}
