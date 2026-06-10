# Inference to the Best Explanation (IBE)

## Origin
- **Paper:** "Explanatory Coherence" (Thagard, 1989)
- **Authors:** Paul Thagard
- **Tradition:** Philosophy of Science, Cognitive Science, Connectionist ECHO Model, Hypothesis Selection

## Algorithm
IBE selects the most coherent hypothesis among competing ones using Thagard's ECHO connectionist network model.
1. Build a network of evidence and hypothesis nodes from facts and rules.
2. Construct connections:
   - Coherence links (positive weights) between hypotheses and evidence they explain.
   - Incoherence links (negative weights) between contradictory or competing hypotheses.
   - External evidence links (positive weights) from evidence nodes to the external input.
3. Run connectionist activation updates for 100 iterations:
   - $a_i(t+1) = a_i(t)(1 - d) + \text{net}_i \cdot (\text{max} - a_i(t))$ if $\text{net}_i > 0$
   - $a_i(t+1) = a_i(t)(1 - d) + \text{net}_i \cdot (a_i(t) - \text{min})$ otherwise
   - Where $\text{net}_i = \sum w_{ij} a_j(t) + \text{external}_i$.
4. Select the hypothesis node with the highest activation.

## Pseudocode
```
function solve(input):
    (evidence, hypotheses, explains, contradicts) = parse_network(input)
    activations = initialize_activations(evidence, hypotheses)
    
    for 100 iterations:
        for each node i:
            net = sum(w_ij * activations[j]) + external_i
            activations[i] = update_activation(activations[i], net)
            
    best_hypothesis = argmax(activations[h] for h in hypotheses)
    return best_hypothesis
```

## Input contract
- `intent`: not used
- `facts`: contains network nodes and links:
  - `evidence`: `"node_name"` (node is evidence)
  - `hypothesis`: `"node_name"` (node is hypothesis)
  - `contradicts` or `competes`: `"node1,node2"` (nodes contradict each other)
- `rules`: rules with conclusion and premises (premises explain conclusion; rules concluding `"false"` define contradiction links).

## Output contract
- `selected`: ID of the hypothesis with the highest activation.
- `explanation`: `"IBE: Explanatory coherence (ECHO) finalized..."`
- `inference_trace`: trace steps recording `"ibe-load"`, `"ibe-explain"`, and `"ibe-select"`.

## Complexity
- Time: $O(I \cdot (E + C))$ where $I$ is iteration count (100), $E$ is explain links, $C$ is contradiction links.
- Space: $O(V + E + C)$ where $V$ is node count.

## Generalization examples
- **Competing Process Explanations**: Select the best explanation for a process delay among multiple competing hypotheses based on observed telemetry.
- **Medical Diagnostics**: Select the most coherent disease diagnosis that explains symptoms and contradicts other diagnoses.

## Adversarial coverage
- Precondition rejects if facts are empty.
- Standardizes candidate scores by mapping activations from $[-1.0, 1.0]$ to $[0.0, 1.0]$.
