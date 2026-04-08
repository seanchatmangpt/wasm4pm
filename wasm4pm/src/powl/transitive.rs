//! Transitive-closure and transitive-reduction helpers.

use crate::powl_arena::BinaryRelation;

/// Non-destructive transitive closure.
pub fn transitive_closure(rel: &BinaryRelation) -> BinaryRelation {
    let mut result = rel.clone();
    result.add_transitive_edges();
    result
}

/// True when `rel` is a strict partial order.
pub fn is_strict_partial_order(rel: &BinaryRelation) -> bool {
    rel.is_strict_partial_order()
}

/// Generate initial order from eventually-follows graph.
pub fn generate_initial_order_from_efg(
    n: usize,
    efg: &BinaryRelation,
) -> BinaryRelation {
    let mut order = BinaryRelation::new(n);
    for i in 0..n {
        for j in 0..n {
            if i != j && efg.is_edge(i, j) && !efg.is_edge(j, i) {
                order.add_edge(i, j);
            }
        }
    }
    order.add_transitive_edges();
    order
}

/// Check whether `order` is a valid partial order cut given the EFG.
pub fn is_valid_order(order: &BinaryRelation, efg: &BinaryRelation) -> bool {
    if !order.is_strict_partial_order() {
        return false;
    }
    let n = order.n;
    for i in 0..n {
        for j in 0..n {
            if i == j {
                continue;
            }
            if efg.is_edge(i, j) && efg.is_edge(j, i)
                && (order.is_edge(i, j) || order.is_edge(j, i)) {
                    return false;
                }
        }
    }
    true
}

/// Merge two groups of node indices.
pub fn merge_groups(groups: &mut Vec<Vec<usize>>, a: usize, b: usize) {
    if a == b {
        return;
    }
    let (lo, hi) = if a < b { (a, b) } else { (b, a) };
    let hi_group = groups.remove(hi);
    groups[lo].extend(hi_group);
}

/// Build cluster-level ordering from per-node EFG.
pub fn cluster_order_from_efg(
    clusters: &[Vec<usize>],
    efg: &BinaryRelation,
) -> BinaryRelation {
    let k = clusters.len();
    let mut order = BinaryRelation::new(k);
    'outer: for (ci, src) in clusters.iter().enumerate() {
        'inner: for (cj, tgt) in clusters.iter().enumerate() {
            if ci == cj {
                continue;
            }
            for &i in src {
                for &j in tgt {
                    if !efg.is_edge(i, j) {
                        continue 'inner;
                    }
                }
            }
            for &i in src {
                for &j in tgt {
                    if efg.is_edge(j, i) {
                        continue 'outer;
                    }
                }
            }
            order.add_edge(ci, cj);
        }
    }
    order
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chain(n: usize) -> BinaryRelation {
        let mut r = BinaryRelation::new(n);
        for i in 0..(n - 1) {
            r.add_edge(i, i + 1);
        }
        r
    }

    #[test]
    fn closure_of_chain() {
        let r = chain(4);
        let closed = transitive_closure(&r);
        assert!(closed.is_edge(0, 3));
        assert!(closed.is_transitive());
    }

    #[test]
    fn initial_order_from_efg() {
        let mut efg = BinaryRelation::new(3);
        efg.add_edge(0, 1);
        efg.add_edge(1, 2);
        let order = generate_initial_order_from_efg(3, &efg);
        assert!(order.is_edge(0, 1));
        assert!(order.is_edge(1, 2));
        assert!(order.is_edge(0, 2));
        assert!(order.is_strict_partial_order());
    }

    #[test]
    fn invalid_order_bidirectional_efg() {
        let mut order = BinaryRelation::new(2);
        order.add_edge(0, 1);
        let mut efg = BinaryRelation::new(2);
        efg.add_edge(0, 1);
        efg.add_edge(1, 0);
        assert!(!is_valid_order(&order, &efg));
    }
}
