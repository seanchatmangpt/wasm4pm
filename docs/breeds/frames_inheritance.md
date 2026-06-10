# Frames Inheritance

## Origin
- **Paper:** "A Framework for Representing Knowledge" (Minsky, 1974)
- **Authors:** Marvin Minsky
- **Tradition:** Frame theory, Semantic Networks, Object-Oriented Knowledge Representation

## Algorithm
Frames Inheritance parses a frame graph (parent links, slot values, default values) and resolves slot values down the inheritance path, applying overrides.
1. Parse frame declarations from input facts:
   - `frame:<F>:isa` with value `<Parent>` defines multiple parent links.
   - `frame:<F>:slot:<S>` with value `<Val>` defines a locally-owned slot value.
   - `frame:<F>:slot:<S>:default` with value `<Val>` defines a default slot value.
2. Initialize path traversal at the requested target frame.
3. In a loop, trace the `isa` hierarchy upwards:
   - If a cycle is detected (frame visited twice), raise a cycle detection error.
   - Check if the current frame contains the target slot locally (`own_slots`). If so, resolve and terminate.
   - Check if the current frame contains the target slot default (`default_slots`). If so, resolve and terminate.
   - Move to the parent frame (`isa_map`) and increment traversal distance.
4. If the parent root is reached without resolution, return None.

## Pseudocode
```
function run(input):
    target_frame, target_slot = parse_intent(input.intent)
    isa_map, own_slots, default_slots = parse_frames(input.facts)
    
    current = target_frame
    visited = {}
    distance = 0
    
    while current is not null:
        if current in visited:
            return Err("isa cycle detected")
        visited.insert(current)
        
        if current has own_slot[target_slot]:
            return own_slot[target_slot], distance
        if current has default_slot[target_slot]:
            return default_slot[target_slot], distance
            
        current = isa_map[current]
        distance += 1
        
    return None
```

## Input contract
- `intent`: must be `"resolve <frame> <slot>"`
- `facts`: represents frame graph facts (`frame:<F>:isa`, `frame:<F>:slot:<S>`, `frame:<F>:slot:<S>:default`).
- `rules`: not used
- `goals`: not used
- `cases`: not used
- `state`: not used
- `candidates`: passed through unchanged

## Output contract
- `selected`: resolved slot value if found, or None.
- `explanation`: string detailing the resolution path and distance.
- `inference_trace`: trace steps recording `"frame-load"`, `"frame-walk"`, and `"frame-resolve"`.

## Complexity
- Time: $O(N)$ where $N$ is the depth of the inheritance hierarchy.
- Space: $O(F + S)$ where $F$ is the number of frames and $S$ is the number of slots.

## Generalization examples
- **System Config Overrides**: Resolving configuration values where local container configs inherit from node, region, and global defaults.
- **Enterprise Hierarchy**: Resolving organizational policies or properties (e.g. holiday calendars) down a corporate structure.

## Adversarial coverage
- Precondition rejects if intent is malformed.
- Postcondition validates that the trace is not empty.
- Cycles in `isa` links are detected and rejected.
