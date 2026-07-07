import { assertValidIdentifier, type NounDefinition, type NounSpec } from './types.js';

/**
 * Register a noun and its verb table. TS analog of the crate's
 * auto-discovered noun module. The registry produced here is the
 * single source of truth `buildCli()` folds into: citty registration,
 * `--help` sections, generated docs, introspection, and completions
 * all derive from this same data.
 */
export function defineNoun(spec: NounSpec): NounDefinition {
  assertValidIdentifier('noun', spec.name);

  const seen = new Set<string>();
  for (const verb of spec.verbs) {
    if (verb.noun !== spec.name) {
      throw new Error(
        `Verb '${verb.verb}' declares noun '${verb.noun}' but is registered under noun '${spec.name}'.`
      );
    }
    if (seen.has(verb.verb)) {
      throw new Error(`Duplicate verb '${verb.verb}' registered twice under noun '${spec.name}'.`);
    }
    seen.add(verb.verb);
  }

  return {
    ...spec,
    __kind: 'noun',
  };
}
