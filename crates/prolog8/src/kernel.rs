//! Kernel — query execution, proof emission, receipt assembly.
//!
//! ARD section 8 (execution model), 11 (proof requirements), 13 (WASM ABI).
//!
//! The kernel never sees strings. It accepts only `Catalog`, `FactBlock8`s,
//! `Rule8`s, and `QueryAtom8`s, and emits answers + proof + receipt.

use crate::admission::{admit_atom, admit_rule, RejectionCode};
use crate::catalog::Catalog;
use crate::hash::{combine_roots, Hash, DOMAIN_PROLOG8_INPUT, DOMAIN_PROLOG8_OUTPUT, DOMAIN_PROLOG8_PROOF_ROOT, DOMAIN_PROLOG8_RULES};
use crate::types::{
    Atom8, DecisionKind, EpochId, FactBlock8, FactRow8, ProofKind, ProofMode, ProofNode,
    ProofNodeId, QueryAtom8, Receipt, Rule8, SubstitutionId, TermId, ARITY_CAP,
};
use serde::{Deserialize, Serialize};

/// One answer row: bindings for the output positions.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Decision {
    /// The decision value.
    pub kind: DecisionKind,
    /// Output bindings: one entry per `Some` output position in `output_mask`.
    pub bindings: Vec<TermId>,
    /// Proof DAG nodes (positive or negative).
    pub proof: Vec<ProofNode>,
    /// Receipt assembled from all roots.
    pub receipt: Receipt,
}

/// Result of running a query.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum QueryResult {
    /// Query produced one or more answers.
    Answered(Vec<Decision>),
    /// Query produced no answers (false / deny).
    Denied(Decision),
    /// Inputs failed admission.
    Invalid(RejectionCode),
}

/// The Prolog8 kernel. Owns a catalog, fact blocks, and rule set.
pub struct Kernel {
    /// Admitted catalog.
    pub catalog: Catalog,
    /// Loaded fact blocks (per ARD section 4.7).
    pub fact_blocks: Vec<FactBlock8>,
    /// Loaded rules (per ARD section 4.4).
    pub rules: Vec<Rule8>,
}

impl Kernel {
    /// Construct an empty kernel.
    pub fn new(catalog: Catalog) -> Self {
        Self {
            catalog,
            fact_blocks: Vec::new(),
            rules: Vec::new(),
        }
    }

    /// Load a fact block. Block must be admitted before any query touches it.
    pub fn load_facts(&mut self, block: FactBlock8) -> Result<(), RejectionCode> {
        // Sanity: block predicate must exist in catalog with matching arity.
        let meta = self
            .catalog
            .predicate(block.pred_id)
            .ok_or(RejectionCode::PredicateNotInCatalog)?;
        if meta.arity != block.arity {
            return Err(RejectionCode::ArityMismatch);
        }
        self.fact_blocks.push(block);
        Ok(())
    }

    /// Load a rule. Runs admission.
    pub fn load_rule(&mut self, rule: Rule8) -> Result<(), RejectionCode> {
        admit_rule(&rule, &self.catalog)?;
        self.rules.push(rule);
        Ok(())
    }

    /// Run a query end-to-end: validate, scan facts, fire applicable rules,
    /// emit proof and receipt.
    pub fn query(&self, q: &QueryAtom8) -> QueryResult {
        if let Err(code) = admit_atom(&q.atom, &self.catalog) {
            return QueryResult::Invalid(code);
        }

        // Phase 1: direct fact matches.
        let fact_answers = self.scan_facts(&q.atom, q.epoch);

        if !fact_answers.is_empty() {
            let answers = fact_answers
                .into_iter()
                .enumerate()
                .map(|(i, (row, fact_hash))| self.assemble_fact_answer(q, &row, fact_hash, i))
                .collect();
            return QueryResult::Answered(answers);
        }

        // Phase 2: rule application (one-step, depth-1 backwards chaining).
        let rule_answers = self.scan_rules(q);
        if !rule_answers.is_empty() {
            return QueryResult::Answered(rule_answers);
        }

        // Phase 3: deny with negative proof.
        QueryResult::Denied(self.assemble_negative(q))
    }

    /// Scan all admitted fact blocks for rows that unify with `query`.
    /// Returns `(row, fact_hash)` pairs.
    fn scan_facts(&self, query: &Atom8, epoch: EpochId) -> Vec<(FactRow8, [u8; 32])> {
        let mut out = Vec::new();
        for block in &self.fact_blocks {
            if block.pred_id != query.pred_id {
                continue;
            }
            if block.skip_for(query, epoch) {
                continue;
            }
            for row in &block.rows {
                if Self::row_matches(row, query) {
                    out.push((*row, row.fact_hash));
                }
            }
        }
        out
    }

    /// Test whether a fact row matches a query atom under bound positions.
    fn row_matches(row: &FactRow8, query: &Atom8) -> bool {
        if row.pred_id != query.pred_id || row.arity != query.arity {
            return false;
        }
        for i in 0..row.arity as usize {
            if query.is_bound(i as u8) {
                if row.args[i] != query.args[i] {
                    return false;
                }
            }
        }
        true
    }

    /// Apply rules whose head unifies with the query and whose body succeeds.
    /// One-step chaining; deeper recursion requires bounded-recursion feature
    /// (out of scope for MVP).
    fn scan_rules(&self, q: &QueryAtom8) -> Vec<Decision> {
        let mut answers = Vec::new();
        for rule in &self.rules {
            if rule.head.pred_id != q.atom.pred_id || rule.head.arity != q.atom.arity {
                continue;
            }
            // Head-query unification: check that bound positions agree if both
            // are bound (ground); if rule head has a sentinel slot at i, treat
            // as variable that binds to query arg.
            // For MVP: only support rules whose head is fully ground from facts.
            let mut bindings = [TermId::sentinel(); ARITY_CAP as usize];
            let mut ok = true;
            for i in 0..rule.head.arity as usize {
                let q_arg = q.atom.args[i];
                let h_arg = rule.head.args[i];
                if q.atom.is_bound(i as u8) && !h_arg.is_sentinel() && q_arg != h_arg {
                    ok = false;
                    break;
                }
                bindings[i] = if q.atom.is_bound(i as u8) { q_arg } else { h_arg };
            }
            if !ok {
                continue;
            }

            // Body check: every body atom must be derivable from facts under
            // the inherited bindings. (One-level; no shared variables across
            // body atoms beyond head bindings.)
            let mut all_supported = true;
            let mut supporting_facts: Vec<FactRow8> = Vec::new();
            for i in 0..rule.body_len as usize {
                let body_atom = rule.body[i];
                // Substitute head bindings into body args by position.
                let mut concrete = body_atom;
                concrete.binding_mask = body_atom.binding_mask;
                // Mark all positions as bound — MVP rules ground the body via
                // head bindings or rule literals only.
                let live_mask = if concrete.arity == 8 {
                    0xFFu8
                } else {
                    ((1u16 << concrete.arity) as u8).wrapping_sub(1)
                };
                concrete.binding_mask = live_mask;
                let supports = self.scan_facts(&concrete, q.epoch);
                if supports.is_empty() {
                    all_supported = false;
                    break;
                }
                supporting_facts.push(supports[0].0);
            }

            if all_supported {
                answers.push(self.assemble_rule_answer(q, rule, &bindings, &supporting_facts));
            }
        }
        answers
    }

    fn assemble_fact_answer(
        &self,
        q: &QueryAtom8,
        row: &FactRow8,
        fact_hash: [u8; 32],
        idx: usize,
    ) -> Decision {
        let mut bindings = Vec::new();
        for i in 0..row.arity {
            if (q.output_mask >> i) & 1 == 1 {
                bindings.push(row.args[i as usize]);
            }
        }
        let proof = if matches!(q.proof_mode, ProofMode::PositiveOnly | ProofMode::Both) {
            vec![ProofNode {
                node_id: ProofNodeId(idx as u32),
                kind: ProofKind::Fact,
                pred_id: row.pred_id,
                rule_id: None,
                fact_hash: Some(fact_hash),
                children: [ProofNodeId(0); 8],
                child_count: 0,
                substitution_id: SubstitutionId(idx as u32),
                node_hash: [0u8; 32],
            }]
        } else {
            Vec::new()
        };
        let proof = self.finalize_proof(proof);
        let receipt = self.assemble_receipt(q, &proof, DecisionKind::Allow);
        Decision {
            kind: DecisionKind::Allow,
            bindings,
            proof,
            receipt,
        }
    }

    fn assemble_rule_answer(
        &self,
        q: &QueryAtom8,
        rule: &Rule8,
        bindings_arr: &[TermId; 8],
        supporting_facts: &[FactRow8],
    ) -> Decision {
        let mut bindings = Vec::new();
        for i in 0..rule.head.arity {
            if (q.output_mask >> i) & 1 == 1 {
                bindings.push(bindings_arr[i as usize]);
            }
        }
        let mut proof = Vec::new();
        for (i, fact) in supporting_facts.iter().enumerate() {
            proof.push(ProofNode {
                node_id: ProofNodeId(i as u32),
                kind: ProofKind::Fact,
                pred_id: fact.pred_id,
                rule_id: None,
                fact_hash: Some(fact.fact_hash),
                children: [ProofNodeId(0); 8],
                child_count: 0,
                substitution_id: SubstitutionId(i as u32),
                node_hash: [0u8; 32],
            });
        }
        let mut child_ids = [ProofNodeId(0); 8];
        for (i, _) in supporting_facts.iter().enumerate() {
            child_ids[i] = ProofNodeId(i as u32);
        }
        proof.push(ProofNode {
            node_id: ProofNodeId(supporting_facts.len() as u32),
            kind: ProofKind::Rule,
            pred_id: rule.head.pred_id,
            rule_id: Some(rule.rule_id),
            fact_hash: None,
            children: child_ids,
            child_count: supporting_facts.len() as u8,
            substitution_id: SubstitutionId(0),
            node_hash: [0u8; 32],
        });
        let proof = self.finalize_proof(proof);
        let receipt = self.assemble_receipt(q, &proof, DecisionKind::Allow);
        Decision {
            kind: DecisionKind::Allow,
            bindings,
            proof,
            receipt,
        }
    }

    fn assemble_negative(&self, q: &QueryAtom8) -> Decision {
        let proof = if matches!(q.proof_mode, ProofMode::NegativeOnly | ProofMode::Both) {
            vec![ProofNode {
                node_id: ProofNodeId(0),
                kind: ProofKind::MissingFact,
                pred_id: q.atom.pred_id,
                rule_id: None,
                fact_hash: None,
                children: [ProofNodeId(0); 8],
                child_count: 0,
                substitution_id: SubstitutionId(0),
                node_hash: [0u8; 32],
            }]
        } else {
            Vec::new()
        };
        let proof = self.finalize_proof(proof);
        let receipt = self.assemble_receipt(q, &proof, DecisionKind::Deny);
        Decision {
            kind: DecisionKind::Deny,
            bindings: Vec::new(),
            proof,
            receipt,
        }
    }

    fn finalize_proof(&self, mut proof: Vec<ProofNode>) -> Vec<ProofNode> {
        for node in &mut proof {
            node.node_hash = node.canonical_hash();
        }
        proof
    }

    fn assemble_receipt(&self, q: &QueryAtom8, proof: &[ProofNode], decision: DecisionKind) -> Receipt {
        let catalog_root = self.catalog.catalog_root();
        let rule_root = self.rule_root();
        let fact_root = self.fact_root();
        let input_root = Self::input_root(q);
        let proof_root = Self::proof_root(proof);
        let output_root = Self::output_root(q, proof);
        let mut receipt = Receipt {
            engine_version: crate::ENGINE_VERSION.to_string(),
            catalog_root,
            rule_root,
            fact_root,
            input_root,
            proof_root,
            output_root,
            decision,
            epoch: q.epoch,
            receipt_hash: [0u8; 32],
        };
        receipt.receipt_hash = receipt.compute_hash();
        receipt
    }

    fn rule_root(&self) -> Hash {
        let mut hasher = blake3::Hasher::new_keyed(&DOMAIN_PROLOG8_RULES);
        hasher.update(&(self.rules.len() as u32).to_le_bytes());
        for r in &self.rules {
            hasher.update(&r.rule_id.0.to_le_bytes());
            hasher.update(&r.head.pred_id.0.to_le_bytes());
            hasher.update(&[r.head.arity, r.body_len, r.var_count]);
            hasher.update(&[r.body_mask, r.negation_mask, r.builtin_mask, r.feature_mask]);
        }
        hasher.finalize().into()
    }

    fn fact_root(&self) -> Hash {
        let mut roots: Vec<&Hash> = Vec::new();
        for b in &self.fact_blocks {
            roots.push(&b.metadata.fact_root);
        }
        if roots.is_empty() {
            return [0u8; 32];
        }
        combine_roots(&roots)
    }

    fn input_root(q: &QueryAtom8) -> Hash {
        let mut hasher = blake3::Hasher::new_keyed(&DOMAIN_PROLOG8_INPUT);
        hasher.update(&q.atom.pred_id.0.to_le_bytes());
        hasher.update(&[q.atom.arity, q.atom.binding_mask, q.output_mask]);
        for i in 0..q.atom.arity as usize {
            hasher.update(&q.atom.args[i].0.to_le_bytes());
        }
        hasher.update(&q.epoch.0.to_le_bytes());
        hasher.finalize().into()
    }

    fn proof_root(proof: &[ProofNode]) -> Hash {
        let mut hasher = blake3::Hasher::new_keyed(&DOMAIN_PROLOG8_PROOF_ROOT);
        hasher.update(&(proof.len() as u32).to_le_bytes());
        for n in proof {
            hasher.update(&n.node_hash);
        }
        hasher.finalize().into()
    }

    fn output_root(q: &QueryAtom8, proof: &[ProofNode]) -> Hash {
        let mut hasher = blake3::Hasher::new_keyed(&DOMAIN_PROLOG8_OUTPUT);
        hasher.update(&q.output_mask.to_le_bytes());
        // Output bindings live inside the matching ProofNode that wraps a fact.
        for n in proof {
            if let Some(fh) = n.fact_hash {
                hasher.update(&fh);
            }
        }
        hasher.finalize().into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::{PredicateMeta, PredicateProofPolicy};
    use crate::types::{
        Atom8, CatalogId, EpochId, FactBlock8, FactRow8, PlanId, PredicateId, QueryAtom8, RuleId,
        SourceId, FeatureBit,
    };

    fn build_kernel() -> Kernel {
        let mut cat = Catalog::new(CatalogId(1));
        cat.add_predicate(PredicateMeta {
            pred_id: PredicateId(1),
            label: "parent".into(),
            arity: 2,
            access_orders: vec![],
            proof_policy: PredicateProofPolicy::OnRequest,
            materialized: false,
        });
        cat.add_predicate(PredicateMeta {
            pred_id: PredicateId(2),
            label: "ancestor".into(),
            arity: 2,
            access_orders: vec![],
            proof_policy: PredicateProofPolicy::OnRequest,
            materialized: false,
        });
        let alice = cat.intern_term("alice");
        let bob = cat.intern_term("bob");
        let carol = cat.intern_term("carol");

        let mut k = Kernel::new(cat);
        let rows = vec![
            FactRow8::new(PredicateId(1), 2, &[alice, bob], SourceId(0)),
            FactRow8::new(PredicateId(1), 2, &[bob, carol], SourceId(0)),
        ];
        k.load_facts(FactBlock8::new(PredicateId(1), 2, rows)).unwrap();
        k
    }

    #[test]
    fn query_known_fact_returns_allow_with_proof() {
        let k = build_kernel();
        let alice = k.catalog.term_id("alice").unwrap();
        let bob = k.catalog.term_id("bob").unwrap();
        let mut q_atom = Atom8::new(PredicateId(1), 2, &[alice, bob]);
        q_atom.binding_mask = 0b11;
        let q = QueryAtom8 {
            atom: q_atom,
            output_mask: 0,
            proof_mode: ProofMode::Both,
            epoch: EpochId(0),
        };
        match k.query(&q) {
            QueryResult::Answered(answers) => {
                assert_eq!(answers.len(), 1);
                assert_eq!(answers[0].kind, DecisionKind::Allow);
                assert!(!answers[0].proof.is_empty());
                assert_ne!(answers[0].receipt.receipt_hash, [0u8; 32]);
            }
            other => panic!("expected Answered, got {other:?}"),
        }
    }

    #[test]
    fn query_unknown_fact_returns_deny_with_negative_proof() {
        let k = build_kernel();
        let alice = k.catalog.term_id("alice").unwrap();
        let carol = k.catalog.term_id("carol").unwrap();
        let mut q_atom = Atom8::new(PredicateId(1), 2, &[alice, carol]);
        q_atom.binding_mask = 0b11;
        let q = QueryAtom8 {
            atom: q_atom,
            output_mask: 0,
            proof_mode: ProofMode::Both,
            epoch: EpochId(0),
        };
        match k.query(&q) {
            QueryResult::Denied(d) => {
                assert_eq!(d.kind, DecisionKind::Deny);
                assert_eq!(d.proof.len(), 1);
                assert_eq!(d.proof[0].kind, ProofKind::MissingFact);
                assert_eq!(d.bindings.len(), 0);
            }
            other => panic!("expected Denied, got {other:?}"),
        }
    }

    #[test]
    fn query_with_oversize_arity_returns_invalid() {
        let k = build_kernel();
        // Construct an atom whose arity disagrees with catalog.
        let mut bad = Atom8::new(PredicateId(1), 3, &[TermId(1), TermId(2), TermId(3)]);
        bad.binding_mask = 0b111;
        let q = QueryAtom8 {
            atom: bad,
            output_mask: 0,
            proof_mode: ProofMode::PositiveOnly,
            epoch: EpochId(0),
        };
        match k.query(&q) {
            QueryResult::Invalid(code) => assert_eq!(code, RejectionCode::ArityMismatch),
            other => panic!("expected Invalid, got {other:?}"),
        }
    }

    #[test]
    fn rule_one_step_chain_yields_answer() {
        let mut k = build_kernel();
        let alice = k.catalog.term_id("alice").unwrap();
        let bob = k.catalog.term_id("bob").unwrap();
        // Define a rule:  ancestor(alice, bob) :- parent(alice, bob).
        let head = Atom8::new(PredicateId(2), 2, &[alice, bob]);
        let body = Atom8::new(PredicateId(1), 2, &[alice, bob]);
        let mut body_arr = [Atom8::new(PredicateId(1), 0, &[]); 8];
        body_arr[0] = body;
        let rule = Rule8 {
            rule_id: RuleId(1),
            head,
            body: body_arr,
            body_len: 1,
            body_mask: 0b1,
            negation_mask: 0,
            builtin_mask: 0,
            var_count: 0,
            var_live_mask: 0,
            feature_mask: FeatureBit::Facts.mask() | FeatureBit::HornRules.mask(),
            proof_mask: 0,
            plan_id: PlanId::default(),
        };
        k.load_rule(rule).unwrap();

        // Query: ancestor(alice, bob)?
        let mut q_atom = Atom8::new(PredicateId(2), 2, &[alice, bob]);
        q_atom.binding_mask = 0b11;
        let q = QueryAtom8 {
            atom: q_atom,
            output_mask: 0,
            proof_mode: ProofMode::Both,
            epoch: EpochId(0),
        };

        match k.query(&q) {
            QueryResult::Answered(answers) => {
                assert_eq!(answers.len(), 1);
                assert_eq!(answers[0].kind, DecisionKind::Allow);
                // Proof must contain at least the rule node + one fact node.
                assert!(answers[0].proof.len() >= 2);
                let rule_nodes: Vec<&ProofNode> = answers[0]
                    .proof
                    .iter()
                    .filter(|n| n.kind == ProofKind::Rule)
                    .collect();
                assert_eq!(rule_nodes.len(), 1);
            }
            other => panic!("expected Answered, got {other:?}"),
        }
    }

    #[test]
    fn receipt_is_deterministic_across_runs() {
        let k = build_kernel();
        let alice = k.catalog.term_id("alice").unwrap();
        let bob = k.catalog.term_id("bob").unwrap();
        let mut q_atom = Atom8::new(PredicateId(1), 2, &[alice, bob]);
        q_atom.binding_mask = 0b11;
        let q = QueryAtom8 {
            atom: q_atom,
            output_mask: 0,
            proof_mode: ProofMode::PositiveOnly,
            epoch: EpochId(0),
        };
        let r1 = match k.query(&q) {
            QueryResult::Answered(a) => a[0].receipt.clone(),
            _ => panic!(),
        };
        let r2 = match k.query(&q) {
            QueryResult::Answered(a) => a[0].receipt.clone(),
            _ => panic!(),
        };
        assert_eq!(r1.receipt_hash, r2.receipt_hash);
        assert_eq!(r1.proof_root, r2.proof_root);
    }
}
