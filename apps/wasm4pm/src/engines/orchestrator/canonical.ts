import { hashJsonString } from '@wasm4pm/contracts';

/** JSON-compatible canonicalization with lexicographically sorted object keys. */
export function canonicalize(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'undefined') return undefined;
  if (typeof value === 'bigint') return value.toString(10);
  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new TypeError(`Unsupported canonical JSON value: ${typeof value}`);
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item) ?? null);
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64');
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(object).sort()) {
      const canonical = canonicalize(object[key]);
      if (canonical !== undefined) out[key] = canonical;
    }
    return out;
  }
  throw new TypeError(`Unsupported canonical JSON value: ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  const canonical = canonicalize(value);
  return JSON.stringify(canonical === undefined ? null : canonical);
}

export function hashCanonical(value: unknown): string {
  return hashJsonString(canonicalJson(value));
}
