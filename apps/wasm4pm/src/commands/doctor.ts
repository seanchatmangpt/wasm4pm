// Deprecated shim — logic moved to commands/doctor/index.ts (since v26.6.9)
export {
  doctorCommand,
  doctor,
  // types
} from './doctor/index.js';
export type { DoctorOptions, Pathology, Severity, RepairMode, Diagnosis, DoctorReport } from './doctor/index.js';
// check arrays
export {
  ENV_CHECKS,
  TPS_CHECKS,
  CLAUDE_CODE_CHECKS,
  ALGO_HEALTH_CHECKS,
  DATA_QUALITY_CHECKS,
  OUTPUT_CONTRACT_CHECKS,
  OBSERVABILITY_CHECKS,
  CONFIG_SYSTEM_CHECKS,
  ALL_CHECKS,
} from './doctor/index.js';
// subcommands
export {
  doctorCheck,
  doctorEnv,
  doctorTps,
  doctorFix,
  doctorPerf,
  doctorWatch,
  doctorReport,
  doctorPublish,
  doctorHooks,
} from './doctor/index.js';
// jtbd
export type { JtbdProbe } from './doctor/index.js';
export { runHook, probeHooks } from './doctor/index.js';
