//! [`BreedStanding`] — ten-rung certification ladder for cognition breeds.

use serde::{Deserialize, Serialize};

/// The ten-rung certification ladder.
///
/// Each rung is a strict superset of all rungs below it. Stored in
/// `breeds/registry.json` as the `"standing"` field.
///
/// ## Relationship to `status`
///
/// `status: "PARTIAL_ALIVE"` is a coarse admission gate.
/// `BreedStanding` provides ten-rung precision. A breed must be at least
/// `Dispatchable` to qualify as `PARTIAL_ALIVE`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BreedStanding {
    /// Rung 1: `BreedId` variant exists in the enum and `BreedId::ALL`.
    Named,
    /// Rung 2: Entry present in `breeds/registry.json` with mandatory fields.
    Registered,
    /// Rung 3: Dispatch arm exists in `dispatch_breed_id` (compile-enforced).
    ///
    /// This is the minimum standing for `PARTIAL_ALIVE` status.
    Dispatchable,
    /// Rung 4: `complexity_caps` declared; `preconditions()` enforces them.
    Bounded,
    /// Rung 5: Oracle fixture exists; paper `expected_value` asserted.
    Oracled,
    /// Rung 6: `inference_trace` non-empty; trace-law checks pass.
    Traceable,
    /// Rung 7: BLAKE3 receipt deterministic; `SortedFacts` used throughout.
    Canonical,
    /// Rung 8: `CognitionError` variants in use; all refusal paths tested.
    Refusable,
    /// Rung 9: OCEL conformance fitness = 1.0; `replay_pointer` valid.
    Replayable,
    /// Rung 10: Ed25519 signature verified; Merkle root anchored; counter-test green.
    Certified,
}

impl BreedStanding {
    /// Minimum standing required for `PARTIAL_ALIVE` registry status.
    pub const PARTIAL_ALIVE_MINIMUM: Self = Self::Dispatchable;

    /// Returns `true` if this standing satisfies the PARTIAL_ALIVE gate.
    pub fn is_partial_alive_eligible(self) -> bool {
        self >= Self::PARTIAL_ALIVE_MINIMUM
    }

    /// Parse from the SCREAMING_SNAKE_CASE string stored in `registry.json`.
    pub fn from_registry_str(s: &str) -> Option<Self> {
        serde_json::from_value(serde_json::Value::String(s.to_uppercase())).ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn partial_alive_minimum_is_dispatchable() {
        assert_eq!(
            BreedStanding::PARTIAL_ALIVE_MINIMUM,
            BreedStanding::Dispatchable
        );
    }

    #[test]
    fn ladder_ordering() {
        assert!(BreedStanding::Named < BreedStanding::Certified);
        assert!(BreedStanding::Dispatchable <= BreedStanding::Traceable);
    }

    #[test]
    fn eligible_checks() {
        assert!(!BreedStanding::Named.is_partial_alive_eligible());
        assert!(BreedStanding::Dispatchable.is_partial_alive_eligible());
        assert!(BreedStanding::Certified.is_partial_alive_eligible());
    }

    #[test]
    fn from_registry_str_roundtrip() {
        assert_eq!(
            BreedStanding::from_registry_str("TRACEABLE"),
            Some(BreedStanding::Traceable)
        );
        assert_eq!(
            BreedStanding::from_registry_str("traceable"),
            Some(BreedStanding::Traceable)
        );
        assert_eq!(BreedStanding::from_registry_str("UNKNOWN_RUNG"), None);
    }

    #[test]
    fn serde_roundtrip() {
        let s = BreedStanding::Replayable;
        let json = serde_json::to_string(&s).unwrap();
        assert_eq!(json, r#""REPLAYABLE""#);
        let back: BreedStanding = serde_json::from_str(&json).unwrap();
        assert_eq!(back, s);
    }
}
