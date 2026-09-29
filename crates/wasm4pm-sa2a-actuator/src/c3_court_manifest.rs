//! Factory D C3 adversarial court manifest.
//! These cases are executable test inputs, not authority.
//! A protected effect is admissible only after local certificate mediation.

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Expected {
    Admit,
    Refuse,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CourtVector {
    pub id: &'static str,
    pub expected: Expected,
    pub invariant: &'static str,
}

pub const VECTORS: &[CourtVector] = &[
    CourtVector { id: "credential/control-plane-no-key", expected: Expected::Refuse, invariant: "control plane has no protected signing or effector credential" },
    CourtVector { id: "mediation/missing-certificate", expected: Expected::Refuse, invariant: "no protected DO without certificate" },
    CourtVector { id: "mediation/effect-digest-mismatch", expected: Expected::Refuse, invariant: "certificate binds exact PreparedEffect digest" },
    CourtVector { id: "principal/confused-deputy", expected: Expected::Refuse, invariant: "principal is preserved end-to-end" },
    CourtVector { id: "epoch/stale-policy", expected: Expected::Refuse, invariant: "policy epoch is current" },
    CourtVector { id: "epoch/revoked", expected: Expected::Refuse, invariant: "revocation epoch is current" },
    CourtVector { id: "fence/stale-generation", expected: Expected::Refuse, invariant: "generation token fences stale work" },
    CourtVector { id: "quorum/duplicate-key", expected: Expected::Refuse, invariant: "k-of-n counts distinct verified keys" },
    CourtVector { id: "quorum/duplicate-custodian", expected: Expected::Refuse, invariant: "k-of-n counts distinct custodians" },
    CourtVector { id: "quorum/same-trust-domain", expected: Expected::Refuse, invariant: "k-of-n spans administrative trust domains" },
    CourtVector { id: "quorum/independent-domains", expected: Expected::Admit, invariant: "independent verified domains may satisfy quorum" },
    CourtVector { id: "claim/replay-before-completion", expected: Expected::Refuse, invariant: "actuator-local claim store prevents duplicate DO" },
    CourtVector { id: "claim/replay-after-completion", expected: Expected::Refuse, invariant: "completion receipt prevents duplicate DO" },
    CourtVector { id: "claim/unknown-outcome", expected: Expected::Refuse, invariant: "unknown outcome reconciles before retry" },
    CourtVector { id: "resource/child-over-parent", expected: Expected::Refuse, invariant: "recursive child grant cannot exceed parent grant" },
    CourtVector { id: "resource/sibling-amplification", expected: Expected::Refuse, invariant: "sibling grants conserve parent budget" },
    CourtVector { id: "resource/receipt-as-authority", expected: Expected::Refuse, invariant: "allocation receipt never authorizes DO" },
    CourtVector { id: "fault/authority-unreachable", expected: Expected::Refuse, invariant: "missing authority removes only protected DO" },
    CourtVector { id: "fault/ledger-unreachable", expected: Expected::Refuse, invariant: "actuator cannot DO without durable local claim" },
    CourtVector { id: "compromise/control-plane", expected: Expected::Refuse, invariant: "control compromise cannot mint actuation authority" },
];

pub fn by_id(id: &str) -> Option<&'static CourtVector> {
    VECTORS.iter().find(|vector| vector.id == id)
}
