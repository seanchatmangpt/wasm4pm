import { defineCommand } from 'citty';
import { execute } from './agent/execute.js';
import { list } from './agent/list.js';
import { audit } from './agent/audit.js';
import { status } from './agent/status.js';
import { register } from './agent/register.js';
import { STANDARD_EXIT_CODE_DOCS } from '../help-standards.js';

export const agent = defineCommand({
  meta: {
    name: 'agent',
    description: `Manage and execute Van der Aalst process mining agents. Example: wpm agent list

${STANDARD_EXIT_CODE_DOCS}`,
  },
  subCommands: {
    execute,
    list,
    audit,
    status,
    register,
  },
});

export { execute, list, audit, status, register };
