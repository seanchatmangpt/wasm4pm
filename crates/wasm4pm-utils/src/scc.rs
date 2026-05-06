use crate::dense_kernel::KBitSet;
use std::cmp::min;

/// Computes all SCCs of a generic K-Tier graph using Tarjan's $O(V+E)$ algorithm.
/// Optimized for sparse Directly Follows Graphs (DFG).
#[allow(clippy::needless_range_loop)]
pub fn compute_sccs_generic<const WORDS: usize>(adj: &[KBitSet<WORDS>]) -> Vec<KBitSet<WORDS>> {
    let max_nodes = WORDS * 64;
    let mut sccs = Vec::new();

    let mut index = 0;
    let mut stack = Vec::new();
    let mut on_stack = vec![false; max_nodes];
    let mut indices = vec![-1; max_nodes];
    let mut lowlink = vec![-1; max_nodes];

    #[allow(clippy::too_many_arguments)]
    fn strong_connect<const W: usize>(
        v: usize,
        adj: &[KBitSet<W>],
        index: &mut i32,
        stack: &mut Vec<usize>,
        on_stack: &mut [bool],
        indices: &mut [i32],
        lowlink: &mut [i32],
        sccs: &mut Vec<KBitSet<W>>,
        max_nodes: usize,
    ) {
        indices[v] = *index;
        lowlink[v] = *index;
        *index += 1;
        stack.push(v);
        on_stack[v] = true;

        // Explore neighbors
        for w in 0..max_nodes {
            if adj[v].contains(w) {
                if indices[w] == -1 {
                    strong_connect(
                        w, adj, index, stack, on_stack, indices, lowlink, sccs, max_nodes,
                    );
                    lowlink[v] = min(lowlink[v], lowlink[w]);
                } else if on_stack[w] {
                    lowlink[v] = min(lowlink[v], indices[w]);
                }
            }
        }

        // If v is a root node, pop the stack and generate an SCC
        if lowlink[v] == indices[v] {
            let mut scc_mask = KBitSet::<W>::zero();
            loop {
                let w = stack.pop().unwrap();
                on_stack[w] = false;
                let _ = scc_mask.set(w);
                if w == v {
                    break;
                }
            }
            sccs.push(scc_mask);
        }
    }

    for i in 0..max_nodes {
        if indices[i] == -1 {
            strong_connect(
                i,
                adj,
                &mut index,
                &mut stack,
                &mut on_stack,
                &mut indices,
                &mut lowlink,
                &mut sccs,
                max_nodes,
            );
        }
    }

    sccs
}

/// A truly branchless version of compute_sccs using mask calculus.
#[allow(clippy::needless_range_loop)]
pub fn compute_sccs_branchless<const WORDS: usize>(adj: &[KBitSet<WORDS>]) -> Vec<KBitSet<WORDS>> {
    let max_nodes = WORDS * 64;
    let mut sccs = Vec::new();
    let mut visited = KBitSet::<WORDS>::zero();

    let mut r = adj.to_vec();

    // 1. Transitive Closure (Truly Branchless)
    for k in 0..max_nodes {
        let k_mask = r[k];
        for i in 0..max_nodes {
            // bit = r[i] contains k
            let bit = (r[i].words[k >> 6] >> (k & 63)) & 1;
            let mask = bit.wrapping_neg();
            for w in 0..WORDS {
                r[i].words[w] |= k_mask.words[w] & mask;
            }
        }
    }

    // 2. Transpose Reachability (Branchless)
    let mut rt = vec![KBitSet::<WORDS>::zero(); max_nodes];
    for i in 0..max_nodes {
        for j in 0..max_nodes {
            let bit = (r[i].words[j >> 6] >> (j & 63)) & 1;
            rt[j].words[i >> 6] |= bit << (i & 63);
        }
    }

    // 3. Extraction
    for i in 0..max_nodes {
        if !visited.contains(i) {
            let mut scc = r[i].bitwise_and(rt[i]);
            // Ensure self-reachability for SCC definition consistency
            let _ = scc.set(i);
            sccs.push(scc);
            visited = visited.bitwise_or(scc);
        }
    }

    sccs
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scc_branchless_parity() {
        let mut adj = vec![KBitSet::<1>::zero(); 64];
        // Create a simple cycle: 0 -> 1 -> 2 -> 0
        let _ = adj[0].set(1);
        let _ = adj[1].set(2);
        let _ = adj[2].set(0);

        let sccs_gen = compute_sccs_generic(&adj);
        let sccs_br = compute_sccs_branchless(&adj);

        assert_eq!(sccs_gen.len(), sccs_br.len());
        for (a, b) in sccs_gen.iter().zip(sccs_br.iter()) {
            assert_eq!(a, b);
        }
    }
}
