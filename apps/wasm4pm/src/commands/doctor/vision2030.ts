import type { Diagnosis } from './types.js';

export type CapabilityStanding =
  | 'UNKNOWN'
  | 'PARTIAL_ALIVE'
  | 'ALIVE'
  | 'BLOCKED'
  | 'BUILD_BROKEN'
  | 'UNSUPPORTED';

export interface CapabilityDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly checks: ReadonlyArray<() => Promise<Diagnosis>>;
  /** Highest standing the currently admitted evidence can establish. */
  readonly ceiling?: Exclude<CapabilityStanding, 'BLOCKED' | 'BUILD_BROKEN'>;
  /** Standing used when an executed check reaches STOP_THE_LINE. */
  readonly failureStanding?: 'BLOCKED' | 'BUILD_BROKEN';
  /** Explicitly records a known capability boundary with no executable route. */
  readonly unsupportedReason?: string;
}

export interface CapabilityEvidence {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly standing: CapabilityStanding;
  readonly ceiling: CapabilityStanding;
  readonly diagnoses: readonly Diagnosis[];
  readonly counts: {
    readonly pass: number;
    readonly warn: number;
    readonly fail: number;
  };
  readonly limitation?: string;
}

export interface Vision2030Report {
  readonly schema_version: 'wasm4pm.vision2030.v1';
  readonly overall_standing: CapabilityStanding;
  readonly capabilities: readonly CapabilityEvidence[];
  readonly summary: {
    readonly alive: number;
    readonly partial_alive: number;
    readonly unknown: number;
    readonly blocked: number;
    readonly build_broken: number;
    readonly unsupported: number;
  };
  readonly evidence_hash: string;
  readonly generated_at: string;
}

export class Vision2030AuditError extends Error {
  constructor(
    readonly code: 'UNKNOWN_CAPABILITY_REFUSED' | 'EMPTY_CAPABILITY_SET_REFUSED',
    message: string,
    readonly alternatives: readonly string[] = []
  ) {
    super(message);
    this.name = 'Vision2030AuditError';
  }
}

type EvidenceHasher = (canonicalJson: string) => string;

const STANDING_RANK: Readonly<Record<CapabilityStanding, number>> = {
  UNKNOWN: 0,
  UNSUPPORTED: 0,
  PARTIAL_ALIVE: 1,
  ALIVE: 2,
  BLOCKED: -1,
  BUILD_BROKEN: -2,
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function applyCeiling(
  observed: CapabilityStanding,
  ceiling: CapabilityDefinition['ceiling']
): CapabilityStanding {
  if (!ceiling || observed === 'BLOCKED' || observed === 'BUILD_BROKEN') return observed;
  return STANDING_RANK[observed] <= STANDING_RANK[ceiling] ? observed : ceiling;
}

function observedStanding(
  diagnoses: readonly Diagnosis[],
  failureStanding: CapabilityDefinition['failureStanding']
): CapabilityStanding {
  if (diagnoses.length === 0) return 'UNKNOWN';
  if (diagnoses.some((diagnosis) => diagnosis.severity === 'STOP_THE_LINE')) {
    return failureStanding ?? 'BLOCKED';
  }
  if (diagnoses.some((diagnosis) => diagnosis.severity === 'WARNING')) {
    return 'PARTIAL_ALIVE';
  }
  return 'ALIVE';
}

async function executeCheck(check: () => Promise<Diagnosis>): Promise<Diagnosis> {
  try {
    return await check();
  } catch (error) {
    return {
      name: check.name || 'anonymous capability check',
      pathology: 'EPISTEMIC_FAULT',
      severity: 'STOP_THE_LINE',
      message: `Check execution failed: ${error instanceof Error ? error.message : String(error)}`,
      repairMode: 'MANUAL_INTERVENTION',
      fixGuide: 'Repair the check boundary, then replay the Vision 2030 audit.',
    };
  }
}

function summarize(capabilities: readonly CapabilityEvidence[]): Vision2030Report['summary'] {
  const count = (standing: CapabilityStanding): number =>
    capabilities.filter((capability) => capability.standing === standing).length;
  return {
    alive: count('ALIVE'),
    partial_alive: count('PARTIAL_ALIVE'),
    unknown: count('UNKNOWN'),
    blocked: count('BLOCKED'),
    build_broken: count('BUILD_BROKEN'),
    unsupported: count('UNSUPPORTED'),
  };
}

function overallStanding(capabilities: readonly CapabilityEvidence[]): CapabilityStanding {
  if (capabilities.length === 0) return 'UNKNOWN';
  if (capabilities.some((capability) => capability.standing === 'BUILD_BROKEN')) {
    return 'BUILD_BROKEN';
  }
  if (capabilities.some((capability) => capability.standing === 'BLOCKED')) return 'BLOCKED';
  if (capabilities.every((capability) => capability.standing === 'ALIVE')) return 'ALIVE';
  if (capabilities.every((capability) => capability.standing === 'UNSUPPORTED')) {
    return 'UNSUPPORTED';
  }
  if (capabilities.every((capability) => capability.standing === 'UNKNOWN')) return 'UNKNOWN';
  return 'PARTIAL_ALIVE';
}

export async function evaluateVision2030(
  definitions: readonly CapabilityDefinition[],
  hash: EvidenceHasher,
  options: { readonly only?: readonly string[]; readonly now?: () => Date } = {}
): Promise<Vision2030Report> {
  if (definitions.length === 0) {
    throw new Vision2030AuditError(
      'EMPTY_CAPABILITY_SET_REFUSED',
      'Vision 2030 audit refused: no capability definitions were admitted.'
    );
  }

  const available = definitions.map((definition) => definition.id).sort();
  const requested = options.only?.filter(Boolean);
  const unknown = requested?.filter((id) => !available.includes(id)) ?? [];
  if (unknown.length > 0) {
    throw new Vision2030AuditError(
      'UNKNOWN_CAPABILITY_REFUSED',
      `Unknown Vision 2030 capability: ${unknown.join(', ')}`,
      available
    );
  }

  const selected = requested?.length
    ? definitions.filter((definition) => requested.includes(definition.id))
    : [...definitions];

  const capabilities: CapabilityEvidence[] = [];
  for (const definition of selected) {
    if (definition.unsupportedReason && definition.checks.length === 0) {
      capabilities.push({
        id: definition.id,
        label: definition.label,
        description: definition.description,
        standing: 'UNSUPPORTED',
        ceiling: definition.ceiling ?? 'UNSUPPORTED',
        diagnoses: [],
        counts: { pass: 0, warn: 0, fail: 0 },
        limitation: definition.unsupportedReason,
      });
      continue;
    }

    const diagnoses = await Promise.all(definition.checks.map(executeCheck));
    const standing = applyCeiling(
      observedStanding(diagnoses, definition.failureStanding),
      definition.ceiling
    );
    capabilities.push({
      id: definition.id,
      label: definition.label,
      description: definition.description,
      standing,
      ceiling: definition.ceiling ?? 'ALIVE',
      diagnoses,
      counts: {
        pass: diagnoses.filter((diagnosis) => diagnosis.severity === 'INFO').length,
        warn: diagnoses.filter((diagnosis) => diagnosis.severity === 'WARNING').length,
        fail: diagnoses.filter((diagnosis) => diagnosis.severity === 'STOP_THE_LINE').length,
      },
      limitation:
        standing === definition.ceiling && definition.ceiling !== 'ALIVE'
          ? `Evidence ceiling: ${definition.ceiling}`
          : undefined,
    });
  }

  const overall = overallStanding(capabilities);
  const summary = summarize(capabilities);
  const evidencePayload = {
    schema_version: 'wasm4pm.vision2030.v1' as const,
    overall_standing: overall,
    capabilities: capabilities.map((capability) => ({
      id: capability.id,
      standing: capability.standing,
      ceiling: capability.ceiling,
      counts: capability.counts,
      limitation: capability.limitation,
      diagnoses: capability.diagnoses.map((diagnosis) => ({
        name: diagnosis.name,
        pathology: diagnosis.pathology,
        severity: diagnosis.severity,
        message: diagnosis.message,
        repairMode: diagnosis.repairMode,
      })),
    })),
    summary,
  };

  return {
    ...evidencePayload,
    capabilities,
    evidence_hash: hash(canonicalJson(evidencePayload)),
    generated_at: (options.now?.() ?? new Date()).toISOString(),
  };
}
