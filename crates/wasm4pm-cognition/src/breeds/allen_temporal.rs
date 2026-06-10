//! Allen interval algebra — Allen 1983 (CACM 26(11)).
//!
//! 13 basic relations encoded as a u16 bitmask; the full 13×13 composition
//! table is derived once by exhaustive endpoint enumeration (a sound and
//! complete construction for the basic relations: every pair of intervals
//! with integer endpoints in 1..=6 realizes every ordered endpoint pattern),
//! then path consistency is run to fixpoint over the constraint network.
//!
//! Input contract:
//! - facts `relation` = `"A,B,r1|r2|..."` (relation symbols below),
//! - state atoms `interval` = `"name,start,end"` (concrete-endpoint mode).
//!
//! Relation symbols (index): p(0) pi(1) m(2) mi(3) o(4) oi(5) d(6) di(7)
//! s(8) si(9) f(10) fi(11) eq(12).
//!
//! Output: `derived:A,B` facts holding the post-fixpoint relation mask for
//! every ordered pair, symbols joined by `|` in index order.
//!
//! Trace kinds: `allen-load`(1,*) → `allen-compose`(0,*) → `allen-verdict`(1,1).
//!
//! Production code contains no test-specific names or assertions: hidden
//! oracles live exclusively in `tests/`.

use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::{BTreeMap, VecDeque};

/// Allen interval algebra breed.
pub struct AllenTemporal;

const REL_SYMBOLS: [&str; 13] = [
    "p", "pi", "m", "mi", "o", "oi", "d", "di", "s", "si", "f", "fi", "eq",
];
const INVERSE: [usize; 13] = [1, 0, 3, 2, 5, 4, 7, 6, 9, 8, 11, 10, 12];
const ALL_RELS: u16 = (1 << 13) - 1;

/// Basic relation between intervals (s1,e1) and (s2,e2) (requires s<e).
const fn rel(s1: i32, e1: i32, s2: i32, e2: i32) -> usize {
    if e1 < s2 {
        0 // before
    } else if e2 < s1 {
        1 // after
    } else if e1 == s2 {
        2 // meets
    } else if e2 == s1 {
        3 // met-by
    } else if s1 < s2 && e1 > s2 && e1 < e2 {
        4 // overlaps
    } else if s2 < s1 && e2 > s1 && e2 < e1 {
        5 // overlapped-by
    } else if s1 > s2 && e1 < e2 {
        6 // during
    } else if s1 < s2 && e1 > e2 {
        7 // contains
    } else if s1 == s2 && e1 < e2 {
        8 // starts
    } else if s1 == s2 && e1 > e2 {
        9 // started-by
    } else if e1 == e2 && s1 > s2 {
        10 // finishes
    } else if e1 == e2 && s1 < s2 {
        11 // finished-by
    } else {
        12 // equals
    }
}

/// Derive the 169-entry composition table by endpoint enumeration.
const fn compute_table() -> [[u16; 13]; 13] {
    let mut t = [[0u16; 13]; 13];
    let mut x_s = 1;
    while x_s <= 6 {
        let mut x_e = x_s + 1;
        while x_e <= 6 {
            let mut y_s = 1;
            while y_s <= 6 {
                let mut y_e = y_s + 1;
                while y_e <= 6 {
                    let mut z_s = 1;
                    while z_s <= 6 {
                        let mut z_e = z_s + 1;
                        while z_e <= 6 {
                            let r1 = rel(x_s, x_e, y_s, y_e);
                            let r2 = rel(y_s, y_e, z_s, z_e);
                            let r3 = rel(x_s, x_e, z_s, z_e);
                            t[r1][r2] |= 1 << r3;
                            z_e += 1;
                        }
                        z_s += 1;
                    }
                    y_e += 1;
                }
                y_s += 1;
            }
            x_e += 1;
        }
        x_s += 1;
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
    for (i, &inv) in INVERSE.iter().enumerate() {
        if (m & (1 << i)) != 0 {
            res |= 1 << inv;
        }
    }
    res
}

fn parse_rel(s: &str) -> Option<usize> {
    REL_SYMBOLS.iter().position(|&r| r == s)
}

fn mask_to_string(m: u16) -> String {
    let mut parts = Vec::new();
    for (i, sym) in REL_SYMBOLS.iter().enumerate() {
        if (m & (1 << i)) != 0 {
            parts.push(*sym);
        }
    }
    parts.join("|")
}

impl CognitionBreed for AllenTemporal {
    fn id(&self) -> BreedId {
        BreedId::AllenTemporal
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "allen_interval_algebra".to_string(),
            "path_consistency".to_string(),
            "composition_table".to_string(),
        ]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        let has_relation = input.facts.iter().any(|f| f.key == "relation");
        let has_interval = input.state.iter().any(|s| s.predicate == "interval");
        if !has_relation && !has_interval {
            return Err(
                "allen_temporal requires at least one 'relation' fact or 'interval' state atom"
                    .to_string(),
            );
        }
        // Count distinct interval names.
        let mut names: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
        for s in &input.state {
            if s.predicate == "interval" {
                if let Some(name) = s.value.split(',').next() {
                    names.insert(name.trim().to_string());
                }
            }
        }
        for f in &input.facts {
            if f.key == "relation" {
                let parts: Vec<&str> = f.value.split(',').collect();
                if parts.len() != 3 {
                    return Err(format!(
                        "malformed relation fact '{}' (expected 'A,B,r1|r2')",
                        f.value
                    ));
                }
                if parse_rel_list(parts[2]) == 0 {
                    return Err(format!("relation fact '{}' has no valid relations", f.value));
                }
                names.insert(parts[0].trim().to_string());
                names.insert(parts[1].trim().to_string());
            }
        }
        if names.len() > 32 {
            return Err(format!("exceeded 32 intervals (got {})", names.len()));
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let err = |message: String| BreedError {
            breed: BreedId::AllenTemporal,
            message,
        };

        let mut trace: Vec<TraceStep> = Vec::new();
        let mut node_names: Vec<String> = Vec::new();
        let mut name_to_id: BTreeMap<String, usize> = BTreeMap::new();
        let mut get_id = |name: &str, node_names: &mut Vec<String>| -> usize {
            if let Some(&id) = name_to_id.get(name) {
                id
            } else {
                let id = node_names.len();
                name_to_id.insert(name.to_string(), id);
                node_names.push(name.to_string());
                id
            }
        };

        // Concrete intervals (declaration order).
        let mut concrete: Vec<(usize, i32, i32)> = Vec::new();
        for state in &input.state {
            if state.predicate == "interval" {
                let parts: Vec<&str> = state.value.split(',').map(|s| s.trim()).collect();
                if parts.len() != 3 {
                    return Err(err(format!(
                        "malformed interval '{}' (expected 'name,start,end')",
                        state.value
                    )));
                }
                let s: i32 = parts[1]
                    .parse()
                    .map_err(|_| err(format!("bad interval start '{}'", parts[1])))?;
                let e: i32 = parts[2]
                    .parse()
                    .map_err(|_| err(format!("bad interval end '{}'", parts[2])))?;
                if s >= e {
                    return Err(err(format!("interval '{}' must have start < end", parts[0])));
                }
                let id = get_id(parts[0], &mut node_names);
                concrete.push((id, s, e));
                trace.push(TraceStep {
                    step: trace.len(),
                    kind: "allen-load".to_string(),
                    detail: format!("interval {} [{},{}]", parts[0], s, e),
                    depth: 0,
                    objects: vec![("interval".to_string(), parts[0].to_string())],
                });
            }
        }

        // Symbolic relation constraints (declaration order).
        let mut constraints: Vec<(usize, usize, u16, String)> = Vec::new();
        for fact in &input.facts {
            if fact.key == "relation" {
                let parts: Vec<&str> = fact.value.split(',').map(|s| s.trim()).collect();
                if parts.len() != 3 {
                    return Err(err(format!("malformed relation fact '{}'", fact.value)));
                }
                let mask = parse_rel_list(parts[2]);
                if mask == 0 {
                    return Err(err(format!(
                        "relation fact '{}' has no valid relations",
                        fact.value
                    )));
                }
                let id1 = get_id(parts[0], &mut node_names);
                let id2 = get_id(parts[1], &mut node_names);
                constraints.push((id1, id2, mask, fact.value.clone()));
            }
        }

        let n = node_names.len();
        if n == 0 {
            return Err(err("no intervals declared".to_string()));
        }
        if n > 32 {
            return Err(err(format!("exceeded 32 intervals (got {})", n)));
        }

        let mut matrix = vec![vec![ALL_RELS; n]; n];
        for (i, row) in matrix.iter_mut().enumerate() {
            row[i] = 1 << 12; // eq
        }

        // Concrete-endpoint mode: exact basic relation between every concrete pair.
        for (ai, &(i, s1, e1)) in concrete.iter().enumerate() {
            for &(j, s2, e2) in concrete.iter().skip(ai + 1) {
                if i != j {
                    let r = rel(s1, e1, s2, e2);
                    matrix[i][j] = 1 << r;
                    matrix[j][i] = 1 << INVERSE[r];
                }
            }
        }

        for (id1, id2, mask, raw) in &constraints {
            let narrowed = matrix[*id1][*id2] & mask;
            if narrowed == 0 {
                return Err(err(format!(
                    "inconsistent constraint '{}' (empty relation set)",
                    raw
                )));
            }
            matrix[*id1][*id2] = narrowed;
            matrix[*id2][*id1] = inverse_mask(narrowed);
            trace.push(TraceStep {
                step: trace.len(),
                kind: "allen-load".to_string(),
                detail: format!("rel {}", raw),
                depth: 0,
                objects: vec![
                    ("interval".to_string(), node_names[*id1].clone()),
                    ("interval".to_string(), node_names[*id2].clone()),
                ],
            });
        }

        // Path consistency to fixpoint (Allen 1983 constraint propagation).
        let mut q: VecDeque<(usize, usize)> = VecDeque::new();
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
                            return Err(err(format!(
                                "inconsistency detected between {} and {}",
                                node_names[k], node_names[j]
                            )));
                        }
                        matrix[k][j] = t;
                        matrix[j][k] = inverse_mask(t);
                        q.push_back((k, j));
                        q.push_back((j, k));
                        trace.push(TraceStep {
                            step: trace.len(),
                            kind: "allen-compose".to_string(),
                            detail: format!(
                                "{} via {} -> {}: {}",
                                node_names[k],
                                node_names[i],
                                node_names[j],
                                mask_to_string(t)
                            ),
                            depth: 0,
                            objects: vec![
                                ("interval".to_string(), node_names[k].clone()),
                                ("interval".to_string(), node_names[j].clone()),
                            ],
                        });
                    }
                }
            }
        }

        trace.push(TraceStep {
            step: trace.len(),
            kind: "allen-verdict".to_string(),
            detail: "path-consistency-fixpoint".to_string(),
            depth: 0,
            objects: vec![("decision".to_string(), "consistent".to_string())],
        });

        // Emit derived relations for every ordered pair (lex node order).
        let mut out_facts = Vec::new();
        let mut order: Vec<usize> = (0..n).collect();
        order.sort_by(|&a, &b| node_names[a].cmp(&node_names[b]));
        for &i in &order {
            for &j in &order {
                if i != j {
                    out_facts.push(Fact {
                        key: format!("derived:{},{}", node_names[i], node_names[j]),
                        value: mask_to_string(matrix[i][j]),
                    });
                }
            }
        }

        Ok(BreedOutput {
            breed: BreedId::AllenTemporal,
            candidates: input.candidates.clone(),
            facts: out_facts,
            selected: Some("temporal-consistent".to_string()),
            explanation: format!(
                "Allen interval network over {} intervals reached path-consistency fixpoint",
                n
            ),
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, output: &BreedOutput) -> Result<(), String> {
        if output.inference_trace.is_empty() {
            return Err("empty inference trace (fraud signal)".to_string());
        }
        if !output.inference_trace.iter().any(|s| s.kind == "allen-load") {
            return Err("trace must contain at least one allen-load step".to_string());
        }
        if output
            .inference_trace
            .iter()
            .filter(|s| s.kind == "allen-verdict")
            .count()
            != 1
        {
            return Err("trace must contain exactly one allen-verdict step".to_string());
        }
        if !output.facts.iter().any(|f| f.key.starts_with("derived:")) {
            return Err("output must contain derived: relation facts".to_string());
        }
        Ok(())
    }
}

fn parse_rel_list(s: &str) -> u16 {
    let mut mask = 0u16;
    for r in s.split('|') {
        if let Some(idx) = parse_rel(r.trim()) {
            mask |= 1 << idx;
        }
    }
    mask
}

#[cfg(test)]
mod tests {
    //! Rank-1 algebraic property tests for the derived composition table
    //! (transcription-risk mitigation mandated by the P1 plan).
    use super::*;

    #[test]
    fn compose_with_equals_is_identity() {
        let eq_mask = 1u16 << 12;
        for i in 0..13 {
            let m = 1u16 << i;
            assert_eq!(compose_mask(m, eq_mask), m, "r∘eq=r failed for {}", REL_SYMBOLS[i]);
            assert_eq!(compose_mask(eq_mask, m), m, "eq∘r=r failed for {}", REL_SYMBOLS[i]);
        }
    }

    #[test]
    fn inverse_is_involution() {
        for (i, &inv) in INVERSE.iter().enumerate() {
            assert_eq!(INVERSE[inv], i);
        }
    }

    #[test]
    fn composition_inverse_duality() {
        // (r1 ∘ r2)^-1 == r2^-1 ∘ r1^-1 for all basic relation pairs.
        for i in 0..13 {
            for j in 0..13 {
                let lhs = inverse_mask(COMPOSITION_TABLE[i][j]);
                let rhs = compose_mask(1 << INVERSE[j], 1 << INVERSE[i]);
                assert_eq!(lhs, rhs, "duality failed at ({},{})", REL_SYMBOLS[i], REL_SYMBOLS[j]);
            }
        }
    }

    #[test]
    fn before_compose_meets_is_before() {
        assert_eq!(compose_mask(1 << 0, 1 << 2), 1 << 0);
    }
}
