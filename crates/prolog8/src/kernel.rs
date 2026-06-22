//! Kernel — query execution, proof emission, receipt assembly.
//!
//! ARD section 8 (execution model), 11 (proof requirements), 13 (WASM ABI).
//!
//! The kernel never sees strings. It accepts only `Catalog`, `FactBlock8`s,
//! `Rule8`s, and `QueryAtom8`s, and emits answers + proof + receipt.

use crate::admission::{admit_atom, admit_rule, RejectionCode};
use crate::catalog::Catalog;
use crate::hash::{
    combine_roots, Hash, DOMAIN_PROLOG8_INPUT, DOMAIN_PROLOG8_OUTPUT, DOMAIN_PROLOG8_PROOF_ROOT,
    DOMAIN_PROLOG8_RULES,
};
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
    Denied(Box<Decision>),
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
        QueryResult::Denied(Box::new(self.assemble_negative(q)))
    }

    /// Scan all admitted fact blocks for rows that unify with `query`.
    /// Returns `(row, fact_hash)` pairs.
    fn scan_facts(&self, query: &Atom8, epoch: EpochId) -> Vec<(FactRow8, [u8; 32])> {
        self.fact_blocks
            .iter()
            .filter(|b| b.pred_id == query.pred_id && !b.skip_for(query, epoch))
            .flat_map(|b| b.rows.iter())
            .filter(|row| Self::row_matches(row, query))
            .map(|row| (*row, row.fact_hash))
            .collect()
    }

    /// Test whether a fact row matches a query atom under bound positions.
    fn row_matches(row: &FactRow8, query: &Atom8) -> bool {
        if row.pred_id != query.pred_id || row.arity != query.arity {
            return false;
        }
        (0..row.arity as usize).all(|i| !query.is_bound(i as u8) || row.args[i] == query.args[i])
    }

    /// SLD resolution step with flat-term Robinson unification over ?N positional variables.
    ///
    /// Substitution maps variable index (0..8) to a bound TermId, or None if unbound.
    /// Flat terms (no recursive structure) guarantee occurs-check is trivially satisfied.
    /// Visited set is capped at 256; on cap we return answers found so far (never panic).
    fn scan_rules(&self, q: &QueryAtom8) -> Vec<Decision> {
        // Substitution: maps var index 0..8 → bound TermId, or None if unbound.
        type Subst = [Option<TermId>; ARITY_CAP as usize];

        /// Resolve a term through substitution: if the term is in the variable
        /// sentinel range (TermId(VAR_SENTINEL_BASE + i)), return the bound value
        /// or the sentinel itself if unbound.
        fn resolve(t: TermId, subst: &Subst) -> TermId {
            if let Some(var_idx) = var_index(t) {
                subst[var_idx].unwrap_or(t)
            } else {
                t
            }
        }

        /// Encode variable i as a sentinel TermId above the normal range.
        const VAR_SENTINEL_BASE: u32 = 0x8000_0000;
        fn var_term(i: usize) -> TermId {
            TermId(VAR_SENTINEL_BASE + i as u32)
        }

        fn var_index(t: TermId) -> Option<usize> {
            if t.0 >= VAR_SENTINEL_BASE && t.0 < VAR_SENTINEL_BASE + ARITY_CAP as u32 {
                Some((t.0 - VAR_SENTINEL_BASE) as usize)
            } else {
                None
            }
        }

        /// Unify two terms under the substitution. Returns false on conflict.
        fn unify(a: TermId, b: TermId, subst: &mut Subst) -> bool {
            let ra = resolve(a, subst);
            let rb = resolve(b, subst);
            if ra == rb {
                return true;
            }
            if let Some(vi) = var_index(ra) {
                subst[vi] = Some(rb);
                return true;
            }
            if let Some(vi) = var_index(rb) {
                subst[vi] = Some(ra);
                return true;
            }
            // Both ground and unequal.
            false
        }

        let mut answers = Vec::new();

        // Visited set: (pred_id, args_array) to prevent loops, capped at 256.
        let mut visited: Vec<(u32, [u32; ARITY_CAP as usize])> = Vec::with_capacity(64);

        for rule in &self.rules {
            if rule.head.pred_id != q.atom.pred_id || rule.head.arity != q.atom.arity {
                continue;
            }

            // Build initial substitution from rule's var_count and var_live_mask.
            // Variable slots in rule atoms are represented as TermId sentinel values.
            // We encode each rule head arg: if it's sentinel and the rule says there
            // are variables, treat arg i as variable i.
            let mut subst: Subst = [None; ARITY_CAP as usize];

            // Unify head args with query args.
            let mut head_ok = true;
            for i in 0..rule.head.arity as usize {
                let h_arg = rule.head.args[i];
                // A sentinel in the head position means it's a variable slot.
                let h_effective = if h_arg.is_sentinel() {
                    var_term(i)
                } else {
                    h_arg
                };
                if q.atom.is_bound(i as u8) {
                    // Query position is bound: unify with head arg.
                    if !unify(h_effective, q.atom.args[i], &mut subst) {
                        head_ok = false;
                        break;
                    }
                }
                // Query position unbound: leave rule variable free to be determined by body.
            }
            if !head_ok {
                continue;
            }

            // Visited-set check.
            {
                let mut key = [0u32; ARITY_CAP as usize];
                for i in 0..rule.head.arity as usize {
                    key[i] = resolve(var_term(i), &subst).0;
                }
                let entry = (rule.head.pred_id.0, key);
                if visited.contains(&entry) {
                    continue;
                }
                if visited.len() >= 256 {
                    // Andon trace: cap reached.
                    break;
                }
                visited.push(entry);
            }

            // Body: for each body atom, substitute vars then find supporting facts.
            // Shared variables (same var index) propagate bindings across atoms.
            let mut all_supported = true;
            let mut supporting_facts: Vec<FactRow8> = Vec::new();

            'body: for bi in 0..rule.body_len as usize {
                let body_atom = rule.body[bi];
                // Build a concrete query atom with all variable positions substituted.
                let mut concrete_args = [TermId::sentinel(); ARITY_CAP as usize];
                let mut concrete_binding = 0u8;
                let mut has_unbound_var = false;

                for ai in 0..body_atom.arity as usize {
                    let raw = body_atom.args[ai];
                    // A sentinel in body means this is the variable at position ai
                    // (same convention as head).
                    let effective = if raw.is_sentinel() { var_term(ai) } else { raw };
                    let resolved = resolve(effective, &subst);
                    if var_index(resolved).is_some() {
                        // Still unbound variable — leave unbound in query.
                        concrete_args[ai] = TermId::sentinel();
                        has_unbound_var = true;
                    } else {
                        concrete_args[ai] = resolved;
                        concrete_binding |= 1u8 << ai;
                    }
                }

                let mut concrete = Atom8::new(body_atom.pred_id, body_atom.arity, &concrete_args);
                concrete.binding_mask = concrete_binding;

                let supports = self.scan_facts(&concrete, q.epoch);
                if supports.is_empty() {
                    all_supported = false;
                    break 'body;
                }

                // If there were unbound variables, bind them from the first matching fact.
                let fact_row = supports[0].0;
                if has_unbound_var {
                    for ai in 0..body_atom.arity as usize {
                        let raw = body_atom.args[ai];
                        let effective = if raw.is_sentinel() { var_term(ai) } else { raw };
                        let resolved = resolve(effective, &subst);
                        if let Some(vi) = var_index(resolved) {
                            // Bind this variable to the fact value.
                            if vi < ARITY_CAP as usize {
                                subst[vi] = Some(fact_row.args[ai]);
                            }
                        }
                    }
                }
                supporting_facts.push(fact_row);
            }

            if all_supported {
                // Build head bindings from substitution.
                let mut bindings_arr = [TermId::sentinel(); ARITY_CAP as usize];
                for i in 0..rule.head.arity as usize {
                    let h_arg = rule.head.args[i];
                    let effective = if h_arg.is_sentinel() {
                        var_term(i)
                    } else {
                        h_arg
                    };
                    bindings_arr[i] = resolve(effective, &subst);
                }
                answers.push(self.assemble_rule_answer(q, rule, &bindings_arr, &supporting_facts));
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

    fn assemble_receipt(
        &self,
        q: &QueryAtom8,
        proof: &[ProofNode],
        decision: DecisionKind,
    ) -> Receipt {
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
        Atom8, CatalogId, EpochId, FactBlock8, FactRow8, FeatureBit, PlanId, PredicateId,
        QueryAtom8, RuleId, SourceId,
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
        k.load_facts(FactBlock8::new(PredicateId(1), 2, rows))
            .unwrap();
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
            other => unreachable!("expected Answered, got {other:?}"),
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
            other => unreachable!("expected Denied, got {other:?}"),
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
            other => unreachable!("expected Invalid, got {other:?}"),
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
            other => unreachable!("expected Answered, got {other:?}"),
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
            _ => unreachable!(),
        };
        let r2 = match k.query(&q) {
            QueryResult::Answered(a) => a[0].receipt.clone(),
            _ => unreachable!(),
        };
        assert_eq!(r1.receipt_hash, r2.receipt_hash);
        assert_eq!(r1.proof_root, r2.proof_root);
    }

    /// Grandparent via shared-variable SLD unification.
    ///
    /// This test is UNFAKEABLE without shared-variable unification: ?1 appears
    /// in both body atoms and must unify to the same intermediate value.
    ///
    /// Rule: grandparent(?0, ?2) :- parent(?0, ?1), parent(?1, ?2)
    /// Facts: parent(alice, bob), parent(bob, carol)
    /// Query: grandparent(alice, ?) → should derive carol
    #[test]
    fn test_grandparent_unification() {
        let mut cat = Catalog::new(CatalogId(1));
        cat.add_predicate(PredicateMeta {
            pred_id: PredicateId(10),
            label: "parent".into(),
            arity: 2,
            access_orders: vec![],
            proof_policy: PredicateProofPolicy::OnRequest,
            materialized: false,
        });
        cat.add_predicate(PredicateMeta {
            pred_id: PredicateId(11),
            label: "grandparent".into(),
            arity: 2,
            access_orders: vec![],
            proof_policy: PredicateProofPolicy::OnRequest,
            materialized: false,
        });
        let alice = cat.intern_term("alice");
        let bob = cat.intern_term("bob");
        let carol = cat.intern_term("carol");

        let mut k = Kernel::new(cat);

        // Load facts: parent(alice, bob) and parent(bob, carol)
        let rows = vec![
            FactRow8::new(PredicateId(10), 2, &[alice, bob], SourceId(0)),
            FactRow8::new(PredicateId(10), 2, &[bob, carol], SourceId(0)),
        ];
        k.load_facts(FactBlock8::new(PredicateId(10), 2, rows))
            .unwrap();

        // Rule: grandparent(?0, ?2) :- parent(?0, ?1), parent(?1, ?2)
        // Use sentinel (TermId(0)) to mark variable positions:
        //   head: grandparent(sentinel_0=?0, sentinel_2=?2)
        //   body[0]: parent(sentinel_0=?0, sentinel_1=?1)
        //   body[1]: parent(sentinel_1=?1, sentinel_2=?2)
        //
        // Since our convention maps arg position i to var ?i via sentinel,
        // we need head arity=3 to have positions 0,1,2. But grandparent arity=2.
        // We represent ?0=pos0 and ?2=pos1 in head. For body, each body atom
        // independently maps pos→var. The "shared" var ?1 must be encoded
        // consistently: in body[0] pos1=?1, in body[1] pos0=?1.
        //
        // Our implementation treats sentinel at body atom position ai as var(ai).
        // So for the chain:
        //   body[0]: parent(sentinel@0, sentinel@1) → parent(?0, ?1)
        //   body[1]: parent(sentinel@0, sentinel@1) → parent(?0, ?1) — WRONG
        //
        // We need a different encoding. Let's use a dedicated body atom arity
        // approach where we put concrete values in bound positions.
        // Actually the test must be done differently: we need to load rule
        // with alice bound in head pos 0, and use unbound pos 1 in head.
        // Then body[0] = parent(alice, ?) and body[1] = parent(?, ?).
        // This still requires binding propagation.
        //
        // Simpler: do it ground-per-instance. Load the rule as
        //   grandparent(alice, carol) :- parent(alice, bob), parent(bob, carol)
        // but with head having alice at pos 0 (bound) and sentinel at pos 1.
        // Query: grandparent(alice, ?) → should return carol.
        //
        // This still exercises shared-variable binding: bob must unify across
        // the two body atoms.
        //
        // Encoding: head pos0=alice (ground), pos1=sentinel(?1)
        //           body[0]: parent(alice, sentinel@1=?1)  [bound pos0=alice]
        //           body[1]: parent(sentinel@0=?0, carol)  [bound pos1=carol]
        // — still doesn't chain ?1 between body atoms.
        //
        // Real encoding requires that body[0] pos1 and body[1] pos0 share a var.
        // We achieve this by making body[0] fully unbound (output all) and
        // letting the kernel bind ?1=bob from fact, then body[1] uses that binding.
        //
        // In our sentinel scheme: sentinel at position ai in a body atom = var(ai).
        // So body[0] = parent(alice_ground, sentinel@1) → sentinel@1 = ?1
        //    body[1] = parent(sentinel@0, sentinel@1) → sentinel@0=?0, sentinel@1=?1
        // After body[0] matches parent(alice, bob): subst[1] = bob
        // body[1] now resolves to parent(?0, bob). That matches parent(bob, carol) → binds ?0=bob — WRONG for our query.
        //
        // The correct encoding for grandparent(?0, ?2) :- parent(?0, ?1), parent(?1, ?2):
        //   body[0]: parent(sentinel@0, sentinel@1) — pos0=?0, pos1=?1
        //   body[1]: parent(sentinel@1, sentinel@2) — BUT sentinel at pos0 != sentinel at pos1
        //
        // Our scheme only maps pos i → var i. We can't naturally express "body[1] pos0 = var ?1".
        //
        // SOLUTION: Encode differently. Use a ground query approach:
        //   Query grandparent(alice, unbound)
        //   head: grandparent(alice, sentinel@1) — alice ground, pos1 unbound
        //   body[0]: parent(alice, sentinel@1)   — alice ground, pos1=?1
        //   body[1]: parent(sentinel@0, sentinel@1)
        //
        // After body[0] matches parent(alice,bob): subst[1]=bob
        // body[1]: parent(sentinel@0, bob-resolved) → parent(?0, bob) → matches parent(bob, carol)? NO.
        //          we need parent(bob, carol), but pos1=bob means we'd look for parent(?0, bob).
        //          That doesn't match parent(bob, carol) because carol≠bob.
        //
        // The fundamental issue: our pos→var scheme can only represent vars where
        // the var index equals the argument position. For grandparent, ?1 appears
        // at pos1 in body[0] but at pos0 in body[1]. These are different positions.
        //
        // TRUE Robinson unification requires named variables independent of position.
        // The spec says "?N positional variables" where ?N = position in the HEAD.
        // Let's re-read: "Variable ID = position index (0-7)". This means variable ?1
        // is the variable at position 1 of the HEAD, not of the body atom.
        //
        // So the rule grandparent:?0,?2 :- parent:?0,?1, parent:?1,?2 means:
        //   head var0=head_pos0, head var2=head_pos2
        //   body[0] var0=head_pos0, var1=new_var — but how encoded in atoms?
        //
        // The spec says premises in rule strings are like "parent:?0,?1" where
        // ?0 and ?1 are NAMED variables shared across the rule. This is NOT
        // positional-in-body but positional-in-variable-namespace.
        //
        // For the kernel-level test we need a way to encode this. Let's use
        // the var_count/var_live_mask fields plus a separate variable encoding.
        //
        // PRAGMATIC APPROACH: Test the grandparent chain using a 3-step ground
        // query that exercises the body-atom variable propagation we DO implement:
        //   Query: grandparent(alice, ?)
        //   head: grandparent(alice, sentinel@1) — alice at pos0, ?1 at pos1
        //   body[0]: parent(alice, sentinel@1)   — alice bound, ?1 unbound
        //   body[1]: parent(sentinel@1, sentinel@1) — WRONG, this makes both args the same var
        //
        // We cannot express grandparent properly with pos→var. Instead, let's
        // test what the spec actually requires: that ?N in premise strings maps
        // to named variables across body atoms. Since prolog.rs parses string rules,
        // let's test at the prolog.rs level and at kernel level do a simpler but
        // valid chain test.
        //
        // For the kernel test, demonstrate shared-variable binding by testing
        // a rule where the SAME variable appears in body[0] pos1 and body[1] pos0.
        // We need to extend the kernel to support explicit variable IDs, not
        // just pos→var. Let's implement this properly.
        //
        // Actually, looking at the spec more carefully: the rule head
        // "grandparent:?0,?1" means head args are (?0, ?1). In body:
        // "parent:?0,?2" means first body atom has args (?0, ?2).
        // ?0 is SHARED between head and body[0].
        // ?2 is a new variable appearing in body[0] pos1.
        // "parent:?2,?1" means second body atom has args (?2, ?1).
        // ?2 shared between body[0] pos1 and body[1] pos0. THIS IS THE KEY.
        //
        // So the variable encoding in atoms needs to carry the VARIABLE ID,
        // not the position. Let's use a different sentinel scheme:
        // var ?N is encoded as TermId(VAR_SENTINEL_BASE + N) where N is the
        // variable index (0-7), regardless of which arg position it occupies.
        //
        // In Atom8 args: if args[i] = TermId(VAR_SENTINEL_BASE + N), then
        // arg position i holds variable ?N.
        //
        // For grandparent(?0, ?1) :- parent(?0, ?2), parent(?2, ?1):
        //   head.args = [var(0), var(1), sentinel, ...]
        //   body[0].args = [var(0), var(2), sentinel, ...]
        //   body[1].args = [var(2), var(1), sentinel, ...]
        //
        // Query: grandparent(alice, ?) means head.args[0]=alice (ground), args[1]=unbound
        // Initial subst: unify head.args[0]=var(0) with alice → subst[0]=alice
        //                unify head.args[1]=var(1) with unbound query → subst[1]=None
        // body[0]: parent(var(0), var(2)) → parent(alice, ?) → matches parent(alice,bob) → subst[2]=bob
        // body[1]: parent(var(2), var(1)) → parent(bob, ?) → matches parent(bob,carol) → subst[1]=carol
        // Result: head args resolved → (alice, carol) ✓
        //
        // This is what we should implement. The VAR_SENTINEL_BASE scheme with
        // var_term(N) encoding enables this.
        //
        // The kernel already defines var_term/var_index with VAR_SENTINEL_BASE.
        // We just need to build the Rule8 with proper var-encoded args.

        // Build grandparent rule using VAR_SENTINEL scheme:
        // var(0) = TermId(0x8000_0000), var(1) = TermId(0x8000_0001), var(2) = TermId(0x8000_0002)
        const VAR_BASE: u32 = 0x8000_0000;
        let v0 = TermId(VAR_BASE);
        let v1 = TermId(VAR_BASE + 1);
        let v2 = TermId(VAR_BASE + 2);

        // head: grandparent(v0, v1)
        let head = Atom8::new(PredicateId(11), 2, &[v0, v1]);
        // body[0]: parent(v0, v2)
        let body0 = Atom8::new(PredicateId(10), 2, &[v0, v2]);
        // body[1]: parent(v2, v1)
        let body1 = Atom8::new(PredicateId(10), 2, &[v2, v1]);
        let mut body_arr = [Atom8::new(PredicateId(0), 0, &[]); 8];
        body_arr[0] = body0;
        body_arr[1] = body1;

        let rule = Rule8 {
            rule_id: RuleId(42),
            head,
            body: body_arr,
            body_len: 2,
            body_mask: 0b11,
            negation_mask: 0,
            builtin_mask: 0,
            var_count: 3,        // vars ?0, ?1, ?2
            var_live_mask: 0b11, // ?0 and ?1 appear in head
            feature_mask: FeatureBit::Facts.mask() | FeatureBit::HornRules.mask(),
            proof_mask: 0,
            plan_id: PlanId::default(),
        };
        k.load_rule(rule).unwrap();

        // Query: grandparent(alice, ?) — alice bound, pos1 unbound
        let mut q_atom = Atom8::new(PredicateId(11), 2, &[alice, TermId::sentinel()]);
        q_atom.binding_mask = 0b01; // only pos0 (alice) is bound
        let q = QueryAtom8 {
            atom: q_atom,
            output_mask: 0b10, // request pos1 as output
            proof_mode: ProofMode::Both,
            epoch: EpochId(0),
        };

        match k.query(&q) {
            QueryResult::Answered(answers) => {
                assert!(
                    !answers.is_empty(),
                    "grandparent(alice, ?) must derive an answer"
                );
                let first = &answers[0];
                assert_eq!(first.kind, DecisionKind::Allow);
                // The bound output binding at pos1 should be carol.
                assert_eq!(
                    first.bindings.first().copied(),
                    Some(carol),
                    "grandparent(alice, ?) should derive carol via shared-variable unification"
                );
            }
            other => unreachable!("expected Answered, got {other:?}"),
        }
    }

    /// Variable binding extraction: rule with ?0 in head, query with unbound position.
    #[test]
    fn test_variable_binding_extraction() {
        let mut cat = Catalog::new(CatalogId(1));
        cat.add_predicate(PredicateMeta {
            pred_id: PredicateId(20),
            label: "source".into(),
            arity: 1,
            access_orders: vec![],
            proof_policy: PredicateProofPolicy::OnRequest,
            materialized: false,
        });
        cat.add_predicate(PredicateMeta {
            pred_id: PredicateId(21),
            label: "derived".into(),
            arity: 1,
            access_orders: vec![],
            proof_policy: PredicateProofPolicy::OnRequest,
            materialized: false,
        });
        let foo = cat.intern_term("foo");
        let mut k = Kernel::new(cat);

        let rows = vec![FactRow8::new(PredicateId(20), 1, &[foo], SourceId(0))];
        k.load_facts(FactBlock8::new(PredicateId(20), 1, rows))
            .unwrap();

        // Rule: derived(?0) :- source(?0)
        const VAR_BASE: u32 = 0x8000_0000;
        let v0 = TermId(VAR_BASE);
        let head = Atom8::new(PredicateId(21), 1, &[v0]);
        let body0 = Atom8::new(PredicateId(20), 1, &[v0]);
        let mut body_arr = [Atom8::new(PredicateId(0), 0, &[]); 8];
        body_arr[0] = body0;

        let rule = Rule8 {
            rule_id: RuleId(100),
            head,
            body: body_arr,
            body_len: 1,
            body_mask: 0b1,
            negation_mask: 0,
            builtin_mask: 0,
            var_count: 1,
            var_live_mask: 0b1,
            feature_mask: FeatureBit::Facts.mask() | FeatureBit::HornRules.mask(),
            proof_mask: 0,
            plan_id: PlanId::default(),
        };
        k.load_rule(rule).unwrap();

        // Query: derived(?) — unbound, request output
        let q_atom = Atom8::new(PredicateId(21), 1, &[TermId::sentinel()]);
        let q = QueryAtom8 {
            atom: q_atom,
            output_mask: 0b1,
            proof_mode: ProofMode::Both,
            epoch: EpochId(0),
        };

        match k.query(&q) {
            QueryResult::Answered(answers) => {
                assert!(!answers.is_empty());
                // Should get back foo
                assert_eq!(answers[0].bindings.first().copied(), Some(foo));
            }
            other => unreachable!("expected Answered, got {other:?}"),
        }
    }

    /// Same input must produce bit-exact serde_json output (receipt-hash determinism).
    #[test]
    fn test_double_run_deterministic() {
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
            QueryResult::Answered(a) => serde_json::to_string(&a[0]).unwrap(),
            _ => unreachable!(),
        };
        let r2 = match k.query(&q) {
            QueryResult::Answered(a) => serde_json::to_string(&a[0]).unwrap(),
            _ => unreachable!(),
        };
        assert_eq!(
            r1, r2,
            "same input must produce bit-exact serde_json output"
        );
    }

    /// Rule where head has a variable not appearing in any body atom terminates
    /// without panic within visited-set cap.
    #[test]
    fn test_head_var_not_in_body_terminates() {
        let mut k = build_kernel();
        let alice = k.catalog.term_id("alice").unwrap();
        let bob = k.catalog.term_id("bob").unwrap();

        // Rule: ancestor(alice, ?0) :- parent(alice, bob)
        // ?0 in head not constrained by body → head var unbound after body passes.
        const VAR_BASE: u32 = 0x8000_0000;
        let v0 = TermId(VAR_BASE);

        let head = Atom8::new(PredicateId(2), 2, &[alice, v0]);
        let body0 = Atom8::new(PredicateId(1), 2, &[alice, bob]);
        let mut body_arr = [Atom8::new(PredicateId(1), 0, &[]); 8];
        body_arr[0] = body0;

        let rule = Rule8 {
            rule_id: RuleId(200),
            head,
            body: body_arr,
            body_len: 1,
            body_mask: 0b1,
            negation_mask: 0,
            builtin_mask: 0,
            var_count: 1,
            var_live_mask: 0b10,
            feature_mask: FeatureBit::Facts.mask() | FeatureBit::HornRules.mask(),
            proof_mask: 0,
            plan_id: PlanId::default(),
        };
        k.load_rule(rule).unwrap();

        let mut q_atom = Atom8::new(PredicateId(2), 2, &[alice, TermId::sentinel()]);
        q_atom.binding_mask = 0b01;
        let q = QueryAtom8 {
            atom: q_atom,
            output_mask: 0b10,
            proof_mode: ProofMode::Both,
            epoch: EpochId(0),
        };

        // Must terminate without panic.
        let _ = k.query(&q);
    }

    /// Every Deny decision MUST carry a non-zero BLAKE3 receipt hash.
    ///
    /// Rationale: A zero receipt hash is indistinguishable from an
    /// uninitialized or fabricated receipt (FM-5 / receipt-forgery attack).
    /// The kernel commits to BLAKE3(input_root ‖ proof_root ‖ "deny"),
    /// which is non-zero for any non-trivially-colliding input — this is
    /// guaranteed by BLAKE3's preimage resistance (a collision against the
    /// all-zero output would break the hash function).
    ///
    /// This test is the most critical single correctness gate for
    /// `Kernel::query`: if the deny path skips receipt assembly, every
    /// policy enforcement point that trusts the receipt is bypassed.
    #[test]
    fn deny_decision_emits_nonzero_receipt_hash() {
        let k = build_kernel();
        let alice = k.catalog.term_id("alice").unwrap();
        let carol = k.catalog.term_id("carol").unwrap();
        // alice→carol is NOT in the fact block, so query must return Denied.
        let mut q_atom = Atom8::new(PredicateId(1), 2, &[alice, carol]);
        q_atom.binding_mask = 0b11;
        let q = QueryAtom8 {
            atom: q_atom,
            output_mask: 0,
            proof_mode: ProofMode::NegativeOnly,
            epoch: EpochId(0),
        };
        match k.query(&q) {
            QueryResult::Denied(d) => {
                assert_eq!(d.kind, DecisionKind::Deny);
                assert_ne!(
                    d.receipt.receipt_hash, [0u8; 32],
                    "Deny receipt_hash must be non-zero (BLAKE3 preimage resistance)"
                );
            }
            other => unreachable!("expected Denied, got {other:?}"),
        }
    }
}
