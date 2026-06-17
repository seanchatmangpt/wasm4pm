# Cognitive Breed Coverage — wasm4pm-cognition

**Total Breeds:** 56 (9 BreedId-implemented + 47 string-dispatch stubs)  
**Last Updated:** 2026-06-17  
**Version:** v26.6.26

---

## Implemented Breeds (9 Total)

These breeds are fully implemented via the `BreedId` enum and have dedicated logic.

### 1. ELIZA
- **Type:** Conversational
- **Description:** Pattern-matching dialogue system for open-ended conversation and reflection
- **Input:** Natural language intent
- **Output:** Conversational response, candidates with confidence scores
- **Active in Modes:** Full, Reduced, Minimal, Emergency
- **Status:** Production-ready

### 2. CBR (Case-Based Reasoning)
- **Type:** Symbolic Reasoning
- **Description:** Retrieval and adaptation of past cases for current problem solving
- **Input:** Current problem features
- **Output:** Similar cases, adapted solutions
- **Active in Modes:** Full, Reduced, Minimal
- **Status:** Production-ready

### 3. MYCIN
- **Type:** Expert System
- **Description:** Rule-based medical diagnosis and treatment recommendation
- **Input:** Patient symptoms and lab results
- **Output:** Diagnosis candidates, confidence scores, explanation chains
- **Active in Modes:** Full, Reduced, Minimal
- **Status:** Production-ready

### 4. DENDRAL
- **Type:** Structure Elucidation
- **Description:** Molecular structure determination from mass spectrometry data
- **Input:** Spectrometry features, atomic composition
- **Output:** Candidate structures, ranking, elimination reasons
- **Active in Modes:** Full only
- **Status:** Production-ready

### 5. STRIPS
- **Type:** Planning
- **Description:** State-space planning with preconditions and effects
- **Input:** Initial state, goals, action definitions
- **Output:** Action sequences, plan decomposition
- **Active in Modes:** Full, Reduced
- **Status:** Production-ready

### 6. Prolog
- **Type:** Logic Programming
- **Description:** Horn-clause inference with backtracking search
- **Input:** Facts, rules, queries
- **Output:** Query solutions, proof traces
- **Active in Modes:** Full, Reduced
- **Status:** Production-ready

### 7. GPS (General Problem Solver)
- **Type:** Search
- **Description:** Means-ends analysis for goal-directed problem solving
- **Input:** Initial state, goal state, operators
- **Output:** Solution path, operator sequence
- **Active in Modes:** Full only
- **Status:** Production-ready

### 8. SOAR (State, Operator, And Result)
- **Type:** Unified Cognitive Architecture
- **Description:** Integrated architecture combining production rules, learning, and chunking
- **Input:** Problem representation, operator preferences
- **Output:** Decision, elaboration candidates, learning trace
- **Active in Modes:** Full only
- **Status:** Production-ready

### 9. HEARSAY-II
- **Type:** Speech Understanding
- **Description:** Blackboard-based architecture for speech and language understanding
- **Input:** Acoustic features, language models, domain knowledge
- **Output:** Understanding hypothesis, confidence, trace
- **Active in Modes:** Full only
- **Status:** Production-ready

---

## Stub Breeds (47 Total)

These breeds are registered by string dispatch and return empty/minimal results.

### Symbolic Reasoning Stubs (6)
- **Forward Chaining:** Rule-driven inference engine
- **Backward Chaining:** Goal-directed backward proof
- **Semantic Networks:** Graph-based knowledge representation
- **Description Logic:** Formal ontology reasoning
- **Constraint Logic:** Logic with constraint solving
- **Non-monotonic Reasoning:** Default logic and circumscription

### Planning Stubs (5)
- **HTN Planning:** Hierarchical task network decomposition
- **Temporal Planning:** Time-aware plan synthesis
- **Probabilistic Planning:** MDP-based planning
- **Reactive Planning:** Condition-action rules
- **Multi-Agent Planning:** Cooperative agent planning

### Learning Stubs (6)
- **Inductive Learning:** Decision tree and rule induction
- **Analogical Learning:** Structure mapping and transfer
- **Reinforcement Learning:** Q-learning and policy gradients
- **Neural Learning:** Perceptron and backpropagation
- **Instance-Based Learning:** k-NN and instance storage
- **Meta-Learning:** Learning to learn

### Knowledge Representation Stubs (8)
- **Frame Systems:** Object-oriented knowledge representation
- **Scripts:** Stereotypical event sequences
- **Conceptual Graphs:** Graph-based knowledge
- **Formal Ontologies:** OWL and description logic
- **Probabilistic Networks:** Bayesian and Markov networks
- **Argumentation:** Argument-based reasoning
- **Rewriting Systems:** Term rewriting and equational logic
- **Fuzzy Logic:** Fuzzy sets and membership

### NLP Stubs (10)
- **Tokenizer:** Text segmentation and morphology
- **Parser:** Syntax analysis and tree construction
- **Semantic Parser:** Logical form construction
- **Named Entity Recognition:** Entity identification and tagging
- **Sentiment Analysis:** Opinion and emotion detection
- **Machine Translation:** Language-to-language translation
- **Text Summarization:** Document and abstractive summarization
- **Information Extraction:** Relation and event extraction
- **Coreference Resolution:** Pronoun and reference resolution
- **Dependency Parsing:** Syntactic dependency analysis

### Vision Stubs (6)
- **Object Detection:** Bounding box and confidence scoring
- **Scene Understanding:** Image interpretation
- **Visual Reasoning:** Image question answering
- **Image Segmentation:** Pixel-level classification
- **3D Reconstruction:** Depth and structure from motion
- **Activity Recognition:** Video action classification

---

## Degradation Modes

The cognitive system supports graceful degradation under resource and health constraints.

| Mode | Active Breeds | Trigger | Use Case |
|------|---------------|---------|----------|
| **Full** | All 9 BreedId-implemented | Normal operation | Nominal processing with full breed selection |
| **Reduced** | ELIZA, CBR, Mycin, Prolog, Strips | Memory pressure, response time exceeded, moderate error rate | Degraded but responsive processing |
| **Minimal** | ELIZA, CBR, Mycin | Critical memory, high error rate, high response latency | Essential processing only |
| **Emergency** | ELIZA only | Health level 3+, system near failure | Fallback conversational response |

---

## Registry Statistics

| Metric | Value |
|--------|-------|
| **Total Breeds** | 56 |
| **BreedId-implemented** | 9 |
| **String-dispatch stubs** | 47 |
| **Categories** | 7 (symbolic, planning, learning, knowledge, NLP, vision, other) |
| **Test Coverage** | 40 quality tests + 36 autonomic tests + 38 production tests = 114 tests |
| **Inference Trace Required** | Yes (FM-5 fraud detection) |
| **Max Inference Steps** | 10,000 (MAX_TRACE_STEPS) |
| **Max Candidates** | 1,000 |
| **Max Facts** | 10,000 |

---

## Test Coverage Summary

### Breed Quality Tests (40)
- All 9 BreedId variants covered
- Output structure validation (explanation, candidates, inference trace)
- Inference trace monotonicity enforcement
- Score bounds validation [0.0, 1.0]
- Elimination reason validation
- FM-5 fraud detection (empty trace → penalty)

### Autonomic Healing Tests (36)
- AutonomicContext construction and boundaries
- BreedRewardSignal computation
- compute_breed_reward across scenarios
- prioritize_breeds health-based selection
- enrich_input_with_context
- aggregate_rewards multi-breed scenarios
- breed_id_from_str conversions (case-insensitive)

### Production Hardening Tests (38)
- DegradationMode construction (Full, Reduced, Minimal, Emergency)
- DegradationTrigger boundary values
- select_degradation_mode logic across health levels
- breeds_for_mode breed list validation
- breed_active_in_mode correctness
- mode_rationale documentation accuracy
- recovery_recommendation text validation
- Mode severity ordering

---

## Implementation Roadmap

### Completed (v26.6.26)
- ✅ All 9 BreedId-implemented variants
- ✅ Core CognitionBreed trait interface
- ✅ BreedOutput and Candidate structures
- ✅ Autonomic bridge with reward computation
- ✅ Degradation modes with triggering logic
- ✅ All 114 tests passing

### Planned (Future Versions)
- ⏳ Stub breed implementations (47 stubs)
- ⏳ Advanced inference tracing
- ⏳ Learned breed adaptation
- ⏳ Distributed cognition coordination

---

**Registry Notes:** The 56 breeds comprise 9 core BreedId-implemented variants plus 47 string-dispatch stubs organized across symbolic reasoning, planning, learning, knowledge representation, NLP, and vision categories. This architecture supports both immediate full deployment and graceful degradation modes.
