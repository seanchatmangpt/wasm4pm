import * as fs from 'node:fs';
import * as path from 'node:path';
import { defineVerb } from '@wasm4pm/noun-verb';
import { blake3Hex, canonicalJson } from '../../receipts/_shared.js';

const PROCESS_FAMILIES = [
  ['descriptive_statistics', 'latent_process_hypothesis_generation'],
  ['classification', 'trajectory_state_inference'],
  ['regression', 'transition_dynamics_estimation'],
  ['clustering', 'process_family_inference'],
  ['forecasting', 'forward_process_inference'],
  ['survival_analysis', 'terminal_path_hazard_inference'],
  ['anomaly_detection', 'transition_law_violation_detection'],
  ['causal_inference', 'intervention_reachability_discrimination'],
  ['feature_engineering', 'process_projection_retention'],
  ['etl', 'evidence_reconstruction_and_provenance'],
  ['bayesian_inference', 'process_hypothesis_discrimination'],
  ['reinforcement_learning', 'governed_policy_trajectory_search'],
  [
    'process_science_end_to_end',
    'observe_admit_infer_discriminate_simulate_construct_govern_receipt',
  ],
] as const;

function countXmlElements(xml: string, name: 'trace' | 'event'): number {
  const pattern = new RegExp(`<${name}(?:\\s|>)`, 'g');
  return xml.match(pattern)?.length ?? 0;
}

function refusal(code: string, detail: string) {
  return {
    status: 'REFUSED' as const,
    refusal: code,
    detail,
    actuation: 'REFUSED' as const,
    exitCode: 2,
  };
}

export const processScienceVerb = defineVerb({
  noun: 'lab',
  verb: 'process-science',
  summary:
    'Admit an XES evidence file and manufacture a deterministic data-science -> process-science operator plan',
  stability: 'experimental',
  args: {
    input: {
      type: 'string',
      description: 'XES evidence file to admit.',
      required: true,
    },
    output: {
      type: 'string',
      description: 'Optional directory for deterministic process-science.json projection.',
    },
  } as const,
  machine: {
    authority: 'CONSTRUCT',
    effects: ['STDOUT', 'STDERR', 'FILESYSTEM', 'TELEMETRY'],
    idempotency: 'IDEMPOTENT',
    determinism: 'INPUT_DETERMINISTIC',
    receipts: 'REQUIRED',
  },
  handler: async (args) => {
    if (!args.input) {
      return refusal(
        'PROCESS_SCIENCE_INPUT_REQUIRED',
        'usage: wpm lab process-science --input <log.xes> [--output <directory>]'
      );
    }

    const inputPath = path.resolve(args.input);
    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(inputPath);
    } catch (error) {
      return refusal(
        'PROCESS_SCIENCE_INPUT_UNREADABLE',
        `${inputPath}: ${(error as Error).message}`
      );
    }

    const xml = bytes.toString('utf8');
    const traceCount = countXmlElements(xml, 'trace');
    const eventCount = countXmlElements(xml, 'event');
    if (traceCount === 0 || eventCount === 0) {
      return refusal(
        'PROCESS_SCIENCE_XES_EVIDENCE_EMPTY',
        `expected at least one <trace> and one <event>; observed traces=${traceCount}, events=${eventCount}`
      );
    }

    const evidenceHash = blake3Hex(bytes);
    const plan = PROCESS_FAMILIES.map(([family, operator], ordinal) => ({
      ordinal,
      family,
      operator,
      input_evidence_hash: evidenceHash,
      standing: 'CANDIDATE',
      authority: 'CONSTRUCT_ONLY',
    }));
    const projection = {
      schema: 'wasm4pm.process-science.cli.v1',
      evidence: {
        blake3: evidenceHash,
        bytes: bytes.length,
        traces: traceCount,
        events: eventCount,
      },
      families: plan,
      family_count: plan.length,
      calculus:
        'OBSERVE -> ADMIT -> INFER -> DISCRIMINATE -> SIMULATE -> CONSTRUCT -> GOVERN -> RECEIPT',
      actuation: 'REFUSED',
    };
    const receiptHash = blake3Hex(canonicalJson(projection));
    const result = {
      ...projection,
      receipt_hash: receiptHash,
    };

    let outputFile: string | undefined;
    if (args.output) {
      const outputDirectory = path.resolve(args.output);
      try {
        fs.mkdirSync(outputDirectory, { recursive: true });
        outputFile = path.join(outputDirectory, 'process-science.json');
        fs.writeFileSync(outputFile, `${canonicalJson(result)}\n`, { flag: 'w' });
      } catch (error) {
        return refusal(
          'PROCESS_SCIENCE_OUTPUT_BLOCKED',
          `${outputDirectory}: ${(error as Error).message}`
        );
      }
    }

    return {
      ...result,
      ...(outputFile ? { output_file: outputFile } : {}),
      exitCode: 0,
    };
  },
});
