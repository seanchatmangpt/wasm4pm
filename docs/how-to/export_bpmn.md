# How-To: Export Models to BPMN

## Goal
Convert a discovered Petri net or Process Tree into a standard BPMN 2.0 XML file for use in enterprise modeling tools like Camunda or Signavio.

## Steps

### 1. Discover a Block-Structured Model
BPMN requires block-structured logic. Use the Inductive Miner to guarantee a sound Process Tree.
```bash
wpm run inductive_miner -i log.xes --save-model tree.json
```

### 2. Convert to BPMN
Use the conversion utility to translate the internal representation to BPMN 2.0.
```bash
wpm export bpmn --model tree.json -o process.bpmn
```

### 3. Import
Open `process.bpmn` in your preferred BPMN editor.
