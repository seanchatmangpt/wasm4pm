// Shared types for the doctor command module

export interface DoctorOptions {
  fix?: boolean;
}

export type Pathology =
  | 'ENVIRONMENT_FAULT'
  | 'MODEL_TRUTH_FAULT'
  | 'PLAN_TRUTH_FAULT'
  | 'TIMING_TRUTH_FAULT'
  | 'DEPLOYABILITY_TRUTH_FAULT'
  | 'REPRODUCIBILITY_TRUTH_FAULT'
  | 'ANTI_LIE_TRUTH_FAULT'
  | 'EPISTEMIC_FAULT'
  | 'EVIDENCE_QUALITY_FAULT';

export type Severity = 'INFO' | 'WARNING' | 'STOP_THE_LINE';

export type RepairMode =
  | 'MANUAL_INTERVENTION'
  | 'REBUILD_ARTIFACTS'
  | 'SYNC_REGISTRY'
  | 'SCAFFOLD_CONFIG'
  | 'REINSTALL_DEPENDENCIES'
  | 'AUTO_REPAIR';

/** Result of a single health diagnosis */
export interface Diagnosis {
  name: string;
  pathology?: Pathology;
  severity: Severity;
  message: string;
  repairMode?: RepairMode;
  repairCommand?: string; // The smallest lawful repair
  fixGuide?: string; // For manual intervention
  fix?: string; // Backwards compatibility for raw checks
}

/** Aggregate report */
export interface DoctorReport {
  diagnoses: Diagnosis[];
  info: number;
  warnings: number;
  stopTheLine: number;
  epistemicHealth: boolean;
}
