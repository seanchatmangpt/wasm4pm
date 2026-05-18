import { defineCommand } from 'citty';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exitWithFlush } from '../otel/exit.js';
import { EXIT_CODES } from '../exit-codes.js';

const SUPPORTED_SHELLS = ['bash', 'zsh', 'fish'] as const;
type SupportedShell = (typeof SUPPORTED_SHELLS)[number];

const SCRIPT_NAMES: Record<SupportedShell, string> = {
  bash: 'wpm.bash',
  zsh: 'wpm.zsh',
  fish: 'wpm.fish',
};

export const completions = defineCommand({
  meta: {
    name: 'completions',
    description: 'Print shell completion script for bash, zsh, or fish',
  },
  args: {
    shell: {
      type: 'positional',
      required: true,
      description: 'Target shell: bash | zsh | fish',
    },
  },
  async run({ args }) {
    const shell = args.shell as string;

    if (!(SUPPORTED_SHELLS as readonly string[]).includes(shell)) {
      process.stderr.write(
        `Unsupported shell: ${shell}. Try one of: ${SUPPORTED_SHELLS.join(' | ')}\n`
      );
      return await exitWithFlush(2);
    }

    const scriptName = SCRIPT_NAMES[shell as SupportedShell];

    // Resolve completions/<script> relative to the compiled output directory.
    // __filename is apps/wasm4pm/dist/commands/completions.js at runtime.
    // The completions/ folder is at apps/wasm4pm/completions/ (two levels up).
    const here = dirname(fileURLToPath(import.meta.url));
    const completionsPath = join(here, '..', '..', 'completions', scriptName);

    let text: string;
    try {
      text = await readFile(completionsPath, 'utf8');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `Failed to read completion script for ${shell}:\n  ${completionsPath}\n  ${message}\n`
      );
      return await exitWithFlush(EXIT_CODES.system_error);
    }

    process.stdout.write(text);
  },
});
