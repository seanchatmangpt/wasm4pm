//! Property tests for the authority classifier. Anchors the critical
//! invariant: human/LLM markers combined with machine markers must NOT
//! classify as `MachineEvidence`.

use proptest::prelude::*;
use wasm4pm_cognition::authority::{classify, AuthorityKind};

proptest! {
    /// Any string containing a human marker AND a 64-hex digest classifies
    /// as `Mixed` — never as `MachineEvidence`.
    #[test]
    fn human_plus_hex_is_never_machine(prefix in "[a-zA-Z0-9 ]{0,32}") {
        let s = format!("I think {} {}", prefix, "a".repeat(64));
        let k = classify(&s);
        prop_assert_ne!(k, AuthorityKind::MachineEvidence);
    }

    /// LLM marker plus hex is also never `MachineEvidence`.
    #[test]
    fn llm_plus_hex_is_never_machine(suffix in "[a-zA-Z0-9 ]{0,32}") {
        let s = format!("As an AI, here is {} {}", suffix, "f".repeat(64));
        let k = classify(&s);
        prop_assert_ne!(k, AuthorityKind::MachineEvidence);
    }

    /// Pure 64-hex digests with no other markers classify as machine.
    #[test]
    fn pure_hex_is_machine(prefix_len in 0usize..16) {
        let s = format!("{}{}", "0".repeat(prefix_len), "a".repeat(64));
        // Pad to ensure no human/LLM tokens get fabricated.
        let k = classify(&s);
        prop_assert!(
            matches!(k, AuthorityKind::MachineEvidence | AuthorityKind::Empty),
            "expected Machine/Empty, got {:?}",
            k
        );
    }
}

#[test]
fn explicit_attack_string_is_mixed() {
    let s = format!("I think {}", "0".repeat(64));
    assert_eq!(classify(&s), AuthorityKind::Mixed);
}
