//! Core Prolog8 types per ARD section 4.
//!
//! All hot-tier structures obey the byte caps:
//!
//! - arity ≤ 8 (ARITY_CAP)
//! - body atoms ≤ 8 (BODY_CAP)
//! - variables per rule ≤ 8 (VAR_CAP)
//! - binding patterns ≤ 256 (BINDING_PATTERNS)

use serde::{Deserialize, Serialize};

/// Maximum predicate arity. ARD FR-3.
pub const ARITY_CAP: u8 = 8;
/// Maximum atoms in a rule body. ARD FR-4.
pub const BODY_CAP: u8 = 8;
/// Maximum variables per rule. ARD FR-5.
pub const VAR_CAP: u8 = 8;
/// Number of distinct binding masks per predicate. 2^8.
pub const BINDING_PATTERNS: usize = 256;
/// Sentinel for unused term slots in `Atom8::args`.
pub const TERM_SENTINEL: TermId = TermId(0);

/// Admitted term identifier. ARD section 4.1. Display label is external.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct TermId(pub u32);

impl TermId {
    /// Wrap a raw u32 as a TermId.
    pub const fn new(v: u32) -> Self {
        Self(v)
    }

    /// Sentinel value used to pad unused argument slots.
    pub const fn sentinel() -> Self {
        TERM_SENTINEL
    }

    /// True if this term is the sentinel.
    pub fn is_sentinel(self) -> bool {
        self.0 == 0
    }

    /// Raw underlying integer.
    pub fn as_u32(self) -> u32 {
        self.0
    }
}

/// Admitted predicate identifier. ARD section 4.2.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct PredicateId(pub u32);

impl PredicateId {
    /// Wrap a raw u32 as a PredicateId.
    pub const fn new(v: u32) -> Self {
        Self(v)
    }
    /// Raw underlying integer.
    pub fn as_u32(self) -> u32 {
        self.0
    }
}

/// Rule identifier.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct RuleId(pub u32);

impl RuleId {
    /// Wrap a raw u32.
    pub const fn new(v: u32) -> Self {
        Self(v)
    }
}

/// Catalog identifier (one set of admitted predicates+terms).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
pub struct CatalogId(pub u32);

/// Source identifier — origin of a fact (for provenance).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SourceId(pub u32);

/// Monotonic epoch for time-keyed admissibility.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct EpochId(pub u64);

/// Identifier for a substitution table row produced during execution.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SubstitutionId(pub u32);

/// Identifier for a node in the proof DAG.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ProofNodeId(pub u32);

/// Plan identifier — physical execution plan reference.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
pub struct PlanId(pub u32);

/// Atom8 — a predicate application with up to 8 arguments. ARD section 4.3.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Atom8 {
    /// Predicate identifier (must exist in catalog).
    pub pred_id: PredicateId,
    /// Number of significant arguments. Must be ≤ ARITY_CAP.
    pub arity: u8,
    /// Bit i set means argument i is bound (input). Bits ≥ arity must be 0.
    pub binding_mask: u8,
    /// Argument slots. Slots ≥ arity must equal `TERM_SENTINEL`.
    pub args: [TermId; ARITY_CAP as usize],
}

impl Atom8 {
    /// Construct an Atom8 from arity and slice of args, zero-padding the rest.
    /// Returns the atom even if it would fail admission — callers should run
    /// admission separately for kernel safety.
    pub fn new(pred_id: PredicateId, arity: u8, args: &[TermId]) -> Self {
        let mut padded = [TERM_SENTINEL; ARITY_CAP as usize];
        let take = arity.min(ARITY_CAP) as usize;
        padded[..take].copy_from_slice(&args[..take]);
        Self {
            pred_id,
            arity: arity.min(ARITY_CAP),
            binding_mask: 0,
            args: padded,
        }
    }

    /// Set the binding mask. Caller must ensure mask bits ≥ arity are 0.
    pub fn with_binding(mut self, binding_mask: u8) -> Self {
        self.binding_mask = binding_mask;
        self
    }

    /// True if argument position `i` (0-indexed) is bound.
    pub fn is_bound(&self, i: u8) -> bool {
        i < ARITY_CAP && (self.binding_mask & (1u8 << i)) != 0
    }

    /// Iterator over the live (in-arity) argument terms.
    pub fn live_args(&self) -> impl Iterator<Item = &TermId> {
        self.args.iter().take(self.arity as usize)
    }
}

/// Rule8 — a Horn clause with up to 8 body atoms. ARD section 4.4.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rule8 {
    /// Rule identifier.
    pub rule_id: RuleId,
    /// Head atom.
    pub head: Atom8,
    /// Body atoms (only first `body_len` are significant).
    pub body: [Atom8; BODY_CAP as usize],
    /// Number of significant body atoms. Must be ≤ BODY_CAP.
    pub body_len: u8,
    /// Bit i set ⇔ body[i] is present (must equal `(1<<body_len)-1`).
    pub body_mask: u8,
    /// Bit i set ⇔ body[i] is negated. Bits ≥ body_len must be 0.
    pub negation_mask: u8,
    /// Bit i set ⇔ body[i] is a built-in. Bits ≥ body_len must be 0.
    pub builtin_mask: u8,
    /// Number of distinct variables in head ∪ body. Must be ≤ VAR_CAP.
    pub var_count: u8,
    /// Bit i set ⇔ variable index i appears in head (output position).
    pub var_live_mask: u8,
    /// Feature classes used by this rule (bitmap over `FeatureBit`).
    pub feature_mask: u8,
    /// Bit i set ⇔ proof slot i should be emitted.
    pub proof_mask: u8,
    /// Pre-compiled physical plan reference.
    pub plan_id: PlanId,
}

/// Feature classes admitted by Prolog8 hot tier. ARD section 5.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum FeatureBit {
    /// Bit 0 — facts.
    Facts = 0,
    /// Bit 1 — Horn rules.
    HornRules = 1,
    /// Bit 2 — equality.
    Equality = 2,
    /// Bit 3 — typed comparisons.
    TypedComparisons = 3,
    /// Bit 4 — stratified negation.
    StratifiedNegation = 4,
    /// Bit 5 — bounded recursion.
    BoundedRecursion = 5,
    /// Bit 6 — controlled aggregates.
    ControlledAggregates = 6,
    /// Bit 7 — contracted foreign predicates.
    ContractedForeign = 7,
}

impl FeatureBit {
    /// All admitted feature bits, in order.
    pub const ALL: [FeatureBit; 8] = [
        FeatureBit::Facts,
        FeatureBit::HornRules,
        FeatureBit::Equality,
        FeatureBit::TypedComparisons,
        FeatureBit::StratifiedNegation,
        FeatureBit::BoundedRecursion,
        FeatureBit::ControlledAggregates,
        FeatureBit::ContractedForeign,
    ];

    /// Bit position (0..=7).
    pub fn bit(self) -> u8 {
        self as u8
    }

    /// Mask with only this bit set.
    pub fn mask(self) -> u8 {
        1u8 << (self as u8)
    }
}

/// Proof emission policy for a query.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProofMode {
    /// Emit only positive proof for true decisions.
    PositiveOnly,
    /// Emit only negative proof for false decisions.
    NegativeOnly,
    /// Emit both positive and negative proof.
    Both,
    /// Emit only the proof root hash (compact).
    Hashed,
}

/// QueryAtom8 — a query against the kernel. ARD section 4.5.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct QueryAtom8 {
    /// The atom being queried.
    pub atom: Atom8,
    /// Bit i set ⇔ argument i is requested as output.
    pub output_mask: u8,
    /// Proof policy.
    pub proof_mode: ProofMode,
    /// Epoch under which this query is evaluated.
    pub epoch: EpochId,
}

/// FactRow8 — a single ground fact for a predicate. ARD section 4.6.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct FactRow8 {
    /// Predicate identifier.
    pub pred_id: PredicateId,
    /// Arity. Must be ≤ ARITY_CAP.
    pub arity: u8,
    /// Argument terms (positions ≥ arity must equal sentinel).
    pub args: [TermId; ARITY_CAP as usize],
    /// Provenance source.
    pub source_id: SourceId,
    /// BLAKE3 over canonical encoding.
    pub fact_hash: [u8; 32],
}

impl FactRow8 {
    /// Construct a fact row with no precomputed hash.
    pub fn new(pred_id: PredicateId, arity: u8, args: &[TermId], source_id: SourceId) -> Self {
        let mut padded = [TERM_SENTINEL; ARITY_CAP as usize];
        let take = arity.min(ARITY_CAP) as usize;
        padded[..take].copy_from_slice(&args[..take]);
        let row_no_hash = FactRow8 {
            pred_id,
            arity: arity.min(ARITY_CAP),
            args: padded,
            source_id,
            fact_hash: [0u8; 32],
        };
        let h = row_no_hash.canonical_hash();
        FactRow8 {
            fact_hash: h,
            ..row_no_hash
        }
    }

    /// Canonical BLAKE3 hash of the fact (excluding the hash field itself).
    pub fn canonical_hash(&self) -> [u8; 32] {
        use crate::hash::DOMAIN_PROLOG8_FACT;
        let mut hasher = blake3::Hasher::new_keyed(&DOMAIN_PROLOG8_FACT);
        hasher.update(&self.pred_id.0.to_le_bytes());
        hasher.update(&[self.arity]);
        hasher.update(&self.source_id.0.to_le_bytes());
        for i in 0..self.arity as usize {
            hasher.update(&self.args[i].0.to_le_bytes());
        }
        hasher.finalize().into()
    }
}

/// Metadata for skip decisions on a fact block. ARD section 4.7.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FactBlockMeta {
    /// Per-column min term id.
    pub min_terms: [TermId; ARITY_CAP as usize],
    /// Per-column max term id.
    pub max_terms: [TermId; ARITY_CAP as usize],
    /// Bit i set ⇔ column i has a single constant value across all rows.
    pub constant_columns: u8,
    /// Earliest epoch at which any row in the block is valid.
    pub epoch_min: EpochId,
    /// Latest epoch at which any row in the block is valid.
    pub epoch_max: EpochId,
    /// Cumulative source root for provenance.
    pub source_root: [u8; 32],
    /// Cumulative fact root for the block.
    pub fact_root: [u8; 32],
    /// OR over capability masks of contained rows.
    pub capability_mask_or: u32,
    /// AND over capability masks of contained rows.
    pub capability_mask_and: u32,
}

impl Default for FactBlockMeta {
    fn default() -> Self {
        Self {
            min_terms: [TERM_SENTINEL; ARITY_CAP as usize],
            max_terms: [TERM_SENTINEL; ARITY_CAP as usize],
            constant_columns: 0,
            epoch_min: EpochId(0),
            epoch_max: EpochId(u64::MAX),
            source_root: [0u8; 32],
            fact_root: [0u8; 32],
            capability_mask_or: 0,
            capability_mask_and: u32::MAX,
        }
    }
}

/// FactBlock8 — sorted batch of FactRow8 for one predicate. ARD section 4.7.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FactBlock8 {
    /// Predicate identifier.
    pub pred_id: PredicateId,
    /// Arity (must match catalog).
    pub arity: u8,
    /// Argument order this block is sorted by (e.g., [2, 0, 1, …] = sorted on column 2 then 0 then 1).
    pub arg_order: [u8; ARITY_CAP as usize],
    /// Number of rows.
    pub row_count: u32,
    /// Decoded rows (in-memory representation; on-wire encoding is opaque).
    pub rows: Vec<FactRow8>,
    /// Skip-decision metadata.
    pub metadata: FactBlockMeta,
    /// BLAKE3 root over canonical encoding of all rows.
    pub block_hash: [u8; 32],
}

impl FactBlock8 {
    /// Construct a fact block from rows. Recomputes metadata + block hash.
    pub fn new(pred_id: PredicateId, arity: u8, rows: Vec<FactRow8>) -> Self {
        let mut block = FactBlock8 {
            pred_id,
            arity: arity.min(ARITY_CAP),
            arg_order: [0u8; ARITY_CAP as usize],
            row_count: rows.len() as u32,
            rows,
            metadata: FactBlockMeta::default(),
            block_hash: [0u8; 32],
        };
        block.recompute_metadata();
        block.block_hash = block.canonical_hash();
        block
    }

    /// Recompute min/max term per column and the fact_root.
    pub fn recompute_metadata(&mut self) {
        if self.rows.is_empty() {
            return;
        }
        let arity = self.arity as usize;
        let mut mins = [TermId(u32::MAX); ARITY_CAP as usize];
        let mut maxs = [TERM_SENTINEL; ARITY_CAP as usize];
        let mut const_mask = 0xFFu8;
        let first = self.rows[0];
        let mut hasher = blake3::Hasher::new_keyed(&crate::hash::DOMAIN_PROLOG8_BLOCK);
        for row in &self.rows {
            hasher.update(&row.fact_hash);
            for i in 0..arity {
                if row.args[i].0 < mins[i].0 {
                    mins[i] = row.args[i];
                }
                if row.args[i].0 > maxs[i].0 {
                    maxs[i] = row.args[i];
                }
                if row.args[i] != first.args[i] {
                    const_mask &= !(1u8 << i);
                }
            }
        }
        self.metadata.min_terms = mins;
        self.metadata.max_terms = maxs;
        self.metadata.constant_columns = const_mask & ((1u8 << arity).wrapping_sub(1));
        self.metadata.fact_root = hasher.finalize().into();
    }

    /// Recompute the canonical block hash.
    pub fn canonical_hash(&self) -> [u8; 32] {
        let mut hasher = blake3::Hasher::new_keyed(&crate::hash::DOMAIN_PROLOG8_BLOCK_HEADER);
        hasher.update(&self.pred_id.0.to_le_bytes());
        hasher.update(&[self.arity]);
        hasher.update(&self.row_count.to_le_bytes());
        hasher.update(&self.metadata.fact_root);
        hasher.finalize().into()
    }

    /// Test if a binding-mask query is excluded by metadata (skip decision).
    /// Returns `true` if the block CANNOT contribute matches.
    pub fn skip_for(&self, query: &Atom8, epoch: EpochId) -> bool {
        if epoch < self.metadata.epoch_min || epoch > self.metadata.epoch_max {
            return true;
        }
        for i in 0..self.arity as usize {
            if query.is_bound(i as u8) {
                let q = query.args[i];
                if q.0 < self.metadata.min_terms[i].0 || q.0 > self.metadata.max_terms[i].0 {
                    return true;
                }
            }
        }
        false
    }
}

/// Kinds of proof-DAG nodes. ARD section 4.8.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProofKind {
    /// Direct fact lookup.
    Fact,
    /// Rule application.
    Rule,
    /// Built-in evaluation.
    Builtin,
    /// Stratified negation.
    Negation,
    /// Anti-join.
    AntiJoin,
    /// Aggregate.
    Aggregate,
    /// Contracted foreign predicate.
    Foreign,
    /// Negative proof: required fact missing.
    MissingFact,
    /// Negative proof: join failed.
    FailedJoin,
    /// Negative proof: blocked alternative.
    BlockedAlternative,
}

/// One node in the proof DAG. ARD section 4.8.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProofNode {
    /// Identifier within this proof DAG.
    pub node_id: ProofNodeId,
    /// What kind of step this represents.
    pub kind: ProofKind,
    /// Predicate this step pertains to.
    pub pred_id: PredicateId,
    /// Optional rule firing.
    pub rule_id: Option<RuleId>,
    /// Optional fact reference.
    pub fact_hash: Option<[u8; 32]>,
    /// Child nodes (max 8 per ARD).
    pub children: [ProofNodeId; 8],
    /// Number of significant children.
    pub child_count: u8,
    /// Substitution row this step corresponds to.
    pub substitution_id: SubstitutionId,
    /// BLAKE3 over canonical encoding of this node.
    pub node_hash: [u8; 32],
}

impl ProofNode {
    /// Compute the canonical hash for this node.
    pub fn canonical_hash(&self) -> [u8; 32] {
        let mut hasher = blake3::Hasher::new_keyed(&crate::hash::DOMAIN_PROLOG8_PROOF_NODE);
        hasher.update(&self.node_id.0.to_le_bytes());
        hasher.update(&[self.kind_byte()]);
        hasher.update(&self.pred_id.0.to_le_bytes());
        hasher.update(&[self.rule_id.is_some() as u8]);
        if let Some(rid) = self.rule_id {
            hasher.update(&rid.0.to_le_bytes());
        }
        hasher.update(&[self.fact_hash.is_some() as u8]);
        if let Some(fh) = self.fact_hash {
            hasher.update(&fh);
        }
        hasher.update(&[self.child_count]);
        for i in 0..self.child_count as usize {
            hasher.update(&self.children[i].0.to_le_bytes());
        }
        hasher.update(&self.substitution_id.0.to_le_bytes());
        hasher.finalize().into()
    }

    fn kind_byte(&self) -> u8 {
        match self.kind {
            ProofKind::Fact => 0,
            ProofKind::Rule => 1,
            ProofKind::Builtin => 2,
            ProofKind::Negation => 3,
            ProofKind::AntiJoin => 4,
            ProofKind::Aggregate => 5,
            ProofKind::Foreign => 6,
            ProofKind::MissingFact => 7,
            ProofKind::FailedJoin => 8,
            ProofKind::BlockedAlternative => 9,
        }
    }
}

/// The canonical decision values. ARD section 4.9.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DecisionKind {
    /// Action admitted with positive proof.
    Allow,
    /// Action denied with negative proof.
    Deny,
    /// Decision requires escalation.
    Escalate,
    /// Insufficient evidence to decide.
    Unknown,
    /// Inputs failed admission.
    Invalid,
}

/// Cryptographic receipt for a decision. ARD section 4.9.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Receipt {
    /// Engine version string (env!("CARGO_PKG_VERSION") at receipt time).
    pub engine_version: String,
    /// Hash of the catalog used.
    pub catalog_root: [u8; 32],
    /// Hash of the rule artifact used.
    pub rule_root: [u8; 32],
    /// Hash of the fact artifact used.
    pub fact_root: [u8; 32],
    /// Hash of the input query.
    pub input_root: [u8; 32],
    /// Hash of the proof DAG.
    pub proof_root: [u8; 32],
    /// Hash of the output bindings.
    pub output_root: [u8; 32],
    /// Decision value.
    pub decision: DecisionKind,
    /// Epoch under which the decision was made.
    pub epoch: EpochId,
    /// Combined receipt hash (depends on all roots above).
    pub receipt_hash: [u8; 32],
}

impl Receipt {
    /// Compute the canonical receipt hash from the constituent roots.
    pub fn compute_hash(&self) -> [u8; 32] {
        let mut hasher = blake3::Hasher::new_keyed(&crate::hash::DOMAIN_PROLOG8_RECEIPT);
        hasher.update(self.engine_version.as_bytes());
        hasher.update(&self.catalog_root);
        hasher.update(&self.rule_root);
        hasher.update(&self.fact_root);
        hasher.update(&self.input_root);
        hasher.update(&self.proof_root);
        hasher.update(&self.output_root);
        hasher.update(&[self.decision_byte()]);
        hasher.update(&self.epoch.0.to_le_bytes());
        hasher.finalize().into()
    }

    fn decision_byte(&self) -> u8 {
        match self.decision {
            DecisionKind::Allow => 0,
            DecisionKind::Deny => 1,
            DecisionKind::Escalate => 2,
            DecisionKind::Unknown => 3,
            DecisionKind::Invalid => 4,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arity_cap_constant() {
        assert_eq!(ARITY_CAP, 8);
        assert_eq!(BODY_CAP, 8);
        assert_eq!(VAR_CAP, 8);
        assert_eq!(BINDING_PATTERNS, 256);
    }

    #[test]
    fn atom8_pads_unused_args_with_sentinel() {
        let a = Atom8::new(PredicateId(1), 3, &[TermId(10), TermId(11), TermId(12)]);
        assert_eq!(a.arity, 3);
        assert_eq!(a.args[0], TermId(10));
        assert_eq!(a.args[3], TERM_SENTINEL);
    }

    #[test]
    fn atom8_clamps_oversize_arity() {
        let a = Atom8::new(PredicateId(1), 99, &[TermId(1); 16]);
        assert_eq!(a.arity, ARITY_CAP);
    }

    #[test]
    fn fact_row_hash_is_deterministic() {
        let r1 = FactRow8::new(PredicateId(1), 2, &[TermId(10), TermId(11)], SourceId(0));
        let r2 = FactRow8::new(PredicateId(1), 2, &[TermId(10), TermId(11)], SourceId(0));
        assert_eq!(r1.fact_hash, r2.fact_hash);
        let r3 = FactRow8::new(PredicateId(1), 2, &[TermId(10), TermId(12)], SourceId(0));
        assert_ne!(r1.fact_hash, r3.fact_hash);
    }

    #[test]
    fn fact_block_skip_for_out_of_range_term() {
        let rows = vec![
            FactRow8::new(PredicateId(1), 2, &[TermId(10), TermId(20)], SourceId(0)),
            FactRow8::new(PredicateId(1), 2, &[TermId(11), TermId(21)], SourceId(0)),
        ];
        let block = FactBlock8::new(PredicateId(1), 2, rows);
        let mut q = Atom8::new(PredicateId(1), 2, &[TermId(99), TERM_SENTINEL]);
        q.binding_mask = 0b01;
        assert!(block.skip_for(&q, EpochId(0)));
    }

    #[test]
    fn feature_bit_mask_round_trips() {
        for bit in FeatureBit::ALL {
            let m = bit.mask();
            assert_eq!(m.count_ones(), 1);
            assert!((m >> bit.bit()) & 1 == 1);
        }
    }
}
