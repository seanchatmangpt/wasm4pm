//! Bayesian network inference — Pearl 1988.
//!
//! Exact boolean variable elimination (factor product / evidence reduction /
//! sum-out in reverse-topological + lexicographic order) and Bayes-ball
//! d-separation.
//!
//! Input contract:
//! - facts `cpt:X` = `"p"` (prior P(X=t)) or `cpt:X|P1,P2` = comma-separated
//!   P(X=t | parents) indexed by parent assignment bits (P1 is the high bit;
//!   index 0 = all parents false),
//! - facts `evidence:X` = `"true"`/`"false"`,
//! - goal with predicate `query` and value `prob:X` or `dsep:A,B|O1,O2`.
//!
//! Caps: ≤16 nodes, ≤4 parents per node.
//!
//! Determinism: nodes are lex-sorted; evidence is a BTreeMap; the elimination
//! order is reverse-topo with lex tie-breaks.
//!
//! Trace kinds: `bn-load-cpt`(1,*) → `bn-observe`(0,*) → `bn-eliminate`(0,*)
//! → `bn-verdict`(1,1).

use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, TraceStep,
};
use std::collections::{BTreeMap, BTreeSet, HashSet, VecDeque};

/// Bayesian network breed (exact VE + d-separation).
pub struct BayesianNetwork;

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
        let node_count = input.facts.iter().filter(|f| f.key.starts_with("cpt:")).count();
        if node_count == 0 {
            return Err("bayesian_network requires at least one cpt: fact".to_string());
        }
        if node_count > 16 {
            return Err(format!("max 16 nodes supported (got {})", node_count));
        }
        let has_query = input.goals.iter().any(|g| {
            g.predicate == "query" && (g.value.starts_with("prob:") || g.value.starts_with("dsep:"))
        });
        if !has_query {
            return Err("missing query goal (prob: or dsep:)".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let err = |message: String| BreedError {
            breed: BreedId::BayesianNetwork,
            message,
        };
        let mut trace = Vec::new();

        let mut cpts: Vec<(String, String)> = Vec::new();
        let mut evidence: BTreeMap<String, bool> = BTreeMap::new();
        let mut all_nodes: BTreeSet<String> = BTreeSet::new();

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
            } else if fact.key.starts_with("evidence:") {
                let node = fact.key["evidence:".len()..].to_string();
                all_nodes.insert(node.clone());
                evidence.insert(node, fact.value == "true");
            }
        }

        let nodes: Vec<String> = all_nodes.into_iter().collect(); // lex-sorted
        let node_id = |name: &str| -> Result<usize, BreedError> {
            nodes
                .iter()
                .position(|x| x == name)
                .ok_or_else(|| err(format!("unknown node '{}'", name)))
        };

        let mut adj: Vec<Vec<usize>> = vec![vec![]; nodes.len()];
        let mut parents_map: Vec<Vec<usize>> = vec![vec![]; nodes.len()];
        for (key, _) in &cpts {
            let parts: Vec<&str> = key["cpt:".len()..].split('|').collect();
            let c = node_id(parts[0])?;
            if parts.len() > 1 && !parts[1].is_empty() {
                let ps: Vec<&str> = parts[1].split(',').collect();
                if ps.len() > 4 {
                    return Err(err("max 4 parents supported".to_string()));
                }
                for p_name in ps {
                    let p = node_id(p_name)?;
                    adj[p].push(c);
                    parents_map[c].push(p);
                }
            }
        }

        for (key, _) in &cpts {
            trace.push(TraceStep {
                step: trace.len(),
                kind: "bn-load-cpt".to_string(),
                detail: key["cpt:".len()..].to_string(),
                depth: 0,
                objects: vec![("cpt".to_string(), key["cpt:".len()..].to_string())],
            });
        }
        for (node, val) in &evidence {
            trace.push(TraceStep {
                step: trace.len(),
                kind: "bn-observe".to_string(),
                detail: format!("{}={}", node, val),
                depth: 0,
                objects: vec![("evidence".to_string(), node.clone())],
            });
        }

        let q_str = input
            .goals
            .iter()
            .find(|g| g.predicate == "query")
            .map(|g| g.value.clone())
            .ok_or_else(|| err("missing query goal (prob: or dsep:)".to_string()))?;

        let explanation;
        if let Some(q_node_name) = q_str.strip_prefix("prob:") {
            let q_node = node_id(q_node_name)?;

            // Build CPT factors.
            let mut factors: Vec<Factor> = Vec::new();
            for (key, val) in &cpts {
                let parts: Vec<&str> = key["cpt:".len()..].split('|').collect();
                let x_id = node_id(parts[0])?;
                let mut p_ids = Vec::new();
                if parts.len() > 1 && !parts[1].is_empty() {
                    for p in parts[1].split(',') {
                        p_ids.push(node_id(p)?);
                    }
                }
                let mut f_vars = vec![x_id];
                f_vars.extend(&p_ids);
                let mut table = vec![0.0; 1 << f_vars.len()];
                let probs: Vec<f64> = val
                    .split(',')
                    .map(|s| s.trim().parse::<f64>())
                    .collect::<Result<_, _>>()
                    .map_err(|_| err(format!("non-numeric probability in cpt '{}'", key)))?;
                if probs.len() != (1 << p_ids.len()) {
                    return Err(err(format!(
                        "invalid cpt length for '{}': expected {} entries",
                        key,
                        1 << p_ids.len()
                    )));
                }
                for (p_idx, &p_val) in probs.iter().enumerate() {
                    if !(0.0..=1.0).contains(&p_val) {
                        return Err(err(format!("probability out of [0,1] in cpt '{}'", key)));
                    }
                    let mut idx_f = 0usize;
                    for j in 0..p_ids.len() {
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

            // Evidence reduction (BTreeMap order — deterministic).
            for (ev_name, &ev_val) in &evidence {
                let ev_id = node_id(ev_name)?;
                let bit_val = usize::from(ev_val);
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

            // Elimination order: reverse topological, lex tie-break.
            let mut in_degree = vec![0usize; nodes.len()];
            for u in 0..nodes.len() {
                for &v in &adj[u] {
                    in_degree[v] += 1;
                }
            }
            let mut topo = Vec::new();
            let mut zero_in: Vec<usize> =
                (0..nodes.len()).filter(|&u| in_degree[u] == 0).collect();
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
            if topo.len() != nodes.len() {
                return Err(err("cycle detected in network (not a DAG)".to_string()));
            }
            topo.reverse();

            for &u in &topo {
                if u == q_node || evidence.contains_key(&nodes[u]) {
                    continue;
                }
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "bn-eliminate".to_string(),
                    detail: nodes[u].clone(),
                    depth: 0,
                    objects: vec![("node".to_string(), nodes[u].clone())],
                });
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
                    for f in relevant.iter().skip(1) {
                        prod = multiply_factors(&prod, f);
                    }
                    remaining.push(sum_out_factor(&prod, u));
                }
                factors = remaining;
            }

            let mut final_f = factors[0].clone();
            for f in factors.iter().skip(1) {
                final_f = multiply_factors(&final_f, f);
            }
            let pos_q = final_f
                .vars
                .iter()
                .position(|&x| x == q_node)
                .ok_or_else(|| err("query variable eliminated unexpectedly".to_string()))?;
            let mut prob_t = 0.0;
            let mut prob_f = 0.0;
            for (idx, &v) in final_f.table.iter().enumerate() {
                if ((idx >> pos_q) & 1) == 1 {
                    prob_t += v;
                } else {
                    prob_f += v;
                }
            }
            let prob = if prob_t + prob_f == 0.0 {
                0.0
            } else {
                prob_t / (prob_t + prob_f)
            };
            let verdict = format!("prob:{}={:.9}", q_node_name, prob);
            trace.push(TraceStep {
                step: trace.len(),
                kind: "bn-verdict".to_string(),
                detail: verdict.clone(),
                depth: 0,
                objects: vec![("decision".to_string(), "posterior".to_string())],
            });
            explanation = verdict;
        } else if let Some(inner) = q_str.strip_prefix("dsep:") {
            // Bayes-ball reachability: d-separated iff NOT reachable.
            let parts: Vec<&str> = inner.split('|').collect();
            let ends: Vec<&str> = parts[0].split(',').collect();
            if ends.len() != 2 {
                return Err(err("dsep query must be 'dsep:A,B|O1,O2'".to_string()));
            }
            let start = node_id(ends[0])?;
            let end = node_id(ends[1])?;
            let mut obs: BTreeSet<usize> = BTreeSet::new();
            if parts.len() > 1 && !parts[1].is_empty() {
                for o in parts[1].split(',') {
                    obs.insert(node_id(o)?);
                }
            }

            #[derive(Clone, Copy, PartialEq, Eq, Hash)]
            enum Dir {
                Up,
                Down,
            }

            let mut ancestors_of_obs: BTreeSet<usize> = obs.clone();
            let mut q: VecDeque<usize> = obs.iter().copied().collect();
            while let Some(n) = q.pop_front() {
                for &p in &parents_map[n] {
                    if ancestors_of_obs.insert(p) {
                        q.push_back(p);
                    }
                }
            }

            let mut reachable = false;
            let mut visited: HashSet<(usize, Dir)> = HashSet::new();
            let mut rq: VecDeque<(usize, Dir)> = VecDeque::new();
            rq.push_back((start, Dir::Up));
            visited.insert((start, Dir::Up));
            while let Some((n, dir)) = rq.pop_front() {
                if n == end {
                    reachable = true;
                    break;
                }
                let is_obs = obs.contains(&n);
                match dir {
                    Dir::Up => {
                        if !is_obs {
                            for &p in &parents_map[n] {
                                if visited.insert((p, Dir::Up)) {
                                    rq.push_back((p, Dir::Up));
                                }
                            }
                            for &c in &adj[n] {
                                if visited.insert((c, Dir::Down)) {
                                    rq.push_back((c, Dir::Down));
                                }
                            }
                        }
                    }
                    Dir::Down => {
                        if !is_obs {
                            for &c in &adj[n] {
                                if visited.insert((c, Dir::Down)) {
                                    rq.push_back((c, Dir::Down));
                                }
                            }
                            if ancestors_of_obs.contains(&n) {
                                for &p in &parents_map[n] {
                                    if visited.insert((p, Dir::Up)) {
                                        rq.push_back((p, Dir::Up));
                                    }
                                }
                            }
                        } else {
                            for &p in &parents_map[n] {
                                if visited.insert((p, Dir::Up)) {
                                    rq.push_back((p, Dir::Up));
                                }
                            }
                        }
                    }
                }
            }

            let dsep = !reachable;
            let verdict = format!("{}={}", q_str, dsep);
            trace.push(TraceStep {
                step: trace.len(),
                kind: "bn-verdict".to_string(),
                detail: verdict.clone(),
                depth: 0,
                objects: vec![("decision".to_string(), "dsep".to_string())],
            });
            explanation = verdict;
        } else {
            return Err(err("unknown query type (use prob: or dsep:)".to_string()));
        }

        Ok(BreedOutput {
            breed: BreedId::BayesianNetwork,
            candidates: input.candidates.clone(),
            facts: input.facts.clone(),
            selected: Some(explanation.clone()),
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("empty inference trace (fraud signal)".to_string());
        }
        if !output.inference_trace.iter().any(|t| t.kind == "bn-load-cpt") {
            return Err("trace missing bn-load-cpt".to_string());
        }
        if output
            .inference_trace
            .iter()
            .filter(|t| t.kind == "bn-verdict")
            .count()
            != 1
        {
            return Err("trace must contain exactly one bn-verdict".to_string());
        }
        Ok(())
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
    for (idx, slot) in table.iter_mut().enumerate() {
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
        *slot = f1.table[idx1] * f2.table[idx2];
    }
    Factor { vars, table }
}

fn sum_out_factor(f: &Factor, var_to_elim: usize) -> Factor {
    let mut vars = f.vars.clone();
    vars.retain(|&v| v != var_to_elim);

    let mut table = vec![0.0; 1 << vars.len()];
    let pos_elim = f.vars.iter().position(|&x| x == var_to_elim).unwrap();
    for (idx, &v_val) in f.table.iter().enumerate() {
        let mut new_idx = 0;
        for (i, &v) in f.vars.iter().enumerate() {
            if i == pos_elim {
                continue;
            }
            let pos_new = vars.iter().position(|&x| x == v).unwrap();
            if (idx & (1 << i)) != 0 {
                new_idx |= 1 << pos_new;
            }
        }
        table[new_idx] += v_val;
    }
    Factor { vars, table }
}
