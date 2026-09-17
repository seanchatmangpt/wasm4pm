<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs_quarantine/ARCHIVE/unverified/how-to/export_bpmn.md; source-sha256: e2c1e450192de768eed592bb187e060e083486714ed122dfd87d19b487969a4b; reason: tooling or agent control surface -->

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
