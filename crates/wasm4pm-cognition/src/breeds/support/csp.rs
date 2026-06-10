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
    pub op: String,
}

#[derive(Debug, Clone)]
pub enum TraceEvent {
    Init { vars: usize, constraints: usize },
    Revise { x: String, y: String, pruned: usize },
    Assign { var: String, val: String },
    Backtrack { var: String },
    Verdict { satisfiable: bool },
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
        // Try parsing as integers for arithmetic ops
        if let (Ok(i1), Ok(i2)) = (val1.parse::<i64>(), val2.parse::<i64>()) {
            match op {
                "<" => return i1 < i2,
                "<=" => return i1 <= i2,
                ">" => return i1 > i2,
                ">=" => return i1 >= i2,
                "==" => return i1 == i2,
                "!=" => return i1 != i2,
                _ => {
                    // Check for x = y + c (e.g., =+5 or =-3)
                    if op.starts_with("=+") {
                        if let Ok(c) = op[2..].parse::<i64>() {
                            return i1 == i2 + c;
                        }
                    } else if op.starts_with("=-") {
                        if let Ok(c) = op[2..].parse::<i64>() {
                            return i1 == i2 - c;
                        }
                    }
                }
            }
        }
        // Fallback to string matching
        match op {
            "!=" => val1 != val2,
            "==" => val1 == val2,
            _ => false,
        }
    }

    fn revise(&mut self, domains: &mut HashMap<String, Vec<String>>, x: &str, y: &str) -> bool {
        let mut revised = false;
        let mut pruned_count = 0;
        
        let op_forward = self.constraints.iter()
            .find(|c| c.var1 == x && c.var2 == y)
            .map(|c| c.op.clone());
            
        let op_backward = self.constraints.iter()
            .find(|c| c.var1 == y && c.var2 == x)
            .map(|c| {
                // Invert the operator if evaluating backwards
                match c.op.as_str() {
                    "<" => ">".to_string(),
                    "<=" => ">=".to_string(),
                    ">" => "<".to_string(),
                    ">=" => "<=".to_string(),
                    "==" => "==".to_string(),
                    "!=" => "!=".to_string(),
                    _ => {
                        if c.op.starts_with("=+") {
                            format!("=-{}", &c.op[2..])
                        } else if c.op.starts_with("=-") {
                            format!("=+{}", &c.op[2..])
                        } else {
                            "!=".to_string()
                        }
                    }
                }
            });

        let op = op_forward.or(op_backward).unwrap_or_else(|| "!=".to_string());

        let dx = domains.get(x).unwrap().clone();
        let dy = domains.get(y).unwrap().clone();
        
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
                } else {
                    best_var = Some(v);
                }
            }
        }
        best_var.unwrap().clone()
    }

    pub fn backtrack(&mut self, assignments: &mut HashMap<String, String>, unassigned: &mut HashSet<String>, domains: &HashMap<String, Vec<String>>) -> bool {
        if unassigned.is_empty() {
            return true;
        }

        let var = self.select_unassigned_var(unassigned, domains);
        unassigned.remove(&var);

        let mut values = domains.get(&var).unwrap().clone();
        // Since CLP values can be strings representing numbers, sort them numerically if possible
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
                
                if self.ac3(&mut new_domains) {
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
