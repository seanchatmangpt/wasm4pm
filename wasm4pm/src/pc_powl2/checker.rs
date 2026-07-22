use super::*;

pub struct PcPowl2Checker<'a, D: FiniteStateDomain> {
    pub(super) domain: &'a D,
}

impl<'a, D: FiniteStateDomain> PcPowl2Checker<'a, D> {
    pub fn new(domain: &'a D) -> Self {
        Self { domain }
    }

    pub fn bind_certificate(&self, certificate: &mut CertifiedPowl) -> PcpResult<()> {
        certificate.domain_digest = self.domain.domain_digest();
        certificate.model_digest = canonical_digest(&certificate.model)?;
        certificate.proof_digest = canonical_digest(&certificate.proof)?;
        certificate.validate_shape()
    }

    pub fn verify(&self, certificate: &CertifiedPowl) -> PcpResult<VerificationReport> {
        certificate.validate_shape()?;
        if certificate.domain_digest != self.domain.domain_digest() {
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

        let states = self.domain.states();
        if states.is_empty() {
            return Err(PcpRefusal::DomainStateSpaceEmpty);
        }
        if states.len() > certificate.bounds.max_states {
            return Err(PcpRefusal::DomainStateBoundExceeded {
                actual: states.len(),
                maximum: certificate.bounds.max_states,
            });
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
            model_digest,
            proof_digest,
        })
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
                for state in states {
                    let _ = self.domain.holds(assertion, state)?;
                }
            }
            ProofTerm::Atom { pre, post, .. } => {
                let PowlNodeKind::Atom(action) = &node.kind else {
                    return Err(PcpRefusal::RuleDoesNotMatchNode { node: node.id });
                };
                for state in states {
                    let next = self
                        .domain
                        .step(action, state)
                        .map_err(|reason| PcpRefusal::ActionRefused {
                            node: node.id,
                            reason,
                        })?;
                    if !states.contains(&next) {
                        return Err(PcpRefusal::ActionRefused {
                            node: node.id,
                            reason: "DomainStateSpaceNotClosed".to_string(),
                        });
                    }
                    if self.domain.holds(pre, state)? && !self.domain.holds(post, &next)? {
                        return Err(PcpRefusal::AtomicContractFailed { node: node.id });
                    }
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
                if !is_topological_order(&certificate.model, model_children, canonical) {
                    return Err(PcpRefusal::CanonicalOrderInvalid { node: node.id });
                }
                for child in children {
                    self.verify_term(certificate, child, states, depth + 1)?;
                }

                for state in states {
                    if self.domain.holds(pre, state)? {
                        let outputs = self.compose_nodes(
                            certificate,
                            &child_map,
                            canonical,
                            state,
                            &mut 0,
                        )?;
                        if outputs.is_empty() {
                            return Err(PcpRefusal::CanonicalContractFailed { node: node.id });
                        }
                        for output in outputs {
                            if !self.domain.holds(post, &output)? {
                                return Err(PcpRefusal::CanonicalContractFailed { node: node.id });
                            }
                        }
                    }
                }

                let incomparable = incomparable_pairs(&certificate.model, model_children);
                let witnessed: HashSet<_> = commutations
                    .iter()
                    .map(|w| ordered_pair(w.left, w.right))
                    .collect();
                for (left, right) in incomparable {
                    if !witnessed.contains(&ordered_pair(left, right)) {
                        return Err(PcpRefusal::MissingCommutationWitness { left, right });
                    }
                    let left_proof = child_map
                        .get(&left)
                        .copied()
                        .ok_or(PcpRefusal::UnknownNode { node: left })?;
                    let right_proof = child_map
                        .get(&right)
                        .copied()
                        .ok_or(PcpRefusal::UnknownNode { node: right })?;
                    for state in states {
                        let lr = self.compose_terms(certificate, left_proof, right_proof, state)?;
                        let rl = self.compose_terms(certificate, right_proof, left_proof, state)?;
                        if lr != rl {
                            return Err(PcpRefusal::IndependentActionsDoNotCommute {
                                left,
                                right,
                            });
                        }
                    }
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
                let contracts: HashMap<_, _> =
                    nodes.iter().map(|entry| (entry.node, entry)).collect();
                let graph_set: HashSet<_> = graph_nodes.iter().copied().collect();
                let contract_set: HashSet<_> = contracts.keys().copied().collect();
                if graph_set != contract_set {
                    return Err(PcpRefusal::GraphContractCoverageMismatch { node: node.id });
                }

                let start = *graph_nodes
                    .first()
                    .ok_or(PcpRefusal::GraphContractCoverageMismatch { node: node.id })?;
                let finish = *graph_nodes
                    .last()
                    .ok_or(PcpRefusal::GraphContractCoverageMismatch { node: node.id })?;
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
                    if contract.proof.contract() != (&contract.before, &contract.after) {
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
                    let missing = model_edges
                        .difference(&declared_edges)
                        .next()
                        .copied()
                        .unwrap_or((start, finish));
                    return Err(PcpRefusal::GraphEdgeContractMissing {
                        from: missing.0,
                        to: missing.1,
                    });
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

                let cyclic_edges = cyclic_edges(graph_nodes, graph_edges);
                match cycle {
                    CycleWitness::Acyclic => {
                        if !cyclic_edges.is_empty() {
                            return Err(PcpRefusal::ChoiceGraphCycleContradictsAcyclicWitness {
                                node: node.id,
                            });
                        }
                    }
                    CycleWitness::Invariant { invariant } => {
                        self.verify_invariant(certificate, nodes, invariant, states)?;
                        if certificate.claim == CertificateClaim::TotalCorrectness
                            && !cyclic_edges.is_empty()
                        {
                            return Err(PcpRefusal::CycleTerminationUnproved { node: node.id });
                        }
                    }
                    CycleWitness::Variant { invariant, variant } => {
                        self.verify_invariant(certificate, nodes, invariant, states)?;
                        for edge in cyclic_edges {
                            let target = contracts
                                .get(&edge.to)
                                .ok_or(PcpRefusal::UnknownNode { node: edge.to })?;
                            for state in states {
                                if !self.domain.holds(invariant, state)? {
                                    continue;
                                }
                                let before = self.domain.variant(variant, state)?;
                                let outputs = self.outputs_for_term(
                                    certificate,
                                    &target.proof,
                                    state,
                                    &mut 0,
                                )?;
                                if outputs.is_empty() {
                                    return Err(PcpRefusal::CycleVariantDidNotDecrease {
                                        from: edge.from,
                                        to: edge.to,
                                    });
                                }
                                for output in outputs {
                                    let after = self.domain.variant(variant, &output)?;
                                    if after >= before {
                                        return Err(PcpRefusal::CycleVariantDidNotDecrease {
                                            from: edge.from,
                                            to: edge.to,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }

                for state in states {
                    if self.domain.holds(pre, state)? {
                        let outputs = self.outputs_for_term(certificate, proof, state, &mut 0)?;
                        if outputs.is_empty() {
                            return Err(PcpRefusal::CanonicalContractFailed { node: node.id });
                        }
                        for output in outputs {
                            if !self.domain.holds(post, &output)? {
                                return Err(PcpRefusal::CanonicalContractFailed { node: node.id });
                            }
                        }
                    }
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
        for node in nodes {
            for state in states {
                if self.domain.holds(invariant, state)? {
                    let outputs =
                        self.outputs_for_term(certificate, &node.proof, state, &mut 0)?;
                    for output in outputs {
                        if !self.domain.holds(invariant, &output)? {
                            return Err(PcpRefusal::CycleInvariantFailed { node: node.node });
                        }
                    }
                }
            }
        }
        Ok(())
    }

    fn compose_terms(
        &self,
        certificate: &CertifiedPowl,
        left: &ProofTerm,
        right: &ProofTerm,
        state: &D::State,
    ) -> PcpResult<HashSet<D::State>> {
        let mut visits = 0;
        let left_outputs = self.outputs_for_term(certificate, left, state, &mut visits)?;
        let mut outputs = HashSet::new();
        for intermediate in left_outputs {
            outputs.extend(self.outputs_for_term(
                certificate,
                right,
                &intermediate,
                &mut visits,
            )?);
        }
        Ok(outputs)
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
        let node = model_node(&certificate.model, proof.node())?;
        match proof {
            ProofTerm::Boundary { .. } => Ok(HashSet::from([state.clone()])),
            ProofTerm::Atom { .. } => {
                let PowlNodeKind::Atom(action) = &node.kind else {
                    return Err(PcpRefusal::RuleDoesNotMatchNode { node: node.id });
                };
                let next = self
                    .domain
                    .step(action, state)
                    .map_err(|reason| PcpRefusal::ActionRefused {
                        node: node.id,
                        reason,
                    })?;
                Ok(HashSet::from([next]))
            }
            ProofTerm::Consequence { inner, .. } => {
                self.outputs_for_term(certificate, inner, state, visits)
            }
            ProofTerm::PartialOrder {
                canonical,
                children,
                ..
            } => self.compose_nodes(
                certificate,
                &proof_map(children),
                canonical,
                state,
                visits,
            ),
            ProofTerm::ChoiceGraph { nodes, .. } => {
                let PowlNodeKind::ChoiceGraph {
                    nodes: graph_nodes,
                    edges,
                } = &node.kind
                else {
                    return Err(PcpRefusal::RuleDoesNotMatchNode { node: node.id });
                };
                let contracts: HashMap<_, _> =
                    nodes.iter().map(|entry| (entry.node, entry)).collect();
                let start = *graph_nodes
                    .first()
                    .ok_or(PcpRefusal::GraphContractCoverageMismatch { node: node.id })?;
                let finish = *graph_nodes
                    .last()
                    .ok_or(PcpRefusal::GraphContractCoverageMismatch { node: node.id })?;
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
                Ok(outputs)
            }
        }
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
        self.validate_selection_inner(certificate, selection, &mut atoms, 1)?;
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
        selection: &ExecutionSelection,
        atoms: &mut Vec<PowlNodeId>,
        visits: usize,
    ) -> PcpResult<()> {
        if visits > certificate.bounds.max_choice_visits {
            return Err(PcpRefusal::ChoiceVisitBoundExceeded {
                actual: visits,
                maximum: certificate.bounds.max_choice_visits,
            });
        }
        let node = model_node(&certificate.model, selection.node())?;
        match selection {
            ExecutionSelection::Boundary { .. } => {
                if !matches!(
                    &node.kind,
                    PowlNodeKind::Start | PowlNodeKind::End | PowlNodeKind::Silent
                ) {
                    return Err(PcpRefusal::SelectionNotAdmitted { node: node.id });
                }
            }
            ExecutionSelection::Atom { .. } => {
                if !matches!(&node.kind, PowlNodeKind::Atom(_)) {
                    return Err(PcpRefusal::SelectionNotAdmitted { node: node.id });
                }
                atoms.push(node.id);
            }
            ExecutionSelection::PartialOrder { children, .. } => {
                let PowlNodeKind::PartialOrder(model_children) = &node.kind else {
                    return Err(PcpRefusal::SelectionNotAdmitted { node: node.id });
                };
                let order: Vec<_> = children.iter().map(ExecutionSelection::node).collect();
                if !is_topological_order(&certificate.model, model_children, &order) {
                    return Err(PcpRefusal::SelectionNotAdmitted { node: node.id });
                }
                for child in children {
                    self.validate_selection_inner(certificate, child, atoms, visits + 1)?;
                }
            }
            ExecutionSelection::ChoicePath { path, .. } => {
                let PowlNodeKind::ChoiceGraph {
                    nodes: graph_nodes,
                    edges,
                } = &node.kind
                else {
                    return Err(PcpRefusal::SelectionNotAdmitted { node: node.id });
                };
                let ids: Vec<_> = path.iter().map(ExecutionSelection::node).collect();
                if ids.first() != graph_nodes.first() || ids.last() != graph_nodes.last() {
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
                for child in path {
                    self.validate_selection_inner(certificate, child, atoms, visits + 1)?;
                }
            }
        }
        Ok(())
    }

    pub(super) fn execute_selection(
        &self,
        certificate: &CertifiedPowl,
        selection: &ExecutionSelection,
        initial: &D::State,
    ) -> PcpResult<(D::State, Vec<ObservedStep>)> {
        let nodes = self.validate_selection(certificate, selection)?;
        let mut state = initial.clone();
        let mut observed = Vec::with_capacity(nodes.len());
        for (ordinal, node_id) in nodes.into_iter().enumerate() {
            let node = model_node(&certificate.model, node_id)?;
            let PowlNodeKind::Atom(action) = &node.kind else {
                return Err(PcpRefusal::SelectionNotAdmitted { node: node_id });
            };
            let before_digest = canonical_digest(&state)?;
            let next = self
                .domain
                .step(action, &state)
                .map_err(|reason| PcpRefusal::ActionRefused {
                    node: node_id,
                    reason,
                })?;
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
