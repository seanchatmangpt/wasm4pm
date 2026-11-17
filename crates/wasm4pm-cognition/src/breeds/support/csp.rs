#![allow(missing_docs)]
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::fmt;

#[derive(Debug, Clone)]
pub struct CspVar {
    pub name: String,
    pub domain: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct CspConstraint {
    pub var1: String,
    pub var2: String,
    pub op: String,
}

#[derive(Debug, Clone)]
pub enum TraceEvent {
    Init { vars: usize, constraints: usize },
    Revise { x: String, y: String, pruned: usize },
    Propagate { var: String, domain: Vec<String> },
    Assign { var: String, val: String },
    Backtrack { var: String },
    Verdict { satisfiable: bool },
}

/// Typed error for constraint stores. Surfaced as a typed `Err` instead of a
/// panic or a silent `false` so breeds refuse malformed input.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CspError {
    /// A constraint (or revise arc) names a variable with no declared domain.
    UndeclaredVariable { var: String },
    /// An ordering (or arithmetic-offset) constraint was applied to a value
    /// that does not parse as an integer.
    NonNumericOrdering { val: String, op: String },
    /// The solver exceeded its iteration budget.
    BudgetExhausted { iterations: usize },
}

impl fmt::Display for CspError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CspError::UndeclaredVariable { var } => {
                write!(f, "constraint references undeclared variable: {}", var)
            }
            CspError::NonNumericOrdering { val, op } => {
                write!(
                    f,
                    "ordering op '{}' applied to non-numeric value '{}'",
                    op, val
                )
            }
            CspError::BudgetExhausted { iterations } => {
                write!(f, "search budget exhausted ({} iterations)", iterations)
            }
        }
    }
}

impl std::error::Error for CspError {}

/// Reverse the orientation of an op so a constraint (var1, var2, op) can be
/// checked as (var2, var1, reversed). Handles ordering ops and the arithmetic
/// offsets: x = y + c  <=>  y = x - c.
fn reverse_op(op: &str) -> String {
    match op {
        "<" => ">".to_string(),
        "<=" => ">=".to_string(),
        ">" => "<".to_string(),
        ">=" => "<=".to_string(),
        other => {
            if let Some(rest) = other.strip_prefix("=+") {
                format!("=-{}", rest)
            } else if let Some(rest) = other.strip_prefix("=-") {
                format!("=+{}", rest)
            } else {
                other.to_string()
            }
        }
    }
}

/// Shared constraint evaluation.
///
/// Semantics: if both values parse as integers, ordering/equality/offset ops
/// compare numerically; an ordering or offset op whose offset constant does
/// not parse is a typed error. On non-numeric values, an ordering op is a
/// typed error (never a silent string fallback). Equality ops are string
/// comparisons on non-numeric values; unknown ops return false.
fn evaluate(val1: &str, val2: &str, op: &str) -> Result<bool, CspError> {
    if let (Ok(i1), Ok(i2)) = (val1.parse::<i64>(), val2.parse::<i64>()) {
        return Ok(match op {
            "<" => i1 < i2,
            "<=" => i1 <= i2,
            ">" => i1 > i2,
            ">=" => i1 >= i2,
            "==" => i1 == i2,
            "!=" => i1 != i2,
            _ => {
                if let Some(rest) = op.strip_prefix("=+") {
                    match rest.parse::<i64>() {
                        Ok(c) => i1 == i2 + c,
                        Err(_) => {
                            return Err(CspError::NonNumericOrdering {
                                val: op.to_string(),
                                op: op.to_string(),
                            })
                        }
                    }
                } else if let Some(rest) = op.strip_prefix("=-") {
                    match rest.parse::<i64>() {
                        Ok(c) => i1 == i2 - c,
                        Err(_) => {
                            return Err(CspError::NonNumericOrdering {
                                val: op.to_string(),
                                op: op.to_string(),
                            })
                        }
                    }
                } else {
                    // Unknown numeric-context op: fall back to string equality.
                    val1 == val2
                }
            }
        });
    }
    // Non-numeric path.
    match op {
        "!=" => Ok(val1 != val2),
        "==" => Ok(val1 == val2),
        "<" | "<=" | ">" | ">=" => Err(CspError::NonNumericOrdering {
            val: if val1.parse::<i64>().is_err() {
                val1.to_string()
            } else {
                val2.to_string()
            },
            op: op.to_string(),
        }),
        _ => Ok(false),
    }
}

/// Shared arc-revision over ALL constraints on the {x, y} pair. `vx` survives
/// iff for EVERY constraint op over the pair, some `vy` in `dy` satisfies that
/// op (per-constraint witness, as AC-3 arc consistency requires). Returns the
/// surviving values and the prune count.
fn revise_domain(
    dx: &[String],
    dy: &[String],
    ops: &[String],
) -> Result<(Vec<String>, usize), CspError> {
    let mut new_dx = Vec::new();
    let mut pruned = 0;
    for vx in dx {
        let mut satisfied = true;
        for op in ops {
            let mut any = false;
            for vy in dy {
                if evaluate(vx, vy, op)? {
                    any = true;
                    break;
                }
            }
            if !any {
                satisfied = false;
                break;
            }
        }
        if satisfied {
            new_dx.push(vx.clone());
        } else {
            pruned += 1;
        }
    }
    Ok((new_dx, pruned))
}

pub struct CspStore {
    pub vars: BTreeMap<String, CspVar>,
    pub constraints: Vec<CspConstraint>,
    pub domains: BTreeMap<String, Vec<String>>,
    pub trace: Vec<TraceEvent>,
    /// Maximum solver iterations before refusing with
    /// [`CspError::BudgetExhausted`]. Injectable for tests.
    pub max_iterations: usize,
    iterations: usize,
}

impl Default for CspStore {
    fn default() -> Self {
        Self::new()
    }
}

impl CspStore {
    pub fn new() -> Self {
        CspStore {
            vars: BTreeMap::new(),
            constraints: Vec::new(),
            domains: BTreeMap::new(),
            trace: Vec::new(),
            max_iterations: 100_000,
            iterations: 0,
        }
    }

    fn tick(&mut self) -> Result<(), CspError> {
        self.iterations += 1;
        if self.iterations > self.max_iterations {
            return Err(CspError::BudgetExhausted {
                iterations: self.iterations,
            });
        }
        Ok(())
    }

    pub fn add_var(&mut self, name: &str, domain: Vec<String>) {
        self.vars.insert(
            name.to_string(),
            CspVar {
                name: name.to_string(),
                domain: domain.clone(),
            },
        );
        self.domains.insert(name.to_string(), domain.clone());
        self.trace.push(TraceEvent::Propagate {
            var: name.to_string(),
            domain,
        });
    }

    pub fn add_constraint(&mut self, var1: &str, var2: &str, op: &str) -> Result<(), CspError> {
        self.constraints.push(CspConstraint {
            var1: var1.to_string(),
            var2: var2.to_string(),
            op: op.to_string(),
        });
        self.propagate().map(|_| ())
    }

    fn neighbors(&self, x: &str) -> Vec<String> {
        let mut n = Vec::new();
        for c in &self.constraints {
            if c.var1 == x {
                n.push(c.var2.clone());
            } else if c.var2 == x {
                n.push(c.var1.clone());
            }
        }
        n
    }

    /// ALL constraints over the {x, y} pair, re-oriented as x-op-y.
    fn pair_ops(&self, x: &str, y: &str) -> Vec<String> {
        self.constraints
            .iter()
            .filter(|c| (c.var1 == x && c.var2 == y) || (c.var1 == y && c.var2 == x))
            .map(|c| {
                if c.var1 == x {
                    c.op.clone()
                } else {
                    reverse_op(&c.op)
                }
            })
            .collect()
    }

    fn revise(&mut self, x: &str, y: &str) -> Result<bool, CspError> {
        self.tick()?;
        let ops = self.pair_ops(x, y);
        if ops.is_empty() {
            return Ok(false);
        }

        let dx = self
            .domains
            .get(x)
            .cloned()
            .ok_or_else(|| CspError::UndeclaredVariable { var: x.to_string() })?;
        let dy = self
            .domains
            .get(y)
            .cloned()
            .ok_or_else(|| CspError::UndeclaredVariable { var: y.to_string() })?;

        let (new_dx, pruned_count) = revise_domain(&dx, &dy, &ops)?;

        if pruned_count > 0 {
            self.domains.insert(x.to_string(), new_dx.clone());
            self.trace.push(TraceEvent::Revise {
                x: x.to_string(),
                y: y.to_string(),
                pruned: pruned_count,
            });
            self.trace.push(TraceEvent::Propagate {
                var: x.to_string(),
                domain: new_dx,
            });
            return Ok(true);
        }
        Ok(false)
    }

    pub fn propagate(&mut self) -> Result<bool, CspError> {
        let mut queue: VecDeque<(String, String)> = VecDeque::new();
        for c in &self.constraints {
            queue.push_back((c.var1.clone(), c.var2.clone()));
            queue.push_back((c.var2.clone(), c.var1.clone()));
        }

        while let Some((x, y)) = queue.pop_front() {
            self.tick()?;
            if self.revise(&x, &y)? {
                if self.domains.get(&x).map_or(false, Vec::is_empty) {
                    return Ok(false);
                }
                for z in self.neighbors(&x) {
                    if z != y {
                        queue.push_back((z, x.clone()));
                    }
                }
            }
        }
        Ok(true)
    }

    pub fn solve(&mut self) -> Result<Option<BTreeMap<String, String>>, CspError> {
        if !self.propagate()? {
            return Ok(None);
        }

        let mut assignments = BTreeMap::new();
        let mut unassigned: BTreeSet<String> = self.vars.keys().cloned().collect();

        // If all domains are singletons, we are done
        let mut all_singletons = true;
        for (v, d) in &self.domains {
            if d.len() == 1 {
                assignments.insert(v.clone(), d[0].clone());
                unassigned.remove(v);
            } else {
                all_singletons = false;
            }
        }

        if all_singletons {
            return Ok(Some(assignments));
        }

        if self.backtrack(&mut assignments, &mut unassigned, &self.domains.clone())? {
            Ok(Some(assignments))
        } else {
            Ok(None)
        }
    }

    fn select_unassigned_var(
        &self,
        unassigned: &BTreeSet<String>,
        domains: &BTreeMap<String, Vec<String>>,
    ) -> String {
        let mut best_var: Option<&String> = None;
        let mut min_size = usize::MAX;

        for v in unassigned {
            let size = domains.get(v).unwrap().len();
            if size < min_size {
                min_size = size;
                best_var = Some(v);
            } else if size == min_size {
                if let Some(b) = best_var {
                    if v < b {
                        best_var = Some(v);
                    }
                }
            }
        }
        best_var.unwrap().clone()
    }

    fn backtrack(
        &mut self,
        assignments: &mut BTreeMap<String, String>,
        unassigned: &mut BTreeSet<String>,
        domains: &BTreeMap<String, Vec<String>>,
    ) -> Result<bool, CspError> {
        self.tick()?;
        if unassigned.is_empty() {
            return Ok(true);
        }

        let var = self.select_unassigned_var(unassigned, domains);
        unassigned.remove(&var);

        let mut values = domains.get(&var).unwrap().clone();
        values.sort();

        for val in values {
            let mut consistent = true;
            for c in &self.constraints {
                if c.var1 == var && assignments.contains_key(&c.var2) {
                    if !evaluate(&val, assignments.get(&c.var2).unwrap(), &c.op)? {
                        consistent = false;
                        break;
                    }
                } else if c.var2 == var && assignments.contains_key(&c.var1) {
                    if !evaluate(assignments.get(&c.var1).unwrap(), &val, &c.op)? {
                        consistent = false;
                        break;
                    }
                }
            }

            if consistent {
                assignments.insert(var.clone(), val.clone());
                self.trace.push(TraceEvent::Assign {
                    var: var.clone(),
                    val: val.clone(),
                });

                let mut new_domains = domains.clone();
                new_domains.insert(var.clone(), vec![val.clone()]);

                // Temp solver for MAC
                let mut temp_solver = CspSolver::new();
                temp_solver.max_iterations = self.max_iterations.saturating_sub(self.iterations);
                temp_solver.vars = self.vars.clone();
                temp_solver.constraints = self.constraints.clone();

                if temp_solver.ac3(&mut new_domains)? {
                    if self.backtrack(assignments, unassigned, &new_domains)? {
                        return Ok(true);
                    }
                }

                assignments.remove(&var);
                self.trace.push(TraceEvent::Backtrack { var: var.clone() });
            }
        }

        unassigned.insert(var.clone());
        Ok(false)
    }
}

pub struct CspSolver {
    pub vars: BTreeMap<String, CspVar>,
    pub constraints: Vec<CspConstraint>,
    pub trace: Vec<TraceEvent>,
    /// Maximum solver iterations before refusing with
    /// [`CspError::BudgetExhausted`]. Injectable for tests.
    pub max_iterations: usize,
    iterations: usize,
}

impl Default for CspSolver {
    fn default() -> Self {
        Self::new()
    }
}

impl CspSolver {
    pub fn new() -> Self {
        CspSolver {
            vars: BTreeMap::new(),
            constraints: Vec::new(),
            trace: Vec::new(),
            max_iterations: 100_000,
            iterations: 0,
        }
    }

    fn tick(&mut self) -> Result<(), CspError> {
        self.iterations += 1;
        if self.iterations > self.max_iterations {
            return Err(CspError::BudgetExhausted {
                iterations: self.iterations,
            });
        }
        Ok(())
    }

    pub fn add_var(&mut self, name: &str, domain: Vec<String>) {
        self.vars.insert(
            name.to_string(),
            CspVar {
                name: name.to_string(),
                domain,
            },
        );
    }

    pub fn add_constraint(&mut self, var1: &str, var2: &str, op: &str) {
        self.constraints.push(CspConstraint {
            var1: var1.to_string(),
            var2: var2.to_string(),
            op: op.to_string(),
        });
    }

    fn neighbors(&self, x: &str) -> Vec<String> {
        let mut n = Vec::new();
        for c in &self.constraints {
            if c.var1 == x {
                n.push(c.var2.clone());
            } else if c.var2 == x {
                n.push(c.var1.clone());
            }
        }
        n
    }

    /// ALL constraints over the {x, y} pair, re-oriented as x-op-y.
    fn pair_ops(&self, x: &str, y: &str) -> Vec<String> {
        self.constraints
            .iter()
            .filter(|c| (c.var1 == x && c.var2 == y) || (c.var1 == y && c.var2 == x))
            .map(|c| {
                if c.var1 == x {
                    c.op.clone()
                } else {
                    reverse_op(&c.op)
                }
            })
            .collect()
    }

    fn revise(
        &mut self,
        domains: &mut BTreeMap<String, Vec<String>>,
        x: &str,
        y: &str,
    ) -> Result<bool, CspError> {
        self.tick()?;
        let ops = self.pair_ops(x, y);
        if ops.is_empty() {
            return Ok(false);
        }

        let dx = domains
            .get(x)
            .cloned()
            .ok_or_else(|| CspError::UndeclaredVariable { var: x.to_string() })?;
        let dy = domains
            .get(y)
            .cloned()
            .ok_or_else(|| CspError::UndeclaredVariable { var: y.to_string() })?;

        let (new_dx, pruned_count) = revise_domain(&dx, &dy, &ops)?;

        if pruned_count > 0 {
            domains.insert(x.to_string(), new_dx);
            self.trace.push(TraceEvent::Revise {
                x: x.to_string(),
                y: y.to_string(),
                pruned: pruned_count,
            });
            return Ok(true);
        }
        Ok(false)
    }

    pub fn ac3(
        &mut self,
        domains: &mut BTreeMap<String, Vec<String>>,
    ) -> Result<bool, CspError> {
        let mut queue: VecDeque<(String, String)> = VecDeque::new();
        for c in &self.constraints {
            queue.push_back((c.var1.clone(), c.var2.clone()));
            queue.push_back((c.var2.clone(), c.var1.clone()));
        }

        while let Some((x, y)) = queue.pop_front() {
            self.tick()?;
            if self.revise(domains, &x, &y)? {
                if domains.get(&x).map_or(false, Vec::is_empty) {
                    return Ok(false); // Domain wipeout
                }
                for z in self.neighbors(&x) {
                    if z != y {
                        queue.push_back((z, x.clone()));
                    }
                }
            }
        }
        Ok(true)
    }

    fn select_unassigned_var(
        &self,
        unassigned: &BTreeSet<String>,
        domains: &BTreeMap<String, Vec<String>>,
    ) -> String {
        let mut best_var: Option<&String> = None;
        let mut min_size = usize::MAX;

        for v in unassigned {
            let size = domains.get(v).unwrap().len();
            if size < min_size {
                min_size = size;
                best_var = Some(v);
            } else if size == min_size {
                if let Some(b) = best_var {
                    if v < b {
                        best_var = Some(v);
                    }
                }
            }
        }
        best_var.unwrap().clone()
    }

    pub fn backtrack(
        &mut self,
        assignments: &mut BTreeMap<String, String>,
        unassigned: &mut BTreeSet<String>,
        domains: &BTreeMap<String, Vec<String>>,
    ) -> Result<bool, CspError> {
        self.tick()?;
        if unassigned.is_empty() {
            return Ok(true);
        }

        let var = self.select_unassigned_var(unassigned, domains);
        unassigned.remove(&var);

        let mut values = domains.get(&var).unwrap().clone();
        // CLP values can be strings representing numbers: sort numerically
        // when possible so the search order is deterministic.
        values.sort_by(|a, b| {
            if let (Ok(ia), Ok(ib)) = (a.parse::<i64>(), b.parse::<i64>()) {
                ia.cmp(&ib)
            } else {
                a.cmp(b)
            }
        });

        for val in values {
            let mut consistent = true;
            for c in &self.constraints {
                if c.var1 == var && assignments.contains_key(&c.var2) {
                    if !evaluate(&val, assignments.get(&c.var2).unwrap(), &c.op)? {
                        consistent = false;
                        break;
                    }
                } else if c.var2 == var && assignments.contains_key(&c.var1) {
                    if !evaluate(assignments.get(&c.var1).unwrap(), &val, &c.op)? {
                        consistent = false;
                        break;
                    }
                }
            }

            if consistent {
                assignments.insert(var.clone(), val.clone());
                self.trace.push(TraceEvent::Assign {
                    var: var.clone(),
                    val: val.clone(),
                });

                let mut new_domains = domains.clone();
                new_domains.insert(var.clone(), vec![val.clone()]);

                if self.ac3(&mut new_domains)? {
                    if self.backtrack(assignments, unassigned, &new_domains)? {
                        return Ok(true);
                    }
                }

                assignments.remove(&var);
                self.trace.push(TraceEvent::Backtrack { var: var.clone() });
            }
        }

        unassigned.insert(var.clone());
        Ok(false)
    }

    pub fn solve(&mut self) -> Result<Option<BTreeMap<String, String>>, CspError> {
        self.trace.push(TraceEvent::Init {
            vars: self.vars.len(),
            constraints: self.constraints.len(),
        });

        let mut domains: BTreeMap<String, Vec<String>> = self
            .vars
            .iter()
            .map(|(k, v)| (k.clone(), v.domain.clone()))
            .collect();

        if !self.ac3(&mut domains)? {
            self.trace.push(TraceEvent::Verdict { satisfiable: false });
            return Ok(None);
        }

        let mut assignments = BTreeMap::new();
        let mut unassigned: BTreeSet<String> = self.vars.keys().cloned().collect();

        if self.backtrack(&mut assignments, &mut unassigned, &domains)? {
            self.trace.push(TraceEvent::Verdict { satisfiable: true });
            Ok(Some(assignments))
        } else {
            self.trace.push(TraceEvent::Verdict { satisfiable: false });
            Ok(None)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store_pair_constrained(ops: &[&str]) -> CspStore {
        let mut s = CspStore::new();
        s.add_var("x", vec!["1".into(), "2".into(), "3".into(), "4".into()]);
        s.add_var("y", vec!["2".into(), "3".into(), "4".into()]);
        for op in ops {
            s.add_constraint("x", "y", op).unwrap();
        }
        s
    }

    #[test]
    fn two_constraints_same_pair_both_enforced() {
        // x < y AND x != 2 (as x != y... use x<y and x>y-2 i.e. =-1 offset? keep
        // simple: x <= 2 via ordering against y plus != against y.
        // x<y and x!=y: y domain {2,3,4}; x must have SOME y with x<y AND x!=y.
        // x=1: y=2 works (1<2, 1!=2). x=2: y=3 works. x=3: y=4 works.
        // x=4: no y>4 -> pruned. Survivors {1,2,3}.
        let mut s = store_pair_constrained(&["<", "!="]);
        assert!(s.propagate().unwrap());
        let dx = &s.domains["x"];
        assert_eq!(dx, &["1".to_string(), "2".to_string(), "3".to_string()]);
    }

    #[test]
    fn two_constraints_same_pair_intersected() {
        // x <= y AND x == y-1 (offset "=−1"): x=1: y=2 ok(1<=2, 1==2-1). x=2: y=3 ok,
        // x=3: y=4 ok. x=4: no y with 4<=y -> pruned. Survivors {1,2,3}.
        let mut s = store_pair_constrained(&["<=", "=-1"]);
        assert!(s.propagate().unwrap());
        assert_eq!(s.domains["x"], ["1", "2", "3"]);
        // y side: y=2 needs x with x<=2 and x>=1 -> x=1 or 2 ok. y=3: x<=3 ok.
        assert_eq!(s.domains["y"], ["2", "3", "4"]);
    }

    #[test]
    fn ordering_on_strings_is_typed_error() {
        let mut s = CspStore::new();
        s.add_var("c1", vec!["red".into(), "blue".into()]);
        s.add_var("c2", vec!["blue".into(), "green".into()]);
        s.add_constraint("c1", "c2", "<").unwrap_err();
        // add_constraint propagates; the ordering on strings must surface as a
        // typed error, not a silent false.
        let mut s2 = CspStore::new();
        s2.add_var("c1", vec!["red".into(), "blue".into()]);
        s2.add_var("c2", vec!["blue".into(), "green".into()]);
        // push the constraint directly so we test revise() itself, not just
        // add_constraint's propagate-on-add path.
        s2.constraints.push(CspConstraint {
            var1: "c1".to_string(),
            var2: "c2".to_string(),
            op: "<".to_string(),
        });
        let err = s2.propagate().err().expect("must be a typed Err");
        match err {
            CspError::NonNumericOrdering { val, op } => {
                assert!(val == "red" || val == "blue");
                assert_eq!(op, "<");
            }
            other => panic!("expected NonNumericOrdering, got {:?}", other),
        }
    }

    #[test]
fn dbg_propagate() {
    let mut s2 = CspStore::new();
    s2.add_var("c1", vec!["red".into(), "blue".into()]);
    s2.add_var("c2", vec!["blue".into(), "green".into()]);
    let r = s2.propagate();
    println!("propagate result: {:?}", r);
    let r2 = evaluate("red", "blue", "<");
    println!("evaluate: {:?}", r2);
    let ops = s2.pair_ops("c1", "c2");
    println!("ops: {:?}", ops);
    let dx = s2.domains.get("c1").cloned().unwrap();
    let dy = s2.domains.get("c2").cloned().unwrap();
    println!("revise_domain: {:?}", revise_domain(&dx, &dy, &ops));
}

    #[test]
    fn reverse_op_reverses_offsets() {
        assert_eq!(reverse_op("=+3"), "=-3");
        assert_eq!(reverse_op("=-3"), "=+3");
        assert_eq!(reverse_op("<"), ">");
        assert_eq!(reverse_op("=="), "==");
    }

    #[test]
    fn solver_offset_pair_both_directions() {
        // CspSolver path: constraint x == y+1 ("=+1", forward on x). Revising
        // x: x=1 needs y=0 (absent) -> pruned; x=2 needs y=1 (absent) -> pruned;
        // x=3 needs y=2 -> survives. Revising y uses the reversed op "=−1":
        // y=3 needs x=4 (absent) -> pruned; y=4 needs x=5 -> pruned; y=2 keeps
        // x=3. Intersected fixpoint: x={3}, y={2}.
        let mut s = CspSolver::new();
        s.add_var("x", vec!["1".into(), "2".into(), "3".into()]);
        s.add_var("y", vec!["2".into(), "3".into(), "4".into()]);
        s.add_constraint("x", "y", "=+1");
        let mut domains: BTreeMap<String, Vec<String>> = s
            .vars
            .iter()
            .map(|(k, v)| (k.clone(), v.domain.clone()))
            .collect();
        assert!(s.ac3(&mut domains).unwrap());
        assert_eq!(domains["x"], ["3"]);
        assert_eq!(domains["y"], ["2"]);
    }

    #[test]
    fn budget_exhausted_is_typed_error() {
        let mut s = CspSolver::new();
        s.max_iterations = 2;
        s.add_var("x", vec!["1".into(), "2".into()]);
        s.add_var("y", vec!["1".into(), "2".into()]);
        s.add_constraint("x", "y", "!=");
        match s.solve() {
            Err(CspError::BudgetExhausted { iterations }) => assert!(iterations > 2),
            other => panic!("expected BudgetExhausted, got {:?}", other),
        }
    }

    #[test]
    fn coloring_regression_still_solves() {
        // 2-color a square: x1!=x2, x2!=x3, x3!=x4, x4!=x1.
        let mut s = CspSolver::new();
        for v in ["x1", "x2", "x3", "x4"] {
            s.add_var(v, vec!["red".into(), "blue".into()]);
        }
        s.add_constraint("x1", "x2", "!=");
        s.add_constraint("x2", "x3", "!=");
        s.add_constraint("x3", "x4", "!=");
        s.add_constraint("x4", "x1", "!=");
        let sol = s.solve().unwrap().expect("square is 2-colorable");
        assert_ne!(sol["x1"], sol["x2"]);
        assert_ne!(sol["x2"], sol["x3"]);
        assert_ne!(sol["x3"], sol["x4"]);
        assert_ne!(sol["x4"], sol["x1"]);
    }
}
