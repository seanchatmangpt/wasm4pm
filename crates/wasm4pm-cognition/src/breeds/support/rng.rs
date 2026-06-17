use rand::rngs::SmallRng;
use rand::SeedableRng;

/// Create a deterministic pseudo-random number generator seeded with 42.
pub fn seeded_rng() -> SmallRng {
    SmallRng::seed_from_u64(42)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::Rng;

    #[test]
    fn test_seeded_rng_is_deterministic() {
        let mut rng1 = seeded_rng();
        let mut rng2 = seeded_rng();

        for _ in 0..100 {
            assert_eq!(rng1.gen::<u64>(), rng2.gen::<u64>());
        }
    }
}
