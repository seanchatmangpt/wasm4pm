/**
 * wpm system completions — migrated from `commands/completions.ts`.
 *
 * Note the relative path depth to `apps/wasm4pm/completions/` changes: this
 * file compiles to `dist/nouns/system/completions.js` (one level deeper
 * than the old `dist/commands/completions.js`), so it needs three `..`
 * segments, not two.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineVerb, NounVerbError } from '@wasm4pm/noun-verb';
import { withSpanRaw } from '../../commands/_otel.js';

const SUPPORTED_SHELLS = ['bash', 'zsh', 'fish'] as const;
type SupportedShell = (typeof SUPPORTED_SHELLS)[number];

const SCRIPT_NAMES: Record<SupportedShell, string> = {
  bash: 'wpm.bash',
  zsh: 'wpm.zsh',
  fish: 'wpm.fish',
};

export const completionsVerb = defineVerb({
  noun: 'system',
  verb: 'completions',
  summary: 'Print shell completion script for bash, zsh, or fish (was: wpm completions)',
  args: {
    shell: { type: 'positional', required: true, description: 'Target shell: bash | zsh | fish' },
  } as const,
  handler: async (args) => {
    const shell = args.shell as string;
    if (!(SUPPORTED_SHELLS as readonly string[]).includes(shell)) {
      throw NounVerbError.invalidInput(`Unsupported shell: ${shell}. Try one of: ${SUPPORTED_SHELLS.join(' | ')}`);
    }

    let scriptBytes = 0;
    return withSpanRaw(
      'wasm4pm.command.completions',
      { 'completions.shell': shell },
      async () => {
        const scriptName = SCRIPT_NAMES[shell as SupportedShell];
        const here = dirname(fileURLToPath(import.meta.url));
        const completionsPath = join(here, '..', '..', '..', 'completions', scriptName);

        let text: string;
        try {
          text = await readFile(completionsPath, 'utf8');
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw NounVerbError.internalError(`Failed to read completion script for ${shell}: ${completionsPath}: ${message}`);
        }

        scriptBytes = Buffer.byteLength(text, 'utf8');
        return { shell, script: text, scriptBytes };
      },
      () => ({ 'completions.script_bytes': scriptBytes })
    );
  },
});
