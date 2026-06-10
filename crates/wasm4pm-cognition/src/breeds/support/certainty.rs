/// Shortliffe-Buchanan certainty-factor combination.
///
/// Properties (Rank-1, mathematical):
/// - Commutativity for same-sign: `combine(a,b) == combine(b,a)`.
/// - Identity: `combine(x, 0) == x`.
/// - Bounds: result is in `[-1.0, 1.0]` for inputs in `[-1.0, 1.0]`.
pub fn combine_cf(a: f32, b: f32) -> f32 {
    let r = if a >= 0.0 && b >= 0.0 {
        a + b - a * b
    } else if a < 0.0 && b < 0.0 {
        a + b + a * b
    } else {
        let denom = 1.0 - a.abs().min(b.abs());
        if denom.abs() < 1e-9 {
            0.0
        } else {
            (a + b) / denom
        }
    };
    r.clamp(-1.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_combine_cf_both_positive() {
        let result = combine_cf(0.6, 0.4);
        let expected = 0.6_f32 + 0.4 - 0.6 * 0.4;
        assert!((result - expected).abs() < 1e-5);
    }

    #[test]
    fn test_combine_cf_both_negative() {
        let result = combine_cf(-0.3, -0.4);
        let expected = -0.3_f32 + -0.4 + (-0.3 * -0.4);
        assert!((result - expected).abs() < 1e-5);
    }

    #[test]
    fn test_combine_cf_mixed_positive_wins() {
        let result = combine_cf(0.5, -0.2);
        let expected = (0.5_f32 + -0.2) / (1.0 - 0.2_f32);
        assert!((result - expected).abs() < 1e-5);
    }

    #[test]
    fn test_combine_cf_mixed_negative_wins() {
        let result = combine_cf(-0.5, 0.2);
        let expected = (-0.5_f32 + 0.2) / (1.0 - 0.2_f32);
        assert!((result - expected).abs() < 1e-5);
    }
}
