//! Standing-first host court for the construct-only runtime.
//!
//! This crate makes the process mathematics operational rather than treating
//! OCEL evidence as a downstream audit log. A peer must present the exact
//! process geometry expected by the local world and satisfy the admitted
//! algebra/calculus before a standing session exists. The session can then
//! select only pre-admitted `u8` construct capsules.
//!
//! Cryptographic primitive implementations intentionally remain outside this
//! zero-dependency court. `Digest32` values are exact BLAKE3 identities admitted
//! by the surrounding sealing boundary; this crate compares them but does not
//! invent a replacement hash or signature algorithm.

pub type Digest32 = [u8; 32];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Refusal {
    EmptyProcess,
    ZeroDimensions,
    IntegralDimensionMismatch,
    OrdinalMismatch { expected: u64, observed: u64 },
    EmptyObjectSet { ordinal: u64 },
    NonCanonicalObjectSet { ordinal: u64 },
    CoordinateDimensionMismatch { ordinal: u64 },
    DuplicateAlgebraRule { left: u8, right: u8 },
    UndefinedComposition { left: u8, right: u8 },
    VelocityExceeded { ordinal: u64, dimension: usize },
    AccelerationExceeded { ordinal: u64, dimension: usize },
    IntegralOutsideBounds { dimension: usize },
    ConstitutionMismatch,
    CorpusMismatch,
    DispatchMismatch,
    PartMismatch,
    ProcessGeometryMismatch,
    InvalidPartSignature,
    SelectorUnassigned(u8),
    CapsuleSelectorMismatch { expected: u8, observed: u8 },
    CapsulePartMismatch,
    ConstructRefused,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CompositionRule {
    pub left: u8,
    pub right: u8,
    pub result: u8,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompositionTable {
    rules: Vec<CompositionRule>,
}

impl CompositionTable {
    pub fn new(rules: Vec<CompositionRule>) -> Result<Self, Refusal> {
        for (index, rule) in rules.iter().enumerate() {
            if rules[..index]
                .iter()
                .any(|prior| prior.left == rule.left && prior.right == rule.right)
            {
                return Err(Refusal::DuplicateAlgebraRule {
                    left: rule.left,
                    right: rule.right,
                });
            }
        }
        Ok(Self { rules })
    }

    pub fn compose(&self, left: u8, right: u8) -> Result<u8, Refusal> {
        self.rules
            .iter()
            .find(|rule| rule.left == left && rule.right == right)
            .map(|rule| rule.result)
            .ok_or(Refusal::UndefinedComposition { left, right })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessEvent {
    /// Canonical discrete process coordinate. The bounded court requires a
    /// contiguous `0..n` trajectory, so discrete derivatives have unit dt.
    pub ordinal: u64,
    /// Semantic operation selector observed at this event.
    pub selector: u8,
    /// OCEL object references participating in the event. The set must be
    /// non-empty, sorted, and duplicate-free to provide one canonical geometry.
    pub objects: Vec<u32>,
    /// Coordinates in the admitted process manifold.
    pub coordinates: Vec<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OcelV2ProcessGeometry {
    pub events: Vec<ProcessEvent>,
}

impl OcelV2ProcessGeometry {
    pub fn endpoint(&self) -> Option<&[i64]> {
        self.events.last().map(|event| event.coordinates.as_slice())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CalculusBounds {
    pub dimensions: usize,
    pub max_abs_velocity: i64,
    pub max_abs_acceleration: i64,
    /// Bounds for the discrete path integral (sum of each coordinate along the
    /// canonical unit-time trajectory).
    pub integral_min: Vec<i128>,
    pub integral_max: Vec<i128>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessLaw {
    pub algebra: CompositionTable,
    pub calculus: CalculusBounds,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessMeasures {
    pub composite_selector: u8,
    pub discrete_integrals: Vec<i128>,
}

impl ProcessLaw {
    pub fn validate(&self, process: &OcelV2ProcessGeometry) -> Result<ProcessMeasures, Refusal> {
        if process.events.is_empty() {
            return Err(Refusal::EmptyProcess);
        }
        let dimensions = self.calculus.dimensions;
        if dimensions == 0 {
            return Err(Refusal::ZeroDimensions);
        }
        if self.calculus.integral_min.len() != dimensions
            || self.calculus.integral_max.len() != dimensions
        {
            return Err(Refusal::IntegralDimensionMismatch);
        }

        let velocity_bound = i128::from(self.calculus.max_abs_velocity).abs();
        let acceleration_bound = i128::from(self.calculus.max_abs_acceleration).abs();
        let mut integrals = vec![0_i128; dimensions];
        let mut prior_velocity: Option<Vec<i128>> = None;
        let mut composite = process.events[0].selector;

        for (index, event) in process.events.iter().enumerate() {
            let expected_ordinal = index as u64;
            if event.ordinal != expected_ordinal {
                return Err(Refusal::OrdinalMismatch {
                    expected: expected_ordinal,
                    observed: event.ordinal,
                });
            }
            if event.objects.is_empty() {
                return Err(Refusal::EmptyObjectSet {
                    ordinal: event.ordinal,
                });
            }
            if event.objects.windows(2).any(|pair| pair[0] >= pair[1]) {
                return Err(Refusal::NonCanonicalObjectSet {
                    ordinal: event.ordinal,
                });
            }
            if event.coordinates.len() != dimensions {
                return Err(Refusal::CoordinateDimensionMismatch {
                    ordinal: event.ordinal,
                });
            }

            for (dimension, coordinate) in event.coordinates.iter().enumerate() {
                integrals[dimension] += i128::from(*coordinate);
            }

            if index > 0 {
                composite = self.algebra.compose(composite, event.selector)?;
                let previous = &process.events[index - 1];
                let velocity: Vec<i128> = event
                    .coordinates
                    .iter()
                    .zip(previous.coordinates.iter())
                    .map(|(current, prior)| i128::from(*current) - i128::from(*prior))
                    .collect();

                for (dimension, value) in velocity.iter().enumerate() {
                    if value.abs() > velocity_bound {
                        return Err(Refusal::VelocityExceeded {
                            ordinal: event.ordinal,
                            dimension,
                        });
                    }
                }

                if let Some(previous_velocity) = &prior_velocity {
                    for (dimension, (current, prior)) in
                        velocity.iter().zip(previous_velocity.iter()).enumerate()
                    {
                        if (current - prior).abs() > acceleration_bound {
                            return Err(Refusal::AccelerationExceeded {
                                ordinal: event.ordinal,
                                dimension,
                            });
                        }
                    }
                }
                prior_velocity = Some(velocity);
            }
        }

        for dimension in 0..dimensions {
            if integrals[dimension] < self.calculus.integral_min[dimension]
                || integrals[dimension] > self.calculus.integral_max[dimension]
            {
                return Err(Refusal::IntegralOutsideBounds { dimension });
            }
        }

        Ok(ProcessMeasures {
            composite_selector: composite,
            discrete_integrals: integrals,
        })
    }
}

pub trait PartSignatureVerifier {
    fn verify(&self, part_digest: &Digest32, signature: &[u8]) -> bool;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SignedPart {
    digest: Digest32,
}

impl SignedPart {
    pub fn admit(
        digest: Digest32,
        signature: &[u8],
        verifier: &impl PartSignatureVerifier,
    ) -> Result<Self, Refusal> {
        if verifier.verify(&digest, signature) {
            Ok(Self { digest })
        } else {
            Err(Refusal::InvalidPartSignature)
        }
    }

    pub fn digest(&self) -> Digest32 {
        self.digest
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExpectedWorld {
    pub constitution_digest: Digest32,
    pub corpus_digest: Digest32,
    pub dispatch_digest: Digest32,
    pub part_digest: Digest32,
    /// The exact process geometry that has standing in this world. It is not a
    /// secret scalar credential; the path itself is the interaction witness.
    pub process: OcelV2ProcessGeometry,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PeerPresentation {
    pub constitution_digest: Digest32,
    pub corpus_digest: Digest32,
    pub dispatch_digest: Digest32,
    pub signed_part: SignedPart,
    pub process: OcelV2ProcessGeometry,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExecutionCapsule {
    pub selector: u8,
    pub part_digest: Digest32,
    pub construct_digest: Digest32,
    pub graph_view_digest: Digest32,
    pub policy_digest: Digest32,
    pub receipt_shape_digest: Digest32,
    pub objects: Vec<u32>,
}

#[derive(Debug, Clone)]
pub struct DispatchTable {
    pub identity: Digest32,
    slots: [Option<ExecutionCapsule>; 256],
}

impl DispatchTable {
    pub fn new(
        identity: Digest32,
        slots: [Option<ExecutionCapsule>; 256],
    ) -> Result<Self, Refusal> {
        for (index, capsule) in slots.iter().enumerate() {
            if let Some(capsule) = capsule {
                let expected = index as u8;
                if capsule.selector != expected {
                    return Err(Refusal::CapsuleSelectorMismatch {
                        expected,
                        observed: capsule.selector,
                    });
                }
            }
        }
        Ok(Self { identity, slots })
    }

    pub fn capsule(&self, selector: u8) -> Result<&ExecutionCapsule, Refusal> {
        self.slots[selector as usize]
            .as_ref()
            .ok_or(Refusal::SelectorUnassigned(selector))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConstructConsequence {
    pub artifact_digest: Digest32,
    pub coordinates: Vec<i64>,
}

/// Host implementation must be a pure `CONSTRUCT` boundary. Consequential DO
/// authority is intentionally not represented by this trait.
pub trait ConstructHost {
    fn construct(
        &mut self,
        capsule: &ExecutionCapsule,
        corpus_digest: Digest32,
    ) -> Result<ConstructConsequence, Refusal>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Receipt {
    pub selector: u8,
    pub corpus_digest: Digest32,
    pub part_digest: Digest32,
    pub dispatch_digest: Digest32,
    pub artifact_digest: Digest32,
    pub prior_event_count: usize,
    pub next_event_count: usize,
}

/// The constructor is private: a standing session can only be obtained by the
/// conformance handshake below.
#[derive(Debug, Clone)]
pub struct StandingSession {
    constitution_digest: Digest32,
    corpus_digest: Digest32,
    dispatch_digest: Digest32,
    part_digest: Digest32,
    process: OcelV2ProcessGeometry,
    law: ProcessLaw,
}

impl StandingSession {
    pub fn process(&self) -> &OcelV2ProcessGeometry {
        &self.process
    }

    pub fn constitution_digest(&self) -> Digest32 {
        self.constitution_digest
    }

    pub fn execute(
        &mut self,
        selector: u8,
        dispatch: &DispatchTable,
        host: &mut impl ConstructHost,
    ) -> Result<Receipt, Refusal> {
        if dispatch.identity != self.dispatch_digest {
            return Err(Refusal::DispatchMismatch);
        }
        let capsule = dispatch.capsule(selector)?;
        if capsule.part_digest != self.part_digest {
            return Err(Refusal::CapsulePartMismatch);
        }

        // Refuse undefined algebra before invoking the construct host.
        let current = self.law.validate(&self.process)?;
        self.law
            .algebra
            .compose(current.composite_selector, selector)?;

        let consequence = host.construct(capsule, self.corpus_digest)?;
        let prior_event_count = self.process.events.len();
        let mut candidate = self.process.clone();
        candidate.events.push(ProcessEvent {
            ordinal: prior_event_count as u64,
            selector,
            objects: capsule.objects.clone(),
            coordinates: consequence.coordinates.clone(),
        });

        // Geometry/calculus are checked before the new process state acquires
        // standing. Because ConstructHost has no DO surface, refusal here cannot
        // retroactively authorize an external consequence.
        self.law.validate(&candidate)?;
        self.process = candidate;

        Ok(Receipt {
            selector,
            corpus_digest: self.corpus_digest,
            part_digest: self.part_digest,
            dispatch_digest: self.dispatch_digest,
            artifact_digest: consequence.artifact_digest,
            prior_event_count,
            next_event_count: prior_event_count + 1,
        })
    }
}

pub fn establish_standing(
    expected: &ExpectedWorld,
    peer: &PeerPresentation,
    law: &ProcessLaw,
) -> Result<StandingSession, Refusal> {
    // Both the local expected geometry and the peer presentation must satisfy
    // the same mathematics before equality is meaningful.
    law.validate(&expected.process)?;
    law.validate(&peer.process)?;

    if peer.constitution_digest != expected.constitution_digest {
        return Err(Refusal::ConstitutionMismatch);
    }
    if peer.corpus_digest != expected.corpus_digest {
        return Err(Refusal::CorpusMismatch);
    }
    if peer.dispatch_digest != expected.dispatch_digest {
        return Err(Refusal::DispatchMismatch);
    }
    if peer.signed_part.digest() != expected.part_digest {
        return Err(Refusal::PartMismatch);
    }
    if peer.process != expected.process {
        return Err(Refusal::ProcessGeometryMismatch);
    }

    Ok(StandingSession {
        constitution_digest: expected.constitution_digest,
        corpus_digest: expected.corpus_digest,
        dispatch_digest: expected.dispatch_digest,
        part_digest: expected.part_digest,
        process: peer.process.clone(),
        law: law.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn digest(byte: u8) -> Digest32 {
        [byte; 32]
    }

    struct TestSignatureVerifier;

    impl PartSignatureVerifier for TestSignatureVerifier {
        fn verify(&self, part_digest: &Digest32, signature: &[u8]) -> bool {
            signature == [part_digest[0], part_digest[31]]
        }
    }

    fn signed_part(byte: u8) -> SignedPart {
        SignedPart::admit(digest(byte), &[byte, byte], &TestSignatureVerifier).unwrap()
    }

    fn law() -> ProcessLaw {
        ProcessLaw {
            algebra: CompositionTable::new(vec![
                CompositionRule {
                    left: 1,
                    right: 1,
                    result: 1,
                },
                CompositionRule {
                    left: 1,
                    right: 17,
                    result: 17,
                },
                CompositionRule {
                    left: 17,
                    right: 17,
                    result: 17,
                },
                // Explicitly non-commutative observed pair.
                CompositionRule {
                    left: 1,
                    right: 2,
                    result: 3,
                },
                CompositionRule {
                    left: 2,
                    right: 1,
                    result: 4,
                },
            ])
            .unwrap(),
            calculus: CalculusBounds {
                dimensions: 2,
                max_abs_velocity: 4,
                max_abs_acceleration: 8,
                integral_min: vec![-100, -100],
                integral_max: vec![100, 100],
            },
        }
    }

    fn process_middle(middle: i64) -> OcelV2ProcessGeometry {
        OcelV2ProcessGeometry {
            events: vec![
                ProcessEvent {
                    ordinal: 0,
                    selector: 1,
                    objects: vec![7, 9],
                    coordinates: vec![0, 0],
                },
                ProcessEvent {
                    ordinal: 1,
                    selector: 1,
                    objects: vec![7, 9],
                    coordinates: vec![middle, 0],
                },
                ProcessEvent {
                    ordinal: 2,
                    selector: 1,
                    objects: vec![7, 9],
                    coordinates: vec![0, 0],
                },
            ],
        }
    }

    fn expected(process: OcelV2ProcessGeometry) -> ExpectedWorld {
        ExpectedWorld {
            constitution_digest: digest(1),
            corpus_digest: digest(2),
            dispatch_digest: digest(3),
            part_digest: digest(4),
            process,
        }
    }

    fn peer(process: OcelV2ProcessGeometry) -> PeerPresentation {
        PeerPresentation {
            constitution_digest: digest(1),
            corpus_digest: digest(2),
            dispatch_digest: digest(3),
            signed_part: signed_part(4),
            process,
        }
    }

    #[test]
    fn algebra_can_be_non_commutative() {
        let algebra = &law().algebra;
        assert_eq!(algebra.compose(1, 2).unwrap(), 3);
        assert_eq!(algebra.compose(2, 1).unwrap(), 4);
    }

    #[test]
    fn same_endpoint_different_path_has_no_standing() {
        let local_process = process_middle(1);
        let foreign_process = process_middle(2);
        assert_eq!(local_process.endpoint(), foreign_process.endpoint());
        assert_eq!(
            establish_standing(&expected(local_process), &peer(foreign_process), &law()),
            Err(Refusal::ProcessGeometryMismatch)
        );
    }

    #[test]
    fn corpus_mismatch_refuses_before_session_exists() {
        let process = process_middle(1);
        let mut foreign = peer(process.clone());
        foreign.corpus_digest = digest(99);
        assert_eq!(
            establish_standing(&expected(process), &foreign, &law()),
            Err(Refusal::CorpusMismatch)
        );
    }

    #[test]
    fn undefined_process_composition_refuses() {
        let process = OcelV2ProcessGeometry {
            events: vec![
                ProcessEvent {
                    ordinal: 0,
                    selector: 2,
                    objects: vec![1],
                    coordinates: vec![0, 0],
                },
                ProcessEvent {
                    ordinal: 1,
                    selector: 2,
                    objects: vec![1],
                    coordinates: vec![0, 0],
                },
            ],
        };
        assert_eq!(
            law().validate(&process),
            Err(Refusal::UndefinedComposition { left: 2, right: 2 })
        );
    }

    #[test]
    fn derivative_violation_refuses() {
        let process = OcelV2ProcessGeometry {
            events: vec![
                ProcessEvent {
                    ordinal: 0,
                    selector: 1,
                    objects: vec![1],
                    coordinates: vec![0, 0],
                },
                ProcessEvent {
                    ordinal: 1,
                    selector: 1,
                    objects: vec![1],
                    coordinates: vec![5, 0],
                },
            ],
        };
        assert_eq!(
            law().validate(&process),
            Err(Refusal::VelocityExceeded {
                ordinal: 1,
                dimension: 0
            })
        );
    }

    #[test]
    fn invalid_part_signature_never_becomes_a_part() {
        assert_eq!(
            SignedPart::admit(digest(4), &[0, 0], &TestSignatureVerifier),
            Err(Refusal::InvalidPartSignature)
        );
    }

    struct RecordingConstructHost {
        calls: usize,
        expected_construct: Digest32,
    }

    impl ConstructHost for RecordingConstructHost {
        fn construct(
            &mut self,
            capsule: &ExecutionCapsule,
            corpus_digest: Digest32,
        ) -> Result<ConstructConsequence, Refusal> {
            if capsule.construct_digest != self.expected_construct || corpus_digest != digest(2) {
                return Err(Refusal::ConstructRefused);
            }
            self.calls += 1;
            Ok(ConstructConsequence {
                artifact_digest: digest(42),
                coordinates: vec![1, 1],
            })
        }
    }

    fn dispatch() -> DispatchTable {
        let mut slots: [Option<ExecutionCapsule>; 256] = std::array::from_fn(|_| None);
        slots[17] = Some(ExecutionCapsule {
            selector: 17,
            part_digest: digest(4),
            construct_digest: digest(5),
            graph_view_digest: digest(6),
            policy_digest: digest(7),
            receipt_shape_digest: digest(8),
            objects: vec![7, 9],
        });
        DispatchTable::new(digest(3), slots).unwrap()
    }

    #[test]
    fn standing_session_executes_only_pre_admitted_u8_capsule_and_extends_process() {
        let process = process_middle(1);
        let mut session = establish_standing(&expected(process.clone()), &peer(process), &law()).unwrap();
        let mut host = RecordingConstructHost {
            calls: 0,
            expected_construct: digest(5),
        };

        let receipt = session.execute(17, &dispatch(), &mut host).unwrap();
        assert_eq!(host.calls, 1);
        assert_eq!(receipt.selector, 17);
        assert_eq!(receipt.artifact_digest, digest(42));
        assert_eq!(receipt.prior_event_count, 3);
        assert_eq!(receipt.next_event_count, 4);
        assert_eq!(session.process().events.len(), 4);
        assert_eq!(session.process().events[3].coordinates, vec![1, 1]);
    }

    #[test]
    fn unassigned_byte_refuses_without_calling_construct_host() {
        let process = process_middle(1);
        let mut session = establish_standing(&expected(process.clone()), &peer(process), &law()).unwrap();
        let mut host = RecordingConstructHost {
            calls: 0,
            expected_construct: digest(5),
        };
        assert_eq!(
            session.execute(18, &dispatch(), &mut host),
            Err(Refusal::SelectorUnassigned(18))
        );
        assert_eq!(host.calls, 0);
    }

    #[test]
    fn behaviorally_equivalent_foreign_part_digest_cannot_enter_capsule() {
        let process = process_middle(1);
        let mut session = establish_standing(&expected(process.clone()), &peer(process), &law()).unwrap();
        let mut slots: [Option<ExecutionCapsule>; 256] = std::array::from_fn(|_| None);
        slots[17] = Some(ExecutionCapsule {
            selector: 17,
            part_digest: digest(44),
            construct_digest: digest(5),
            graph_view_digest: digest(6),
            policy_digest: digest(7),
            receipt_shape_digest: digest(8),
            objects: vec![7, 9],
        });
        let foreign_dispatch = DispatchTable::new(digest(3), slots).unwrap();
        let mut host = RecordingConstructHost {
            calls: 0,
            expected_construct: digest(5),
        };
        assert_eq!(
            session.execute(17, &foreign_dispatch, &mut host),
            Err(Refusal::CapsulePartMismatch)
        );
        assert_eq!(host.calls, 0);
    }
}
