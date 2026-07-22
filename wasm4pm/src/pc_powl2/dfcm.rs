//! Exact Design-for-Combinatorial-Maximalism closure for PC-POWL2.
//!
//! The innovation space is the Hamming graph `H(4, 8)`: eight closed semantic
//! operators composed in four ordered positions. The resulting 4,096 words are
//! generated rather than handwritten, classified under one deterministic
//! manufacturing law, connected to all one-coordinate counterfactuals, and
//! sealed by replayable closure and mutation receipts.

use super::{canonical_digest, PcpResult};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub const DFCM_OPERATOR_COUNT: usize = 8;
pub const DFCM_COMPOSITION_DEPTH: usize = 4;
pub const DFCM_CORPUS_SIZE: usize = 4096;
pub const DFCM_COUNTERFACTUAL_DEGREE: usize = 28;
pub const DFCM_UNDIRECTED_EDGE_COUNT: usize = 57_344;
pub const DFCM_ADMITTED_WORD_COUNT: usize = 2_801;
pub const DFCM_REFUSED_WORD_COUNT: usize = 1_295;
pub const DFCM_DECISION_BOUNDARY_EDGE_COUNT: usize = 8_400;
pub const DFCM_ADMITTED_INTERIOR_EDGE_COUNT: usize = 35_014;
pub const DFCM_REFUSED_INTERIOR_EDGE_COUNT: usize = 13_930;
pub const DFCM_SHELL_HISTOGRAM: [usize; 5] = [1, 28, 294, 1_372, 2_401];
pub const DFCM_PREFIX_CLOSURE: [usize; 4] = [8, 64, 512, 4_096];

pub const DFCM_SCHEMA: &str = "urn:mfw:pc-powl2:dfcm:8pow4:v1";

/// The eight closed semantic operators used to manufacture PC-POWL2 variants.
///
/// Each operator is a lawful lift over a canonical proof-carrying atomic seed.
/// `Receipt` is terminal and idempotent. Applying any semantic operator after a
/// receipt is a named refusal rather than an untracked mutation.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SemanticOperator {
    Atom = 0,
    Sequence = 1,
    PartialOrder = 2,
    ChoiceGraph = 3,
    Cycle = 4,
    Frame = 5,
    Consequence = 6,
    Receipt = 7,
}

impl SemanticOperator {
    pub const ALL: [Self; DFCM_OPERATOR_COUNT] = [
        Self::Atom,
        Self::Sequence,
        Self::PartialOrder,
        Self::ChoiceGraph,
        Self::Cycle,
        Self::Frame,
        Self::Consequence,
        Self::Receipt,
    ];

    pub const fn index(self) -> usize {
        self as usize
    }

    pub const fn from_index(index: usize) -> Option<Self> {
        match index {
            0 => Some(Self::Atom),
            1 => Some(Self::Sequence),
            2 => Some(Self::PartialOrder),
            3 => Some(Self::ChoiceGraph),
            4 => Some(Self::Cycle),
            5 => Some(Self::Frame),
            6 => Some(Self::Consequence),
            7 => Some(Self::Receipt),
            _ => None,
        }
    }

    pub const fn obligation(self) -> ProofObligation {
        match self {
            Self::Atom => ProofObligation::AtomicContract,
            Self::Sequence => ProofObligation::SequentialComposition,
            Self::PartialOrder => ProofObligation::PairwiseCommutation,
            Self::ChoiceGraph => ProofObligation::GraphPathSoundness,
            Self::Cycle => ProofObligation::CycleInvariantAndVariant,
            Self::Frame => ProofObligation::HierarchicalFrame,
            Self::Consequence => ProofObligation::ConsequenceImplications,
            Self::Receipt => ProofObligation::ReceiptAndReplay,
        }
    }
}

/// One proof obligation per semantic operator. This one-to-one mapping makes
/// coverage mechanically inspectable rather than inferred from test names.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProofObligation {
    AtomicContract = 0,
    SequentialComposition = 1,
    PairwiseCommutation = 2,
    GraphPathSoundness = 3,
    CycleInvariantAndVariant = 4,
    HierarchicalFrame = 5,
    ConsequenceImplications = 6,
    ReceiptAndReplay = 7,
}

impl ProofObligation {
    pub const ALL: [Self; DFCM_OPERATOR_COUNT] = [
        Self::AtomicContract,
        Self::SequentialComposition,
        Self::PairwiseCommutation,
        Self::GraphPathSoundness,
        Self::CycleInvariantAndVariant,
        Self::HierarchicalFrame,
        Self::ConsequenceImplications,
        Self::ReceiptAndReplay,
    ];

    pub const fn index(self) -> usize {
        self as usize
    }
}

/// Compact obligation union carried by one manufactured word.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ObligationSet(u16);

impl ObligationSet {
    pub const EMPTY: Self = Self(0);

    pub fn insert(&mut self, obligation: ProofObligation) {
        self.0 |= 1_u16 << obligation.index();
    }

    pub const fn contains(self, obligation: ProofObligation) -> bool {
        self.0 & (1_u16 << obligation.index()) != 0
    }

    pub fn members(self) -> Vec<ProofObligation> {
        ProofObligation::ALL
            .into_iter()
            .filter(|obligation| self.contains(*obligation))
            .collect()
    }

    pub const fn bits(self) -> u16 {
        self.0
    }
}

/// Maximum standing reachable by a four-operator word.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StandingCeiling {
    ProofCarrying,
    TotalCorrectness,
    ReceiptedActuation,
}

/// A base-eight word of exactly four semantic operators.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct OperatorWord(pub [SemanticOperator; DFCM_COMPOSITION_DEPTH]);

impl OperatorWord {
    pub const ORIGIN: Self = Self([SemanticOperator::Atom; DFCM_COMPOSITION_DEPTH]);

    pub fn from_ordinal(mut ordinal: usize) -> Option<Self> {
        if ordinal >= DFCM_CORPUS_SIZE {
            return None;
        }
        let mut operators = [SemanticOperator::Atom; DFCM_COMPOSITION_DEPTH];
        for position in (0..DFCM_COMPOSITION_DEPTH).rev() {
            let digit = ordinal % DFCM_OPERATOR_COUNT;
            operators[position] = SemanticOperator::from_index(digit)?;
            ordinal /= DFCM_OPERATOR_COUNT;
        }
        Some(Self(operators))
    }

    pub fn ordinal(self) -> usize {
        self.0.iter().fold(0, |value, operator| {
            value * DFCM_OPERATOR_COUNT + operator.index()
        })
    }

    pub fn hamming_distance(self, other: Self) -> usize {
        self.0
            .iter()
            .zip(other.0.iter())
            .filter(|(left, right)| left != right)
            .count()
    }

    /// All 28 one-coordinate substitutions in `H(4, 8)`.
    pub fn neighbors(self) -> Vec<Self> {
        let mut neighbors = Vec::with_capacity(DFCM_COUNTERFACTUAL_DEGREE);
        for position in 0..DFCM_COMPOSITION_DEPTH {
            for replacement in SemanticOperator::ALL {
                if replacement == self.0[position] {
                    continue;
                }
                let mut candidate = self.0;
                candidate[position] = replacement;
                neighbors.push(Self(candidate));
            }
        }
        neighbors.sort_unstable_by_key(|word| word.ordinal());
        neighbors
    }

    /// A deterministic shortest route that changes differing coordinates from
    /// left to right. Every adjacent pair is one Hamming edge apart.
    pub fn route_to(self, target: Self) -> Vec<Self> {
        let mut route = vec![self];
        let mut current = self;
        for position in 0..DFCM_COMPOSITION_DEPTH {
            if current.0[position] == target.0[position] {
                continue;
            }
            current.0[position] = target.0[position];
            route.push(current);
        }
        route
    }
}

/// The one manufacturing refusal in the closed 8^4 algebra: a proof artifact
/// was semantically changed after it had already received execution standing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WordRefusalKind {
    SemanticMutationAfterReceipt,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WordAdmission {
    pub word: OperatorWord,
    pub ordinal: usize,
    pub standing: StandingCeiling,
    pub obligations: ObligationSet,
    pub proof_depth: usize,
    pub semantic_layers: usize,
    pub cycle_layers: usize,
    pub receipt_layers: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WordRefusal {
    pub word: OperatorWord,
    pub ordinal: usize,
    pub position: usize,
    pub operator: SemanticOperator,
    pub reason: WordRefusalKind,
    pub standing_before_refusal: StandingCeiling,
    pub obligations_before_refusal: ObligationSet,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "verdict", rename_all = "snake_case")]
pub enum WordVerdict {
    Admitted(WordAdmission),
    Refused(WordRefusal),
}

impl WordVerdict {
    pub const fn is_admitted(&self) -> bool {
        matches!(self, Self::Admitted(_))
    }

    pub const fn word(&self) -> OperatorWord {
        match self {
            Self::Admitted(admission) => admission.word,
            Self::Refused(refusal) => refusal.word,
        }
    }
}

/// Classify one operator word against the terminal-receipt manufacturing law.
pub fn classify_word(word: OperatorWord) -> WordVerdict {
    let mut sealed = false;
    let mut standing = StandingCeiling::ProofCarrying;
    let mut obligations = ObligationSet::EMPTY;
    let mut proof_depth = 1;
    let mut semantic_layers = 1;
    let mut cycle_layers = 0;
    let mut receipt_layers = 0;

    for (position, operator) in word.0.iter().copied().enumerate() {
        if sealed && operator != SemanticOperator::Receipt {
            return WordVerdict::Refused(WordRefusal {
                word,
                ordinal: word.ordinal(),
                position,
                operator,
                reason: WordRefusalKind::SemanticMutationAfterReceipt,
                standing_before_refusal: standing,
                obligations_before_refusal: obligations,
            });
        }

        obligations.insert(operator.obligation());
        match operator {
            SemanticOperator::Receipt => {
                sealed = true;
                receipt_layers += 1;
                standing = StandingCeiling::ReceiptedActuation;
            }
            SemanticOperator::Cycle => {
                cycle_layers += 1;
                semantic_layers += 1;
                proof_depth += 1;
                standing = StandingCeiling::TotalCorrectness;
            }
            _ => {
                semantic_layers += 1;
                proof_depth += 1;
            }
        }
    }

    WordVerdict::Admitted(WordAdmission {
        word,
        ordinal: word.ordinal(),
        standing,
        obligations,
        proof_depth,
        semantic_layers,
        cycle_layers,
        receipt_layers,
    })
}

/// Generate the complete lexicographic 8^4 corpus.
pub fn corpus() -> Vec<OperatorWord> {
    (0..DFCM_CORPUS_SIZE)
        .map(|ordinal| {
            OperatorWord::from_ordinal(ordinal)
                .expect("ordinal is bounded by the exact 8^4 corpus cardinality")
        })
        .collect()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MutationReceipt {
    pub schema: String,
    pub source: OperatorWord,
    pub target: OperatorWord,
    pub distance: usize,
    pub path: Vec<OperatorWord>,
    pub path_digest: String,
}

impl MutationReceipt {
    pub fn manufacture(source: OperatorWord, target: OperatorWord) -> PcpResult<Self> {
        let path = source.route_to(target);
        let mut receipt = Self {
            schema: DFCM_SCHEMA.to_string(),
            source,
            target,
            distance: source.hamming_distance(target),
            path,
            path_digest: String::new(),
        };
        receipt.path_digest = receipt.expected_digest()?;
        Ok(receipt)
    }

    pub fn replay(&self) -> PcpResult<bool> {
        if self.schema != DFCM_SCHEMA
            || self.path.first().copied() != Some(self.source)
            || self.path.last().copied() != Some(self.target)
            || self.path.len() != self.distance + 1
            || self.distance != self.source.hamming_distance(self.target)
            || self
                .path
                .windows(2)
                .any(|step| step[0].hamming_distance(step[1]) != 1)
        {
            return Ok(false);
        }
        Ok(self.path_digest == self.expected_digest()?)
    }

    fn expected_digest(&self) -> PcpResult<String> {
        let mut material = self.clone();
        material.path_digest.clear();
        canonical_digest(&material)
    }
}

/// Complete mechanical receipt for the 4,096-cell innovation field.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DfcmClosureReceipt {
    pub schema: String,
    pub operator_count: usize,
    pub composition_depth: usize,
    pub expected_words: usize,
    pub classified_words: usize,
    pub admitted_words: usize,
    pub refused_words: usize,
    pub coverage_gaps: usize,
    pub position_histogram: [[usize; DFCM_OPERATOR_COUNT]; DFCM_COMPOSITION_DEPTH],
    pub operator_histogram: [usize; DFCM_OPERATOR_COUNT],
    pub prefix_closure: [usize; DFCM_COMPOSITION_DEPTH],
    pub shell_histogram: [usize; DFCM_COMPOSITION_DEPTH + 1],
    pub counterfactual_degree: usize,
    pub undirected_counterfactual_edges: usize,
    pub admitted_interior_edges: usize,
    pub refused_interior_edges: usize,
    pub decision_boundary_edges: usize,
    pub standing_histogram: BTreeMap<StandingCeiling, usize>,
    pub refusal_histogram: BTreeMap<WordRefusalKind, usize>,
    pub corpus_digest: String,
    pub verdict_digest: String,
    pub receipt_digest: String,
}

impl DfcmClosureReceipt {
    pub fn manufacture() -> PcpResult<Self> {
        let words = corpus();
        let verdicts: Vec<_> = words.iter().copied().map(classify_word).collect();
        let ordinals: BTreeSet<_> = words.iter().map(|word| word.ordinal()).collect();

        let mut position_histogram = [[0_usize; DFCM_OPERATOR_COUNT]; DFCM_COMPOSITION_DEPTH];
        let mut operator_histogram = [0_usize; DFCM_OPERATOR_COUNT];
        let mut prefix_sets: Vec<BTreeSet<Vec<SemanticOperator>>> = (0..DFCM_COMPOSITION_DEPTH)
            .map(|_| BTreeSet::new())
            .collect();
        let mut shell_histogram = [0_usize; DFCM_COMPOSITION_DEPTH + 1];

        for word in &words {
            for (position, operator) in word.0.iter().copied().enumerate() {
                position_histogram[position][operator.index()] += 1;
                operator_histogram[operator.index()] += 1;
            }
            for prefix_length in 1..=DFCM_COMPOSITION_DEPTH {
                prefix_sets[prefix_length - 1].insert(word.0[..prefix_length].to_vec());
            }
            shell_histogram[word.hamming_distance(OperatorWord::ORIGIN)] += 1;
        }

        let prefix_closure = std::array::from_fn(|index| prefix_sets[index].len());
        let mut standing_histogram = BTreeMap::new();
        let mut refusal_histogram = BTreeMap::new();
        for verdict in &verdicts {
            match verdict {
                WordVerdict::Admitted(admission) => {
                    *standing_histogram.entry(admission.standing).or_default() += 1;
                }
                WordVerdict::Refused(refusal) => {
                    *refusal_histogram.entry(refusal.reason).or_default() += 1;
                }
            }
        }

        let admitted_flags: Vec<_> = verdicts.iter().map(WordVerdict::is_admitted).collect();
        let mut undirected_counterfactual_edges = 0;
        let mut admitted_interior_edges = 0;
        let mut refused_interior_edges = 0;
        let mut decision_boundary_edges = 0;
        for word in &words {
            let source = word.ordinal();
            for neighbor in word.neighbors() {
                let target = neighbor.ordinal();
                if source >= target {
                    continue;
                }
                undirected_counterfactual_edges += 1;
                match (admitted_flags[source], admitted_flags[target]) {
                    (true, true) => admitted_interior_edges += 1,
                    (false, false) => refused_interior_edges += 1,
                    _ => decision_boundary_edges += 1,
                }
            }
        }

        let admitted_words = admitted_flags.iter().filter(|admitted| **admitted).count();
        let classified_words = verdicts.len();
        let coverage_gaps = DFCM_CORPUS_SIZE.saturating_sub(ordinals.len());
        let mut receipt = Self {
            schema: DFCM_SCHEMA.to_string(),
            operator_count: SemanticOperator::ALL.len(),
            composition_depth: DFCM_COMPOSITION_DEPTH,
            expected_words: DFCM_CORPUS_SIZE,
            classified_words,
            admitted_words,
            refused_words: classified_words - admitted_words,
            coverage_gaps,
            position_histogram,
            operator_histogram,
            prefix_closure,
            shell_histogram,
            counterfactual_degree: OperatorWord::ORIGIN.neighbors().len(),
            undirected_counterfactual_edges,
            admitted_interior_edges,
            refused_interior_edges,
            decision_boundary_edges,
            standing_histogram,
            refusal_histogram,
            corpus_digest: canonical_digest(&words)?,
            verdict_digest: canonical_digest(&verdicts)?,
            receipt_digest: String::new(),
        };
        receipt.receipt_digest = receipt.expected_digest()?;
        Ok(receipt)
    }

    /// Exact closure gate. This is intentionally stronger than checking only
    /// `classified_words == 4096`.
    pub fn is_complete(&self) -> bool {
        self.schema == DFCM_SCHEMA
            && self.operator_count == DFCM_OPERATOR_COUNT
            && self.composition_depth == DFCM_COMPOSITION_DEPTH
            && self.expected_words == DFCM_CORPUS_SIZE
            && self.classified_words == DFCM_CORPUS_SIZE
            && self.admitted_words == DFCM_ADMITTED_WORD_COUNT
            && self.refused_words == DFCM_REFUSED_WORD_COUNT
            && self.coverage_gaps == 0
            && self.position_histogram.iter().all(|position| {
                position
                    .iter()
                    .all(|count| *count == DFCM_CORPUS_SIZE / DFCM_OPERATOR_COUNT)
            })
            && self.operator_histogram.iter().all(|count| {
                *count == DFCM_COMPOSITION_DEPTH * DFCM_CORPUS_SIZE / DFCM_OPERATOR_COUNT
            })
            && self.prefix_closure == DFCM_PREFIX_CLOSURE
            && self.shell_histogram == DFCM_SHELL_HISTOGRAM
            && self.counterfactual_degree == DFCM_COUNTERFACTUAL_DEGREE
            && self.undirected_counterfactual_edges == DFCM_UNDIRECTED_EDGE_COUNT
            && self.admitted_interior_edges == DFCM_ADMITTED_INTERIOR_EDGE_COUNT
            && self.refused_interior_edges == DFCM_REFUSED_INTERIOR_EDGE_COUNT
            && self.decision_boundary_edges == DFCM_DECISION_BOUNDARY_EDGE_COUNT
            && self.standing_histogram.get(&StandingCeiling::ProofCarrying) == Some(&1_296)
            && self
                .standing_histogram
                .get(&StandingCeiling::TotalCorrectness)
                == Some(&1_105)
            && self
                .standing_histogram
                .get(&StandingCeiling::ReceiptedActuation)
                == Some(&400)
            && self
                .refusal_histogram
                .get(&WordRefusalKind::SemanticMutationAfterReceipt)
                == Some(&DFCM_REFUSED_WORD_COUNT)
    }

    pub fn replay(&self) -> PcpResult<bool> {
        let replayed = Self::manufacture()?;
        Ok(self == &replayed && self.receipt_digest == self.expected_digest()?)
    }

    fn expected_digest(&self) -> PcpResult<String> {
        let mut material = self.clone();
        material.receipt_digest.clear();
        canonical_digest(&material)
    }
}

/// Queryable index over every admitted and refused innovation cell.
#[derive(Debug, Clone)]
pub struct InnovationIndex {
    verdicts: Vec<WordVerdict>,
    receipt: DfcmClosureReceipt,
}

impl InnovationIndex {
    pub fn build() -> PcpResult<Self> {
        let verdicts = corpus().into_iter().map(classify_word).collect();
        let receipt = DfcmClosureReceipt::manufacture()?;
        Ok(Self { verdicts, receipt })
    }

    pub fn receipt(&self) -> &DfcmClosureReceipt {
        &self.receipt
    }

    pub fn verdict(&self, word: OperatorWord) -> &WordVerdict {
        &self.verdicts[word.ordinal()]
    }

    pub fn query_prefix(&self, prefix: &[SemanticOperator]) -> Vec<&WordVerdict> {
        if prefix.len() > DFCM_COMPOSITION_DEPTH {
            return Vec::new();
        }
        self.verdicts
            .iter()
            .filter(|verdict| verdict.word().0.starts_with(prefix))
            .collect()
    }

    /// The exact 28 local counterfactuals, including whether each mutation
    /// crosses the admission/refusal boundary.
    pub fn counterfactuals(&self, source: OperatorWord) -> Vec<Counterfactual> {
        let source_admitted = self.verdict(source).is_admitted();
        source
            .neighbors()
            .into_iter()
            .map(|candidate| {
                let candidate_admitted = self.verdict(candidate).is_admitted();
                Counterfactual {
                    source,
                    candidate,
                    source_admitted,
                    candidate_admitted,
                    crosses_decision_boundary: source_admitted != candidate_admitted,
                }
            })
            .collect()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Counterfactual {
    pub source: OperatorWord,
    pub candidate: OperatorWord,
    pub source_admitted: bool,
    pub candidate_admitted: bool,
    pub crosses_decision_boundary: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn corpus_is_exactly_8_to_the_fourth() {
        let words = corpus();
        assert_eq!(words.len(), DFCM_CORPUS_SIZE);
        assert_eq!(words.first().copied(), OperatorWord::from_ordinal(0));
        assert_eq!(
            words.last().copied(),
            OperatorWord::from_ordinal(DFCM_CORPUS_SIZE - 1)
        );
        assert_eq!(
            words
                .iter()
                .map(|word| word.ordinal())
                .collect::<BTreeSet<_>>()
                .len(),
            DFCM_CORPUS_SIZE
        );
    }

    #[test]
    fn hamming_geometry_is_regular_and_reversible() {
        for word in corpus() {
            let neighbors = word.neighbors();
            assert_eq!(neighbors.len(), DFCM_COUNTERFACTUAL_DEGREE);
            assert_eq!(neighbors.iter().copied().collect::<BTreeSet<_>>().len(), 28);
            for neighbor in neighbors {
                assert_eq!(word.hamming_distance(neighbor), 1);
                assert!(neighbor.neighbors().contains(&word));
            }
        }
    }

    #[test]
    fn mutation_routes_are_minimal_and_receipted() {
        let source = OperatorWord::ORIGIN;
        let target = OperatorWord([
            SemanticOperator::Receipt,
            SemanticOperator::Cycle,
            SemanticOperator::ChoiceGraph,
            SemanticOperator::Frame,
        ]);
        let receipt = MutationReceipt::manufacture(source, target).expect("manufacture route");
        assert_eq!(receipt.distance, 4);
        assert_eq!(receipt.path.len(), 5);
        assert!(receipt.replay().expect("replay route"));

        let mut corrupted = receipt;
        corrupted.path_digest.push('0');
        assert!(!corrupted.replay().expect("reject corrupt route"));
    }

    #[test]
    fn receipt_is_terminal_but_idempotent() {
        let admitted = OperatorWord([
            SemanticOperator::Atom,
            SemanticOperator::Receipt,
            SemanticOperator::Receipt,
            SemanticOperator::Receipt,
        ]);
        assert!(classify_word(admitted).is_admitted());

        let refused = OperatorWord([
            SemanticOperator::Atom,
            SemanticOperator::Receipt,
            SemanticOperator::Cycle,
            SemanticOperator::Receipt,
        ]);
        let WordVerdict::Refused(refusal) = classify_word(refused) else {
            panic!("semantic mutation after receipt must be refused")
        };
        assert_eq!(refusal.position, 2);
        assert_eq!(
            refusal.reason,
            WordRefusalKind::SemanticMutationAfterReceipt
        );
    }

    #[test]
    fn closure_receipt_has_zero_gaps_and_exact_boundary_geometry() {
        let receipt = DfcmClosureReceipt::manufacture().expect("manufacture closure");
        assert!(receipt.is_complete());
        assert!(receipt.replay().expect("replay closure"));
        assert_eq!(receipt.classified_words, 4_096);
        assert_eq!(receipt.admitted_words, 2_801);
        assert_eq!(receipt.refused_words, 1_295);
        assert_eq!(receipt.decision_boundary_edges, 8_400);
        assert_eq!(
            receipt.admitted_interior_edges
                + receipt.refused_interior_edges
                + receipt.decision_boundary_edges,
            DFCM_UNDIRECTED_EDGE_COUNT
        );
    }

    #[test]
    fn closure_receipt_rejects_counterfactual_mutation() {
        let mut receipt = DfcmClosureReceipt::manufacture().expect("manufacture closure");
        receipt.coverage_gaps = 1;
        assert!(!receipt.is_complete());
        assert!(!receipt.replay().expect("replay mutated closure"));
    }

    #[test]
    fn innovation_index_exposes_all_prefixes_and_local_counterfactuals() {
        let index = InnovationIndex::build().expect("build innovation index");
        assert_eq!(index.query_prefix(&[]).len(), 4_096);
        assert_eq!(index.query_prefix(&[SemanticOperator::Cycle]).len(), 512);
        assert_eq!(
            index
                .query_prefix(&[SemanticOperator::Cycle, SemanticOperator::Receipt])
                .len(),
            64
        );
        let counterfactuals = index.counterfactuals(OperatorWord::ORIGIN);
        assert_eq!(counterfactuals.len(), 28);
        assert!(counterfactuals.iter().all(|counterfactual| counterfactual
            .source
            .hamming_distance(counterfactual.candidate)
            == 1));
    }

    #[test]
    fn full_8pow4_manufacture_and_replay_complete_under_five_seconds() {
        let started = Instant::now();
        let receipt = DfcmClosureReceipt::manufacture().expect("manufacture closure");
        assert!(receipt.replay().expect("replay closure"));
        assert!(started.elapsed() < Duration::from_secs(5));
    }
}
