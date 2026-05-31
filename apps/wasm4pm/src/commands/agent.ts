import { defineCommand } from 'citty';
import { execute } from './agent/execute.js';
import { list } from './agent/list.js';
import { audit } from './agent/audit.js';
import { status } from './agent/status.js';
import { register } from './agent/register.js';
import { switchAgent } from './agent/switch.js';
import { reset } from './agent/reset.js';
import { STANDARD_EXIT_CODE_DOCS } from '../help-standards.js';

export const agent = defineCommand({
  meta: {
    name: 'agent',
    description: `Manage Van der Aalst process-mining agents and RL autonomic agents.

  VdA agents: list, execute, audit, register, status
  RL agents:  list --rl, status --rl, status <AgentName>, switch <AgentName>, reset

Example: wpm agent list
         wpm agent list --rl
         wpm agent status DoubleQLearning
         wpm agent switch SARSA
         wpm agent reset

${STANDARD_EXIT_CODE_DOCS}`,
  },
  subCommands: {
    execute,
    list,
    audit,
    status,
    register,
    switch: switchAgent,
    reset,
  },
});

export { execute, list, audit, status, register, switchAgent, reset };
