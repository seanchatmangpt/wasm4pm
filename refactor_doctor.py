import re

with open('apps/wasm4pm/src/commands/doctor.ts', 'r') as f:
    content = f.read()

# Replace interfaces
interfaces = """export type Pathology = 
  | 'ENVIRONMENT_FAULT' 
  | 'MODEL_TRUTH_FAULT' 
  | 'PLAN_TRUTH_FAULT' 
  | 'TIMING_TRUTH_FAULT' 
  | 'DEPLOYABILITY_TRUTH_FAULT' 
  | 'REPRODUCIBILITY_TRUTH_FAULT' 
  | 'ANTI_LIE_TRUTH_FAULT'
  | 'EPISTEMIC_FAULT';

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
interface DoctorReport {
  diagnoses: Diagnosis[];
  info: number;
  warnings: number;
  stopTheLine: number;
  epistemicHealth: boolean;
}"""

content = re.sub(
    r'/\*\* Result of a single health check \*/.*?interface DoctorReport \{.*?\n\}',
    interfaces,
    content,
    flags=re.DOTALL
)

# Map old fields to new fields
def replacer(match):
    body = match.group(0)
    
    # Extract name safely
    name_match = re.search(r"name:\s*'([^']+)'", body)
    name = name_match.group(1) if name_match else "Unknown"

    # Extract status safely
    status_match = re.search(r"status:\s*'([^']+)'", body)
    status = status_match.group(1) if status_match else "ok"
    
    severity = 'INFO'
    if status == 'warn':
        severity = 'WARNING'
    elif status == 'fail':
        severity = 'STOP_THE_LINE'

    body = re.sub(r"status:\s*'[^']+'", f"severity: '{severity}'", body)

    # Pathology assignment based on name
    pathology = "'ENVIRONMENT_FAULT'"
    if 'version' in name.lower() or 'toolchain' in name.lower():
        pathology = "'ENVIRONMENT_FAULT'"
    elif 'WASM' in name:
        pathology = "'ENVIRONMENT_FAULT'"
    elif 'Config' in name:
        pathology = "'REPRODUCIBILITY_TRUTH_FAULT'"
    elif 'XES' in name:
        pathology = "'REPRODUCIBILITY_TRUTH_FAULT'"
    elif 'memory' in name.lower() or 'disk' in name.lower():
        pathology = "'DEPLOYABILITY_TRUTH_FAULT'"
    elif 'Git' in name:
        pathology = "'DEPLOYABILITY_TRUTH_FAULT'"
    elif 'TypeScript' in name:
        pathology = "'EPISTEMIC_FAULT'"
    elif '@wasm4pm/ml' in name:
        pathology = "'ENVIRONMENT_FAULT'"
    elif 'Results' in name:
        pathology = "'DEPLOYABILITY_TRUTH_FAULT'"
    elif 'Registry' in name:
        pathology = "'MODEL_TRUTH_FAULT'"
    elif 'Workspace' in name:
        pathology = "'DEPLOYABILITY_TRUTH_FAULT'"
    elif 'Step type' in name:
        pathology = "'PLAN_TRUTH_FAULT'"
    elif 'State machine' in name:
        pathology = "'ANTI_LIE_TRUTH_FAULT'"
    elif 'Profile coverage' in name:
        pathology = "'MODEL_TRUTH_FAULT'"
    elif 'Canonical' in name:
        pathology = "'MODEL_TRUTH_FAULT'"

    # Insert pathology
    body = re.sub(r"(name:\s*'[^']+',)", r"\1 pathology: " + pathology + ",", body)

    # Note: we don't try to regex 'fix:' anymore, we let the interface accept it.
    # However, we can guess repairMode based on 'fix:' value dynamically in the print function or here.
    return body

content = re.sub(r'\{\s*name:\s*\'[^\']+\',\s*status:\s*\'[^\']+\'[\s\S]*?\}', replacer, content)

# Type replacements
content = content.replace('Promise<CheckResult>', 'Promise<Diagnosis>')
content = content.replace('CheckResult[]', 'Diagnosis[]')
content = content.replace('check: CheckResult', 'check: Diagnosis')
content = content.replace("CheckResult['status']", "Diagnosis['severity']")
content = content.replace("const checks: CheckResult[]", "const checks: Diagnosis[]")

# Fix printReport section entirely
idx_start = content.find('const BADGE = {')
idx_end = content.find('export const doctor = defineCommand({')

print_report_replacement = """const BADGE = {
  INFO: ' INFO ',
  WARNING: ' WARN ',
  STOP_THE_LINE: ' STOP ',
} as const;

function renderBadge(severity: Diagnosis['severity']): string {
  return `[${BADGE[severity]}]`;
}

function printReport(formatter: HumanFormatter, report: DoctorReport): void {
  formatter.log('');
  formatter.log('wasm4pm doctor — epistemic diagnostician & autonomic governor');
  formatter.log('─'.repeat(80));

  let lastSection = '';
  for (const diag of report.diagnoses) {
    const isTps = diag.name.includes('(TPS)');
    const section = isTps ? 'TPS Pipeline & Epistemic Truth' : 'Environment & Deployment Truth';
    if (section !== lastSection) {
      if (lastSection) formatter.log('');
      formatter.log(`  ${section}:`);
      lastSection = section;
    }

    const badge = renderBadge(diag.severity);
    formatter.log(`    ${badge}  ${diag.name} [${diag.pathology || 'UNKNOWN'}]`);
    formatter.log(`             Diagnosis: ${diag.message}`);
    
    if (diag.severity !== 'INFO') {
      const fixText = diag.fixGuide || diag.fix;
      
      // Dynamically infer repair mode
      let inferredRepairMode: RepairMode = diag.repairMode || 'MANUAL_INTERVENTION';
      let inferredRepairCmd = diag.repairCommand;
      
      if (fixText) {
          if (fixText.includes('pnpm run build') && fixText.includes('cd wasm4pm')) {
              inferredRepairMode = 'REBUILD_ARTIFACTS';
              inferredRepairCmd = 'cd wasm4pm && pnpm run build';
          } else if (fixText.includes('pnpm run build')) {
              inferredRepairMode = 'REBUILD_ARTIFACTS';
              inferredRepairCmd = 'pnpm run build';
          } else if (fixText.includes('pnpm install')) {
              inferredRepairMode = 'REINSTALL_DEPENDENCIES';
              inferredRepairCmd = 'pnpm install';
          } else if (fixText.includes('wasm4pm init')) {
              inferredRepairMode = 'SCAFFOLD_CONFIG';
              inferredRepairCmd = 'wasm4pm init';
          } else if (fixText.includes('corepack')) {
              inferredRepairMode = 'REINSTALL_DEPENDENCIES';
              inferredRepairCmd = fixText;
          } else if (isTps) {
              inferredRepairMode = 'SYNC_REGISTRY';
          }
      }
      
      if (inferredRepairMode !== 'MANUAL_INTERVENTION') {
        formatter.log(`             Repair Mode: ${inferredRepairMode}`);
        if (inferredRepairCmd) {
            formatter.log(`             Smallest Lawful Repair: ${inferredRepairCmd}`);
        }
      }
      
      if (fixText) {
        formatter.log(`             Manual Treatment: ${fixText}`);
      }
    }
  }

  formatter.log('');
  formatter.log('─'.repeat(80));
  formatter.log(`Result: ${report.info} INFO  ${report.warnings} WARNINGS  ${report.stopTheLine} STOP_THE_LINE`);
  formatter.log('');

  if (report.epistemicHealth) {
    formatter.success('System is epistemically healthy and operationally ready.');
  } else {
    formatter.error('STOP THE LINE: System is epistemically unhealthy or missing critical deployment artifacts.');
  }
  formatter.log('');
}

// ────────────────────────────────────────────────────────────────────────────
// Command definition
// ────────────────────────────────────────────────────────────────────────────

"""

content = content[:idx_start] + print_report_replacement + content[idx_end:]

# Fix the report generation in run()
content = content.replace('const report: DoctorReport = {', 'const report: DoctorReport = {')
content = content.replace('checks,', 'diagnoses: checks,')
content = content.replace("ok: checks.filter((c) => c.status === 'ok').length,", "info: checks.filter((c) => c.severity === 'INFO').length,")
content = content.replace("warn: checks.filter((c) => c.status === 'warn').length,", "warnings: checks.filter((c) => c.severity === 'WARNING').length,")
content = content.replace("fail: checks.filter((c) => c.status === 'fail').length,", "stopTheLine: checks.filter((c) => c.severity === 'STOP_THE_LINE').length,")
content = content.replace("healthy: checks.every((c) => c.status !== 'fail'),", "epistemicHealth: checks.every((c) => c.severity !== 'STOP_THE_LINE'),")

# Fix formatter payload names
content = content.replace('report.healthy', 'report.epistemicHealth')
content = content.replace('checks: report.checks', 'diagnoses: report.diagnoses')

with open('apps/wasm4pm/src/commands/doctor.ts', 'w') as f:
    f.write(content)
