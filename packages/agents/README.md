# @wasm4pm/agents

Van der Aalst process mining agents — autonomous adversarial validation

## Overview

This package implements autonomous process mining agents based on van der Aalst's research. These agents autonomously discover, validate, and assess process models from event logs using adversarial testing strategies.

## Key Features

- **Autonomous discovery**: Agents run algorithms without human intervention
- **Adversarial validation**: Tests process models against hostile assumptions
- **Multi-perspective analysis**: Control flow, time, resource, and data perspectives
- **Quality assessment**: Fitness, precision, generalization, and simplicity metrics

## Usage

```typescript
import { createAgent, AgentType } from '@wasm4pm/agents';

const agent = createAgent(AgentType.Discovery);
const results = await agent.analyze(eventLog, config);
```

## Agents

### Van der Aalst Perspectives

- **Control Flow**: Activity sequencing and dependencies
- **Time**: Temporal patterns and performance bottlenecks
- **Resource**: Organizational structures and handovers
- **Data**: Case attributes and variant analysis

## Quality Metrics

All results conform to van der Aalst's four quality dimensions:

- **Fitness**: How much observed behavior is explained by the model
- **Precision**: How much model behavior is observed in the log
- **Generalization**: How well the model generalizes to unseen behavior
- **Simplicity**: Model complexity (fewer places/transitions preferred)

## Testing

```bash
npm test
```

## Architecture notes

### Relationship to `wpm autoprocess` (ADR)

This package's `AgentOrchestrator` implements a MAPE-K loop (Monitor → Analyze → Plan → Execute → Learn) over **repository/manufacturing artifacts** using pure-TypeScript heuristic agents. It is intentionally distinct from the autonomic loop in `apps/wasm4pm/src/commands/autoprocess.ts` (Perception → Decision → Protection → Optimization), which operates on **event logs** and is backed by the WASM cognition layer. The two do not share state or converge: this package polices the build/release process itself; autoprocess polices mined process models. Keep them separate — merging them would couple artifact governance to event-log analysis.

### Known limitation: no correction backend

`AgentOrchestrator.execute()` records intended corrective actions in the audit trail but **does not apply them** — `_applyCorrection` returns `success: false` with `not_implemented: true` until a real correction backend (subprocess bridge) exists, and `_createSnapshot` returns `null` (no rollback support). This is deliberate: fabricating `correction_success: true` would be the same evidence-theater this package exists to detect.

## See Also

- [@wasm4pm/kernel](../kernel) — WASM algorithm boundary
- [@wasm4pm/testing](../testing) — Test harnesses and oracles
- [@wasm4pm/ml](../ml) — Machine learning process mining
