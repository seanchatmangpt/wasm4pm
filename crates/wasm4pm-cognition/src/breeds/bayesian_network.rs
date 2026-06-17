use std::collections::{HashMap, HashSet, VecDeque};
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, Candidate, CognitionBreed, TraceStep, Fact,
};

/// Bayesian Network breed (Pearl 1988).
/// Exact boolean variable elimination and Bayes-ball d-separation.
pub struct BayesianNetwork;

impl BoundedBreed for BayesianNetwork {
    fn breed_name(&self) -> &'static str {
        "bayesian_network"
    }

    fn domain_bound(&self) -> DomainBound {
        DomainBound::default()
    }

    fn custom_check(&self, input: &BreedInput) -> Option<CognitionError> {
        let node_count = input
            .facts
            .iter()
            .filter(|f| f.key.starts_with("cpt:"))
            .count();
        if node_count > 16 {
            return Some(CognitionError::ComplexityCap {
                breed: self.breed_name(),
                detail: format!("max 16 nodes supported (got {})", node_count),
            });
        }
        None
    }
}

#[derive(Debug, Clone)]
struct Factor {
    vars: Vec<usize>,
    table: Vec<f64>,
}

impl CognitionBreed for BayesianNetwork {
    fn id(&self) -> BreedId {
        BreedId::BayesianNetwork
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "probabilistic_inference".to_string(),
            "variable_elimination".to_string(),
            "d_separation".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let mut node_count = 0;
        let mut has_query = false;
        for fact in &input.facts {
            if fact.key.starts_with("cpt:") {
                node_count += 1;
            }
        }
        for goal in &input.goals {
            if goal.predicate == "query" {
                has_query = true;
            }
        }
        if !has_query {
            return Err("missing query goal".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();
        let mut step_count = 0;
        
        let mut cpts = Vec::new();
        let mut evidence = std::collections::BTreeMap::new();
        let mut query = None;
        
        for goal in &input.goals {
            if goal.predicate == "query" {
                query = Some(goal.value.clone());
            }
        }
        
        let mut all_nodes = HashSet::new();
        for fact in &input.facts {
            if fact.key.starts_with("cpt:") {
                let parts: Vec<&str> = fact.key["cpt:".len()..].split('|').collect();
                all_nodes.insert(parts[0].to_string());
                if parts.len() > 1 && !parts[1].is_empty() {
                    for p in parts[1].split(',') {
                        all_nodes.insert(p.to_string());
                    }
                }
                cpts.push((fact.key.clone(), fact.value.clone()));
            } else {
                let (node_name, val_bool) = if let Some(node) = fact.key.strip_prefix("evidence:") {
                    (node.to_string(), fact.value == "true")
                } else if fact.key != "formula" && fact.key != "ltl:formula" && fact.key != "relation" && (fact.value == "true" || fact.value == "false") {
                    (fact.key.clone(), fact.value == "true")
                } else {
                    continue;
                };
                all_nodes.insert(node_name.clone());
                evidence.insert(node_name, val_bool);
            }
        }

        // Group rules by child variable to build CPTs
        let mut child_rules: HashMap<String, Vec<&crate::breeds::Rule>> = HashMap::new();
        for rule in &input.rules {
            let concl = rule.conclusion.trim();
            if let Some(eq_idx) = concl.find('=') {
                let child_name = concl[..eq_idx].trim().to_string();
                child_rules.entry(child_name).or_default().push(rule);
            }
        }

        for (child_name, rules) in child_rules {
            all_nodes.insert(child_name.clone());
            let mut parents = HashSet::new();
            for rule in &rules {
                for premise in &rule.premise {
                    if let Some(eq_idx) = premise.find('=') {
                        let parent_name = premise[..eq_idx].trim().to_string();
                        parents.insert(parent_name);
                    }
                }
            }
            let mut parents_sorted: Vec<String> = parents.into_iter().collect();
            parents_sorted.sort();
            for p in &parents_sorted {
                all_nodes.insert(p.clone());
            }

            let mut probs = vec![0.0; 1 << parents_sorted.len()];
            for p_idx in 0..(1 << parents_sorted.len()) {
                let mut parent_vals = HashMap::new();
                for (j, p_name) in parents_sorted.iter().enumerate() {
                    let val = ((p_idx >> (parents_sorted.len() - 1 - j)) & 1) == 1;
                    parent_vals.insert(p_name.clone(), val);
                }

                let mut matched_prob = 0.0;
                for rule in &rules {
                    let mut matches = true;
                    for premise in &rule.premise {
                        if let Some(eq_idx) = premise.find('=') {
                            let p_name = premise[..eq_idx].trim();
                            let p_val_str = premise[eq_idx+1..].trim();
                            let expected_val = p_val_str == "true";
                            if parent_vals.get(p_name) != Some(&expected_val) {
                                matches = false;
                                break;
                            }
                        } else {
                            matches = false;
                            break;
                        }
                    }
                    if matches {
                        let concl = rule.conclusion.trim();
                        if let Some(eq_idx) = concl.find('=') {
                            let val_str = concl[eq_idx+1..].trim();
                            if val_str == "true" {
                                matched_prob = rule.certainty as f64;
                            } else {
                                matched_prob = 1.0 - rule.certainty as f64;
                            }
                        }
                        break;
                    }
                }
                probs[p_idx] = matched_prob;
            }

            let cpt_key = if parents_sorted.is_empty() {
                format!("cpt:{}", child_name)
            } else {
                format!("cpt:{}|{}", child_name, parents_sorted.join(","))
            };
            let cpt_val = probs.iter().map(|p| p.to_string()).collect::<Vec<String>>().join(",");
            
            if !cpts.iter().any(|(k, _)| k == &cpt_key) {
                cpts.push((cpt_key, cpt_val));
            }
        }
        
        let mut nodes: Vec<String> = all_nodes.into_iter().collect();
        nodes.sort();
        
        let node_id = |name: &str| -> usize {
            nodes.iter().position(|x| x == name).unwrap()
        };
        
        let mut adj = vec![vec![]; nodes.len()];
        let mut parents_map = vec![vec![]; nodes.len()];
        
        for (key, _) in &cpts {
            let parts: Vec<&str> = key["cpt:".len()..].split('|').collect();
            let c = node_id(parts[0]);
            if parts.len() > 1 && !parts[1].is_empty() {
                let ps: Vec<&str> = parts[1].split(',').collect();
                if ps.len() > 4 {
                    return Err(BreedError { breed: self.id(), message: "max 4 parents supported".to_string() });
                }
                for p_name in ps {
                    let p = node_id(p_name);
                    adj[p].push(c);
                    parents_map[c].push(p);
                }
            }
        }
        
        for (key, _) in &cpts {
            trace.push(TraceStep {
                step: step_count,
                kind: "bn-load-cpt".to_string(),
                detail: key["cpt:".len()..].to_string(),
                depth: 0,
                objects: vec![],
            });
            step_count += 1;
        }
        
        for (node, val) in &evidence {
            trace.push(TraceStep {
                step: step_count,
                kind: "bn-observe".to_string(),
                detail: format!("{}={}", node, val),
                depth: 0,
                objects: vec![],
            });
            step_count += 1;
        }
        
        let q_raw = query.ok_or_else(|| BreedError { breed: self.id(), message: "missing query goal".to_string() })?;
        let q_str = if q_raw.starts_with("prob:") || q_raw.starts_with("dsep:") {
            q_raw
        } else {
            format!("prob:{}", q_raw)
        };
        let explanation;
        
        if q_str.starts_with("prob:") {
            let q_node_name = &q_str["prob:".len()..];
            if !nodes.contains(&q_node_name.to_string()) {
                return Err(BreedError { breed: self.id(), message: "query node not found".to_string() });
            }
            let q_node = node_id(q_node_name);
            
            // Build factors
            let mut factors = Vec::new();
            for (key, val) in &cpts {
                let parts: Vec<&str> = key["cpt:".len()..].split('|').collect();
                let x_id = node_id(parts[0]);
                let mut p_ids = Vec::new();
                if parts.len() > 1 && !parts[1].is_empty() {
                    for p in parts[1].split(',') {
                        p_ids.push(node_id(p));
                    }
                }
                
                let mut f_vars = vec![x_id];
                f_vars.extend(&p_ids);
                let mut table = vec![0.0; 1 << f_vars.len()];
                
                let probs: Vec<f64> = val.split(',').map(|s| s.parse().unwrap()).collect();
                if probs.len() != (1 << p_ids.len()) {
                    return Err(BreedError { breed: self.id(), message: "invalid cpt length".to_string() });
                }
                
                for p_idx in 0..(1 << p_ids.len()) {
                    let p_val = probs[p_idx];
                    let mut idx_f = 0;
                    for (j, &_pid) in p_ids.iter().enumerate() {
                        let bit = (p_idx >> (p_ids.len() - 1 - j)) & 1;
                        if bit == 1 {
                            idx_f |= 1 << (j + 1);
                        }
                    }
                    table[idx_f] = 1.0 - p_val;
                    table[idx_f | 1] = p_val;
                }
                
                factors.push(Factor { vars: f_vars, table });
            }
            
            // Reduce with evidence
            for (ev_name, &ev_val) in &evidence {
                let ev_id = node_id(ev_name);
                let bit_val = if ev_val { 1 } else { 0 };
                for f in &mut factors {
                    if let Some(pos) = f.vars.iter().position(|&x| x == ev_id) {
                        for idx in 0..(1 << f.vars.len()) {
                            if ((idx >> pos) & 1) != bit_val {
                                f.table[idx] = 0.0;
                            }
                        }
                    }
                }
            }
            
            // Variable elimination order
            // Reverse topo, then lex
            let mut in_degree = vec![0; nodes.len()];
            for u in 0..nodes.len() {
                for &v in &adj[u] {
                    in_degree[v] += 1;
                }
            }
            
            let mut topo = Vec::new();
            let mut zero_in = Vec::new();
            for u in 0..nodes.len() {
                if in_degree[u] == 0 {
                    zero_in.push(u);
                }
            }
            
            while !zero_in.is_empty() {
                zero_in.sort_by(|a, b| nodes[*a].cmp(&nodes[*b]));
                let u = zero_in.remove(0);
                topo.push(u);
                for &v in &adj[u] {
                    in_degree[v] -= 1;
                    if in_degree[v] == 0 {
                        zero_in.push(v);
                    }
                }
            }
            
            topo.reverse(); // Reverse topo
            
            // Eliminate
            for &u in &topo {
                if u == q_node || evidence.contains_key(&nodes[u]) {
                    continue;
                }
                
                trace.push(TraceStep {
                    step: step_count,
                    kind: "bn-eliminate".to_string(),
                    detail: nodes[u].clone(),
                    depth: 0,
                    objects: vec![],
                });
                step_count += 1;
                
                let mut relevant = Vec::new();
                let mut remaining = Vec::new();
                for f in factors {
                    if f.vars.contains(&u) {
                        relevant.push(f);
                    } else {
                        remaining.push(f);
                    }
                }
                
                if !relevant.is_empty() {
                    let mut prod = relevant[0].clone();
                    for i in 1..relevant.len() {
                        prod = multiply_factors(&prod, &relevant[i]);
                    }
                    let sum = sum_out_factor(&prod, u);
                    remaining.push(sum);
                }
                factors = remaining;
            }
            
            // Final multiplication
            let mut final_f = factors[0].clone();
            for i in 1..factors.len() {
                final_f = multiply_factors(&final_f, &factors[i]);
            }
            
            let pos_q = final_f.vars.iter().position(|&x| x == q_node).unwrap();
            let mut prob_t = 0.0;
            let mut prob_f = 0.0;
            for idx in 0..(1 << final_f.vars.len()) {
                if ((idx >> pos_q) & 1) == 1 {
                    prob_t += final_f.table[idx];
                } else {
                    prob_f += final_f.table[idx];
                }
            }
            let prob = if prob_t + prob_f == 0.0 {
                0.0
            } else {
                prob_t / (prob_t + prob_f)
            };
            
            let verdict = format!("prob:{}={:.9}", q_node_name, prob);
            trace.push(TraceStep {
                step: step_count,
                kind: "bn-verdict".to_string(),
                detail: verdict.clone(),
                depth: 0,
                objects: vec![],
            });
            explanation = verdict;
            
            // Add probability fact
            let mut out_facts = input.facts.clone();
            out_facts.push(Fact {
                key: format!("probability:{}", q_node_name),
                value: format!("{:.9}", prob),
            });

            return Ok(BreedOutput {
                breed: self.id(),
                candidates: input.candidates.clone(),
                facts: out_facts,
                selected: None,
                explanation,
                inference_trace: trace,
                ocel_log: None,
                retained_cases: vec![],
            });
        } else if q_str.starts_with("dsep:") {
            let inner = &q_str["dsep:".len()..];
            let parts: Vec<&str> = inner.split('|').collect();
            let ends: Vec<&str> = parts[0].split(',').collect();
            let mut start_nodes = vec![node_id(ends[0])];
            let mut end_nodes = vec![node_id(ends[1])];
            
            let mut obs = HashSet::new();
            if parts.len() > 1 && !parts[1].is_empty() {
                for o in parts[1].split(',') {
                    obs.insert(node_id(o));
                }
            }
            
            #[derive(Clone, Copy, PartialEq, Eq, Hash)]
            enum Dir { Up, Down }
            
            let mut ancestors_of_obs = HashSet::new();
            let mut q = VecDeque::new();
            for &o in &obs {
                q.push_back(o);
                ancestors_of_obs.insert(o);
            }
            while let Some(n) = q.pop_front() {
                for &p in &parents_map[n] {
                    if ancestors_of_obs.insert(p) {
                        q.push_back(p);
                    }
                }
            }
            
            let mut reachable = false;
            let mut visited = HashSet::new();
            let mut rq = VecDeque::new();
            
            for &s in &start_nodes {
                rq.push_back((s, Dir::Up));
                visited.insert((s, Dir::Up));
            }
            
            while let Some((n, dir)) = rq.pop_front() {
                if end_nodes.contains(&n) {
                    reachable = true;
                    break;
                }
                let is_obs = obs.contains(&n);
                
                if dir == Dir::Up {
                    if !is_obs {
                        for &p in &parents_map[n] {
                            if visited.insert((p, Dir::Up)) { rq.push_back((p, Dir::Up)); }
                        }
                        for &c in &adj[n] {
                            if visited.insert((c, Dir::Down)) { rq.push_back((c, Dir::Down)); }
                        }
                    }
                } else if dir == Dir::Down {
                    if !is_obs {
                        for &c in &adj[n] {
                            if visited.insert((c, Dir::Down)) { rq.push_back((c, Dir::Down)); }
                        }
                        if ancestors_of_obs.contains(&n) {
                            for &p in &parents_map[n] {
                                if visited.insert((p, Dir::Up)) { rq.push_back((p, Dir::Up)); }
                            }
                        }
                    } else {
                        for &p in &parents_map[n] {
                            if visited.insert((p, Dir::Up)) { rq.push_back((p, Dir::Up)); }
                        }
                    }
                }
            }
            
            let dsep = !reachable;
            let verdict = format!("{}={}", q_str, dsep);
            trace.push(TraceStep {
                step: step_count,
                kind: "bn-verdict".to_string(),
                detail: verdict.clone(),
                depth: 0,
                objects: vec![],
            });
            explanation = verdict;
        } else {
            return Err(BreedError { breed: self.id(), message: "unknown query type".to_string() });
        }

        Ok(BreedOutput {
            breed: self.id(),
            candidates: input.candidates.clone(),
            facts: input.facts.clone(),
            selected: None,
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("Fraud: empty inference trace".to_string());
        }
        if !output.inference_trace.iter().any(|t| t.kind == "bn-verdict") {
            return Err("Missing bn-verdict in trace".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{Fact, Goal};

    fn burglary_alarm_input() -> BreedInput {
        // Pearl 1988 Ch.2 burglary/earthquake/alarm network (Russell & Norvig Fig 14.2).
        // CPT index: FIRST listed parent = high bit; index 0 = all parents false.
        // cpt:A|B,E values: P(A=t|B=f,E=f)=0.001, P(A=t|B=f,E=t)=0.29,
        //                   P(A=t|B=t,E=f)=0.94, P(A=t|B=t,E=t)=0.95
        BreedInput {
            intent: "diagnose burglary from phone calls".into(),
            candidates: vec![],
            facts: vec![
                Fact {
                    key: "cpt:B".into(),
                    value: "0.001".into(),
                },
                Fact {
                    key: "cpt:E".into(),
                    value: "0.002".into(),
                },
                Fact {
                    key: "cpt:A|B,E".into(),
                    value: "0.001,0.29,0.94,0.95".into(),
                },
                Fact {
                    key: "cpt:J|A".into(),
                    value: "0.05,0.90".into(),
                },
                Fact {
                    key: "cpt:M|A".into(),
                    value: "0.01,0.70".into(),
                },
                Fact {
                    key: "evidence:J".into(),
                    value: "true".into(),
                },
                Fact {
                    key: "evidence:M".into(),
                    value: "true".into(),
                },
            ],
            cases: vec![],
            rules: vec![],
            goals: vec![Goal {
                id: "g1".into(),
                predicate: "query".into(),
                value: "prob:B".into(),
            }],
            state: vec![],
        }
    }

    /// Pearl 1988: exact posterior P(Burglary | JohnCalls=t, MaryCalls=t) = 0.284171835.
    /// Tolerance 1e-6 (fixture-specified).
    #[test]
    fn paper_posterior_burglary_given_calls() {
        let out = BayesianNetwork
            .run(&burglary_alarm_input())
            .expect("run ok");
        let verdict = out.selected.as_deref().unwrap_or("");
        // selected = "prob:B=<value>"
        let prob_str = verdict
            .strip_prefix("prob:B=")
            .expect("selected must start with 'prob:B='");
        let prob: f64 = prob_str.parse().expect("posterior must be a float");
        assert!(
            (prob - 0.284171835_f64).abs() < 1e-6,
            "P(B|J=t,M=t) must equal 0.284171835 ±1e-6 (Pearl 1988); got {}",
            prob
        );
    }

    /// Monotonicity: more evidence for burglary raises the posterior above baseline.
    /// P(B) = 0.001; P(B|J=t,M=t) ≈ 0.284 — a 284x increase.
    #[test]
    fn evidence_raises_posterior_above_prior() {
        let out = BayesianNetwork
            .run(&burglary_alarm_input())
            .expect("run ok");
        let verdict = out.selected.as_deref().unwrap_or("");
        let prob_str = verdict
            .strip_prefix("prob:B=")
            .expect("selected must start with 'prob:B='");
        let prob: f64 = prob_str.parse().expect("posterior must be a float");
        assert!(
            prob > 0.001,
            "posterior P(B|J,M)={} must exceed prior P(B)=0.001",
            prob
        );
    }
}

fn multiply_factors(f1: &Factor, f2: &Factor) -> Factor {
    let mut vars = f1.vars.clone();
    for &v in &f2.vars {
        if !vars.contains(&v) {
            vars.push(v);
        }
    }
    vars.sort_unstable();
    
    let mut table = vec![0.0; 1 << vars.len()];
    for idx in 0..(1 << vars.len()) {
        let mut idx1 = 0;
        for (i, &v) in f1.vars.iter().enumerate() {
            let pos = vars.iter().position(|&x| x == v).unwrap();
            if (idx & (1 << pos)) != 0 {
                idx1 |= 1 << i;
            }
        }
        
        let mut idx2 = 0;
        for (i, &v) in f2.vars.iter().enumerate() {
            let pos = vars.iter().position(|&x| x == v).unwrap();
            if (idx & (1 << pos)) != 0 {
                idx2 |= 1 << i;
            }
        }
        table[idx] = f1.table[idx1] * f2.table[idx2];
    }
    Factor { vars, table }
}

fn sum_out_factor(f: &Factor, var_to_elim: usize) -> Factor {
    let mut vars = f.vars.clone();
    vars.retain(|&v| v != var_to_elim);
    
    let mut table = vec![0.0; 1 << vars.len()];
    let pos_elim = f.vars.iter().position(|&x| x == var_to_elim).unwrap();
    
    for idx in 0..(1 << f.vars.len()) {
        let mut new_idx = 0;
        for (i, &v) in f.vars.iter().enumerate() {
            if i == pos_elim { continue; }
            let pos_new = vars.iter().position(|&x| x == v).unwrap();
            if (idx & (1 << i)) != 0 {
                new_idx |= 1 << pos_new;
            }
        }
        table[new_idx] += f.table[idx];
    }
    Factor { vars, table }
}
