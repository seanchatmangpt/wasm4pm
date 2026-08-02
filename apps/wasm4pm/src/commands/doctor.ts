// Compatibility adapter — implementation lives in commands/doctor/index.ts.
export {
  doctorCommand,
  doctor,
  // check arrays
  ENV_CHECKS,
  TPS_CHECKS,
  CLAUDE_CODE_CHECKS,
  ALGO_HEALTH_CHECKS,
  DATA_QUALITY_CHECKS,
  OUTPUT_CONTRACT_CHECKS,
  OBSERVABILITY_CHECKS,
  CONFIG_SYSTEM_CHECKS,
  BRCE_CHECKS,
  ALL_CHECKS,
  // subcommands
  doctorCheck,
  doctorEnv,
  doctorTps,
  doctorFix,
  doctorCapabilities,
  doctorPerf,
  doctorWatch,
  doctorReport,
  doctorPublish,
  doctorHooks,
  // Vision 2030 and BRCE surfaces
  runVision2030Audit,
  VISION_2030_CAPABILITIES,
  executeRepairPlan,
  planRepairs,
  REPAIR_INTENTS,
  validateRepairRegistry,
} from './doctor/index.js';

export type {
  DoctorOptions,
  Pathology,
  Severity,
  RepairMode,
  Diagnosis,
  DoctorReport,
  CapabilityDefinition,
  CapabilityEvidence,
  CapabilityStanding,
  Vision2030Report,
  PlannedRepair,
  RepairExecutionReport,
  RepairIntent,
  RepairIntentId,
  RepairOutcome,
  JtbdProbe,
} from './doctor/index.js';

export { runHook, probeHooks } from './doctor/index.js';
