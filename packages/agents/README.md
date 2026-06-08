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

## See Also

- [@wasm4pm/kernel](../kernel) — WASM algorithm boundary
- [@wasm4pm/testing](../testing) — Test harnesses and oracles
- [@wasm4pm/ml](../ml) — Machine learning process mining
