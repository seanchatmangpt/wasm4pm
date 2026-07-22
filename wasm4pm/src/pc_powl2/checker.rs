use super::*;

pub struct PcPowl2Checker<'a, D: FiniteStateDomain> {
    pub(super) domain: &'a D,
}

impl<'a, D: FiniteStateDomain> PcPowl2Checker<'a, D> {
    pub fn new(domain: &'a D) -> Self {
        Self { domain }
    }

    fn admitted_states(&self, maximum: usize) -> PcpResult<Vec<D::State>> {
        let states = self.domain.states();
        if states.is_empty() {
            return Err(PcpRefusal::DomainStateSpaceEmpty);
        }
        if states.len() > maximum {
            return Err(PcpRefusal::DomainStateBoundExceeded {
                actual: states.len(),
                maximum,
            });
        }
        let unique: HashSet<_> = states.iter().cloned().collect();
        if unique.len() != states.len() {
            return Err(PcpRefusal::DomainDigestMismatch);
        }
        Ok(states)
    }

    fn admitted_domain_digest(&self, states: &[D::State]) -> PcpResult<String> {
        let mut state_digests = states
            .iter()
            .map(canonical_digest)
            .collect::<PcpResult<Vec<_>>>()?;
        state_digests.sort();
        canonical_digest(&(self.domain.domain_digest(), state_digests))
    }

    /// Authoring helper. It binds the certificate to the admitted finite state
    /// space but does not itself confer standing; `verify` remains mandatory.
    pub fn bind_certificate(&self, certificate: &mut CertifiedPowl) -> PcpResult<()> {
        let states = self.admitted_states(certificate.bounds.max_states)?;
        certificate.domain_digest = self.admitted_domain_digest(&states)?;
        certificate.model_digest = canonical_digest(&certificate.model)?;
        certificate.proof_digest = canonical_digest(&certificate.proof)?;
        certificate.validate_shape()
    }

    pub fn verify(&self, certificate: &CertifiedPowl) -> PcpResult<VerificationReport> {
        certificate.validate_shape()?;
        let states = self.admitted_states(certificate.bounds.max_states)?;
        let domain_digest = self.admitted_domain_digest(&states)?;
        if certificate.domain_digest != domain_digest {
            return Err(PcpRefusal::DomainDigestMismatch);
        }
        let model_digest = canonical_digest(&certificate.model)?;
        if certificate.model_digest != model_digest {
            return Err(PcpRefusal::ModelDigestMismatch);
        }
        let proof_digest = canonical_digest(&certificate.proof)?;
        if certificate.proof_digest != proof_digest {
            return Err(PcpRefusal::ProofDigestMismatch);
        }

        let (root_pre, _) = certificate.proof.contract();
        if !self.assertion_inhabited(root_pre, &states)? {
            return Err(PcpRefusal::InitialEvidenceMissing);
        }
        self.verify_term(certificate, &certificate.proof, &states, 1)?;

        let standing = match certificate.claim {
            CertificateClaim::FiniteTraceSafety => VerificationStanding::FiniteTraceSafety,
            CertificateClaim::TotalCorrectness => VerificationStanding::TotalCorrectness,
        };
        Ok(VerificationReport {
            admitted: true,
            standing,
            checked_states: states.len(),
            domain_digest,
            model_digest,
            proof_digest,
        })
    }

    fn assertion_inhabited(
        &self,
        assertion: &AssertionRef,
        states: &[D::State],
    ) -> PcpResult<bool> {
        for state in states {
            if self.domain.holds(assertion, state)? {
                return Ok(true);
            }
        }
        Ok(false)
    }

    fn verify_term(
        &self,
        certificate: &CertifiedPowl,
        proof: &ProofTerm,
        states: &[D::State],
        depth: usize,
    ) -> PcpResult<()> {
        if depth > certificate.bounds.max_proof_depth {
            return Err(PcpRefusal::ProofDepthExceeded {
                actual: depth,
                maximum: certificate.bounds.max_proof_depth,
            });
        }
        let node = model_node(&certificate.model, proof.node())?;
        match proof {
            ProofTerm::Boundary { assertion, .. } => {
                if !matches!(
                    &node.kind,
                    PowlNodeKind::Start | PowlNodeKind::End | PowlNodeKind::Silent
                ) {
                    return Err(PcpRefusal::RuleDoesNotMatchNode { node: node.id });
                }
                if !self.assertion_inhabited(assertion, states)? {
                    return Err(PcpRefusal::CanonicalContractFailed { node: node.id });
                }
            }
            ProofTerm::Atom { pre, post, .. } => {
                let PowlNodeKind::Atom(action) = &node.kind else {
                    return Err(PcpRefusal::RuleDoesNotMatchNode { node: node.id });
                };
                let mut applicable = 0usize;
                for state in states {
                    if !self.domain.holds(pre, state)? {
                        continue;
                    }
                    applicable += 1;
                    let next = self.domain.step(action, state).map_err(|reason| {
                        PcpRefusal::ActionRefused {
                            node: node.id,
                            reason,
                        }
                    })?;
                    if !states.contains(&next) || !self.domain.holds(post, &next)? {
                        return Err(PcpRefusal::AtomicContractFailed { node: node.id });
                    }
                }
                if applicable == 0 {
                    return Err(PcpRefusal::AtomicContractFailed { node: node.id });
                }
            }
            ProofTerm::Consequence {
                pre,
                post,
                inner_pre,
                inner_post,
                inner,
                ..
            } => {
                if proof.node() != inner.node() || inner.contract() != (inner_pre, inner_post) {
                    return Err(PcpRefusal::ProofNodeMismatch {
                        expected: proof.node(),
                        actual: inner.node(),
                    });
                }
                if !self.assertion_inhabited(pre, states)? {
                    return Err(PcpRefusal::ConsequencePreconditionFailed { node: node.id });
                }
                self.verify_term(certificate, inner, states, depth + 1)?;
                for state in states {
                    if self.domain.holds(pre, state)? && !self.domain.holds(inner_pre, state)? {
                        return Err(PcpRefusal::ConsequencePreconditionFailed { node: node.id });
                    }
                    if self.domain.holds(inner_post, state)? && !self.domain.holds(post, state)? {
                        return Err(PcpRefusal::ConsequencePostconditionFailed { node: node.id });
                    }
                }
            }
            ProofTerm::PartialOrder {
                pre,
                post,
                canonical,
                children,
                commutations,
                ..
            } => {
                let PowlNodeKind::PartialOrder(model_children) = &node.kind else {
                    return Err(PcpRefusal::RuleDoesNotMatchNode { node: node.id });
                };
                let child_map = proof_map(children);
                let model_set: HashSet<_> = model_children.iter().copied().collect();
                let proof_set: HashSet<_> = child_map.keys().copied().collect();
                if model_set != proof_set {
                    return Err(PcpRefusal::CanonicalCoverageMismatch {
                        node: node.id,
                        canonical: model_set.len(),
                        children: proof_set.len(),
                    });
                }
                for child in children {
                    self.verify_term(certificate, child, states, depth + 1)?;
                }

                let expected: HashSet<_> = incomparable_pairs(&certificate.model, model_children)
                    .into_iter()
                    .collect();
                let declared: HashSet<_> = commutations
                    .iter()
                    .map(|witness| ordered_pair(witness.left, witness.right))
                    .collect();
                if let Some((left, right)) = expected.difference(&declared).next().copied() {
                    return Err(PcpRefusal::MissingCommutationWitness { left, right });
                }
                if let Some((left, right)) = declared.difference(&expected).next().copied() {
                    return Err(PcpRefusal::InvalidCommutationWitness { left, right });
                }
                for (left, right) in &expected {
                    let left_proof = child_map
                        .get(left)
                        .copied()
                        .ok_or(PcpRefusal::UnknownNode { node: *left })?;
                    let right_proof = child_map
                        .get(right)
                        .copied()
                        .ok_or(PcpRefusal::UnknownNode { node: *right })?;
                    let mut inhabited_context = false;
                    for state in states {
                        let left_then_right =
                            self.compose_terms(certificate, left_proof, right_proof, state)?;
                        let right_then_left =
                            self.compose_terms(certificate, right_proof, left_proof, state)?;
                        if left_then_right != right_then_left {
                            return Err(PcpRefusal::IndependentActionsDoNotCommute {
                                left: *left,
                                right: *right,
                            });
                        }
                        inhabited_context |= !left_then_right.is_empty();
                    }
                    if !inhabited_context {
                        return Err(PcpRefusal::InvalidCommutationWitness {
                            left: *left,
                            right: *right,
                        });
                    }
                }

                let orders = self.topological_orders(
                    &certificate.model,
                    model_children,
                    certificate.bounds.max_choice_visits,
                )?;
                if !orders.iter().any(|order| order == canonical) {
                    return Err(PcpRefusal::CanonicalOrderInvalid { node: node.id });
                }
                let mut applicable = 0usize;
                for state in states {
                    if !self.domain.holds(pre, state)? {
                        continue;
                    }
                    applicable += 1;
                    for order in &orders {
                        let outputs =
                            self.compose_nodes(certificate, &child_map, order, state, &mut 0)?;
                        if outputs.is_empty() {
                            return Err(PcpRefusal::CanonicalContractFailed { node: node.id });
                        }
                        for output in &outputs {
                            if !self.domain.holds(post, output)? {
                                return Err(PcpRefusal::CanonicalContractFailed { node: node.id });
                            }
                        }
                    }
                }
                if applicable == 0 {
                    return Err(PcpRefusal::CanonicalContractFailed { node: node.id });
                }
            }
            ProofTerm::ChoiceGraph {
                pre,
                post,
                nodes,
                edges,
                cycle,
                ..
            } => {
                let PowlNodeKind::ChoiceGraph {
                    nodes: graph_nodes,
                    edges: graph_edges,
                } = &node.kind
                else {
                    return Err(PcpRefusal::RuleDoesNotMatchNode { node: node.id });
                };
                let (start, finish) = choice_terminals(&certificate.model, graph_nodes)?;
                let contracts: HashMap<_, _> =
                    nodes.iter().map(|entry| (entry.node, entry)).collect();
                let graph_set: HashSet<_> = graph_nodes.iter().copied().collect();
                let contract_set: HashSet<_> = contracts.keys().copied().collect();
                if graph_set != contract_set {
                    return Err(PcpRefusal::GraphContractCoverageMismatch { node: node.id });
                }
                let start_contract = contracts
                    .get(&start)
                    .ok_or(PcpRefusal::GraphContractCoverageMismatch { node: node.id })?;
                let finish_contract = contracts
                    .get(&finish)
                    .ok_or(PcpRefusal::GraphContractCoverageMismatch { node: node.id })?;
                if &start_contract.before != pre || &finish_contract.after != post {
                    return Err(PcpRefusal::GraphContractCoverageMismatch { node: node.id });
                }

                for contract in nodes {
                    if contract.proof.contract() != (&contract.before, &contract.after)
                        || !self.assertion_inhabited(&contract.before, states)?
                    {
                        return Err(PcpRefusal::GraphContractCoverageMismatch {
                            node: contract.node,
                        });
                    }
                    self.verify_term(certificate, &contract.proof, states, depth + 1)?;
                }

                let declared_edges: HashSet<_> =
                    edges.iter().map(|edge| (edge.from, edge.to)).collect();
                let model_edges: HashSet<_> = graph_edges
                    .iter()
                    .map(|edge| (edge.from, edge.to))
                    .collect();
                if declared_edges != model_edges {
                    let (from, to) = model_edges
                        .difference(&declared_edges)
                        .next()
                        .copied()
                        .unwrap_or((start, finish));
                    return Err(PcpRefusal::GraphEdgeContractMissing { from, to });
                }
                for edge in graph_edges {
                    let from = contracts
                        .get(&edge.from)
                        .ok_or(PcpRefusal::UnknownNode { node: edge.from })?;
                    let to = contracts
                        .get(&edge.to)
                        .ok_or(PcpRefusal::UnknownNode { node: edge.to })?;
                    for state in states {
                        if self.domain.holds(&from.after, state)?
                            && !self.domain.holds(&to.before, state)?
                        {
                            return Err(PcpRefusal::GraphEdgeBridgeFailed {
                                from: edge.from,
                                to: edge.to,
                            });
                        }
                    }
                }

                let cycle_edges = cyclic_edges(graph_edges);
                match cycle {
                    CycleWitness::Acyclic => {
                        if !cycle_edges.is_empty() {
                            return Err(PcpRefusal::ChoiceGraphCycleContradictsAcyclicWitness {
                                node: node.id,
                            });
                        }
                    }
                    CycleWitness::Invariant { invariant } => {
                        self.verify_invariant(certificate, nodes, invariant, states)?;
                        if certificate.claim == CertificateClaim::TotalCorrectness
                            && !cycle_edges.is_empty()
                        {
                            return Err(PcpRefusal::CycleTerminationUnproved { node: node.id });
                        }
                    }
                    CycleWitness::Variant { invariant, variant } => {
                        self.verify_invariant(certificate, nodes, invariant, states)?;
                        self.verify_variant(
                            certificate,
                            &contracts,
                            &cycle_edges,
                            invariant,
                            variant,
                            states,
                        )?;
                    }
                }

                let mut applicable = 0usize;
                for state in states {
                    if !self.domain.holds(pre, state)? {
                        continue;
                    }
                    applicable += 1;
                    let outputs = self.outputs_for_term(certificate, proof, state, &mut 0)?;
                    if outputs.is_empty() {
                        return Err(PcpRefusal::CanonicalContractFailed { node: node.id });
                    }
                    for output in &outputs {
                        if !self.domain.holds(post, output)? {
                            return Err(PcpRefusal::CanonicalContractFailed { node: node.id });
                        }
                    }
                }
                if applicable == 0 {
                    return Err(PcpRefusal::CanonicalContractFailed { node: node.id });
                }
            }
        }
        Ok(())
    }

    fn verify_invariant(
        &self,
        certificate: &CertifiedPowl,
        nodes: &[GraphNodeProof],
        invariant: &AssertionRef,
        states: &[D::State],
    ) -> PcpResult<()> {
        let mut applicable = 0usize;
        for node in nodes {
            for state in states {
                if !self.domain.holds(invariant, state)?
                    || !self.domain.holds(&node.before, state)?
                {
                    continue;
                }
                applicable += 1;
                let outputs = self.outputs_for_term(certificate, &node.proof, state, &mut 0)?;
                if outputs.is_empty() {
                    return Err(PcpRefusal::CycleInvariantFailed { node: node.node });
                }
                for output in outputs {
                    if !self.domain.holds(invariant, &output)? {
                        return Err(PcpRefusal::CycleInvariantFailed { node: node.node });
                    }
                }
            }
        }
        if applicable == 0 {
            let node = nodes.first().map(|node| node.node).unwrap_or(PowlNodeId(0));
            return Err(PcpRefusal::CycleInvariantFailed { node });
        }
        Ok(())
    }

    fn verify_variant(
        &self,
        certificate: &CertifiedPowl,
        contracts: &HashMap<PowlNodeId, &GraphNodeProof>,
        edges: &[ChoiceGraphEdge],
        invariant: &AssertionRef,
        variant: &VariantRef,
        states: &[D::State],
    ) -> PcpResult<()> {
        for edge in edges {
            let source = contracts
                .get(&edge.from)
                .ok_or(PcpRefusal::UnknownNode { node: edge.from })?;
            let target = contracts
                .get(&edge.to)
                .ok_or(PcpRefusal::UnknownNode { node: edge.to })?;
            let mut applicable = 0usize;
            for state in states {
                if !self.domain.holds(invariant, state)?
                    || !self.domain.holds(&source.after, state)?
                    || !self.domain.holds(&target.before, state)?
                {
                    continue;
                }
                applicable += 1;
                let before = self.domain.variant(variant, state)?;
                let outputs = self.outputs_for_term(certificate, &target.proof, state, &mut 0)?;
                if outputs.is_empty() {
                    return Err(PcpRefusal::CycleVariantDidNotDecrease {
                        from: edge.from,
                        to: edge.to,
                    });
                }
                for output in outputs {
                    let after = self.domain.variant(variant, &output)?;
                    if after >= before || !self.domain.holds(invariant, &output)? {
                        return Err(PcpRefusal::CycleVariantDidNotDecrease {
                            from: edge.from,
                            to: edge.to,
                        });
                    }
                }
            }
            if applicable == 0 {
                return Err(PcpRefusal::CycleVariantDidNotDecrease {
                    from: edge.from,
                    to: edge.to,
                });
            }
        }
        Ok(())
    }

    fn topological_orders(
        &self,
        model: &Powl,
        children: &[PowlNodeId],
        maximum: usize,
    ) -> PcpResult<Vec<Vec<PowlNodeId>>> {
        fn visit(
            remaining: &mut Vec<PowlNodeId>,
            prefix: &mut Vec<PowlNodeId>,
            edges: &[OrderEdge],
            maximum: usize,
            orders: &mut Vec<Vec<PowlNodeId>>,
        ) -> PcpResult<()> {
            if remaining.is_empty() {
                orders.push(prefix.clone());
                if orders.len() > maximum {
                    return Err(PcpRefusal::ChoiceVisitBoundExceeded {
                        actual: orders.len(),
                        maximum,
                    });
                }
                return Ok(());
            }
            let available: Vec<_> = remaining
                .iter()
                .copied()
                .filter(|candidate| {
                    !edges
                        .iter()
                        .any(|edge| edge.to == *candidate && remaining.contains(&edge.from))
                })
                .collect();
            if available.is_empty() {
                return Err(PcpRefusal::CanonicalOrderInvalid {
                    node: prefix.first().copied().unwrap_or(PowlNodeId(0)),
                });
            }
            for candidate in available {
                let Some(index) = remaining.iter().position(|node| *node == candidate) else {
                    return Err(PcpRefusal::CanonicalOrderInvalid { node: candidate });
                };
                remaining.remove(index);
                prefix.push(candidate);
                visit(remaining, prefix, edges, maximum, orders)?;
                prefix.pop();
                remaining.insert(index, candidate);
            }
            Ok(())
        }

        let mut remaining = children.to_vec();
        let mut orders = Vec::new();
        visit(
            &mut remaining,
            &mut Vec::new(),
            &partial_edges(model, children),
            maximum,
            &mut orders,
        )?;
        Ok(orders)
    }

    fn compose_nodes(
        &self,
        certificate: &CertifiedPowl,
        proofs: &HashMap<PowlNodeId, &ProofTerm>,
        order: &[PowlNodeId],
        state: &D::State,
        visits: &mut usize,
    ) -> PcpResult<HashSet<D::State>> {
        let mut current = HashSet::from([state.clone()]);
        for node in order {
            let proof = proofs
                .get(node)
                .copied()
                .ok_or(PcpRefusal::UnknownNode { node: *node })?;
            let mut next = HashSet::new();
            for state in current {
                next.extend(self.outputs_for_term(certificate, proof, &state, visits)?);
            }
            current = next;
        }
        Ok(current)
    }

    fn outputs_for_term(
        &self,
        certificate: &CertifiedPowl,
        proof: &ProofTerm,
        state: &D::State,
        visits: &mut usize,
    ) -> PcpResult<HashSet<D::State>> {
        *visits += 1;
        if *visits > certificate.bounds.max_choice_visits {
            return Err(PcpRefusal::ChoiceVisitBoundExceeded {
                actual: *visits,
                maximum: certificate.bounds.max_choice_visits,
            });
        }
        let (pre, post) = proof.contract();
        if !self.domain.holds(pre, state)? {
            return Ok(HashSet::new());
        }
        let node = model_node(&certificate.model, proof.node())?;
        let outputs = match proof {
            ProofTerm::Boundary { .. } => HashSet::from([state.clone()]),
            ProofTerm::Atom { .. } => {
                let PowlNodeKind::Atom(action) = &node.kind else {
                    return Err(PcpRefusal::RuleDoesNotMatchNode { node: node.id });
                };
                let next = self.domain.step(action, state).map_err(|reason| {
                    PcpRefusal::ActionRefused {
                        node: node.id,
                        reason,
                    }
                })?;
                HashSet::from([next])
            }
            ProofTerm::Consequence { inner, .. } => {
                self.outputs_for_term(certificate, inner, state, visits)?
            }
            ProofTerm::PartialOrder {
                canonical,
                children,
                ..
            } => self.compose_nodes(certificate, &proof_map(children), canonical, state, visits)?,
            ProofTerm::ChoiceGraph { nodes, .. } => {
                let PowlNodeKind::ChoiceGraph {
                    nodes: graph_nodes,
                    edges,
                } = &node.kind
                else {
                    return Err(PcpRefusal::RuleDoesNotMatchNode { node: node.id });
                };
                let (start, finish) = choice_terminals(&certificate.model, graph_nodes)?;
                let contracts: HashMap<_, _> =
                    nodes.iter().map(|entry| (entry.node, entry)).collect();
                let adjacency = graph_adjacency(edges);
                let mut queue = VecDeque::from([(start, state.clone())]);
                let mut seen = HashSet::new();
                let mut outputs = HashSet::new();
                while let Some((current_node, current_state)) = queue.pop_front() {
                    if !seen.insert((current_node, current_state.clone())) {
                        continue;
                    }
                    *visits += 1;
                    if *visits > certificate.bounds.max_choice_visits {
                        return Err(PcpRefusal::ChoiceVisitBoundExceeded {
                            actual: *visits,
                            maximum: certificate.bounds.max_choice_visits,
                        });
                    }
                    let contract = contracts
                        .get(&current_node)
                        .ok_or(PcpRefusal::UnknownNode { node: current_node })?;
                    let node_outputs = self.outputs_for_term(
                        certificate,
                        &contract.proof,
                        &current_state,
                        visits,
                    )?;
                    for output in node_outputs {
                        if current_node == finish {
                            outputs.insert(output);
                        } else if let Some(next_nodes) = adjacency.get(&current_node) {
                            for next in next_nodes {
                                queue.push_back((*next, output.clone()));
                            }
                        }
                    }
                }
                outputs
            }
        };
        for output in &outputs {
            if !self.domain.holds(post, output)? {
                return Err(match proof {
                    ProofTerm::Atom { .. } => PcpRefusal::AtomicContractFailed { node: node.id },
                    _ => PcpRefusal::CanonicalContractFailed { node: node.id },
                });
            }
        }
        Ok(outputs)
    }

    pub fn validate_selection(
        &self,
        certificate: &CertifiedPowl,
        selection: &ExecutionSelection,
    ) -> PcpResult<Vec<PowlNodeId>> {
        let depth = selection.depth();
        if depth > certificate.bounds.max_selection_depth {
            return Err(PcpRefusal::SelectionDepthExceeded {
                actual: depth,
                maximum: certificate.bounds.max_selection_depth,
            });
        }
        let mut atoms = Vec::new();
        self.validate_selection_inner(certificate, &certificate.proof, selection, &mut atoms, 1)?;
        if atoms.len() > certificate.bounds.max_trace_steps {
            return Err(PcpRefusal::TraceStepBoundExceeded {
                actual: atoms.len(),
                maximum: certificate.bounds.max_trace_steps,
            });
        }
        Ok(atoms)
    }

    fn validate_selection_inner(
        &self,
        certificate: &CertifiedPowl,
        proof: &ProofTerm,
        selection: &ExecutionSelection,
        atoms: &mut Vec<PowlNodeId>,
        visits: usize,
    ) -> PcpResult<()> {
        if visits > certificate.bounds.max_choice_visits || selection.node() != proof.node() {
            return Err(PcpRefusal::SelectionNotAdmitted {
                node: selection.node(),
            });
        }
        let node = model_node(&certificate.model, selection.node())?;
        match proof {
            ProofTerm::Consequence { inner, .. } => {
                self.validate_selection_inner(certificate, inner, selection, atoms, visits)
            }
            ProofTerm::Boundary { .. } => match selection {
                ExecutionSelection::Boundary { .. }
                    if matches!(
                        &node.kind,
                        PowlNodeKind::Start | PowlNodeKind::End | PowlNodeKind::Silent
                    ) =>
                {
                    Ok(())
                }
                _ => Err(PcpRefusal::SelectionNotAdmitted { node: node.id }),
            },
            ProofTerm::Atom { .. } => match selection {
                ExecutionSelection::Atom { .. } if matches!(&node.kind, PowlNodeKind::Atom(_)) => {
                    atoms.push(node.id);
                    Ok(())
                }
                _ => Err(PcpRefusal::SelectionNotAdmitted { node: node.id }),
            },
            ProofTerm::PartialOrder {
                children: proofs, ..
            } => {
                let ExecutionSelection::PartialOrder { children, .. } = selection else {
                    return Err(PcpRefusal::SelectionNotAdmitted { node: node.id });
                };
                let PowlNodeKind::PartialOrder(model_children) = &node.kind else {
                    return Err(PcpRefusal::SelectionNotAdmitted { node: node.id });
                };
                let order: Vec<_> = children.iter().map(ExecutionSelection::node).collect();
                if !is_topological_order(&certificate.model, model_children, &order) {
                    return Err(PcpRefusal::SelectionNotAdmitted { node: node.id });
                }
                let proof_map = proof_map(proofs);
                for child in children {
                    let child_proof = proof_map
                        .get(&child.node())
                        .copied()
                        .ok_or(PcpRefusal::SelectionNotAdmitted { node: child.node() })?;
                    self.validate_selection_inner(
                        certificate,
                        child_proof,
                        child,
                        atoms,
                        visits + 1,
                    )?;
                }
                Ok(())
            }
            ProofTerm::ChoiceGraph { nodes: proofs, .. } => {
                let ExecutionSelection::ChoicePath { path, .. } = selection else {
                    return Err(PcpRefusal::SelectionNotAdmitted { node: node.id });
                };
                let PowlNodeKind::ChoiceGraph {
                    nodes: graph_nodes,
                    edges,
                } = &node.kind
                else {
                    return Err(PcpRefusal::SelectionNotAdmitted { node: node.id });
                };
                let (start, finish) = choice_terminals(&certificate.model, graph_nodes)?;
                let ids: Vec<_> = path.iter().map(ExecutionSelection::node).collect();
                if ids.first().copied() != Some(start) || ids.last().copied() != Some(finish) {
                    return Err(PcpRefusal::SelectionNotAdmitted { node: node.id });
                }
                for pair in ids.windows(2) {
                    if !edges
                        .iter()
                        .any(|edge| edge.from == pair[0] && edge.to == pair[1])
                    {
                        return Err(PcpRefusal::SelectionNotAdmitted { node: node.id });
                    }
                }
                let proof_map: HashMap<_, _> = proofs
                    .iter()
                    .map(|entry| (entry.node, entry.proof.as_ref()))
                    .collect();
                for child in path {
                    let child_proof = proof_map
                        .get(&child.node())
                        .copied()
                        .ok_or(PcpRefusal::SelectionNotAdmitted { node: child.node() })?;
                    self.validate_selection_inner(
                        certificate,
                        child_proof,
                        child,
                        atoms,
                        visits + 1,
                    )?;
                }
                Ok(())
            }
        }
    }

    pub(super) fn execute_selection(
        &self,
        certificate: &CertifiedPowl,
        selection: &ExecutionSelection,
        initial: &D::State,
    ) -> PcpResult<(D::State, Vec<ObservedStep>)> {
        let mut actuator = ModelActuator;
        self.execute_selection_with(certificate, selection, initial, &mut actuator)
    }

    pub(super) fn execute_selection_with<A: PcPowl2Actuator<D>>(
        &self,
        certificate: &CertifiedPowl,
        selection: &ExecutionSelection,
        initial: &D::State,
        actuator: &mut A,
    ) -> PcpResult<(D::State, Vec<ObservedStep>)> {
        let nodes = self.validate_selection(certificate, selection)?;
        let states = self.admitted_states(certificate.bounds.max_states)?;
        let mut proofs = HashMap::new();
        collect_proofs(&certificate.proof, &mut proofs);
        let mut state = initial.clone();
        let mut observed = Vec::with_capacity(nodes.len());
        for (ordinal, node_id) in nodes.into_iter().enumerate() {
            let node = model_node(&certificate.model, node_id)?;
            let PowlNodeKind::Atom(action) = &node.kind else {
                return Err(PcpRefusal::SelectionNotAdmitted { node: node_id });
            };
            let proof = proofs
                .get(&node_id)
                .copied()
                .ok_or(PcpRefusal::SelectionNotAdmitted { node: node_id })?;
            let (pre, post) = proof.contract();
            if !self.domain.holds(pre, &state)? {
                return Err(PcpRefusal::InitialEvidenceMissing);
            }
            let before_digest = canonical_digest(&state)?;
            let expected =
                self.domain
                    .step(action, &state)
                    .map_err(|reason| PcpRefusal::ActionRefused {
                        node: node_id,
                        reason,
                    })?;
            let next = actuator
                .actuate(action, &state, &expected)
                .map_err(|reason| PcpRefusal::ActionRefused {
                    node: node_id,
                    reason,
                })?;
            if next != expected {
                return Err(PcpRefusal::ActionRefused {
                    node: node_id,
                    reason: "ActuatorRefinementMismatch".to_string(),
                });
            }
            if !states.contains(&next) || !self.domain.holds(post, &next)? {
                return Err(PcpRefusal::FinalGoalNotObserved);
            }
            let after_digest = canonical_digest(&next)?;
            observed.push(ObservedStep {
                ordinal,
                node: node_id,
                action: action.clone(),
                before_digest,
                after_digest,
            });
            state = next;
        }
        Ok((state, observed))
    }
}
