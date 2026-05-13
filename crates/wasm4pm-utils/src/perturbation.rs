//! Deterministic perturbation utilities for adversarial robustness.
//! Branchless implementation for zero-heap hot paths.

/// A branchless Xorshift64* implementation for deterministic noise.
pub struct Perturbator {
    state: u64,
}

impl Perturbator {
    pub fn new(seed: u64) -> Self {
        // Ensure seed is non-zero
        Self {
            state: if seed == 0 { 0xdeadbeefdeadbeef } else { seed },
        }
    }

    /// Generates a deterministic pseudorandom u64 in a branchless way.
    #[inline(always)]
    pub fn generate(&mut self) -> u64 {
        self.state ^= self.state >> 12;
        self.state ^= self.state << 25;
        self.state ^= self.state >> 27;
        self.state.wrapping_mul(0x2545F4914F6CDD1D)
    }

    /// Perturbs a u64 marking mask based on deterministic noise.
    #[inline(always)]
    pub fn perturb_mask(&mut self, mask: u64, intensity: u64) -> u64 {
        let noise = self.generate();
        // Perturb by selectively flipping bits based on noise and intensity.
        // Branchless: (mask ^ (noise & intensity))
        mask ^ (noise & intensity)
    }
}

impl Iterator for Perturbator {
    type Item = u64;

    #[inline(always)]
    fn next(&mut self) -> Option<u64> {
        Some(self.generate())
    }
}
