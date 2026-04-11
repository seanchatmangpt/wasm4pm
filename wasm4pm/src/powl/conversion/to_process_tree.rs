/// Convert a POWL model to a process tree.
use crate::powl_arena::{Operator, PowlArena, PowlNode};
use crate::powl_process_tree::{ProcessTree, PtOperator};

struct Dag {
    n: usize,
    adj: Vec<Vec<usize>>,
}

impl Dag {
    fn new(n: usize) -> Self {
        Dag {
            n,
            adj: vec![Vec::new(); n],
        }
    }

    fn add_edge(&mut self, from: usize, to: usize) {
        self.adj[from].push(to);
    }

    fn in_degrees(&self) -> Vec<usize> {
        let mut deg = vec![0usize; self.n];
        for i in 0..self.n {
            for &j in &self.adj[i] {
                deg[j] += 1;
            }
        }
        deg
    }

    fn assign_levels(&self) -> Vec<usize> {
        let in_deg = self.in_degrees();
        let mut levels = vec![usize::MAX; self.n];
        let mut queue = std::collections::VecDeque::new();
        for i in 0..self.n {
            if in_deg[i] == 0 {
                levels[i] = 0;
                queue.push_back(i);
            }
        }
        while let Some(cur) = queue.pop_front() {
            let next_level = levels[cur] + 1;
            for &succ in &self.adj[cur] {
                if levels[succ] == usize::MAX {
                    levels[succ] = next_level;
                    queue.push_back(succ);
                }
            }
        }
        levels
    }

    fn transitive_reduction(&self) -> Dag {
        let n = self.n;
        let reachable = {
            let mut reach = vec![vec![false; n]; n];
            for (start, adj_row) in self.adj.iter().enumerate() {
                let mut visited = vec![false; n];
                let mut stack = Vec::new();
                for &succ in adj_row {
                    stack.push(succ);
                }
                while let Some(cur) = stack.pop() {
                    if visited[cur] {
                        continue;
                    }
                    visited[cur] = true;
                    reach[start][cur] = true;
                    for &succ in &self.adj[cur] {
                        stack.push(succ);
                    }
                }
            }
            reach
        };
        let mut red = Dag::new(n);
        for i in 0..n {
            for &j in &self.adj[i] {
                let redundant = self.adj[i].iter().any(|&k| k != j && reachable[k][j]);
                if !redundant {
                    red.add_edge(i, j);
                }
            }
        }
        red
    }

    fn undirected_components(&self) -> Vec<Vec<usize>> {
        let mut visited = vec![false; self.n];
        let mut components: Vec<Vec<usize>> = Vec::new();
        for start in 0..self.n {
            if visited[start] {
                continue;
            }
            let mut comp = Vec::new();
            let mut queue = std::collections::VecDeque::new();
            queue.push_back(start);
            visited[start] = true;
            while let Some(cur) = queue.pop_front() {
                comp.push(cur);
                for &j in &self.adj[cur] {
                    if !visited[j] {
                        visited[j] = true;
                        queue.push_back(j);
                    }
                }
                for (i, row) in self.adj.iter().enumerate() {
                    if !visited[i] && row.contains(&cur) {
                        visited[i] = true;
                        queue.push_back(i);
                    }
                }
            }
            components.push(comp);
        }
        components
    }
}

pub fn apply_recursive(arena: &PowlArena, node_idx: u32) -> ProcessTree {
    match arena.get(node_idx) {
        None => ProcessTree::leaf(None),
        Some(PowlNode::Transition(t)) => ProcessTree::leaf(t.label.clone()),
        Some(PowlNode::FrequentTransition(t)) => ProcessTree::leaf(Some(t.label.clone())),
        Some(PowlNode::OperatorPowl(op)) => {
            let pt_op = match op.operator {
                Operator::Xor => PtOperator::Xor,
                Operator::Loop => PtOperator::Loop,
                Operator::PartialOrder => PtOperator::Sequence,
            };
            let children: Vec<ProcessTree> = op
                .children
                .iter()
                .map(|&c| apply_recursive(arena, c))
                .collect();
            ProcessTree::internal(pt_op, children)
        }
        Some(PowlNode::StrictPartialOrder(spo)) => {
            let n = spo.children.len();
            if n == 0 {
                return ProcessTree::leaf(None);
            }
            if n == 1 {
                return apply_recursive(arena, spo.children[0]);
            }
            let mut dag = Dag::new(n);
            for i in 0..n {
                for j in 0..n {
                    if spo.order.is_edge(i, j) {
                        dag.add_edge(i, j);
                    }
                }
            }
            let dag = dag.transitive_reduction();
            let components = dag.undirected_components();
            let mut component_trees: Vec<ProcessTree> = Vec::new();
            for comp in &components {
                if comp.len() == 1 {
                    let child_idx = spo.children[comp[0]];
                    component_trees.push(apply_recursive(arena, child_idx));
                    continue;
                }
                let local_to_global: Vec<usize> = comp.clone();
                let global_to_local: Vec<Option<usize>> = {
                    let mut g2l = vec![None; n];
                    for (li, &gi) in local_to_global.iter().enumerate() {
                        g2l[gi] = Some(li);
                    }
                    g2l
                };
                let m = comp.len();
                let mut sub_dag = Dag::new(m);
                for (li, &gi) in local_to_global.iter().enumerate() {
                    for &succ_gi in &dag.adj[gi] {
                        if let Some(succ_li) = global_to_local[succ_gi] {
                            sub_dag.add_edge(li, succ_li);
                        }
                    }
                }
                let levels_map = sub_dag.assign_levels();
                let max_level = *levels_map.iter().max().unwrap_or(&0);
                let mut level_groups: Vec<Vec<usize>> = vec![Vec::new(); max_level + 1];
                for (li, &lv) in levels_map.iter().enumerate() {
                    if lv != usize::MAX {
                        level_groups[lv].push(li);
                    }
                }
                let mut level_trees: Vec<ProcessTree> = Vec::new();
                for group in &level_groups {
                    if group.is_empty() {
                        continue;
                    }
                    let sub_trees: Vec<ProcessTree> = group
                        .iter()
                        .map(|&li| apply_recursive(arena, spo.children[local_to_global[li]]))
                        .collect();
                    if sub_trees.len() == 1 {
                        level_trees.push(sub_trees.into_iter().next().unwrap());
                    } else {
                        level_trees.push(ProcessTree::internal(PtOperator::Parallel, sub_trees));
                    }
                }
                let subtree = if level_trees.len() == 1 {
                    level_trees.into_iter().next().unwrap()
                } else {
                    ProcessTree::internal(PtOperator::Sequence, level_trees)
                };
                component_trees.push(subtree);
            }
            if component_trees.len() == 1 {
                component_trees.into_iter().next().unwrap()
            } else {
                ProcessTree::internal(PtOperator::Parallel, component_trees)
            }
        }

        Some(PowlNode::DecisionGraph(dg)) => {
            // Treat as StrictPartialOrder for process tree conversion
            // DecisionGraph has the same children+order structure
            let n = dg.children.len();
            if n == 0 {
                return ProcessTree::leaf(None);
            }
            if n == 1 {
                return apply_recursive(arena, dg.children[0]);
            }
            let mut dag = Dag::new(n);
            for i in 0..n {
                for j in 0..n {
                    if dg.order.is_edge(i, j) {
                        dag.add_edge(i, j);
                    }
                }
            }
            let dag = dag.transitive_reduction();
            let components = dag.undirected_components();
            let mut component_trees: Vec<ProcessTree> = Vec::new();
            for comp in &components {
                if comp.len() == 1 {
                    let child_idx = dg.children[comp[0]];
                    component_trees.push(apply_recursive(arena, child_idx));
                    continue;
                }
                let local_to_global: Vec<usize> = comp.clone();
                let global_to_local: Vec<Option<usize>> = {
                    let mut g2l = vec![None; n];
                    for (li, &gi) in local_to_global.iter().enumerate() {
                        g2l[gi] = Some(li);
                    }
                    g2l
                };
                let m = comp.len();
                let mut sub_dag = Dag::new(m);
                for (li, &gi) in local_to_global.iter().enumerate() {
                    for &succ_gi in &dag.adj[gi] {
                        if let Some(succ_li) = global_to_local[succ_gi] {
                            sub_dag.add_edge(li, succ_li);
                        }
                    }
                }
                let levels_map = sub_dag.assign_levels();
                let max_level = *levels_map.iter().max().unwrap_or(&0);
                let mut level_groups: Vec<Vec<usize>> = vec![Vec::new(); max_level + 1];
                for (li, &lv) in levels_map.iter().enumerate() {
                    if lv != usize::MAX {
                        level_groups[lv].push(li);
                    }
                }
                let mut level_trees: Vec<ProcessTree> = Vec::new();
                for group in &level_groups {
                    if group.is_empty() {
                        continue;
                    }
                    let sub_trees: Vec<ProcessTree> = group
                        .iter()
                        .map(|&li| apply_recursive(arena, dg.children[local_to_global[li]]))
                        .collect();
                    if sub_trees.len() == 1 {
                        level_trees.push(sub_trees.into_iter().next().unwrap());
                    } else {
                        level_trees.push(ProcessTree::internal(PtOperator::Parallel, sub_trees));
                    }
                }
                let subtree = if level_trees.len() == 1 {
                    level_trees.into_iter().next().unwrap()
                } else {
                    ProcessTree::internal(PtOperator::Sequence, level_trees)
                };
                component_trees.push(subtree);
            }
            if component_trees.len() == 1 {
                component_trees.into_iter().next().unwrap()
            } else {
                ProcessTree::internal(PtOperator::Parallel, component_trees)
            }
        }
    }
}

pub fn apply(arena: &PowlArena, root: u32) -> ProcessTree {
    apply_recursive(arena, root)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::powl_parser::parse_powl_model_string;

    fn build(s: &str) -> (PowlArena, u32) {
        let mut arena = PowlArena::new();
        let root = parse_powl_model_string(s, &mut arena).unwrap();
        (arena, root)
    }

    #[test]
    fn test_process_tree_leaf() {
        // Happy path: single transition becomes leaf node
        let (arena, root) = build("A");
        let pt = apply(&arena, root);
        assert_eq!(pt.label.as_deref(), Some("A"));
        assert!(pt.operator.is_none());
    }

    #[test]
    fn test_process_tree_operators() {
        // XOR becomes XOR operator
        let (arena, root) = build("X ( A, B )");
        let pt = apply(&arena, root);
        assert_eq!(pt.operator, Some(PtOperator::Xor));
        assert_eq!(pt.children.len(), 2);

        // Loop becomes loop operator
        let (arena, root) = build("* ( A, B )");
        let pt = apply(&arena, root);
        assert_eq!(pt.operator, Some(PtOperator::Loop));
    }

    #[test]
    fn test_process_tree_partial_orders() {
        // Sequential PO becomes sequence
        let (arena, root) = build("PO=(nodes={A, B}, order={A-->B})");
        let pt = apply(&arena, root);
        let repr = pt.to_repr();
        assert!(repr.contains("A") && repr.contains("B"));

        // Concurrent PO becomes parallel
        let (arena, root) = build("PO=(nodes={A, B}, order={})");
        let pt = apply(&arena, root);
        assert_eq!(pt.operator, Some(PtOperator::Parallel));
    }
}
