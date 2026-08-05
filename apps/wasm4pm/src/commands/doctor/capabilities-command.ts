import { defineCommand } from 'citty';
import { emitResult, makeErrorResult, makeResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { exitWithFlush } from '../../otel/exit.js';
import { runVision2030Audit, VISION_2030_CAPABILITIES } from './capabilities.js';
import { Vision2030AuditError, type CapabilityStanding } from './vision2030.js';

function standingExitCode(standing: CapabilityStanding): number {
  switch (standing) {
    case 'ALIVE':
      return EXIT_CODES.success;
    case 'BLOCKED':
    case 'BUILD_BROKEN':
      return EXIT_CODES.config_error;
    case 'UNKNOWN':
    case 'UNSUPPORTED':
    case 'PARTIAL_ALIVE':
      return EXIT_CODES.partial_failure;
  }
}

export const doctorCapabilities = defineCommand({
  meta: {
    name: 'capabilities',
    description:
      'Execute the Vision 2030 capability audit with exact subject identity, evidence ceilings, replay hashes, and explicit unsupported boundaries',
  },
  args: {
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      description: 'Show every diagnosis under each capability',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress human output',
      alias: 'q',
    },
    only: {
      type: 'string',
      description: `Comma-separated capability ids: ${VISION_2030_CAPABILITIES.map((capability) => capability.id).join(', ')}`,
    },
  },
  async run(ctx) {
    const start = Date.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const only = String(ctx.args.only ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    try {
      const report = await runVision2030Audit({ only: only.length > 0 ? only : undefined });
      const exitCode = standingExitCode(report.overall_standing);
      const result = makeResult(
        'doctor capabilities',
        report,
        Date.now() - start,
        exitCode,
        `Vision 2030 standing: ${report.overall_standing} (${report.scope.mode.toLowerCase()} scope; selected ${report.scope_standing})`
      );
      emitResult(result, { format, verbose, quiet }, (_result, projection) => {
        projection.log(`Vision 2030: ${report.overall_standing}`);
        projection.log(`Selected scope: ${report.scope_standing} (${report.scope.mode})`);
        projection.log(`Subject: ${report.subject.git_commit ?? 'UNADMITTED'}`);
        if (report.subject.limitation) projection.log(`Subject limitation: ${report.subject.limitation}`);
        projection.log(`Catalog: ${report.catalog_hash}`);
        projection.log(`Evidence: ${report.evidence_hash}`);
        projection.log('');
        for (const capability of report.capabilities) {
          projection.log(
            `  [${capability.standing}] ${capability.id} — ${capability.counts.pass} pass, ${capability.counts.warn} warn, ${capability.counts.fail} fail, ${capability.counts.not_observed} not observed`
          );
          if (capability.limitation) projection.log(`      ${capability.limitation}`);
          if (verbose) {
            for (const [index, diagnosis] of capability.diagnoses.entries()) {
              const evidence = capability.evidence[index];
              projection.log(
                `      ${diagnosis.severity}/${evidence?.observation ?? 'UNKNOWN'}: ${diagnosis.name} — ${diagnosis.message}`
              );
              if (evidence) projection.log(`        proof: ${evidence.diagnosis_hash}`);
            }
          }
        }
      });
      return await exitWithFlush(exitCode);
    } catch (error) {
      if (error instanceof Vision2030AuditError) {
        const result = makeErrorResult(
          'doctor capabilities',
          error,
          EXIT_CODES.source_error,
          error.code,
          error.alternatives.length > 0
            ? `Available capabilities: ${error.alternatives.join(', ')}`
            : undefined
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(EXIT_CODES.source_error);
      }
      throw error;
    }
  },
});
