# Description Logic (DL)

## Origin
- **Paper:** "The Description Logic Handbook" (Baader, Calvanese, McGuinness, Nardi, Patel-Schneider, 2003)
- **Authors:** Franz Baader et al.
- **Tradition:** Ontological Reasoning, Semantic Web, ABox/TBox Subsumption

## Algorithm
Description Logic reasoning propagates class subsumptions and checks consistency of individual class assertions.
1. Parse the TBox (subsumption relations) and ABox (class assertions) from `input.facts`.
2. Compute the transitive closure of the subsumes relation:
   - If class $A$ subsumes $B$ and class $B$ subsumes $C$, then $A$ subsumes $C$.
3. Propagate ABox individual class membership:
   - If individual $x$ is a member of class $C$, and class $D$ subsumes class $C$, then $x$ is a member of class $D$.
4. Check ABox/TBox consistency against disjointness assertions:
   - If individual $x$ is derived to belong to both classes $C_1$ and $C_2$, and $C_1$ is disjoint from $C_2$, then the ontology is inconsistent.

## Pseudocode
```
function solve(input):
    (subsumes, member, disjoint) = parse_kb(input.facts)
    
    // TBox reasoning
    repeat until no changes:
        if A subsumes B and B subsumes C:
            subsumes.insert(A subsumes C)
            
    // ABox reasoning
    repeat until no changes:
        if x is member of C and D subsumes C:
            member.insert(x is member of D)
            
    // Consistency Check
    for each (x, C1) and (x, C2) in member:
        if disjoint(C1, C2):
            return INCONSISTENT
            
    return CONSISTENT
```

## Input contract
- `intent`: not used
- `facts`: contains TBox and ABox statements:
  - `subsumes`: `"ClassA,ClassB"` (ClassA subsumes ClassB)
  - `subclass`: `"ClassB,ClassA"` (ClassB is a subclass of ClassA)
  - `class`, `class_assertion`, or `type`: `"individual,Class"` (individual belongs to Class)
  - `disjoint` or `disjoint_classes`: `"Class1,Class2"` (Class1 and Class2 are disjoint)

## Output contract
- `selected`: `"consistent"` or `"inconsistent"`
- `explanation`: `"Description Logic: KB is consistent..."` or error details on disjointness clashes.
- `inference_trace`: trace steps recording `"dl-load"`, `"dl-subsume"`, and `"dl-consistent"`.

## Complexity
- Time: Polynomial $O(C^3 + I \cdot C^2)$ in class count $C$ and individual count $I$.
- Space: $O(C^2 + I \cdot C)$ to store relations.

## Generalization examples
- **Workflow Compliance Auditing**: Match process instances (ABox individuals) to compliance types (TBox classes) and verify disjoint risk categories (e.g. `Maker` disjoint from `Checker`).
- **Data Model Ontologies**: Check consistency of complex database schema mappings.

## Adversarial coverage
- Precondition rejects if facts (knowledge base) is empty.
- Detects disjoint clashes and eliminates all candidates with score 0.0.
