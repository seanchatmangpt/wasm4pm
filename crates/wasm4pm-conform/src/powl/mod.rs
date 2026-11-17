use crate::replayer::TransitionLattice;
use std::collections::BTreeMap;

/// Normative POWL trajectory compiler from bcinr-powl.
/// Maps activity names to bitpacked transition representations.
#[derive(Debug, Clone, Default)]
pub struct PowlTrajectoryCompiler {
    pub activity_to_bit: BTreeMap<String, u64>,
    pub initial_lattice: TransitionLattice,
}

impl PowlTrajectoryCompiler {
    pub fn new() -> Self {
        Self::default()
    }

    /// Registers a sequential or concurrent trajectory specification.
    pub fn register_activity(&mut self, activity: &str) -> u64 {
        let count = self.activity_to_bit.len();
        if let Some(&bit) = self.activity_to_bit.get(activity) {
            return bit;
        }
        let bit = 1u64 << (count % 64);
        self.activity_to_bit.insert(activity.to_string(), bit);
        bit
    }

    /// Compiles a sequence of activities into an initial transition lattice and post-transition masks.
    pub fn compile_sequence(&mut self, activities: &[&str]) -> (TransitionLattice, Vec<u64>) {
        let mut bits = Vec::new();
        for &act in activities {
            bits.push(self.register_activity(act));
        }

        let initial_mask = bits.first().copied().unwrap_or(0);
        let mut post_masks = Vec::new();

        for i in 0..bits.len() {
            if i + 1 < bits.len() {
                post_masks.push(bits[i + 1]);
            } else {
                post_masks.push(0);
            }
        }

        let lattice = TransitionLattice {
            enabled_mask: initial_mask,
            marked_mask: 0,
            sync_mask: 0,
        };

        (lattice, post_masks)
    }
}
