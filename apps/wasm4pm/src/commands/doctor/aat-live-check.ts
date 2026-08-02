import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Diagnosis } from './types.js';
import { resolveWorkspaceRoot } from './checks-env.js';
import { verifyReleaseCertificate } from '../../release/certificate.js';
import {
  verifyAatLiveBundle,
  type AatLiveBundle,
} from '../../vision/aat-live-bundle.js';

function newestBundle(directory: string): string | undefined {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) return undefined;
  const candidates = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.bundle.json'))
    .map((name) => {
      const absolute = path.join(directory, name);
      return { absolute, modified: fs.statSync(absolute).mtimeMs };
    })
    .sort((left, right) => right.modified - left.modified);
  return candidates[0]?.absolute;
}

/** Replay the newest admitted AAT-Live bundle against the current exact release graph. */
export async function checkAatLiveRuntime(): Promise<Diagnosis> {
  const root = resolveWorkspaceRoot();
  if (!root) {
    return {
      name: 'AAT-Live runtime',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'WARNING',
      message: 'Workspace root not found; AAT-Live standing is UNKNOWN',
      repairMode: 'MANUAL_INTERVENTION',
      fixGuide: 'Run the capability audit from an admitted wasm4pm checkout.',
    };
  }

  const bundlePath = newestBundle(path.join(root, '.wasm4pm', 'aat-live'));
  if (!bundlePath) {
    return {
      name: 'AAT-Live runtime',
      pathology: 'EVIDENCE_QUALITY_FAULT',
      severity: 'WARNING',
      message: 'No AAT-Live bundle has been observed; implementation exists but SUBJECT_ALIVE is unproven',
      repairMode: 'MANUAL_INTERVENTION',
      fixGuide:
        'Run wpm evidence live --trace <trace.ndjson> --session <session.json> --weaver <report.json> --proof <proof.json>, then replay doctor.',
    };
  }

  let bundle: AatLiveBundle;
  try {
    bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8')) as AatLiveBundle;
  } catch (error) {
    return {
      name: 'AAT-Live runtime',
      pathology: 'EVIDENCE_QUALITY_FAULT',
      severity: 'STOP_THE_LINE',
      message: `Cannot parse ${path.relative(root, bundlePath)}: ${error instanceof Error ? error.message : String(error)}`,
      repairMode: 'MANUAL_INTERVENTION',
      fixGuide: 'Preserve the damaged bundle and manufacture a new admitted run.',
    };
  }

  const verification = verifyAatLiveBundle(bundle);
  const release = verifyReleaseCertificate(root);
  const identityMatches =
    release.valid &&
    release.certificate_hash === bundle.input.release.certificate.hash &&
    release.git_commit === bundle.input.release.package.git_commit;
  if (!verification.valid || !identityMatches) {
    const issues = [
      ...verification.issues,
      ...(release.valid
        ? identityMatches
          ? []
          : ['bundle release identity does not match the current exact artifact graph']
        : release.issues.map((issue) => `${issue.code}: ${issue.message}`)),
    ];
    return {
      name: 'AAT-Live runtime',
      pathology: 'REPRODUCIBILITY_TRUTH_FAULT',
      severity: 'STOP_THE_LINE',
      message: `AAT-Live bundle replay refused: ${issues.slice(0, 4).join('; ')}`,
      repairMode: 'MANUAL_INTERVENTION',
      fixGuide: 'Repair the first failed identity/signature/release edge and manufacture a new bundle.',
    };
  }

  return {
    name: 'AAT-Live runtime',
    pathology: 'REPRODUCIBILITY_TRUTH_FAULT',
    severity: 'INFO',
    message: `Accepted AAT-Live bundle replayed against the current exact release graph (${verification.bundle_hash})`,
  };
}
