export interface ResidualEntry {
  gate: string;
  description: string;
  status: 'open' | 'closed';
}

export interface WasmExportEntry {
  algorithm: string;
  ttlDeclaration: string;
  rustExport: string;
  verified: boolean;
}

export interface ReplayTemplate {
  algorithm: string;
  replay_pointer: string;
}

/** Base fields every context packet carries — proof of substrate anchoring */
export interface ContextPacketBase {
  /** BLAKE3 of the frozen admitted KGC universe */
  snapshotHash: string;
  /** KGC nanosecond timestamp when universe was frozen */
  snapshotTimestamp: bigint;
  /** Algorithm IDs with admitted=true in ocel/reports/pi/ */
  admittedAlgorithms: string[];
  /** Open residuals from crown report */
  recentResiduals: ResidualEntry[];
  /** Count of pi-<algo>-latest.json receipts on disk */
  receiptCount: number;
}

export interface PlanningContextPacket extends ContextPacketBase {
  priorityResiduals: ResidualEntry[];
  /** v1: no substrate source — populated when PI bottleneck mining exists */
  bottleneckAlgorithms: string[];
  /** v1: no substrate source — populated when drift detection feed exists */
  driftAlgorithms: string[];
}

export interface ImplementationContextPacket extends ContextPacketBase {
  wasmExportMap: WasmExportEntry[];
  boundaryConditions: { fitnessThreshold: number; admittedRequired: boolean };
  replayTemplates: ReplayTemplate[];
}

export interface VerificationContextPacket extends ContextPacketBase {
  receiptTemplates: { shape: string[] };
  crownGates: Array<{ gate: string; command: string; passCriteria: string }>;
  antiCheatSignatures: string[];
}

export interface RepairContextPacket extends ContextPacketBase {
  /** v1: no substrate source — populated when diagnostics feed exists */
  activeFailures: string[];
  priorRepairPatterns: string[];
}

export interface OrchestratorContextPacket extends ContextPacketBase {
  agentRouting: Record<string, string>;
  waveSequencing: string[];
  parallelizationSafe: string[];
  sequentialRequired: string[];
}
