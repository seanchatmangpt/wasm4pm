#![allow(missing_docs)]
use std::collections::{HashMap, VecDeque};
use std::collections::HashSet;

#[derive(Debug, Clone)]
pub struct CspVar {
    pub name: String,
    pub domain: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct CspConstraint {
    pub var1: String,
    pub var2: String,
    // Only != is required for graph coloring, but we can represent it abstractly.
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

pub struct CspStore {
    pub vars: HashMap<String, CspVar>,
    pub constraints: Vec<CspConstraint>,
    pub domains: HashMap<String, Vec<String>>,
    pub trace: Vec<TraceEvent>,
}

impl CspStore {
    pub fn new() -> Self {
        CspStore {
            vars: HashMap::new(),
            constraints: Vec::new(),
            domains: HashMap::new(),
            trace: Vec::new(),
        }
    }

    pub fn add_var(&mut self, name: &str, domain: Vec<String>) {
        self.vars.insert(name.to_string(), CspVar { name: name.to_string(), domain: domain.clone() });
        self.domains.insert(name.to_string(), domain.clone());
        self.trace.push(TraceEvent::Propagate { var: name.to_string(), domain });
    }

    pub fn add_constraint(&mut self, var1: &str, var2: &str, op: &str) {
        self.constraints.push(CspConstraint { var1: var1.to_string(), var2: var2.to_string(), op: op.to_string() });
        self.propagate();
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

    fn evaluate(&self, val1: &str, val2: &str, op: &str) -> bool {
        match op {
            "!=" => val1 != val2,
            "==" => val1 == val2,
            "<" => val1.parse::<i32>().unwrap_or(0) < val2.parse::<i32>().unwrap_or(0),
            "<=" => val1.parse::<i32>().unwrap_or(0) <= val2.parse::<i32>().unwrap_or(0),
            ">" => val1.parse::<i32>().unwrap_or(0) > val2.parse::<i32>().unwrap_or(0),
            ">=" => val1.parse::<i32>().unwrap_or(0) >= val2.parse::<i32>().unwrap_or(0),
            _ => false,
        }
    }

    fn revise(&mut self, x: &str, y: &str) -> bool {
        let mut revised = false;
        let mut pruned_count = 0;
        
        let op = self.constraints.iter()
            .find(|c| (c.var1 == x && c.var2 == y) || (c.var1 == y && c.var2 == x))
            .map(|c| {
                if c.var1 == x {
                    c.op.clone()
                } else {
                    match c.op.as_str() {
                        "<" => ">".to_string(),
                        "<=" => ">=".to_string(),
                        ">" => "<".to_string(),
                        ">=" => "<=".to_string(),
                        _ => c.op.clone(),
                    }
                }
            })
            .unwrap_or_else(|| "!=".to_string());

        let dx = self.domains.get(x).unwrap().clone();
        let dy = self.domains.get(y).unwrap().clone();
        
        let mut new_dx = Vec::new();
        for vx in &dx {
            let mut satisfied = false;
            for vy in &dy {
                if self.evaluate(vx, vy, &op) {
                    satisfied = true;
                    break;
                }
            }
            if satisfied {
                new_dx.push(vx.clone());
            } else {
                pruned_count += 1;
                revised = true;
            }
        }

        if revised {
            self.domains.insert(x.to_string(), new_dx.clone());
            self.trace.push(TraceEvent::Revise { x: x.to_string(), y: y.to_string(), pruned: pruned_count });
            self.trace.push(TraceEvent::Propagate { var: x.to_string(), domain: new_dx });
        }

        revised
    }

    pub fn propagate(&mut self) -> bool {
        let mut queue: VecDeque<(String, String)> = VecDeque::new();
        for c in &self.constraints {
            queue.push_back((c.var1.clone(), c.var2.clone()));
            queue.push_back((c.var2.clone(), c.var1.clone()));
        }

        while let Some((x, y)) = queue.pop_front() {
            if self.revise(&x, &y) {
                if self.domains.get(&x).unwrap().is_empty() {
                    return false;
                }
                for z in self.neighbors(&x) {
                    if z != y {
                        queue.push_back((z, x.clone()));
                    }
                }
            }
        }
        true
    }

    pub fn solve(&mut self) -> Option<HashMap<String, String>> {
        if !self.propagate() {
            return None;
        }

        let mut assignments = HashMap::new();
        let mut unassigned: HashSet<String> = self.vars.keys().cloned().collect();
        
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
            return Some(assignments);
        }

        if self.backtrack(&mut assignments, &mut unassigned, &self.domains.clone()) {
            Some(assignments)
        } else {
            None
        }
    }

    fn select_unassigned_var(&self, unassigned: &HashSet<String>, domains: &HashMap<String, Vec<String>>) -> String {
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

    fn backtrack(&mut self, assignments: &mut HashMap<String, String>, unassigned: &mut HashSet<String>, domains: &HashMap<String, Vec<String>>) -> bool {
        if unassigned.is_empty() {
            return true;
        }

        let var = self.select_unassigned_var(unassigned, domains);
        unassigned.remove(&var);

        let mut values = domains.get(&var).unwrap().clone();
        values.sort();

        for val in values {
            let mut consistent = true;
            for c in &self.constraints {
                if c.var1 == var && assignments.contains_key(&c.var2) {
                    if !self.evaluate(&val, assignments.get(&c.var2).unwrap(), &c.op) {
                        consistent = false;
                        break;
                    }
                } else if c.var2 == var && assignments.contains_key(&c.var1) {
                    if !self.evaluate(assignments.get(&c.var1).unwrap(), &val, &c.op) {
                        consistent = false;
                        break;
                    }
                }
            }

            if consistent {
                assignments.insert(var.clone(), val.clone());
                self.trace.push(TraceEvent::Assign { var: var.clone(), val: val.clone() });
                
                let mut new_domains = domains.clone();
                new_domains.insert(var.clone(), vec![val.clone()]);
                
                // Temp solver for MAC
                let mut temp_solver = CspSolver::new();
                temp_solver.vars = self.vars.clone();
                temp_solver.constraints = self.constraints.clone();
                
                if temp_solver.ac3(&mut new_domains) {
                    if self.backtrack(assignments, unassigned, &new_domains) {
                        return true;
                    }
                }
                
                assignments.remove(&var);
                self.trace.push(TraceEvent::Backtrack { var: var.clone() });
            }
        }

        unassigned.insert(var.clone());
        false
    }
}

pub struct CspSolver {
    pub vars: HashMap<String, CspVar>,
    pub constraints: Vec<CspConstraint>,
    pub trace: Vec<TraceEvent>,
}

impl CspSolver {
    pub fn new() -> Self {
        CspSolver {
            vars: HashMap::new(),
            constraints: Vec::new(),
            trace: Vec::new(),
        }
    }

    pub fn add_var(&mut self, name: &str, domain: Vec<String>) {
        self.vars.insert(name.to_string(), CspVar { name: name.to_string(), domain });
    }

    pub fn add_constraint(&mut self, var1: &str, var2: &str, op: &str) {
        self.constraints.push(CspConstraint { var1: var1.to_string(), var2: var2.to_string(), op: op.to_string() });
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

    fn evaluate(&self, val1: &str, val2: &str, op: &str) -> bool {
        match op {
            "!=" => val1 != val2,
            "==" => val1 == val2,
            "<" => val1.parse::<i32>().unwrap_or(0) < val2.parse::<i32>().unwrap_or(0),
            "<=" => val1.parse::<i32>().unwrap_or(0) <= val2.parse::<i32>().unwrap_or(0),
            ">" => val1.parse::<i32>().unwrap_or(0) > val2.parse::<i32>().unwrap_or(0),
            ">=" => val1.parse::<i32>().unwrap_or(0) >= val2.parse::<i32>().unwrap_or(0),
            _ => false, // Fallback
        }
    }

    fn revise(&mut self, domains: &mut HashMap<String, Vec<String>>, x: &str, y: &str) -> bool {
        let mut revised = false;
        let mut pruned_count = 0;
        
        let op = self.constraints.iter()
            .find(|c| (c.var1 == x && c.var2 == y) || (c.var1 == y && c.var2 == x))
            .map(|c| {
                if c.var1 == x {
                    c.op.clone()
                } else {
                    match c.op.as_str() {
                        "<" => ">".to_string(),
                        "<=" => ">=".to_string(),
                        ">" => "<".to_string(),
                        ">=" => "<=".to_string(),
                        _ => c.op.clone(),
                    }
                }
            })
            .unwrap_or_else(|| "!=".to_string());

        let dx = domains.get(x).unwrap().clone();
        let dy = domains.get(y).unwrap().clone();
        
        let mut new_dx = Vec::new();
        for vx in &dx {
            let mut satisfied = false;
            for vy in &dy {
                // If it's a symmetric constraint like !=, order of var1, var2 might matter if we had > or <.
                // We assume != for coloring which is symmetric.
                if self.evaluate(vx, vy, &op) {
                    satisfied = true;
                    break;
                }
            }
            if satisfied {
                new_dx.push(vx.clone());
            } else {
                pruned_count += 1;
                revised = true;
            }
        }

        if revised {
            domains.insert(x.to_string(), new_dx);
            self.trace.push(TraceEvent::Revise { x: x.to_string(), y: y.to_string(), pruned: pruned_count });
        }

        revised
    }

    pub fn ac3(&mut self, domains: &mut HashMap<String, Vec<String>>) -> bool {
        let mut queue: VecDeque<(String, String)> = VecDeque::new();
        for c in &self.constraints {
            queue.push_back((c.var1.clone(), c.var2.clone()));
            queue.push_back((c.var2.clone(), c.var1.clone()));
        }

        while let Some((x, y)) = queue.pop_front() {
            if self.revise(domains, &x, &y) {
                if domains.get(&x).unwrap().is_empty() {
                    return false; // Domain wipeout
                }
                for z in self.neighbors(&x) {
                    if z != y {
                        queue.push_back((z, x.clone()));
                    }
                }
            }
        }
        true
    }

    // Minimum Remaining Values (MRV) with lexicographic tie-breaking
    fn select_unassigned_var(&self, unassigned: &HashSet<String>, domains: &HashMap<String, Vec<String>>) -> String {
        let mut best_var: Option<&String> = None;
        let mut min_size = usize::MAX;

        for v in unassigned {
            let size = domains.get(v).unwrap().len();
            if size < min_size {
                min_size = size;
                best_var = Some(v);
            } else if size == min_size {
                // Lexicographic tie-breaker
                if let Some(b) = best_var {
                    if v < b {
                        best_var = Some(v);
                    }
                }
            }
        }
        best_var.unwrap().clone()
    }

    fn backtrack(&mut self, assignments: &mut HashMap<String, String>, unassigned: &mut HashSet<String>, domains: &HashMap<String, Vec<String>>) -> bool {
        if unassigned.is_empty() {
            return true;
        }

        let var = self.select_unassigned_var(unassigned, domains);
        unassigned.remove(&var);

        // Lexicographic value ordering (values are presorted in domain array or we can sort them here)
        let mut values = domains.get(&var).unwrap().clone();
        values.sort();

        for val in values {
            // Check consistency with current assignments
            let mut consistent = true;
            for c in &self.constraints {
                if c.var1 == var && assignments.contains_key(&c.var2) {
                    if !self.evaluate(&val, assignments.get(&c.var2).unwrap(), &c.op) {
                        consistent = false;
                        break;
                    }
                } else if c.var2 == var && assignments.contains_key(&c.var1) {
                    if !self.evaluate(assignments.get(&c.var1).unwrap(), &val, &c.op) {
                        consistent = false;
                        break;
                    }
                }
            }

            if consistent {
                assignments.insert(var.clone(), val.clone());
                self.trace.push(TraceEvent::Assign { var: var.clone(), val: val.clone() });
                
                // MAC (Maintaining Arc Consistency) - We do a deep copy of domains and run AC-3
                let mut new_domains = domains.clone();
                new_domains.insert(var.clone(), vec![val.clone()]);
                
                if self.ac3(&mut new_domains) {
                    if self.backtrack(assignments, unassigned, &new_domains) {
                        return true;
                    }
                }
                
                // Backtrack
                assignments.remove(&var);
                self.trace.push(TraceEvent::Backtrack { var: var.clone() });
            }
        }

        unassigned.insert(var.clone());
        false
    }

    pub fn solve(&mut self) -> Option<HashMap<String, String>> {
        self.trace.push(TraceEvent::Init { vars: self.vars.len(), constraints: self.constraints.len() });

        let mut domains: HashMap<String, Vec<String>> = self.vars.iter()
            .map(|(k, v)| (k.clone(), v.domain.clone()))
            .collect();

        if !self.ac3(&mut domains) {
            self.trace.push(TraceEvent::Verdict { satisfiable: false });
            return None;
        }

        let mut assignments = HashMap::new();
        let mut unassigned: HashSet<String> = self.vars.keys().cloned().collect();

        if self.backtrack(&mut assignments, &mut unassigned, &domains) {
            self.trace.push(TraceEvent::Verdict { satisfiable: true });
            Some(assignments)
        } else {
            self.trace.push(TraceEvent::Verdict { satisfiable: false });
            None
        }
    }
}
