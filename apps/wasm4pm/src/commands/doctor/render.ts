// Formatting helpers for doctor output
import type { Diagnosis, DoctorReport, RepairMode } from './types.js';
import type { ConsoleProjection } from '../../output.js';

export const BADGE = {
  INFO: ' INFO ',
  WARNING: ' WARN ',
  STOP_THE_LINE: ' STOP ',
} as const;

export function renderBadge(severity: Diagnosis['severity']): string {
  return `[${BADGE[severity]}]`;
}

// ANSI color helpers for doctor output (not via ConsoleProjection to keep inline context)
export const C = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  reset: '\x1b[0m',
};

export function getSectionForDiagnosis(diag: Diagnosis): string {
  const name = diag.name;
  if (name.includes('(TPS)')) return 'TPS Pipeline & Epistemic Truth';
  if (name.startsWith('algo.')) return 'Algorithm Health';
  if (name.startsWith('data.')) return 'Data Quality';
  if (name.startsWith('output.')) return 'Output Contract';
  if (name.startsWith('otel.')) return 'Observability';
  if (name.startsWith('config.')) return 'Config System';
  if (
    name === 'Claude Code settings' ||
    name === 'Hook files' ||
    name === 'CLAUDE.md' ||
    name === 'Memory index'
  ) return 'Claude Code Integration';
  return 'Environment & Deployment Truth';
}

export function printReportToProjection(p: ConsoleProjection, report: DoctorReport): void {
  p.log('');
  p.log(C.bold('wpm doctor — epistemic diagnostician & autonomic governor'));
  p.log(`  Running ${report.diagnoses.length} checks across 8 categories`);
  p.log('─'.repeat(80));

  let lastSection = '';
  for (const diag of report.diagnoses) {
    const section = getSectionForDiagnosis(diag);
    if (section !== lastSection) {
      if (lastSection) p.log('');
      p.log(`  ${C.bold(section)}:`);
      lastSection = section;
    }

    // Color-coded badge
    const badgeText = BADGE[diag.severity];
    const coloredBadge =
      diag.severity === 'INFO'
        ? C.green(`[${badgeText}]`)
        : diag.severity === 'WARNING'
          ? C.yellow(`[${badgeText}]`)
          : C.red(`[${badgeText}]`);

    const checkIcon =
      diag.severity === 'INFO' ? C.green('✓') : diag.severity === 'WARNING' ? C.yellow('⚠') : C.red('✗');

    p.log(`    ${coloredBadge}  ${checkIcon} ${diag.name}  ${C.dim(`[${diag.pathology || 'UNKNOWN'}]`)}`);
    p.log(`             ${diag.message}`);

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
        } else if (fixText.includes('wpm init')) {
          inferredRepairMode = 'SCAFFOLD_CONFIG';
          inferredRepairCmd = 'wpm init';
        } else if (fixText.includes('corepack')) {
          inferredRepairMode = 'REINSTALL_DEPENDENCIES';
          inferredRepairCmd = fixText;
        } else if (diag.name.includes('(TPS)')) {
          inferredRepairMode = 'SYNC_REGISTRY';
        }
      }

      if (inferredRepairMode !== 'MANUAL_INTERVENTION' && inferredRepairCmd) {
        // Make the repair command visually prominent — it's the most actionable line
        p.log(`             ${C.bold('Fix:')}  ${C.cyan(inferredRepairCmd)}`);
      } else if (inferredRepairMode !== 'MANUAL_INTERVENTION') {
        p.log(`             Repair mode: ${inferredRepairMode}`);
      }

      if (fixText && fixText !== inferredRepairCmd) {
        // Only show full fix text if it adds information beyond the repair command
        const shortFix = fixText.length > 120 ? fixText.slice(0, 117) + '...' : fixText;
        p.log(`             ${C.dim(`Guidance: ${shortFix}`)}`);
      }
    }
  }

  p.log('');
  p.log('─'.repeat(80));

  // Summary line with colored counts
  const infoStr = C.green(`${report.info} passed`);
  const warnStr = report.warnings > 0 ? C.yellow(`${report.warnings} warnings`) : C.dim(`${report.warnings} warnings`);
  const stopStr = report.stopTheLine > 0 ? C.red(`${report.stopTheLine} critical`) : C.dim(`${report.stopTheLine} critical`);
  p.log(`Result: ${infoStr}  ${warnStr}  ${stopStr}`);
  p.log('');

  if (report.epistemicHealth) {
    p.success(C.green('System is epistemically healthy and operationally ready.'));
  } else {
    const stopCount = report.stopTheLine;
    p.error(
      `STOP THE LINE: ${stopCount} critical issue${stopCount !== 1 ? 's' : ''} must be fixed before wpm can be used reliably.`
    );
    p.log('');
    p.log(C.bold('  Critical issues require immediate attention:'));
    for (const diag of report.diagnoses.filter((d) => d.severity === 'STOP_THE_LINE')) {
      const cmd = diag.repairCommand || diag.fixGuide || diag.fix;
      if (cmd) {
        p.log(`    ${C.red('✗')} ${diag.name}`);
        p.log(`      ${C.bold('Run:')} ${C.cyan(cmd)}`);
      } else {
        p.log(`    ${C.red('✗')} ${diag.name}  — manual intervention required`);
      }
    }
  }
  p.log('');
}

export function generateHtmlReport(data: {
  generated_at: string;
  wpm_version: string;
  platform: { os: string; arch: string; node: string };
  checks: Diagnosis[];
  summary: { pass: number; warn: number; fail: number; critical: number };
}): string {
  const checkRows = data.checks
    .map((d) => {
      const color =
        d.severity === 'INFO' ? '#2ea44f' : d.severity === 'WARNING' ? '#d29922' : '#cf222e';
      const fixHtml = d.fix
        ? `<p style="font-size:0.85em;color:#666;margin:4px 0 0 0"><strong>Fix:</strong> <code>${escapeHtml(d.fix)}</code></p>`
        : '';
      return `
      <details style="margin-bottom:8px;border:1px solid #d0d7de;border-radius:6px;padding:0">
        <summary style="cursor:pointer;padding:8px 12px;background:#f6f8fa;border-radius:6px;list-style:none;display:flex;align-items:center;gap:8px">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0"></span>
          <strong>${escapeHtml(d.name)}</strong>
          <span style="color:#666;font-size:0.9em">[${escapeHtml(d.severity)}]</span>
        </summary>
        <div style="padding:12px">
          <p style="margin:0">${escapeHtml(d.message)}</p>
          ${fixHtml}
          ${d.pathology ? `<p style="font-size:0.85em;color:#666;margin:4px 0 0 0">Pathology: ${escapeHtml(d.pathology)}</p>` : ''}
        </div>
      </details>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>wpm doctor report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 24px; color: #1f2328; background: #fff; }
    h1 { border-bottom: 1px solid #d0d7de; padding-bottom: 12px; }
    .meta { color: #656d76; font-size: 0.9em; margin-bottom: 24px; }
    .summary { display: flex; gap: 16px; margin-bottom: 24px; }
    .badge { padding: 4px 12px; border-radius: 20px; font-weight: bold; font-size: 0.9em; }
    .badge-pass { background: #dcffe4; color: #116329; }
    .badge-warn { background: #fff8c5; color: #7d4e00; }
    .badge-fail { background: #ffd7d5; color: #82071e; }
    code { background: #f6f8fa; padding: 2px 4px; border-radius: 3px; font-size: 0.9em; }
    details summary::-webkit-details-marker { display: none; }
  </style>
</head>
<body>
  <h1>wpm doctor report</h1>
  <div class="meta">
    Generated: ${escapeHtml(data.generated_at)} &nbsp;|&nbsp;
    Version: ${escapeHtml(data.wpm_version)} &nbsp;|&nbsp;
    ${escapeHtml(data.platform.os)}/${escapeHtml(data.platform.arch)} &nbsp;|&nbsp;
    Node ${escapeHtml(data.platform.node)}
  </div>
  <div class="summary">
    <span class="badge badge-pass">${data.summary.pass} pass</span>
    <span class="badge badge-warn">${data.summary.warn} warn</span>
    <span class="badge badge-fail">${data.summary.fail} fail</span>
  </div>
  <div>
${checkRows}
  </div>
</body>
</html>`;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
