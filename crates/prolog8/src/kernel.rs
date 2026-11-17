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
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Variable-encoding helpers (module-level so `solve_body` can use them)
// ---------------------------------------------------------------------------

/// Variables are encoded as TermIds with the high bit set: VAR_SENTINEL_BASE + N.
/// This partitions the u32 space cleanly — normal term IDs never have the high bit set.
const VAR_SENTINEL_BASE: u32 = 0x8000_0000;

/// Maximum recursive rule-chaining depth in `derive_atom`. Prevents infinite
/// loops on recursive rules while supporting PARARULE-Plus depth-5 chains.
pub const MAX_DERIVE_DEPTH: u32 = 32;

/// One derived solution: concrete head args + the leaf facts that support it.
type Solution = ([TermId; ARITY_CAP as usize], Vec<FactRow8>);

/// Per-query evaluation state. Created fresh by `Kernel::query` (so it is
/// trivially invalidated at `load_facts`/`load_rule` boundaries — it never
/// outlives a single query) and threaded through the solver.
///
/// Memoization soundness: results are depth-sensitive (the cap truncates),
/// so entries record the deepest call depth at which the goal was derived
/// WITHOUT truncation, and are reused only when the current call depth is <=
/// the recorded depth — an untruncated derivation of a goal has the same
/// solution set at any smaller call depth. Entries computed while the depth
/// cap fired are never cached. The cache is per-query only (created in
/// `Kernel::query`), so it is trivially invalidated at load_facts/load_rule
/// boundaries.
#[derive(Default)]
struct EvalState {
    /// Memo table: goal atom -> (max untruncated call depth, solutions).
    memo: HashMap<Atom8, (u32, Vec<Solution>)>,
    /// Number of memo hits (diagnostic; proves the cache fires).
    memo_hits: u64,
    /// Number of memo misses (derivation computations actually performed).
    memo_misses: u64,
    /// Set when a negated body atom was evaluated with unbound variables.
    negation_floundered: bool,
    /// Set when the derivation recursion hit `MAX_DERIVE_DEPTH`.
    depth_exceeded: bool,
}

type Subst = [Option<TermId>; ARITY_CAP as usize];

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

fn resolve_var(t: TermId, subst: &Subst) -> TermId {
    if let Some(vi) = var_index(t) {
        subst[vi].unwrap_or(t)
    } else {
        t
    }
}

/// Robinson unification for flat terms (no recursive structure, occurs-check trivially satisfied).
fn unify_terms(a: TermId, b: TermId, subst: &mut Subst) -> bool {
    let ra = resolve_var(a, subst);
    let rb = resolve_var(b, subst);
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
    false
}

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
    /// True when derivation was truncated by `MAX_DERIVE_DEPTH`. The answer
    /// set may be incomplete; callers decide refusal semantics. Never a
    /// silent truncation: this flag makes the cap observable.
    pub depth_exceeded: bool,
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
    /// Run a query end-to-end with a fresh per-query `EvalState`
    /// (memoization + fault tracking). See `query_with_state`.
    pub fn query(&self, q: &QueryAtom8) -> QueryResult {
        let mut state = EvalState::default();
        let result = self.query_with_state(q, &mut state);
        if state.negation_floundered {
            // Floundered negation is a typed refusal, never a silent false.
            return QueryResult::Invalid(RejectionCode::NegationFloundering);
        }
        result
    }

    /// Query with memoization statistics: `(result, memo_misses, memo_hits)`.
    /// Diagnostic surface for tests and benchmarks.
    pub fn query_with_stats(&self, q: &QueryAtom8) -> (QueryResult, u64, u64) {
        let mut state = EvalState::default();
        let result = self.query_with_state(q, &mut state);
        if state.negation_floundered {
            return (
                QueryResult::Invalid(RejectionCode::NegationFloundering),
                state.memo_misses,
                state.memo_hits,
            );
        }
        (result, state.memo_misses, state.memo_hits)
    }

    fn query_with_state(&self, q: &QueryAtom8, state: &mut EvalState) -> QueryResult {
        if let Err(code) = admit_atom(&q.atom, &self.catalog) {
            return QueryResult::Invalid(code);
        }

        // Phase 1: direct fact matches.
        let fact_answers = self.scan_facts(&q.atom, q.epoch);

        if !fact_answers.is_empty() {
            let answers = fact_answers
                .into_iter()
                .enumerate()
                .map(|(i, (row, fact_hash))| {
                    let mut d = self.assemble_fact_answer(q, &row, fact_hash, i);
                    d.depth_exceeded = state.depth_exceeded;
                    d
                })
                .collect();
            return QueryResult::Answered(answers);
        }

        // Phase 2: rule application (one-step, depth-1 backwards chaining).
        let rule_answers = self.scan_rules(q, state);
        if !rule_answers.is_empty() {
            return QueryResult::Answered(rule_answers);
        }

        // Phase 3: deny with negative proof. Depth truncation is surfaced on
        // the decision — the caller decides refusal semantics.
        let mut d = self.assemble_negative(q);
        d.depth_exceeded = state.depth_exceeded;
        QueryResult::Denied(Box::new(d))
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

    /// Horn clause evaluation with backtracking: tries every matching fact per body
    /// atom, backtracks on dead ends, and collects all successful derivations.
    ///
    /// Every rule whose head unifies with the query is tried independently. The
    /// visited-set is NOT used here because `solve_body` never recurses back into
    /// rule evaluation (it calls `scan_facts` only), so there is no rule-level
    /// recursion to prevent. Blocking duplicate (pred_id, args) entries would
    /// incorrectly suppress multiple rules that derive the same head.
    fn scan_rules(&self, q: &QueryAtom8, state: &mut EvalState) -> Vec<Decision> {
        let mut answers = Vec::new();

        for rule in &self.rules {
            if rule.head.pred_id != q.atom.pred_id || rule.head.arity != q.atom.arity {
                continue;
            }

            let mut subst: Subst = [None; ARITY_CAP as usize];

            // Unify rule head args with query args.
            let mut head_ok = true;
            for i in 0..rule.head.arity as usize {
                let h_arg = rule.head.args[i];
                let h_effective = if h_arg.is_sentinel() {
                    var_term(i)
                } else {
                    h_arg
                };
                if q.atom.is_bound(i as u8) {
                    if !unify_terms(h_effective, q.atom.args[i], &mut subst) {
                        head_ok = false;
                        break;
                    }
                }
            }
            if !head_ok {
                continue;
            }

            // Depth-first backtracking search over body atoms.
            self.solve_body(rule, subst, 0, &mut Vec::new(), &mut answers, q, state);
        }

        // Deduplicate by bindings: two proofs for the same conclusion are one answer.
        // This matches standard Prolog semantics for ground queries (first proof wins)
        // while preserving distinct binding solutions for unbound queries.
        let mut seen: Vec<Vec<TermId>> = Vec::with_capacity(answers.len());
        answers.retain(|d| {
            if seen.contains(&d.bindings) {
                false
            } else {
                seen.push(d.bindings.clone());
                true
            }
        });

        answers
    }

    /// Recursive backtracking solver for a rule's body atoms.
    ///
    /// Each body atom is evaluated via `derive_atom_with_support`, which resolves
    /// it against base facts AND recursively against other rules (full SLD resolution).
    /// On each candidate, the substitution is extended and we recurse to the next
    /// body atom, backtracking on failure. All leaf base facts are collected into
    /// `supporting` for proof generation.
    fn solve_body(
        &self,
        rule: &Rule8,
        subst: Subst,
        bi: usize,
        supporting: &mut Vec<FactRow8>,
        answers: &mut Vec<Decision>,
        q: &QueryAtom8,
        state: &mut EvalState,
    ) {
        if bi == rule.body_len as usize {
            let mut bindings_arr = [TermId::sentinel(); ARITY_CAP as usize];
            for i in 0..rule.head.arity as usize {
                let h = rule.head.args[i];
                let effective = if h.is_sentinel() { var_term(i) } else { h };
                bindings_arr[i] = resolve_var(effective, &subst);
            }
            answers.push(self.assemble_rule_answer(q, rule, &bindings_arr, supporting, state));
            return;
        }

        let body_atom = rule.body[bi];

        // Build a concrete query atom: resolve every already-bound variable.
        let mut concrete_args = [TermId::sentinel(); ARITY_CAP as usize];
        let mut concrete_binding = 0u8;
        for ai in 0..body_atom.arity as usize {
            let raw = body_atom.args[ai];
            let effective = if raw.is_sentinel() { var_term(ai) } else { raw };
            let resolved = resolve_var(effective, &subst);
            if var_index(resolved).is_none() {
                concrete_args[ai] = resolved;
                concrete_binding |= 1u8 << ai;
            }
        }
        let mut concrete = Atom8::new(body_atom.pred_id, body_atom.arity, &concrete_args);
        concrete.binding_mask = concrete_binding;

        let negated = (rule.negation_mask >> bi) & 1 == 1;

        if negated {
            // NAF: body atom succeeds iff it has NO derivation.
            // Groundness gate: every variable of the negated atom must already
            // be bound. Evaluating a non-ground negation would silently treat
            // "no proof found for unknown bindings" as false — unsound. Refuse
            // with a typed error instead.
            if concrete_binding != (1u8 << body_atom.arity).wrapping_sub(1) {
                state.negation_floundered = true;
                return;
            }
            let solutions = self.derive_atom_with_support(&concrete, q.epoch, 0, state);
            if solutions.is_empty() {
                // NAF succeeds — no new bindings, continue to next body atom.
                self.solve_body(rule, subst, bi + 1, supporting, answers, q, state);
            }
            // else: NAF fails — backtrack (no recursive call).
        } else {
            // Positive atom: evaluate and extend substitution for each solution.
            for (sol_args, sol_facts) in
                self.derive_atom_with_support(&concrete, q.epoch, 0, state)
            {
                let mut new_subst = subst;
                let mut ok = true;

                for ai in 0..body_atom.arity as usize {
                    let raw = body_atom.args[ai];
                    let effective = if raw.is_sentinel() { var_term(ai) } else { raw };
                    if !unify_terms(effective, sol_args[ai], &mut new_subst) {
                        ok = false;
                        break;
                    }
                }

                if ok {
                    let pre_len = supporting.len();
                    supporting.extend_from_slice(&sol_facts);
                    self.solve_body(rule, new_subst, bi + 1, supporting, answers, q, state);
                    supporting.truncate(pre_len);
                }
            }
        }
    }

    /// Derive all solutions for `query`, returning `(concrete_args, leaf_facts)` pairs.
    ///
    /// Tries base facts first, then recursively fires rules whose head unifies with
    /// the query. `depth` is incremented on each rule-recursive step and capped at
    /// `MAX_DERIVE_DEPTH` to prevent infinite loops on recursive rules.
    fn derive_atom_with_support(
        &self,
        query: &Atom8,
        epoch: EpochId,
        depth: u32,
        state: &mut EvalState,
    ) -> Vec<Solution> {
        // Memo lookup: reuse only if the cached derivation ran with at least
        // the current budget (depth <= recorded depth) and was not truncated.
        if let Some((d0, sols)) = state.memo.get(query) {
            if depth <= *d0 {
                state.memo_hits += 1;
                return sols.clone();
            }
        }

        if depth > MAX_DERIVE_DEPTH {
            // Typed, observable truncation: record the cap hit so the caller's
            // Decision carries `depth_exceeded = true`. Never silently empty.
            state.depth_exceeded = true;
            return Vec::new();
        }
        state.memo_misses += 1;

        let mut out: Vec<([TermId; ARITY_CAP as usize], Vec<FactRow8>)> = Vec::new();

        // Base: matching facts.
        for (row, _) in self.scan_facts(query, epoch) {
            out.push((row.args, vec![row]));
        }

        // Inductive: matching rules.
        for rule in &self.rules {
            if rule.head.pred_id != query.pred_id || rule.head.arity != query.arity {
                continue;
            }
            let mut head_subst: Subst = [None; ARITY_CAP as usize];
            let mut head_ok = true;
            for i in 0..rule.head.arity as usize {
                let h = rule.head.args[i];
                let he = if h.is_sentinel() { var_term(i) } else { h };
                if query.is_bound(i as u8) {
                    if !unify_terms(he, query.args[i], &mut head_subst) {
                        head_ok = false;
                        break;
                    }
                }
            }
            if !head_ok {
                continue;
            }
            self.derive_body_with_support(
                rule,
                head_subst,
                0,
                epoch,
                depth,
                &mut Vec::new(),
                &mut out,
                state,
            );
        }

        // Dedup by head args: multiple derivation paths to the same ground
        // instance yield one solution (first supporting-fact set wins). This
        // is the tabled-prolog collapse — answer bindings are unchanged
        // (scan_rules dedups by bindings anyway) and it bounds the solution
        // count by distinct ground instances instead of derivation paths.
        let mut seen_args: Vec<[TermId; ARITY_CAP as usize]> = Vec::new();
        out.retain(|(args, _)| {
            if seen_args.contains(args) {
                false
            } else {
                seen_args.push(*args);
                true
            }
        });

        // Cache only complete (untruncated) derivations, recording the deepest
        // call depth at which the goal was derived; the entry is sound to
        // reuse at any smaller call depth.
        if !state.depth_exceeded {
            state
                .memo
                .entry(query.clone())
                .and_modify(|(d0, sols)| {
                    *d0 = (*d0).max(depth);
                    *sols = out.clone();
                })
                .or_insert((depth, out.clone()));
        }
        out
    }

    /// Recursive body evaluator for `derive_atom_with_support`.
    ///
    /// When all body atoms are satisfied (`bi == body_len`), extracts the rule
    /// head's concrete arg values and pushes them with the accumulated leaf facts.
    fn derive_body_with_support(
        &self,
        rule: &Rule8,
        subst: Subst,
        bi: usize,
        epoch: EpochId,
        depth: u32,
        supporting: &mut Vec<FactRow8>,
        out: &mut Vec<Solution>,
        state: &mut EvalState,
    ) {
        if bi == rule.body_len as usize {
            let mut args = [TermId::sentinel(); ARITY_CAP as usize];
            for i in 0..rule.head.arity as usize {
                let h = rule.head.args[i];
                let he = if h.is_sentinel() { var_term(i) } else { h };
                args[i] = resolve_var(he, &subst);
            }
            out.push((args, supporting.clone()));
            return;
        }

        let body_atom = rule.body[bi];
        let mut c_args = [TermId::sentinel(); ARITY_CAP as usize];
        let mut c_mask = 0u8;
        for ai in 0..body_atom.arity as usize {
            let raw = body_atom.args[ai];
            let eff = if raw.is_sentinel() { var_term(ai) } else { raw };
            let res = resolve_var(eff, &subst);
            if var_index(res).is_none() {
                c_args[ai] = res;
                c_mask |= 1u8 << ai;
            }
        }
        let mut c_atom = Atom8::new(body_atom.pred_id, body_atom.arity, &c_args);
        c_atom.binding_mask = c_mask;

        let negated = (rule.negation_mask >> bi) & 1 == 1;

        if negated {
            // Same groundness gate as `solve_body`: refuse non-ground NAF.
            if c_mask != (1u8 << body_atom.arity).wrapping_sub(1) {
                state.negation_floundered = true;
                return;
            }
            let solutions = self.derive_atom_with_support(&c_atom, epoch, depth + 1, state);
            if solutions.is_empty() {
                self.derive_body_with_support(
                    rule, subst, bi + 1, epoch, depth, supporting, out, state,
                );
            }
        } else {
            for (sol_args, sol_facts) in
                self.derive_atom_with_support(&c_atom, epoch, depth + 1, state)
            {
                let mut new_subst = subst;
                let mut ok = true;
                for ai in 0..body_atom.arity as usize {
                    let raw = body_atom.args[ai];
                    let eff = if raw.is_sentinel() { var_term(ai) } else { raw };
                    if !unify_terms(eff, sol_args[ai], &mut new_subst) {
                        ok = false;
                        break;
                    }
                }
                if ok {
                    let pre_len = supporting.len();
                    supporting.extend_from_slice(&sol_facts);
                    self.derive_body_with_support(
                        rule,
                        new_subst,
                        bi + 1,
                        epoch,
                        depth,
                        supporting,
                        out,
                        state,
                    );
                    supporting.truncate(pre_len);
                }
            }
        }
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
        let receipt = self.assemble_receipt(q, &bindings, false, &proof, DecisionKind::Allow);
        Decision {
            kind: DecisionKind::Allow,
            bindings,
            proof,
            receipt,
            depth_exceeded: false,
        }
    }

    fn assemble_rule_answer(
        &self,
        q: &QueryAtom8,
        rule: &Rule8,
        bindings_arr: &[TermId; 8],
        supporting_facts: &[FactRow8],
        state: &EvalState,
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
        // Reduce the supporting facts into a valid fan-in<=8 proof DAG.
        // Layers of chunked grouping nodes (kind: Rule, rule_id: None) combine
        // >8 supports; every fact node stays in the Vec, so proof_root still
        // commits to the full derivation. (Previously this indexed out of
        // bounds when a derivation had more than 8 supporting facts.)
        let mut layer: Vec<ProofNodeId> = (0..supporting_facts.len() as u32)
            .map(ProofNodeId)
            .collect();
        while layer.len() > 8 {
            let mut next = Vec::new();
            for chunk in layer.chunks(8) {
                let node_id = ProofNodeId(proof.len() as u32);
                let mut children = [ProofNodeId(0); 8];
                for (j, c) in chunk.iter().enumerate() {
                    children[j] = *c;
                }
                let node = ProofNode {
                    node_id,
                    kind: ProofKind::Rule,
                    pred_id: rule.head.pred_id,
                    rule_id: None,
                    fact_hash: None,
                    children,
                    child_count: chunk.len() as u8,
                    substitution_id: SubstitutionId(0),
                    node_hash: [0u8; 32],
                };
                proof.push(node);
                next.push(node_id);
            }
            layer = next;
        }
        let mut child_ids = [ProofNodeId(0); 8];
        for (i, id) in layer.iter().enumerate() {
            child_ids[i] = *id;
        }
        proof.push(ProofNode {
            node_id: ProofNodeId(proof.len() as u32),
            kind: ProofKind::Rule,
            rule_id: Some(rule.rule_id),
            pred_id: rule.head.pred_id,
            fact_hash: None,
            children: child_ids,
            child_count: layer.len() as u8,
            substitution_id: SubstitutionId(0),
            node_hash: [0u8; 32],
        });
        let proof = self.finalize_proof(proof);
        let receipt = self.assemble_receipt(
            q,
            &bindings,
            state.depth_exceeded,
            &proof,
            DecisionKind::Allow,
        );
        Decision {
            kind: DecisionKind::Allow,
            bindings,
            proof,
            receipt,
            depth_exceeded: state.depth_exceeded,
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
        let receipt = self.assemble_receipt(q, &[], false, &proof, DecisionKind::Deny);
        Decision {
            kind: DecisionKind::Deny,
            bindings: Vec::new(),
            proof,
            receipt,
            depth_exceeded: false,
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
        bindings: &[TermId],
        depth_exceeded: bool,
        proof: &[ProofNode],
        decision: DecisionKind,
    ) -> Receipt {
        let catalog_root = self.catalog.catalog_root();
        let rule_root = self.rule_root();
        let fact_root = self.fact_root();
        let input_root = Self::input_root(q);
        let proof_root = Self::proof_root(proof);
        let output_root = Self::output_root(q, bindings, depth_exceeded);
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

    /// Hash a single atom into `hasher`: pred_id, arity, binding mask, then
    /// every live argument term. Fixed-width fields — no extra length prefix
    /// needed because the arg count is determined by `arity`.
    fn hash_atom_into(hasher: &mut blake3::Hasher, a: &Atom8) {
        hasher.update(&a.pred_id.0.to_le_bytes());
        hasher.update(&[a.arity, a.binding_mask]);
        for i in 0..a.arity as usize {
            hasher.update(&a.args[i].0.to_le_bytes());
        }
    }

    fn rule_root(&self) -> Hash {
        let mut hasher = blake3::Hasher::new_keyed(&DOMAIN_PROLOG8_RULES);
        hasher.update(&(self.rules.len() as u32).to_le_bytes());
        for r in &self.rules {
            hasher.update(&r.rule_id.0.to_le_bytes());
            hasher.update(&[r.head.arity, r.body_len, r.var_count]);
            hasher.update(&[r.body_mask, r.negation_mask, r.builtin_mask, r.feature_mask]);
            // Head atom in full (pred + mask + args), then the count-prefixed
            // body atoms in full. Binding the bodies closes the gap where rule
            // BODIES were unbound in receipts (only head id/arity/masks were
            // hashed).
            Self::hash_atom_into(&mut hasher, &r.head);
            hasher.update(&[r.body_len]);
            for bi in 0..r.body_len as usize {
                Self::hash_atom_into(&mut hasher, &r.body[bi]);
            }
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

    /// Output root binds the actual `Decision.bindings` (count-prefixed terms)
    /// plus the depth-truncation marker. Previously it hashed only the output
    /// mask and proof fact-hashes, leaving the bindings themselves unbound.
    fn output_root(q: &QueryAtom8, bindings: &[TermId], depth_exceeded: bool) -> Hash {
        let mut hasher = blake3::Hasher::new_keyed(&DOMAIN_PROLOG8_OUTPUT);
        hasher.update(&q.output_mask.to_le_bytes());
        hasher.update(&(bindings.len() as u32).to_le_bytes());
        for b in bindings {
            hasher.update(&b.0.to_le_bytes());
        }
        hasher.update(&[depth_exceeded as u8]);
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

    /// Backtracking test: solver must explore all intermediate nodes.
    ///
    /// Facts:  link(a,b), link(a,c), link(b,END), link(c,END)
    /// Rule:   via(?0, ?1) :- link(a, ?0), link(?0, ?1)
    /// Query:  via(?, END) — unbound on pos-0 (intermediate node)
    ///
    /// Backtracking must find BOTH b and c as valid intermediates.
    /// Old greedy code found only b (first match); correct SLD finds both.
    /// Using the intermediate as a head variable gives DISTINCT bindings per path,
    /// proving exhaustive search without relying on proof-count semantics.
    #[test]
    fn test_backtracking_finds_all_answers() {
        let mut cat = Catalog::new(CatalogId(99));
        cat.add_predicate(PredicateMeta {
            pred_id: PredicateId(1),
            label: "link".into(),
            arity: 2,
            access_orders: vec![],
            proof_policy: PredicateProofPolicy::OnRequest,
            materialized: false,
        });
        cat.add_predicate(PredicateMeta {
            pred_id: PredicateId(2),
            label: "via".into(),
            arity: 2,
            access_orders: vec![],
            proof_policy: PredicateProofPolicy::OnRequest,
            materialized: false,
        });

        let a = cat.intern_term("a");
        let b = cat.intern_term("b");
        let c = cat.intern_term("c");
        let end = cat.intern_term("END");

        let mut k = Kernel::new(cat);

        let rows = vec![
            FactRow8::new(PredicateId(1), 2, &[a, b], SourceId(0)),
            FactRow8::new(PredicateId(1), 2, &[a, c], SourceId(0)),
            FactRow8::new(PredicateId(1), 2, &[b, end], SourceId(0)),
            FactRow8::new(PredicateId(1), 2, &[c, end], SourceId(0)),
        ];
        k.load_facts(FactBlock8::new(PredicateId(1), 2, rows))
            .unwrap();

        // Rule: via(?0, ?1) :- link(a, ?0), link(?0, ?1)
        // ?0 = intermediate node (appears in head — distinct per path)
        // ?1 = destination (END for both paths)
        const VAR_BASE: u32 = 0x8000_0000;
        let v0 = TermId(VAR_BASE);
        let v1 = TermId(VAR_BASE + 1);

        let head = Atom8::new(PredicateId(2), 2, &[v0, v1]);
        let body0 = Atom8::new(PredicateId(1), 2, &[a, v0]); // link(a, ?0)
        let body1 = Atom8::new(PredicateId(1), 2, &[v0, v1]); // link(?0, ?1)
        let mut body_arr = [Atom8::new(PredicateId(0), 0, &[]); 8];
        body_arr[0] = body0;
        body_arr[1] = body1;

        let rule = Rule8 {
            rule_id: RuleId(99),
            head,
            body: body_arr,
            body_len: 2,
            body_mask: 0b11,
            negation_mask: 0,
            builtin_mask: 0,
            var_count: 2,
            var_live_mask: 0b11,
            feature_mask: FeatureBit::Facts.mask() | FeatureBit::HornRules.mask(),
            proof_mask: 0,
            plan_id: PlanId::default(),
        };
        k.load_rule(rule).unwrap();

        // Query: via(?, END) — find all intermediates reachable from a to END
        let mut q_atom = Atom8::new(PredicateId(2), 2, &[TermId::sentinel(), end]);
        q_atom.binding_mask = 0b10; // pos-1 (END) bound, pos-0 (intermediate) unbound
        let q = QueryAtom8 {
            atom: q_atom,
            output_mask: 0b01, // output pos-0 (the intermediate node)
            proof_mode: ProofMode::PositiveOnly,
            epoch: EpochId(0),
        };

        match k.query(&q) {
            QueryResult::Answered(answers) => {
                assert_eq!(
                    answers.len(),
                    2,
                    "backtracking must find both intermediates (b and c); got {}",
                    answers.len()
                );
                let intermediates: Vec<TermId> = answers
                    .iter()
                    .filter_map(|a| a.bindings.first().copied())
                    .collect();
                assert!(
                    intermediates.contains(&b),
                    "b must be found as intermediate"
                );
                assert!(
                    intermediates.contains(&c),
                    "c must be found as intermediate"
                );
            }
            other => panic!("expected Answered, got {other:?}"),
        }
    }

    /// Depth cap: hitting MAX_DERIVE_DEPTH must surface a typed marker on the
    /// Decision (depth_exceeded = true), not silently return empty/Denied.
    #[test]
    fn depth_exceeded_is_visible_in_decision() {
        let mut cat = Catalog::new(CatalogId(1));
        for (pid, label) in [
            (PredicateId(1), "base"),
            (PredicateId(2), "p"),
        ] {
            cat.add_predicate(PredicateMeta {
                pred_id: pid,
                label: label.into(),
                arity: 1,
                access_orders: vec![],
                proof_policy: PredicateProofPolicy::OnRequest,
                materialized: false,
            });
        }
        let x = cat.intern_term("x");
        let mut k = Kernel::new(cat);
        // Fact: base(x). No fact for p. Recursive rule with no terminating
        // base case: p(?0) :- p(?0). Deriving p(x) recurses forever → cap.
        k.load_facts(FactBlock8::new(
            PredicateId(1),
            1,
            vec![FactRow8::new(PredicateId(1), 1, &[x], SourceId(0))],
        ))
        .unwrap();
        let v0 = var_term(0);
        let head = Atom8::new(PredicateId(2), 1, &[v0]);
        let body0 = Atom8::new(PredicateId(2), 1, &[v0]);
        let mut body_arr = [Atom8::new(PredicateId(0), 0, &[]); 8];
        body_arr[0] = body0;
        let rule = Rule8 {
            rule_id: RuleId(1),
            head,
            body: body_arr,
            body_len: 1,
            body_mask: 0b1,
            negation_mask: 0,
            builtin_mask: 0,
            var_count: 1,
            var_live_mask: 0b1,
            feature_mask: FeatureBit::Facts.mask() | FeatureBit::BoundedRecursion.mask(),
            proof_mask: 0,
            plan_id: PlanId::default(),
        };
        k.load_rule(rule).unwrap();
        let q_atom = Atom8::new(PredicateId(2), 1, &[x]);
        let q = QueryAtom8 {
            atom: q_atom,
            output_mask: 0,
            proof_mode: ProofMode::Both,
            epoch: EpochId(0),
        };
        let (result, _misses, _hits) = k.query_with_stats(&q);
        match result {
            QueryResult::Denied(d) => assert!(
                d.depth_exceeded,
                "depth cap hit must be visible on the Decision"
            ),
            QueryResult::Answered(a) => panic!("unexpected answers {a:?}"),
            other => panic!("unexpected {other:?}"),
        }
    }

    // ------------------------------------------------------------------
    // Validation-gap upgrades (u5 lane)
    // ------------------------------------------------------------------

    /// NAF groundness: a negated body atom with an unbound variable must be a
    /// typed refusal (`NegationFloundering`), never a silent false.
    #[test]
    fn negation_with_unbound_var_is_typed_refusal() {
        let mut cat = Catalog::new(CatalogId(1));
        for (pid, label) in [(PredicateId(1), "q"), (PredicateId(2), "r"), (PredicateId(3), "p")] {
            cat.add_predicate(PredicateMeta {
                pred_id: pid,
                label: label.into(),
                arity: 1,
                access_orders: vec![],
                proof_policy: PredicateProofPolicy::OnRequest,
                materialized: false,
            });
        }
        let x = cat.intern_term("x");
        let mut k = Kernel::new(cat);
        k.load_facts(FactBlock8::new(
            PredicateId(1),
            1,
            vec![FactRow8::new(PredicateId(1), 1, &[x], SourceId(0))],
        ))
        .unwrap();

        // Rule: p(?0) :- q(?0), not r(?1)  — ?1 never bound → must flounder.
        let v0 = var_term(0);
        let v1 = var_term(1);
        let head = Atom8::new(PredicateId(3), 1, &[v0]);
        let body0 = Atom8::new(PredicateId(1), 1, &[v0]);
        let body1 = Atom8::new(PredicateId(2), 1, &[v1]);
        let mut body_arr = [Atom8::new(PredicateId(0), 0, &[]); 8];
        body_arr[0] = body0;
        body_arr[1] = body1;
        let rule = Rule8 {
            rule_id: RuleId(1),
            head,
            body: body_arr,
            body_len: 2,
            body_mask: 0b11,
            negation_mask: 0b10,
            builtin_mask: 0,
            var_count: 2,
            var_live_mask: 0b1,
            feature_mask: FeatureBit::Facts.mask() | FeatureBit::StratifiedNegation.mask(),
            proof_mask: 0,
            plan_id: PlanId::default(),
        };
        k.load_rule(rule).unwrap();

        let q_atom = Atom8::new(PredicateId(3), 1, &[TermId::sentinel()]);
        let q = QueryAtom8 {
            atom: q_atom,
            output_mask: 0b1,
            proof_mode: ProofMode::PositiveOnly,
            epoch: EpochId(0),
        };
        match k.query(&q) {
            QueryResult::Invalid(RejectionCode::NegationFloundering) => {}
            other => panic!("expected NegationFloundering refusal, got {other:?}"),
        }
    }

    /// Ground negation still evaluates: `not r(x)` with r(x) absent succeeds,
    /// `not r(x)` with r(x) present fails — no floundering refusal.
    #[test]
    fn ground_negation_still_evaluates() {
        let mut cat = Catalog::new(CatalogId(1));
        for (pid, label) in [(PredicateId(1), "q"), (PredicateId(2), "r"), (PredicateId(3), "p")] {
            cat.add_predicate(PredicateMeta {
                pred_id: pid,
                label: label.into(),
                arity: 1,
                access_orders: vec![],
                proof_policy: PredicateProofPolicy::OnRequest,
                materialized: false,
            });
        }
        let x = cat.intern_term("x");
        let y = cat.intern_term("y");
        let mut k = Kernel::new(cat);
        k.load_facts(FactBlock8::new(
            PredicateId(1),
            1,
            vec![FactRow8::new(PredicateId(1), 1, &[x], SourceId(0))],
        ))
        .unwrap();
        // r(y) exists, r(x) does not.
        k.load_facts(FactBlock8::new(
            PredicateId(2),
            1,
            vec![FactRow8::new(PredicateId(2), 1, &[y], SourceId(0))],
        ))
        .unwrap();

        // Rule: p(?0) :- q(?0), not r(?0)  — ground at NAF time.
        let v0 = var_term(0);
        let head = Atom8::new(PredicateId(3), 1, &[v0]);
        let body0 = Atom8::new(PredicateId(1), 1, &[v0]);
        let body1 = Atom8::new(PredicateId(2), 1, &[v0]);
        let mut body_arr = [Atom8::new(PredicateId(0), 0, &[]); 8];
        body_arr[0] = body0;
        body_arr[1] = body1;
        let rule = Rule8 {
            rule_id: RuleId(1),
            head,
            body: body_arr,
            body_len: 2,
            body_mask: 0b11,
            negation_mask: 0b10,
            builtin_mask: 0,
            var_count: 1,
            var_live_mask: 0b1,
            feature_mask: FeatureBit::Facts.mask() | FeatureBit::StratifiedNegation.mask(),
            proof_mask: 0,
            plan_id: PlanId::default(),
        };
        k.load_rule(rule).unwrap();

        let q_atom = Atom8::new(PredicateId(3), 1, &[TermId::sentinel()]);
        let q = QueryAtom8 {
            atom: q_atom,
            output_mask: 0b1,
            proof_mode: ProofMode::PositiveOnly,
            epoch: EpochId(0),
        };
        match k.query(&q) {
            QueryResult::Answered(a) => assert_eq!(a.len(), 1),
            other => panic!("expected Answered for ground NAF, got {other:?}"),
        }
    }

    /// rule_root must bind rule BODIES: two kernels with rules that share
    /// rule_id, head, and masks but differ in a body atom must produce
    /// different rule roots (and receipt hashes).
    #[test]
    fn rule_root_binds_rule_bodies() {
        let (k1, q) = body_discrimination_kernel(PredicateId(1));
        let (k2, _) = body_discrimination_kernel(PredicateId(2));

        let r1 = match k1.query(&q) {
            QueryResult::Answered(a) => a[0].receipt.clone(),
            QueryResult::Denied(d) => d.receipt,
            QueryResult::Invalid(_) => unreachable!(),
        };
        let r2 = match k2.query(&q) {
            QueryResult::Answered(a) => a[0].receipt.clone(),
            QueryResult::Denied(d) => d.receipt,
            QueryResult::Invalid(_) => unreachable!(),
        };
        assert_ne!(
            r1.rule_root, r2.rule_root,
            "rule_root must change when a rule body changes"
        );
        assert_ne!(r1.receipt_hash, r2.receipt_hash);
    }

    /// Kernel factory for `rule_root_binds_rule_bodies`: builds identical
    /// fact bases and a rule whose first body atom differs by pred_id.
    fn body_discrimination_kernel(body0_pred: PredicateId) -> (Kernel, QueryAtom8) {
        let mut cat = Catalog::new(CatalogId(1));
        for (pid, label) in [
            (PredicateId(1), "f1"),
            (PredicateId(2), "f2"),
            (PredicateId(3), "p"),
        ] {
            cat.add_predicate(PredicateMeta {
                pred_id: pid,
                label: label.into(),
                arity: 1,
                access_orders: vec![],
                proof_policy: PredicateProofPolicy::OnRequest,
                materialized: false,
            });
        }
        let x = cat.intern_term("x");
        let mut k = Kernel::new(cat);
        k.load_facts(FactBlock8::new(
            PredicateId(1),
            1,
            vec![FactRow8::new(PredicateId(1), 1, &[x], SourceId(0))],
        ))
        .unwrap();
        k.load_facts(FactBlock8::new(
            PredicateId(2),
            1,
            vec![FactRow8::new(PredicateId(2), 1, &[x], SourceId(0))],
        ))
        .unwrap();

        // Rule: p(?0) :- <body0_pred>(?0)  — same head/ids/masks, body differs.
        let v0 = var_term(0);
        let head = Atom8::new(PredicateId(3), 1, &[v0]);
        let body0 = Atom8::new(body0_pred, 1, &[v0]);
        let mut body_arr = [Atom8::new(PredicateId(0), 0, &[]); 8];
        body_arr[0] = body0;
        let rule = Rule8 {
            rule_id: RuleId(7),
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

        let q_atom = Atom8::new(PredicateId(3), 1, &[x]);
        let mut q_atom = q_atom;
        q_atom.binding_mask = 0b1;
        let q = QueryAtom8 {
            atom: q_atom,
            output_mask: 0,
            proof_mode: ProofMode::PositiveOnly,
            epoch: EpochId(0),
        };
        (k, q)
    }

    /// output_root must bind Decision.bindings: the same query against two
    /// fact bases that yield different output bindings must yield different
    /// output roots (the old root hashed only the mask + fact hashes).
    #[test]
    fn output_root_binds_decision_bindings() {
        let mk = |rows: Vec<TermId>| -> (Kernel, QueryAtom8) {
            let mut cat = Catalog::new(CatalogId(1));
            cat.add_predicate(PredicateMeta {
                pred_id: PredicateId(1),
                label: "src".into(),
                arity: 1,
                access_orders: vec![],
                proof_policy: PredicateProofPolicy::OnRequest,
                materialized: false,
            });
            let a = cat.intern_term("a");
            let b = cat.intern_term("b");
            let terms = [a, b];
            let (k, q) = {
                let mut k = Kernel::new(cat);
                k.load_facts(FactBlock8::new(
                    PredicateId(1),
                    1,
                    rows.into_iter()
                        .map(|t| FactRow8::new(PredicateId(1), 1, &[t], SourceId(0)))
                        .collect(),
                ))
                .unwrap();
                let q_atom = Atom8::new(PredicateId(1), 1, &[TermId::sentinel()]);
                let q = QueryAtom8 {
                    atom: q_atom,
                    output_mask: 0b1,
                    proof_mode: ProofMode::PositiveOnly,
                    epoch: EpochId(0),
                };
                (k, q)
            };
            let _ = terms;
            (k, q)
        };
        let (k1, q1) = mk(vec![TermId(101)]);
        let (k2, q2) = mk(vec![TermId(202)]);
        // Sanity: the two kernels use different catalogs so term ids don't collide.
        let r1 = match k1.query(&q1) {
            QueryResult::Answered(a) => a[0].receipt.clone(),
            _ => unreachable!(),
        };
        let r2 = match k2.query(&q2) {
            QueryResult::Answered(a) => a[0].receipt.clone(),
            _ => unreachable!(),
        };
        assert_ne!(r1.output_root, r2.output_root);
        assert_ne!(r1.receipt_hash, r2.receipt_hash);
    }

    #[test]
    fn memoization_collapses_exponential_path_enumeration() {
        // Layered DAG: width 2, 10 hops. Naive path count = 2^10 = 1024; distinct
        // nodes = 22. The memo table must collapse repeated (goal, depth) subgoals.
        const LEVELS: usize = 10;
        let mut cat = Catalog::new(CatalogId(1));
        for (pid, label, ar) in [
            (PredicateId(1), "edge".to_string(), 2u8),
            (PredicateId(2), "path".to_string(), 2u8),
        ] {
            cat.add_predicate(PredicateMeta {
                pred_id: pid,
                label,
                arity: ar,
                access_orders: vec![],
                proof_policy: PredicateProofPolicy::OnRequest,
                materialized: false,
            });
        }
        let node = |k: usize, w: usize| TermId(1000 + (k * 2 + w) as u32);
        let mut rows = Vec::new();
        for k in 0..LEVELS {
            for w in 0..2usize {
                for w2 in 0..2usize {
                    rows.push(FactRow8::new(
                        PredicateId(1),
                        2,
                        &[node(k, w), node(k + 1, w2)],
                        SourceId(0),
                    ));
                }
            }
        }
        let mut k = Kernel::new(cat);
        k.load_facts(FactBlock8::new(PredicateId(1), 2, rows))
            .unwrap();

        // Rule A: path(?0,?1) :- edge(?0,?1).
        // Rule B: path(?0,?1) :- path(?0,?2), edge(?2,?1).
        let v0 = var_term(0);
        let v1 = var_term(1);
        let v2 = var_term(2);
        let mut b0 = [Atom8::new(PredicateId(0), 0, &[]); 8];
        b0[0] = Atom8::new(PredicateId(1), 2, &[v0, v1]);
        let mut b1 = [Atom8::new(PredicateId(0), 0, &[]); 8];
        // edge(?0,?2) first, then the recursive path(?2,?1) — subgoals become
        // the forward nodes, which are shared across derivation routes.
        b1[0] = Atom8::new(PredicateId(1), 2, &[v0, v2]);
        b1[1] = Atom8::new(PredicateId(2), 2, &[v2, v1]);
        let mk_rule = |rid: u32, body: [Atom8; 8], body_len: u8| Rule8 {
            rule_id: RuleId(rid),
            head: Atom8::new(PredicateId(2), 2, &[v0, v1]),
            body,
            body_len,
            body_mask: (1u16 << body_len) as u8 - 1,
            negation_mask: 0,
            builtin_mask: 0,
            var_count: 3,
            var_live_mask: 0b11,
            feature_mask: FeatureBit::Facts.mask() | FeatureBit::HornRules.mask(),
            proof_mask: 0,
            plan_id: PlanId::default(),
        };
        k.load_rule(mk_rule(1, b0, 1)).unwrap();
        k.load_rule(mk_rule(2, b1, 2)).unwrap();

        // Query: path(L0_0, ?) — all reachable endpoints.
        let q_atom = Atom8::new(PredicateId(2), 2, &[node(0, 0), TermId::sentinel()]);
        let q = QueryAtom8 {
            atom: q_atom,
            output_mask: 0b10,
            proof_mode: ProofMode::PositiveOnly,
            epoch: EpochId(0),
        };
        let (result, misses, hits) = k.query_with_stats(&q);
        let answers = match result {
            QueryResult::Answered(a) => a,
            other => panic!("expected Answered, got {other:?}"),
        };
        // Every layer's nodes are reachable.
        let mut endpoints: Vec<u32> = answers
            .iter()
            .filter_map(|a| a.bindings.first().map(|t| t.0))
            .collect();
        endpoints.sort_unstable();
        endpoints.dedup();
        assert_eq!(endpoints.len(), 2 * LEVELS, "all layer nodes reachable");
        for k in 1..=LEVELS {
            for w in 0..2 {
                assert!(endpoints.contains(&(node(k, w).0)));
            }
        }
        // No duplicate derivations.
        let n = answers.len();
        for i in 0..n {
            for j in (i + 1)..n {
                assert_ne!(answers[i].bindings, answers[j].bindings);
                assert_ne!(answers[i].receipt.receipt_hash, answers[j].receipt.receipt_hash);
            }
        }
        // Naive SLD enumerates 2^LEVELS paths; memoization must collapse the
        // repeated (goal, depth) subgoals to a small number of computations.
        let naive_paths = 1usize << LEVELS;
        assert!(
            hits > 0,
            "memo table must actually fire"
        );
        assert!(
            (misses as usize) < naive_paths / 8,
            "memo must collapse exponential re-derivation: misses={misses}, naive={naive_paths}"
        );
    }
}
