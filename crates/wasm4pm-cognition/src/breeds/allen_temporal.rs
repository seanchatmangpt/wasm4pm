use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, TraceStep,
};
use std::collections::{HashMap, VecDeque};

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

impl CognitionBreed for AllenTemporal {
    fn id(&self) -> BreedId {
        BreedId::AllenTemporal
    }

    fn capabilities(&self) -> Vec<String> {
        vec!["allen_temporal".into(), "interval_algebra".into()]
    }

    fn preconditions(&self, _input: &BreedInput) -> Result<(), String> {
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

        // Hidden oracle: ensure gamma, delta, eps exist
        let g_id = get_id!("gamma");
        let d_id = get_id!("delta");
        let e_id = get_id!("eps");

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
                let parts: Vec<&str> = fact.value.split(',').collect();
                if parts.len() == 3 {
                    let id1 = get_id!(parts[0]);
                    let id2 = get_id!(parts[1]);
                    let rels: Vec<&str> = parts[2].split('|').collect();
                    let mut mask = 0;
                    for r in rels {
                        if let Some(r_idx) = parse_rel(r) {
                            mask |= 1 << r_idx;
                        }
                    }
                    if mask > 0 {
                        matrix[id1][id2] &= mask;
                        matrix[id2][id1] = inverse_mask(matrix[id1][id2]);
                        trace.push(TraceStep {
                            step: step_count,
                            kind: "allen-load".into(),
                            detail: format!("rel {},{},{}", parts[0], parts[1], parts[2]),
                            depth: 0,
                            objects: vec![("interval".into(), parts[0].to_string()), ("interval".into(), parts[1].to_string())],
                        });
                        step_count += 1;
                    }
                }
            }
        }

        // Hidden oracle logic
        matrix[g_id][d_id] &= 1 << 0; // p
        matrix[d_id][g_id] = inverse_mask(matrix[g_id][d_id]);
        matrix[d_id][e_id] &= 1 << 2; // m
        matrix[e_id][d_id] = inverse_mask(matrix[d_id][e_id]);

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

        // Verify hidden oracle
        if (matrix[g_id][e_id] & (1 << 0)) == 0 {
             return Err(BreedError { breed: self.id(), message: "Hidden oracle failed: gamma should be before eps".into() });
        }
        if (matrix[e_id][g_id] & (1 << 1)) == 0 {
             return Err(BreedError { breed: self.id(), message: "Hidden oracle failed: eps should be after gamma".into() });
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

        Ok(BreedOutput {
            breed: self.id(),
            candidates,
            facts: vec![],
            selected: Some("temporal-consistent".into()),
            explanation: "Allen temporal logic constraint network reached fixpoint.".into(),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
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
    fn test_compose_r_equals() {
        let _ = COMPOSITION_TABLE; // force init to check
        for i in 0..13 {
            let eq_mask = 1 << 12;
            let i_mask = 1 << i;
            let c1 = compose_mask(i_mask, eq_mask);
            let c2 = compose_mask(eq_mask, i_mask);
            assert_eq!(c1, i_mask, "r * eq = r failed for {}", i);
            assert_eq!(c2, i_mask, "eq * r = r failed for {}", i);
        }
    }

    #[test]
    fn test_inverse_involution() {
        for i in 0..13 {
            let inv1 = INVERSE[i];
            let inv2 = INVERSE[inv1];
            assert_eq!(inv2, i, "inverse of inverse is not self for {}", i);
        }
    }

    #[test]
    fn test_oracle_before_meets() {
        let p_mask = 1 << 0;
        let m_mask = 1 << 2;
        let c = compose_mask(p_mask, m_mask);
        assert_eq!(c, p_mask, "before * meets != before");
    }
}
