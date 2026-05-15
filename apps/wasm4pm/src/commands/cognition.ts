import { defineCommand } from 'citty';
import { doctor } from './cognition/doctor.js';

export const cognition = defineCommand({
  meta: {
    name: 'cognition',
    description: 'Cognition stack inspection and capability probes',
  },
  subCommands: {
    doctor,
  },
});

export { doctor };
