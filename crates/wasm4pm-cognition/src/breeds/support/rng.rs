use rand::SeedableRng;
use rand::rngs::SmallRng;

/// The single entry point for deterministic RNG across all cognition breeds.
/// Always seeded with 42 to ensure bit-exact reproducibility (determinism poka-yoke).
pub fn seeded_rng() -> SmallRng {
    SmallRng::seed_from_u64(42)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::RngCore;

    #[test]
    fn test_determinism_poka_yoke() {
        // Rank-1 property test: two instances must produce the exact same sequence.
        let mut rng1 = seeded_rng();
        let mut rng2 = seeded_rng();
        
        for _ in 0..100 {
            assert_eq!(rng1.next_u64(), rng2.next_u64(), "RNG streams must be bit-exact identical");
        }
    }
}
