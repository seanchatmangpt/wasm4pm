//! CSP solver
use std::collections::{HashMap, VecDeque};

/// Variable
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Var(pub String);

/// Domain of a variable
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Domain(pub Vec<i32>);

impl Domain {
    /// Create a new domain
    pub fn new(mut values: Vec<i32>) -> Self {
        values.sort_unstable();
        Self(values)
    }
    /// Check if empty
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
    /// Check if domain contains a value
    pub fn contains(&self, val: i32) -> bool {
        self.0.contains(&val)
    }
    /// Remove a value
    pub fn remove(&mut self, val: i32) -> bool {
        if let Some(pos) = self.0.iter().position(|&x| x == val) {
            self.0.remove(pos);
            true
        } else {
            false
        }
    }
}

/// Constraint operator
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConstraintOp {
    /// Equal
    Equal,
    /// Not Equal
    NotEqual,
    /// Less than
    LessThan,
    /// Greater than
    GreaterThan,
    /// Add equal
    AddEqual(i32),
}

/// Constraint
#[derive(Debug, Clone)]
pub struct Constraint {
    /// X variable
    pub x: Var,
    /// Y variable
    pub y: Var,
    /// Operator
    pub op: ConstraintOp,
}

impl Constraint {
    /// Create new constraint
    pub fn new(x: Var, y: Var, op: ConstraintOp) -> Self {
        Self { x, y, op }
    }

    /// Check satisfaction
    pub fn satisfies(&self, val_x: i32, val_y: i32) -> bool {
        match self.op {
            ConstraintOp::Equal => val_x == val_y,
            ConstraintOp::NotEqual => val_x != val_y,
            ConstraintOp::LessThan => val_x < val_y,
            ConstraintOp::GreaterThan => val_x > val_y,
            ConstraintOp::AddEqual(c) => val_x == val_y + c,
        }
    }
}

/// CSP problem
#[derive(Debug, Clone)]
pub struct Csp {
    /// Domains
    pub domains: HashMap<Var, Domain>,
    /// Constraints
    pub constraints: Vec<Constraint>,
}

impl Csp {
    /// Create new CSP
    pub fn new() -> Self {
        Self {
            domains: HashMap::new(),
            constraints: Vec::new(),
        }
    }

    /// Add variable
    pub fn add_var(&mut self, var: Var, domain: Domain) {
        self.domains.insert(var, domain);
    }

    /// Add constraint
    pub fn add_constraint(&mut self, c: Constraint) {
        self.constraints.push(c);
    }

    /// Run AC3
    pub fn ac3(&mut self) -> bool {
        let mut queue: VecDeque<(Var, Var)> = VecDeque::new();
        for c in &self.constraints {
            queue.push_back((c.x.clone(), c.y.clone()));
            queue.push_back((c.y.clone(), c.x.clone()));
        }
        
        while let Some((x, y)) = queue.pop_front() {
            if self.revise(&x, &y) {
                if self.domains.get(&x).unwrap().is_empty() {
                    return false;
                }
                for c in &self.constraints {
                    if c.x == x && c.y != y {
                        queue.push_back((c.y.clone(), x.clone()));
                    } else if c.y == x && c.x != y {
                        queue.push_back((c.x.clone(), x.clone()));
                    }
                }
            }
        }
        true
    }

    fn revise(&mut self, x: &Var, y: &Var) -> bool {
        let mut revised = false;
        let mut relevant_constraints = Vec::new();
        for c in &self.constraints {
            if (c.x == *x && c.y == *y) || (c.y == *x && c.x == *y) {
                relevant_constraints.push(c.clone());
            }
        }
        
        if relevant_constraints.is_empty() {
            return false;
        }

        let mut to_remove = Vec::new();
        let domain_x = self.domains.get(x).unwrap().clone();
        let domain_y = self.domains.get(y).unwrap().clone();

        for &val_x in &domain_x.0 {
            let mut satisfied = false;
            for &val_y in &domain_y.0 {
                let mut all_hold = true;
                for c in &relevant_constraints {
                    if c.x == *x {
                        if !c.satisfies(val_x, val_y) {
                            all_hold = false;
                            break;
                        }
                    } else {
                        if !c.satisfies(val_y, val_x) {
                            all_hold = false;
                            break;
                        }
                    }
                }
                if all_hold {
                    satisfied = true;
                    break;
                }
            }
            if !satisfied {
                to_remove.push(val_x);
            }
        }

        let dom_x_mut = self.domains.get_mut(x).unwrap();
        for val in to_remove {
            dom_x_mut.remove(val);
            revised = true;
        }
        
        revised
    }

    /// Run backtracking search
    pub fn backtrack(&mut self, assignment: &mut HashMap<Var, i32>) -> Option<HashMap<Var, i32>> {
        if assignment.len() == self.domains.len() {
            return Some(assignment.clone());
        }

        let mut unassigned = self.domains.keys()
            .filter(|v| !assignment.contains_key(v))
            .collect::<Vec<_>>();
        
        unassigned.sort_by(|a, b| {
            let len_a = self.domains.get(*a).unwrap().0.len();
            let len_b = self.domains.get(*b).unwrap().0.len();
            len_a.cmp(&len_b).then(a.0.cmp(&b.0))
        });
        
        let var = unassigned[0].clone();
        let domain = self.domains.get(&var).unwrap().clone();

        for val in domain.0 {
            if self.is_consistent(&var, val, assignment) {
                assignment.insert(var.clone(), val);
                
                let mut csp_clone = self.clone();
                csp_clone.domains.insert(var.clone(), Domain::new(vec![val]));
                
                if csp_clone.ac3() {
                    if let Some(res) = csp_clone.backtrack(assignment) {
                        return Some(res);
                    }
                }
                
                assignment.remove(&var);
            }
        }
        
        None
    }

    fn is_consistent(&self, var: &Var, val: i32, assignment: &HashMap<Var, i32>) -> bool {
        for c in &self.constraints {
            if c.x == *var && assignment.contains_key(&c.y) {
                if !c.satisfies(val, *assignment.get(&c.y).unwrap()) {
                    return false;
                }
            } else if c.y == *var && assignment.contains_key(&c.x) {
                if !c.satisfies(*assignment.get(&c.x).unwrap(), val) {
                    return false;
                }
            }
        }
        true
    }
}

impl Default for Csp {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ac3_propagation() {
        let mut csp = Csp::new();
        csp.add_var(Var("X".into()), Domain::new(vec![1, 2, 3]));
        csp.add_var(Var("Y".into()), Domain::new(vec![1, 2, 3]));
        csp.add_var(Var("Z".into()), Domain::new(vec![1, 2, 3]));

        // X < Y < Z
        csp.add_constraint(Constraint::new(Var("X".into()), Var("Y".into()), ConstraintOp::LessThan));
        csp.add_constraint(Constraint::new(Var("Y".into()), Var("Z".into()), ConstraintOp::LessThan));

        assert!(csp.ac3());

        // Domains should be reduced: X={1}, Y={2}, Z={3}
        assert_eq!(csp.domains.get(&Var("X".into())).unwrap().0, vec![1]);
        assert_eq!(csp.domains.get(&Var("Y".into())).unwrap().0, vec![2]);
        assert_eq!(csp.domains.get(&Var("Z".into())).unwrap().0, vec![3]);
    }

    #[test]
    fn test_backtrack_search() {
        let mut csp = Csp::new();
        csp.add_var(Var("A".into()), Domain::new(vec![1, 2, 3]));
        csp.add_var(Var("B".into()), Domain::new(vec![1, 2, 3]));
        csp.add_var(Var("C".into()), Domain::new(vec![1, 2, 3]));

        // All different
        csp.add_constraint(Constraint::new(Var("A".into()), Var("B".into()), ConstraintOp::NotEqual));
        csp.add_constraint(Constraint::new(Var("A".into()), Var("C".into()), ConstraintOp::NotEqual));
        csp.add_constraint(Constraint::new(Var("B".into()), Var("C".into()), ConstraintOp::NotEqual));

        let mut assignment = HashMap::new();
        let res = csp.backtrack(&mut assignment).unwrap();

        // Lex-first and sorted domains: A=1, B=2, C=3
        assert_eq!(res.get(&Var("A".into())), Some(&1));
        assert_eq!(res.get(&Var("B".into())), Some(&2));
        assert_eq!(res.get(&Var("C".into())), Some(&3));
    }
}
