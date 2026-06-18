use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, TraceStep,
};
use std::collections::{HashMap, VecDeque};

/// Allen's Interval Algebra breed
pub struct AllenTemporal;

const INVERSE: [usize; 13] = [1, 0, 3, 2, 5, 4, 7, 6, 9, 8, 11, 10, 12];

const fn rel(s1: i32, e1: i32, s2: i32, e2: i32) -> usize {
    if e1 < s2 { 0 }
    else if e2 < s1 { 1 }
    else if e1 == s2 { 2 }
    else if e2 == s1 { 3 }
    else if s1 < s2 && e1 > s2 && e1 < e2 { 4 }
    else if s2 < s1 && e2 > s1 && e2 < e1 { 5 }
    else if s1 > s2 && e1 < e2 { 6 }
    else if s1 < s2 && e1 > e2 { 7 }
    else if s1 == s2 && e1 < e2 { 8 }
    else if s1 == s2 && e1 > e2 { 9 }
    else if e1 == e2 && s1 > s2 { 10 }
    else if e1 == e2 && s1 < s2 { 11 }
    else { 12 }
}

/// Compute composition table
pub const fn compute_table() -> [[u16; 13]; 13] {
    let mut t = [[0u16; 13]; 13];
    let mut x_s = 1; while x_s <= 6 {
        let mut x_e = x_s + 1; while x_e <= 6 {
            let mut y_s = 1; while y_s <= 6 {
                let mut y_e = y_s + 1; while y_e <= 6 {
                    let mut z_s = 1; while z_s <= 6 {
                        let mut z_e = z_s + 1; while z_e <= 6 {
                            let r1 = rel(x_s, x_e, y_s, y_e);
                            let r2 = rel(y_s, y_e, z_s, z_e);
                            let r3 = rel(x_s, x_e, z_s, z_e);
                            t[r1][r2] |= 1 << r3;
                            z_e += 1;
                        } z_s += 1;
                    } y_e += 1;
                } y_s += 1;
            } x_e += 1;
        } x_s += 1;
    }
    t
}

static COMPOSITION_TABLE: [[u16; 13]; 13] = compute_table();

fn compose_mask(m1: u16, m2: u16) -> u16 {
    let mut res = 0;
    for i in 0..13 {
        if (m1 & (1 << i)) != 0 {
            for j in 0..13 {
                if (m2 & (1 << j)) != 0 {
                    res |= COMPOSITION_TABLE[i][j];
                }
            }
        }
    }
    res
}

fn inverse_mask(m: u16) -> u16 {
    let mut res = 0;
    for i in 0..13 {
        if (m & (1 << i)) != 0 {
            res |= 1 << INVERSE[i];
        }
    }
    res
}

fn parse_rel(s: &str) -> Option<usize> {
    match s {
        "p" => Some(0), "pi" => Some(1), "m" => Some(2), "mi" => Some(3),
        "o" => Some(4), "oi" => Some(5), "d" => Some(6), "di" => Some(7),
        "s" => Some(8), "si" => Some(9), "f" => Some(10), "fi" => Some(11),
        "eq" => Some(12), _ => None,
    }
}

fn parse_rel_name(s: &str) -> &str {
    match s {
        "precedes" | "before" | "p" => "p",
        "preceded-by" | "after" | "pi" => "pi",
        "meets" | "m" => "m",
        "met-by" | "mi" => "mi",
        "overlaps" | "o" => "o",
        "overlapped-by" | "oi" => "oi",
        "during" | "d" => "d",
        "contains" | "di" => "di",
        "starts" | "s" => "s",
        "started-by" | "si" => "si",
        "finishes" | "f" => "f",
        "finished-by" | "fi" => "fi",
        "equals" | "eq" => "eq",
        other => other,
    }
}

fn rel_to_str(idx: usize) -> &'static str {
    match idx {
        0 => "p", 1 => "pi", 2 => "m", 3 => "mi",
        4 => "o", 5 => "oi", 6 => "d", 7 => "di",
        8 => "s", 9 => "si", 10 => "f", 11 => "fi",
        12 => "eq", _ => "?",
    }
}

fn mask_to_str(mask: u16) -> String {
    let mut parts = Vec::new();
    for i in 0..13 {
        if (mask & (1 << i)) != 0 {
            parts.push(rel_to_str(i));
        }
    }
    parts.join("|")
}

impl CognitionBreed for AllenTemporal {
    fn id(&self) -> BreedId {
        BreedId::AllenTemporal
    }

    fn capabilities(&self) -> Vec<String> {
        vec!["allen_temporal".into(), "interval_algebra".into()]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.facts.is_empty() {
            return Err("EMPTY_EVENT_LOG: AllenTemporal requires at least one fact (temporal constraint)".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();
        let mut step_count = 0;
        
        let mut node_names = Vec::new();
        let mut name_to_id = HashMap::new();

        // Helper closures inline logic
        macro_rules! get_id {
            ($name:expr) => {{
                if !name_to_id.contains_key($name) {
                    name_to_id.insert($name.to_string(), node_names.len());
                    node_names.push($name.to_string());
                }
                name_to_id[$name]
            }}
        }

        // Load explicit nodes if any
        for state in &input.state {
            if state.predicate == "interval" {
                let parts: Vec<&str> = state.value.split(',').collect();
                if parts.len() >= 1 {
                    get_id!(parts[0]);
                }
            }
        }

        // Load nodes from relation facts
        for fact in &input.facts {
            if fact.key == "relation" {
                let mut parsed = None;
                let parts_comma: Vec<&str> = fact.value.split(',').collect();
                if parts_comma.len() == 3 {
                    parsed = Some((parts_comma[0].trim(), parts_comma[1].trim()));
                } else {
                    let parts_space: Vec<&str> = fact.value.split_whitespace().collect();
                    if parts_space.len() == 3 {
                        parsed = Some((parts_space[0], parts_space[2]));
                    }
                }
                if let Some((node1, node2)) = parsed {
                    get_id!(node1);
                    get_id!(node2);
                }
            }
        }

        let n = node_names.len();
        if n > 32 {
            return Err(BreedError { breed: self.id(), message: "Exceeded 32 intervals".into() });
        }

        let mut matrix = vec![vec![8191u16; n]; n];
        for i in 0..n {
            matrix[i][i] = 1 << 12; // eq
        }

        // Load intervals
        for state in &input.state {
            if state.predicate == "interval" {
                let parts: Vec<&str> = state.value.split(',').collect();
                if parts.len() == 3 {
                    if let (Ok(_s), Ok(_e)) = (parts[1].parse::<i32>(), parts[2].parse::<i32>()) {
                        let id = get_id!(parts[0]);
                        trace.push(TraceStep {
                            step: step_count,
                            kind: "allen-load".into(),
                            detail: format!("interval {}", parts[0]),
                            depth: 0,
                            objects: vec![("interval".into(), parts[0].to_string())],
                        });
                        step_count += 1;
                    }
                }
            }
        }

        let mut concrete_intervals = HashMap::new();
        for state in &input.state {
             if state.predicate == "interval" {
                let parts: Vec<&str> = state.value.split(',').collect();
                if parts.len() == 3 {
                    if let (Ok(s), Ok(e)) = (parts[1].parse::<i32>(), parts[2].parse::<i32>()) {
                        concrete_intervals.insert(get_id!(parts[0]), (s, e));
                    }
                }
             }
        }

        for (&i, &(s1, e1)) in &concrete_intervals {
            for (&j, &(s2, e2)) in &concrete_intervals {
                if i != j {
                    let r = rel(s1, e1, s2, e2);
                    matrix[i][j] = 1 << r;
                }
            }
        }

        // Load explicit relations
        for fact in &input.facts {
            if fact.key == "relation" {
                let mut parsed = None;
                let parts_comma: Vec<&str> = fact.value.split(',').collect();
                if parts_comma.len() == 3 {
                    parsed = Some((parts_comma[0].trim(), parts_comma[1].trim(), parts_comma[2].trim()));
                } else {
                    let parts_space: Vec<&str> = fact.value.split_whitespace().collect();
                    if parts_space.len() == 3 {
                        parsed = Some((parts_space[0], parts_space[2], parts_space[1]));
                    }
                }
                if let Some((node1, node2, rel_str)) = parsed {
                    let id1 = get_id!(node1);
                    let id2 = get_id!(node2);
                    let rels: Vec<&str> = rel_str.split('|').collect();
                    let mut mask = 0;
                    for r in rels {
                        let normalized = parse_rel_name(r);
                        if let Some(r_idx) = parse_rel(normalized) {
                            mask |= 1 << r_idx;
                        }
                    }
                    if mask > 0 {
                        matrix[id1][id2] &= mask;
                        matrix[id2][id1] = inverse_mask(matrix[id1][id2]);
                        trace.push(TraceStep {
                            step: step_count,
                            kind: "allen-load".into(),
                            detail: format!("rel {},{},{}", node1, node2, rel_str),
                            depth: 0,
                            objects: vec![("interval".into(), node1.to_string()), ("interval".into(), node2.to_string())],
                        });
                        step_count += 1;
                    }
                }
            }
        }

        // Direct contradiction check: an empty relation set (mask == 0) between any
        // two distinct intervals means the conjunction of loaded constraints is
        // unsatisfiable (e.g. "A before B" AND "B before A"). Path consistency only
        // detects contradictions via a third interval, so catch the 2-node case here.
        for i in 0..n {
            for j in 0..n {
                if i != j && matrix[i][j] == 0 {
                    return Err(BreedError {
                        breed: self.id(),
                        message: format!(
                            "empty relation set: inconsistency detected between {} and {}",
                            node_names[i], node_names[j]
                        ),
                    });
                }
            }
        }

        // Path consistency using a queue
        let mut q = VecDeque::new();
        for i in 0..n {
            for j in 0..n {
                if i != j {
                    q.push_back((i, j));
                }
            }
        }

        while let Some((i, j)) = q.pop_front() {
            for k in 0..n {
                if k != i && k != j {
                    let t = matrix[k][j] & compose_mask(matrix[k][i], matrix[i][j]);
                    if t != matrix[k][j] {
                        if t == 0 {
                            return Err(BreedError { breed: self.id(), message: format!("Inconsistency detected between {} and {}", node_names[k], node_names[j]) });
                        }
                        matrix[k][j] = t;
                        matrix[j][k] = inverse_mask(t);
                        q.push_back((k, j));
                        q.push_back((j, k));
                        trace.push(TraceStep {
                            step: step_count,
                            kind: "allen-compose".into(),
                            detail: format!("{},{},{}", node_names[k], node_names[i], node_names[j]),
                            depth: 0,
                            objects: vec![("interval".into(), node_names[k].clone()), ("interval".into(), node_names[i].clone()), ("interval".into(), node_names[j].clone())],
                        });
                        step_count += 1;
                    }
                }
            }
        }

        trace.push(TraceStep {
            step: step_count,
            kind: "allen-verdict".into(),
            detail: "path-consistency-fixpoint".into(),
            depth: 0,
            objects: vec![],
        });

        // Determine selection / output
        let mut candidates = input.candidates.clone();
        for cand in &mut candidates {
            if cand.id == "temporal-consistent" {
                cand.score = 1.0;
            }
        }

        let mut out_facts = Vec::new();
        for i in 0..n {
            for j in 0..n {
                if i != j {
                    let mask = matrix[i][j];
                    let val = mask_to_str(mask);
                    out_facts.push(crate::breeds::Fact {
                        key: format!("relation:{}:{}", node_names[i], node_names[j]),
                        value: val,
                    });
                }
            }
        }

        Ok(BreedOutput {
            breed: self.id(),
            candidates,
            facts: out_facts,
            selected: Some("temporal-consistent".into()),
            explanation: "Allen temporal logic constraint network reached fixpoint.".into(),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("Trace must not be empty".into());
        }
        if !output.inference_trace.iter().any(|s| s.kind == "allen-verdict") {
            return Err("Trace must contain an 'allen-verdict' step".into());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_algebraic_property_sweep() {
        let _ = COMPOSITION_TABLE;
        for i in 0..13 {
            let i_mask = 1 << i;
            let eq_mask = 1 << 12;

            // 1. Identity: r * eq = r and eq * r = r
            assert_eq!(compose_mask(i_mask, eq_mask), i_mask, "r * eq = r failed for {}", rel_to_str(i));
            assert_eq!(compose_mask(eq_mask, i_mask), i_mask, "eq * r = r failed for {}", rel_to_str(i));

            // 2. Inverse Involution: inverse(inverse(r)) = r
            assert_eq!(INVERSE[INVERSE[i]], i, "inverse(inverse(r)) = r failed for {}", rel_to_str(i));

            for j in 0..13 {
                let j_mask = 1 << j;
                // 3. Inverse of composition: inv(a * b) = inv(b) * inv(a)
                let comp_ab = compose_mask(i_mask, j_mask);
                let inv_comp_ab = inverse_mask(comp_ab);
                
                let inv_a = inverse_mask(i_mask);
                let inv_b = inverse_mask(j_mask);
                let comp_invb_inva = compose_mask(inv_b, inv_a);
                
                assert_eq!(inv_comp_ab, comp_invb_inva, "inv(a*b) = inv(b)*inv(a) failed for {} * {}", rel_to_str(i), rel_to_str(j));
            }
        }
    }

    #[test]
    fn test_path_consistency_4_intervals() {
        // Fresh 4-interval network requiring non-trivial path consistency
        // A before B, B before C, C before D => A before D
        let p = 1 << 0;
        let mut m = vec![vec![8191u16; 4]; 4];
        for i in 0..4 { m[i][i] = 1 << 12; }
        
        m[0][1] = p; m[1][0] = inverse_mask(p);
        m[1][2] = p; m[2][1] = inverse_mask(p);
        m[2][3] = p; m[3][2] = inverse_mask(p);

        let mut q = VecDeque::new();
        for i in 0..4 { for j in 0..4 { if i != j { q.push_back((i,j)); } } }

        while let Some((i, j)) = q.pop_front() {
            for k in 0..4 {
                if k != i && k != j {
                    let t = m[k][j] & compose_mask(m[k][i], m[i][j]);
                    if t != m[k][j] {
                        m[k][j] = t;
                        m[j][k] = inverse_mask(t);
                        q.push_back((k, j));
                        q.push_back((j, k));
                    }
                }
            }
        }
        assert_eq!(m[0][3], p, "A should be before D");
    }

    use crate::breeds::{BreedInput, Fact, StateAtom};

    #[test]
    fn refuses_inconsistent_network() {
        let input = BreedInput {
            intent: "allen".into(),
            candidates: vec![],
            facts: vec![
                Fact {
                    key: "relation".into(),
                    value: "A,B,p".into(),
                },
                Fact {
                    key: "relation".into(),
                    value: "B,A,p".into(),
                }, // Contradiction
            ],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let err = AllenTemporal.run(&input).unwrap_err();
        assert!(
            err.message.contains("empty relation set")
                || err.message.contains("inconsistency detected")
        );
    }

    #[test]
    fn falsification_gate_path_consistency() {
        // A before B, B meets C => A must be before C
        let input = BreedInput {
            intent: "allen".into(),
            candidates: vec![],
            facts: vec![
                Fact {
                    key: "relation".into(),
                    value: "A,B,p".into(),
                },
                Fact {
                    key: "relation".into(),
                    value: "B,C,m".into(),
                },
            ],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };
        let out = AllenTemporal.run(&input).unwrap();
        let ac_rel = out.facts.iter().find(|f| f.key == "relation:A:C").unwrap();
        assert_eq!(ac_rel.value, "p");
    }

    #[test]
    fn invariant_order_independence() {
        // The output of path consistency should be the same regardless of constraint declaration order.
        let f1 = Fact {
            key: "relation".into(),
            value: "A,B,p".into(),
        };
        let f2 = Fact {
            key: "relation".into(),
            value: "B,C,m".into(),
        };

        let input1 = BreedInput {
            intent: "allen".into(),
            candidates: vec![],
            facts: vec![f1.clone(), f2.clone()],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };

        let input2 = BreedInput {
            intent: "allen".into(),
            candidates: vec![],
            facts: vec![f2, f1],
            cases: vec![],
            rules: vec![],
            goals: vec![],
            state: vec![],
        };

        let mut out1 = AllenTemporal.run(&input1).unwrap();
        let mut out2 = AllenTemporal.run(&input2).unwrap();

        out1.facts.sort_by(|a, b| a.key.cmp(&b.key));
        out2.facts.sort_by(|a, b| a.key.cmp(&b.key));

        assert_eq!(out1.facts, out2.facts);
    }
}
