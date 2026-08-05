import type { Diagnosis, ObservationKind } from './types.js';

export type CapabilityStanding =
  | 'UNKNOWN'
  | 'PARTIAL_ALIVE'
  | 'ALIVE'
  | 'BLOCKED'
  | 'BUILD_BROKEN'
  | 'UNSUPPORTED';

export interface Vision2030Subject {
  readonly repository: string;
  readonly git_commit: string | null;
  readonly package_version: string | null;
  readonly node_version: string;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly admitted: boolean;
  readonly limitation?: string;
}

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

export interface DiagnosisEvidence {
  readonly check: string;
  readonly observation: ObservationKind;
  readonly diagnosis_hash: string;
}

export interface CapabilityEvidence {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly standing: CapabilityStanding;
  readonly ceiling: CapabilityStanding;
  readonly failure_standing: 'BLOCKED' | 'BUILD_BROKEN';
  readonly diagnoses: readonly Diagnosis[];
  readonly evidence: readonly DiagnosisEvidence[];
  readonly counts: {
    readonly pass: number;
    readonly warn: number;
    readonly fail: number;
    readonly executed: number;
    readonly inspected: number;
    readonly not_observed: number;
    readonly unsupported: number;
  };
  readonly limitation?: string;
}

export interface Vision2030Report {
  readonly schema_version: 'wasm4pm.vision2030.v2';
  /** Standing of the selected capability subset before global-scope and subject admission fences. */
  readonly scope_standing: CapabilityStanding;
  /** Globally defensible standing. A filtered or unadmitted audit cannot be ALIVE. */
  readonly overall_standing: CapabilityStanding;
  readonly subject: Vision2030Subject;
  readonly scope: {
    readonly mode: 'FULL' | 'FILTERED';
    readonly complete: boolean;
    readonly selected_ids: readonly string[];
    readonly available_ids: readonly string[];
  };
  readonly catalog_hash: string;
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

export interface Vision2030Verification {
  readonly valid: boolean;
  readonly issues: readonly string[];
  readonly recomputed_evidence_hash: string;
}

export class Vision2030AuditError extends Error {
  constructor(
    readonly code:
      | 'UNKNOWN_CAPABILITY_REFUSED'
      | 'EMPTY_CAPABILITY_SET_REFUSED'
      | 'DUPLICATE_CAPABILITY_ID_REFUSED',
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

const LEGACY_NOT_OBSERVED = /^(?:Skipped\b|Binary shadow check skipped\b)/i;

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

function observationOf(diagnosis: Diagnosis): ObservationKind {
  if (diagnosis.observation) return diagnosis.observation;
  // Backward-compatible fail-closed treatment for legacy checks. New checks
  // should populate observation explicitly; legacy "Skipped" prose is never a pass.
  if (LEGACY_NOT_OBSERVED.test(diagnosis.message.trim())) return 'NOT_OBSERVED';
  return 'EXECUTED';
}

function applyCeiling(
  observed: CapabilityStanding,
  ceiling: CapabilityDefinition['ceiling'] | CapabilityStanding
): CapabilityStanding {
  if (!ceiling || observed === 'BLOCKED' || observed === 'BUILD_BROKEN') return observed;
  return STANDING_RANK[observed] <= STANDING_RANK[ceiling] ? observed : ceiling;
}

function observedStanding(
  diagnoses: readonly Diagnosis[],
  evidence: readonly DiagnosisEvidence[],
  failureStanding: CapabilityDefinition['failureStanding'] | 'BLOCKED' | 'BUILD_BROKEN'
): CapabilityStanding {
  if (diagnoses.length === 0) return 'UNKNOWN';
  if (diagnoses.some((diagnosis) => diagnosis.severity === 'STOP_THE_LINE')) {
    return failureStanding ?? 'BLOCKED';
  }
  if (evidence.every((item) => item.observation === 'UNSUPPORTED')) return 'UNSUPPORTED';
  if (evidence.every((item) => item.observation === 'NOT_OBSERVED')) return 'UNKNOWN';
  if (
    diagnoses.some((diagnosis) => diagnosis.severity === 'WARNING') ||
    evidence.some((item) => item.observation !== 'EXECUTED')
  ) {
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
      observation: 'EXECUTED',
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

function boundedGlobalStanding(
  scopeStanding: CapabilityStanding,
  complete: boolean,
  subjectAdmitted: boolean
): CapabilityStanding {
  if (scopeStanding === 'BUILD_BROKEN' || scopeStanding === 'BLOCKED') return scopeStanding;
  if (complete && subjectAdmitted) return scopeStanding;
  if (scopeStanding === 'UNKNOWN') return 'UNKNOWN';
  return 'PARTIAL_ALIVE';
}

function capabilityCatalogPayload(definitions: readonly CapabilityDefinition[]): unknown {
  return definitions.map((definition) => ({
    id: definition.id,
    label: definition.label,
    description: definition.description,
    check_names: definition.checks.map((check) => check.name || 'anonymous capability check'),
    ceiling: definition.ceiling ?? 'ALIVE',
    failure_standing: definition.failureStanding ?? 'BLOCKED',
    unsupported_reason: definition.unsupportedReason,
  }));
}

function capabilityEvidencePayload(capability: CapabilityEvidence): unknown {
  return {
    id: capability.id,
    label: capability.label,
    description: capability.description,
    standing: capability.standing,
    ceiling: capability.ceiling,
    failure_standing: capability.failure_standing,
    counts: capability.counts,
    limitation: capability.limitation,
    diagnoses: capability.diagnoses.map((diagnosis) => ({
      name: diagnosis.name,
      pathology: diagnosis.pathology,
      severity: diagnosis.severity,
      message: diagnosis.message,
      observation: observationOf(diagnosis),
      proof: diagnosis.proof,
      repairMode: diagnosis.repairMode,
    })),
    evidence: capability.evidence,
  };
}

function reportEvidencePayload(report: Omit<Vision2030Report, 'evidence_hash' | 'generated_at'>): unknown {
  return {
    schema_version: report.schema_version,
    scope_standing: report.scope_standing,
    overall_standing: report.overall_standing,
    subject: report.subject,
    scope: report.scope,
    catalog_hash: report.catalog_hash,
    capabilities: report.capabilities.map(capabilityEvidencePayload),
    summary: report.summary,
  };
}

function countsFor(
  diagnoses: readonly Diagnosis[],
  evidence: readonly DiagnosisEvidence[]
): CapabilityEvidence['counts'] {
  const countObservation = (observation: ObservationKind): number =>
    evidence.filter((item) => item.observation === observation).length;
  return {
    pass: diagnoses.filter((diagnosis) => diagnosis.severity === 'INFO').length,
    warn: diagnoses.filter((diagnosis) => diagnosis.severity === 'WARNING').length,
    fail: diagnoses.filter((diagnosis) => diagnosis.severity === 'STOP_THE_LINE').length,
    executed: countObservation('EXECUTED'),
    inspected: countObservation('INSPECTED'),
    not_observed: countObservation('NOT_OBSERVED'),
    unsupported: countObservation('UNSUPPORTED'),
  };
}

function defaultSubject(): Vision2030Subject {
  return {
    repository: 'UNKNOWN',
    git_commit: null,
    package_version: null,
    node_version: process.version,
    platform: process.platform,
    arch: process.arch,
    admitted: false,
    limitation: 'Exact repository and Git commit identity were not supplied.',
  };
}

export async function evaluateVision2030(
  definitions: readonly CapabilityDefinition[],
  hash: EvidenceHasher,
  options: {
    readonly only?: readonly string[];
    readonly now?: () => Date;
    readonly subject?: Vision2030Subject;
  } = {}
): Promise<Vision2030Report> {
  if (definitions.length === 0) {
    throw new Vision2030AuditError(
      'EMPTY_CAPABILITY_SET_REFUSED',
      'Vision 2030 audit refused: no capability definitions were admitted.'
    );
  }

  const ids = definitions.map((definition) => definition.id);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].sort();
  if (duplicateIds.length > 0) {
    throw new Vision2030AuditError(
      'DUPLICATE_CAPABILITY_ID_REFUSED',
      `Duplicate Vision 2030 capability ids: ${duplicateIds.join(', ')}`
    );
  }

  const available = [...ids].sort();
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
  const selectedIds = selected.map((definition) => definition.id).sort();
  const complete = selectedIds.length === available.length && selectedIds.every((id, i) => id === available[i]);
  const scope = {
    mode: complete ? 'FULL' : 'FILTERED',
    complete,
    selected_ids: selectedIds,
    available_ids: available,
  } as const;

  const capabilities: CapabilityEvidence[] = [];
  for (const definition of selected) {
    const failureStanding = definition.failureStanding ?? 'BLOCKED';
    if (definition.unsupportedReason && definition.checks.length === 0) {
      capabilities.push({
        id: definition.id,
        label: definition.label,
        description: definition.description,
        standing: 'UNSUPPORTED',
        ceiling: definition.ceiling ?? 'UNSUPPORTED',
        failure_standing: failureStanding,
        diagnoses: [],
        evidence: [],
        counts: {
          pass: 0,
          warn: 0,
          fail: 0,
          executed: 0,
          inspected: 0,
          not_observed: 0,
          unsupported: 0,
        },
        limitation: definition.unsupportedReason,
      });
      continue;
    }

    const diagnoses = await Promise.all(definition.checks.map(executeCheck));
    const evidence = diagnoses.map<DiagnosisEvidence>((diagnosis, index) => ({
      check: definition.checks[index]?.name || diagnosis.name || 'anonymous capability check',
      observation: observationOf(diagnosis),
      diagnosis_hash: hash(
        canonicalJson({
          subject: options.subject ?? defaultSubject(),
          capability_id: definition.id,
          check: definition.checks[index]?.name || diagnosis.name,
          diagnosis: {
            ...diagnosis,
            observation: observationOf(diagnosis),
          },
        })
      ),
    }));
    const observed = observedStanding(diagnoses, evidence, failureStanding);
    const standing = applyCeiling(observed, definition.ceiling);
    capabilities.push({
      id: definition.id,
      label: definition.label,
      description: definition.description,
      standing,
      ceiling: definition.ceiling ?? 'ALIVE',
      failure_standing: failureStanding,
      diagnoses,
      evidence,
      counts: countsFor(diagnoses, evidence),
      limitation:
        standing === definition.ceiling && definition.ceiling !== 'ALIVE'
          ? `Evidence ceiling: ${definition.ceiling}`
          : undefined,
    });
  }

  const subject = options.subject ?? defaultSubject();
  const scopeStanding = overallStanding(capabilities);
  const overall = boundedGlobalStanding(scopeStanding, complete, subject.admitted);
  const summary = summarize(capabilities);
  const catalogHash = hash(canonicalJson(capabilityCatalogPayload(definitions)));
  const reportWithoutHash: Omit<Vision2030Report, 'evidence_hash' | 'generated_at'> = {
    schema_version: 'wasm4pm.vision2030.v2',
    scope_standing: scopeStanding,
    overall_standing: overall,
    subject,
    scope,
    catalog_hash: catalogHash,
    capabilities,
    summary,
  };

  return {
    ...reportWithoutHash,
    evidence_hash: hash(canonicalJson(reportEvidencePayload(reportWithoutHash))),
    generated_at: (options.now?.() ?? new Date()).toISOString(),
  };
}

export function verifyVision2030Report(
  report: Vision2030Report,
  hash: EvidenceHasher
): Vision2030Verification {
  const issues: string[] = [];
  if (report.schema_version !== 'wasm4pm.vision2030.v2') {
    issues.push('SCHEMA_VERSION_MISMATCH');
  }
  if (new Set(report.scope.available_ids).size !== report.scope.available_ids.length) {
    issues.push('DUPLICATE_AVAILABLE_CAPABILITY_ID');
  }
  if (new Set(report.scope.selected_ids).size !== report.scope.selected_ids.length) {
    issues.push('DUPLICATE_SELECTED_CAPABILITY_ID');
  }
  if (report.scope.selected_ids.some((id) => !report.scope.available_ids.includes(id))) {
    issues.push('SELECTED_CAPABILITY_NOT_IN_CATALOG');
  }
  const expectedComplete =
    report.scope.selected_ids.length === report.scope.available_ids.length &&
    [...report.scope.selected_ids].sort().every((id, i) => id === [...report.scope.available_ids].sort()[i]);
  if (report.scope.complete !== expectedComplete) issues.push('SCOPE_COMPLETENESS_MISMATCH');
  if (report.scope.mode !== (expectedComplete ? 'FULL' : 'FILTERED')) {
    issues.push('SCOPE_MODE_MISMATCH');
  }

  for (const capability of report.capabilities) {
    if (capability.diagnoses.length !== capability.evidence.length) {
      issues.push(`EVIDENCE_CARDINALITY_MISMATCH:${capability.id}`);
      continue;
    }
    const expectedEvidence = capability.diagnoses.map<DiagnosisEvidence>((diagnosis, index) => ({
      check: capability.evidence[index]?.check ?? diagnosis.name,
      observation: observationOf(diagnosis),
      diagnosis_hash: hash(
        canonicalJson({
          subject: report.subject,
          capability_id: capability.id,
          check: capability.evidence[index]?.check ?? diagnosis.name,
          diagnosis: {
            ...diagnosis,
            observation: observationOf(diagnosis),
          },
        })
      ),
    }));
    expectedEvidence.forEach((expected, index) => {
      const actual = capability.evidence[index];
      if (!actual || canonicalJson(actual) !== canonicalJson(expected)) {
        issues.push(`DIAGNOSIS_EVIDENCE_MISMATCH:${capability.id}:${index}`);
      }
    });
    const expectedCounts = countsFor(capability.diagnoses, expectedEvidence);
    if (canonicalJson(capability.counts) !== canonicalJson(expectedCounts)) {
      issues.push(`CAPABILITY_COUNTS_MISMATCH:${capability.id}`);
    }
    const expectedStanding = applyCeiling(
      observedStanding(capability.diagnoses, expectedEvidence, capability.failure_standing),
      capability.ceiling
    );
    if (capability.standing !== expectedStanding) {
      issues.push(`CAPABILITY_STANDING_MISMATCH:${capability.id}`);
    }
  }

  const expectedSummary = summarize(report.capabilities);
  if (canonicalJson(report.summary) !== canonicalJson(expectedSummary)) {
    issues.push('SUMMARY_MISMATCH');
  }
  const expectedScopeStanding = overallStanding(report.capabilities);
  if (report.scope_standing !== expectedScopeStanding) issues.push('SCOPE_STANDING_MISMATCH');
  const expectedOverall = boundedGlobalStanding(
    expectedScopeStanding,
    report.scope.complete,
    report.subject.admitted
  );
  if (report.overall_standing !== expectedOverall) issues.push('OVERALL_STANDING_MISMATCH');

  const withoutHash: Omit<Vision2030Report, 'evidence_hash' | 'generated_at'> = {
    schema_version: report.schema_version,
    scope_standing: report.scope_standing,
    overall_standing: report.overall_standing,
    subject: report.subject,
    scope: report.scope,
    catalog_hash: report.catalog_hash,
    capabilities: report.capabilities,
    summary: report.summary,
  };
  const recomputed = hash(canonicalJson(reportEvidencePayload(withoutHash)));
  if (recomputed !== report.evidence_hash) issues.push('EVIDENCE_HASH_MISMATCH');

  return { valid: issues.length === 0, issues, recomputed_evidence_hash: recomputed };
}
