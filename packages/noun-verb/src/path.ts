/**
 * Shared dot-path extraction used by chain references (`@{n.path}`) and
 * stdin extraction (`@-::json.path`). Deliberately tiny and dependency-free.
 */

/** Resolve a dot-separated path (`a.b.c`) against a plain JS value. Returns `undefined` if any segment is missing. */
export function getByPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined || typeof acc !== 'object') {
      return undefined;
    }
    return (acc as Record<string, unknown>)[key];
  }, value);
}

/** Render an extracted value as a CLI argument string: strings pass through, everything else is JSON-encoded. */
export function stringifyExtractedValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}
