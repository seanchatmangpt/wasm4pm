use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderingLaw {
    pub law_version: String,
    pub law_id: String,
    pub case_key: Vec<String>,
    pub activities: Vec<String>,
    pub precedence: Vec<Precedence>,
    pub accepting: Vec<String>,
    pub initial: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Precedence {
    pub before: String,
    pub after: String,
}

#[derive(Debug, Clone)]
pub struct CompiledLaw {
    pub states: usize,
    pub q_dead: usize,
    pub q_init: usize,
    pub transitions: HashMap<(usize, String), usize>,
    pub accepting_states: HashSet<usize>,
    pub initial_states: HashSet<usize>,
    pub completable: Vec<bool>,
    pub accepting_activities: Vec<String>,
}

impl OrderingLaw {
    pub fn compile(&self) -> CompiledLaw {
        let mut state_map: HashMap<Vec<String>, usize> = HashMap::new();
        let mut state_list: Vec<Vec<String>> = Vec::new();
        
        let q_dead = 0;
        state_map.insert(vec!["DEAD".to_string()], q_dead);
        state_list.push(vec!["DEAD".to_string()]);
        
        let q_init = 1;
        state_map.insert(vec![], q_init);
        state_list.push(vec![]);
        
        let mut transitions: HashMap<(usize, String), usize> = HashMap::new();
        let mut queue = VecDeque::new();
        queue.push_back(q_init);
        
        while let Some(q) = queue.pop_front() {
            if q == q_dead {
                continue;
            }
            
            let current_seen = state_list[q].clone();
            
            for act in &self.activities {
                let mut next_seen = current_seen.clone();
                if !next_seen.contains(act) {
                    next_seen.push(act.clone());
                    next_seen.sort();
                }
                
                let mut valid = true;
                for p in &self.precedence {
                    if p.after == *act {
                        if !current_seen.contains(&p.before) {
                            valid = false;
                            break;
                        }
                    }
                }
                
                // Extra rule from spec: "a case opens only on these activities"
                if q == q_init && !self.initial.contains(act) {
                    valid = false;
                }
                
                let next_q = if valid {
                    if let Some(&id) = state_map.get(&next_seen) {
                        id
                    } else {
                        let id = state_list.len();
                        state_map.insert(next_seen.clone(), id);
                        state_list.push(next_seen);
                        queue.push_back(id);
                        id
                    }
                } else {
                    q_dead
                };
                
                transitions.insert((q, act.clone()), next_q);
            }
        }
        
        let mut accepting_states = HashSet::new();
        let mut initial_states = HashSet::new();
        initial_states.insert(q_init);
        
        let mut completable = vec![false; state_list.len()];
        let mut reverse_edges: HashMap<usize, Vec<usize>> = HashMap::new();
        
        for (&(from, ref act), &to) in &transitions {
            reverse_edges.entry(to).or_default().push(from);
            if self.accepting.contains(act) {
                accepting_states.insert(to);
            }
        }
        
        let mut back_queue = VecDeque::new();
        for &acc in &accepting_states {
            if acc != q_dead {
                completable[acc] = true;
                back_queue.push_back(acc);
            }
        }
        
        while let Some(q) = back_queue.pop_front() {
            if let Some(parents) = reverse_edges.get(&q) {
                for &p in parents {
                    if p != q_dead && !completable[p] {
                        completable[p] = true;
                        back_queue.push_back(p);
                    }
                }
            }
        }
        // q_init is completable if there's any path. We allow empty trace?
        // Actually, completable[q_init] should be discovered.

        CompiledLaw {
            states: state_list.len(),
            q_dead,
            q_init,
            transitions,
            accepting_states,
            initial_states,
            completable,
            accepting_activities: self.accepting.clone(),
        }
    }
}
