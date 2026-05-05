use wasm4pm::ml::regression::{regression_internal, RegressionResult};

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
