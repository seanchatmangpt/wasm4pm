# Old-AI Cognition Breeds Example Gallery

This document provides concrete, working examples for each of the 9 classical "Old-AI" cognition breeds provided by `@wasm4pm/cognition`. 

Each example shows the exact JSON payload expected by the `wpm cognition run` CLI command (or the `cognition_run` WebAssembly function in TypeScript).

## 1. ELIZA (`eliza`)
*Frame-based pattern matching (Weizenbaum 1966).*

ELIZA requires a non-empty `intent` string. It uses pattern reflection to generate an empathetic or procedural response.

```json
{
  "breed": "eliza",
  "contract": {
    "intent": "I feel anxious about deployment",
    "candidates": [],
    "facts": [],
    "cases": [],
    "rules": [],
    "goals": [],
    "state": []
  }
}
```

## 2. Case-Based Reasoning (`cbr`)
*Similarity-based matching via Jaccard metrics (Schank 1983).*

CBR requires past `cases` and query `facts`. It calculates the Jaccard similarity between the query facts and the facts attached to each historical case, returning the closest match.

```json
{
  "breed": "cbr",
  "contract": {
    "intent": "select architecture",
    "facts": [
      { "key": "requirement", "value": "offline" },
      { "key": "scale", "value": "small" }
    ],
    "cases": [
      {
        "id": "case-edge",
        "intent": "edge deployment",
        "architecture": "edge-local",
        "outcome_score": 0.9,
        "facts": [
          { "key": "requirement", "value": "offline" },
          { "key": "scale", "value": "small" }
        ]
      },
      {
        "id": "case-cloud",
        "intent": "cloud deployment",
        "architecture": "centralized-cloud",
        "outcome_score": 0.7,
        "facts": [
          { "key": "requirement", "value": "online" },
          { "key": "scale", "value": "large" }
        ]
      }
    ],
    "candidates": [],
    "rules": [],
    "goals": [],
    "state": []
  }
}
```

## 3. DENDRAL (`dendral`)
*Constraint-based enumeration and search (Feigenbaum 1971).*

DENDRAL eliminates `candidates` based on rigid constraints provided as `facts`. Valid constraint commands include `forbid:<id>`, `require:<token>`, `max-score:<f>`, and `min-score:<f>`.

```json
{
  "breed": "dendral",
  "contract": {
    "intent": "pick architecture under constraints",
    "candidates": [
      { "id": "centralized-cloud", "score": 0.8, "eliminated": false },
      { "id": "edge-offline", "score": 0.7, "eliminated": false },
      { "id": "hybrid-mesh", "score": 0.6, "eliminated": false }
    ],
    "facts": [
      { "key": "constraint", "value": "forbid:centralized-cloud" },
      { "key": "constraint", "value": "require:offline" }
    ],
    "cases": [],
    "rules": [],
    "goals": [],
    "state": []
  }
}
```

## 4. STRIPS (`strips`)
*Precondition-based planner (Fikes & Nilsson 1971).*

STRIPS solves planning problems. You provide the current `state`, the desired `goals`, and a set of `rules` (actions) with `premise` (preconditions) and `conclusion` (effects).

```json
{
  "breed": "strips",
  "contract": {
    "intent": "stack two blocks",
    "state": [
      { "predicate": "on", "value": "A-table" },
      { "predicate": "on", "value": "B-table" },
      { "predicate": "clear", "value": "A" },
      { "predicate": "clear", "value": "B" }
    ],
    "goals": [
      { "id": "g-aob", "predicate": "on", "value": "A-B" }
    ],
    "rules": [
      {
        "id": "stack-A-on-B",
        "premise": ["on=A-table", "clear=A", "clear=B"],
        "conclusion": "on=A-B;!on=A-table;!clear=B",
        "certainty": 1.0
      }
    ],
    "candidates": [],
    "facts": [],
    "cases": []
  }
}
```

## 5. Prolog (`prolog`)
*Horn-clause backward chaining (Robinson 1965).*

Prolog executes logical unification and resolution. You provide `facts`, `rules` (Horn clauses), and a `goal` to prove.

```json
{
  "breed": "prolog",
  "contract": {
    "intent": "prove ancestry",
    "facts": [
      { "key": "parent", "value": "alice" },
      { "key": "parent", "value": "bob" }
    ],
    "rules": [
      {
        "id": "r-ancestor",
        "premise": ["parent"],
        "conclusion": "ancestor",
        "certainty": 1.0
      }
    ],
    "goals": [
      { "id": "g1", "predicate": "parent", "value": "alice" }
    ],
    "candidates": [],
    "cases": [],
    "state": []
  }
}
```

## 6. MYCIN (`mycin`)
*Forward-chaining rule engine with certainty factors (Shortliffe 1976).*

MYCIN seeds its working memory from `facts` and iteratively applies `rules` if the preconditions are met with a minimum confidence factor.

```json
{
  "breed": "mycin",
  "contract": {
    "intent": "diagnose",
    "facts": [
      { "key": "symptom", "value": "fever" },
      { "key": "symptom", "value": "cough" }
    ],
    "rules": [
      {
        "id": "r1-flu",
        "premise": ["fever", "cough"],
        "conclusion": "diagnosis=flu",
        "certainty": 0.8
      },
      {
        "id": "r2-rest",
        "premise": ["diagnosis=flu"],
        "conclusion": "treatment=rest",
        "certainty": 0.9
      }
    ],
    "candidates": [],
    "cases": [],
    "goals": [],
    "state": []
  }
}
```

## 7. General Problem Solver (`gps`)
*Means-ends analysis and gap reduction (Newell & Shaw 1963).*

GPS reduces the "gap" between a current `state` and a target `goal` by finding `rules` (operators) that reduce the difference. The encoding matches STRIPS.

```json
{
  "breed": "gps",
  "contract": {
    "intent": "commute",
    "state": [
      { "predicate": "at", "value": "home" }
    ],
    "goals": [
      { "id": "g-office", "predicate": "at", "value": "office" }
    ],
    "rules": [
      {
        "id": "op-drive",
        "premise": ["at=home"],
        "conclusion": "at=office;!at=home",
        "certainty": 1.0
      }
    ],
    "candidates": [],
    "facts": [],
    "cases": []
  }
}
```

## 8. SOAR (`soar`)
*Preference-based operator selection (Laird 1987).*

SOAR selects from a pool of `candidates` based on explicit preferences encoded as `facts` (e.g., `best:<id>`, `prohibit:<id>`). 

```json
{
  "breed": "soar",
  "contract": {
    "intent": "pick operator",
    "candidates": [
      { "id": "op-A", "score": 0.5, "eliminated": false },
      { "id": "op-B", "score": 0.7, "eliminated": false },
      { "id": "op-C", "score": 0.6, "eliminated": false }
    ],
    "facts": [
      { "key": "pref", "value": "best:op-B" },
      { "key": "pref", "value": "prohibit:op-C" }
    ],
    "cases": [],
    "rules": [],
    "goals": [],
    "state": []
  }
}
```

## 9. Hearsay-II (`hearsay`)
*Blackboard consensus fusion (Erman & Lesser 1980).*

Hearsay uses a "blackboard" architecture. Initial hypotheses come from `facts`. Knowledge Sources (KSs) are encoded as `rules` that trigger when data matching their premise appears on the blackboard, deriving new conclusions until consensus is reached.

```json
{
  "breed": "hearsay",
  "contract": {
    "intent": "speech synthesis",
    "facts": [
      { "key": "phone", "value": "TH" },
      { "key": "phone", "value": "AH" }
    ],
    "rules": [
      {
        "id": "ks-th-to-the",
        "premise": ["phone:TH"],
        "conclusion": "word:THE",
        "certainty": 0.7
      },
      {
        "id": "ks-ah-to-the",
        "premise": ["phone:AH"],
        "conclusion": "word:THE",
        "certainty": 0.6
      }
    ],
    "candidates": [],
    "cases": [],
    "goals": [],
    "state": []
  }
}
```