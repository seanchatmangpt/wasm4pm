import {
  RESERVED_ARG_NAMES,
  assertValidIdentifier,
  type TypedArgSpec,
  type VerbDefinition,
  type VerbSpec,
} from './types.js';

/**
 * Register a single verb. TS analog of `#[verb("verb", "noun")]`.
 *
 * Validates the noun/verb identifiers, rejects reserved arg names
 * (the framework injects `--human` into every verb's args), and
 * defaults `stability` to `'stable'`. Throws a plain `Error` at
 * definition time (module load) — this is a programming mistake, not
 * a runtime CLI failure, so it is intentionally NOT a `NounVerbError`.
 */
export function defineVerb<TArgs extends TypedArgSpec = TypedArgSpec, TResult = unknown>(
  spec: VerbSpec<TArgs, TResult>
): VerbDefinition<TArgs, TResult> {
  assertValidIdentifier('noun', spec.noun);
  assertValidIdentifier('verb', spec.verb);

  if (!spec.summary || !spec.summary.trim()) {
    throw new Error(`Verb '${spec.noun} ${spec.verb}' must have a non-empty summary.`);
  }
  if (typeof spec.handler !== 'function') {
    throw new Error(`Verb '${spec.noun} ${spec.verb}' must have a handler function.`);
  }

  const argNames = Object.keys(spec.args ?? {});
  for (const reserved of RESERVED_ARG_NAMES) {
    if (argNames.includes(reserved)) {
      throw new Error(
        `Verb '${spec.noun} ${spec.verb}' declares arg '--${reserved}', which is reserved by the framework.`
      );
    }
  }

  return {
    ...spec,
    stability: spec.stability ?? 'stable',
    __kind: 'verb',
  };
}
