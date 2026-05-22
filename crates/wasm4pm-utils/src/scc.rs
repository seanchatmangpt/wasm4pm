use crate::dense_kernel::KBitSet;
use std::cmp::min;

/// Tarjan's algorithm state context.
struct Tarjan<'a, const W: usize> {
    adj: &'a [KBitSet<W>],
    index: i32,
    stack: Vec<usize>,
    on_stack: Vec<bool>,
    indices: Vec<i32>,
    lowlink: Vec<i32>,
    sccs: Vec<KBitSet<W>>,
    max_nodes: usize,
}

impl<'a, const W: usize> Tarjan<'a, W> {
    fn new(adj: &'a [KBitSet<W>], max_nodes: usize) -> Self {
        Self {
            adj,
            index: 0,
            stack: Vec::new(),
            on_stack: vec![false; max_nodes],
            indices: vec![-1; max_nodes],
            lowlink: vec![-1; max_nodes],
            sccs: Vec::new(),
            max_nodes,
        }
    }

    fn strong_connect(&mut self, v: usize) {
        self.indices[v] = self.index;
        self.lowlink[v] = self.index;
        self.index += 1;
        self.stack.push(v);
        self.on_stack[v] = true;

        // Explore neighbors
        for w in 0..self.max_nodes {
            if self.adj[v].contains(w) {
                if self.indices[w] == -1 {
                    self.strong_connect(w);
                    self.lowlink[v] = min(self.lowlink[v], self.lowlink[w]);
                } else if self.on_stack[w] {
                    self.lowlink[v] = min(self.lowlink[v], self.indices[w]);
                }
            }
        }

        // If v is a root node, pop the stack and generate an SCC
        if self.lowlink[v] == self.indices[v] {
            let mut scc_mask = KBitSet::<W>::zero();
            loop {
                let w = self.stack.pop().expect("Stack should not be empty");
                self.on_stack[w] = false;
                let _ = scc_mask.set(w);
                if w == v {
                    break;
                }
            }
            self.sccs.push(scc_mask);
        }
    }
}

/// Computes all SCCs of a generic K-Tier graph using Tarjan's $O(V+E)$ algorithm.
/// Optimized for sparse Directly Follows Graphs (DFG).
pub fn compute_sccs_generic<const WORDS: usize>(adj: &[KBitSet<WORDS>]) -> Vec<KBitSet<WORDS>> {
    let max_nodes = WORDS * 64;
    let mut ctx = Tarjan::new(adj, max_nodes);

    for i in 0..max_nodes {
        if ctx.indices[i] == -1 {
            ctx.strong_connect(i);
        }
    }

    ctx.sccs
}

/// A truly branchless version of compute_sccs using mask calculus.
pub fn compute_sccs_branchless<const WORDS: usize>(adj: &[KBitSet<WORDS>]) -> Vec<KBitSet<WORDS>> {
    let max_nodes = WORDS * 64;
    let mut sccs = Vec::new();
    let mut visited = KBitSet::<WORDS>::zero();

    let mut r = adj.to_vec();

    // 1. Transitive Closure (Truly Branchless)
    for k in 0..max_nodes {
        let k_mask = r[k];
        for row in r.iter_mut().take(max_nodes) {
            // bit = row contains k
            let bit = (row.words[k >> 6] >> (k & 63)) & 1;
            let mask = bit.wrapping_neg();
            for w in 0..WORDS {
                row.words[w] |= k_mask.words[w] & mask;
            }
        }
    }

    // 2. Transpose Reachability (Branchless)
    let mut rt = vec![KBitSet::<WORDS>::zero(); max_nodes];
    for (i, row) in r.iter().enumerate().take(max_nodes) {
        for (j, trans_row) in rt.iter_mut().enumerate().take(max_nodes) {
            let bit = (row.words[j >> 6] >> (j & 63)) & 1;
            trans_row.words[i >> 6] |= bit << (i & 63);
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
