<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs_quarantine/ARCHIVE/docs/reference/data-types.md; source-sha256: ac25fb22e7e04172ff7fcfb900deb3c815e9ce2539fba0699681b68d3a84fc60; reason: tooling or agent control surface -->

# Reference: Data Types and Schemas

## Receipt

```typescript
interface Receipt {
  run_id: string;
  timestamp: string;  // ISO8601
  status: "success" | "partial" | "failed";
  
  configuration: {
    algorithm: string;
    profile: string;
    config_file_hash: string;
    config_content: string;  // base64 encoded
  };
  
  input: {
    source_type: string;
    source_path: string;
    event_count: number;
    trace_count: number;
    input_hash: string;
  };
  
  execution: {
    algorithm: string;
    execution_time_ms: number;
    memory_used_mb: number;
    completed_at: string;
  };
  
  output: {
    model_type: "dfg" | "petri_net" | "process_tree";
    nodes: number;
    edges: number;
    output_hash: string;
  };
  
  hashes: {
    plan_hash: string;
    combined_hash: string;  // Overall proof
  };
  
  verification: {
    config_deterministic: boolean;
    input_deterministic: boolean;
    algorithm_deterministic: boolean;
    reproducible: boolean;
  };
}
```

## Plan

```typescript
interface Plan {
  id: string;
  steps: ExecutionStep[];
  edges: Edge[];  // DAG edges
  profile: string;
  hash: string;
}

interface ExecutionStep {
  id: string;
  type: "Algorithm" | "Source" | "Sink" | "Validate";
  config: object;
  dependencies: string[];  // step IDs
  output?: any;
}

interface Edge {
  source: string;  // step ID
  target: string;  // step ID
}
```

## Event

```typescript
interface Event {
  id: string;
  timestamp: string;  // ISO8601
  activity: string;
  trace_id: string;
  attributes?: Record<string, any>;
}
```

## Trace

```typescript
interface Trace {
  id: string;
  events: Event[];
  attributes?: Record<string, any>;
}
```

## Model (DFG)

```typescript
interface DFGModel {
  type: "dfg";
  nodes: DFGNode[];
  edges: DFGEdge[];
}

interface DFGNode {
  id: string;
  label: string;
  frequency: number;
}

interface DFGEdge {
  source: string;
  target: string;
  frequency: number;
}
```

## Model (Petri Net)

```typescript
interface PetriNet {
  type: "petri_net";
  places: Place[];
  transitions: Transition[];
  arcs: Arc[];
}

interface Place {
  id: string;
  label: string;
  initial_marking: number;
}

interface Transition {
  id: string;
  label: string;
}

interface Arc {
  source: string;
  target: string;
  weight: number;
}
```

## JSON Structure Example

```json
{
  "type": "dfg",
  "nodes": [
    {
      "id": "A",
      "label": "Activity A",
      "frequency": 100
    }
  ],
  "edges": [
    {
      "source": "A",
      "target": "B",
      "frequency": 95
    }
  ]
}
```

## See Also

- [Reference: Error Codes](./error-codes.md)
- [Explanation: Receipts](../explanation/receipts.md)
