/**
 * profile-guide.ts
 * Interactive profile recommendation questionnaire for deployment profile selection
 */

import * as readline from 'readline';

/**
 * User responses to the profile guide questionnaire
 */
export interface ProfileGuideResponse {
  logSize: 'small' | 'medium' | 'large';
  needsML: boolean;
  sizeConstrained: 'mobile' | 'iot' | 'browser' | 'none';
}

/**
 * Profile recommendation result
 */
export interface ProfileRecommendation {
  profile: 'mobile' | 'iot' | 'edge' | 'fog' | 'browser';
  reasoning: string;
  sizeEstimate: string;
  features: string[];
  tradeoffs: string[];
  nextSteps: string[];
}

/**
 * Interactive questionnaire to recommend a deployment profile
 */
export async function profileGuideQuestionnaire(): Promise<ProfileGuideResponse> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer);
      });
    });
  };

  const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
  const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
  const green = (s: string) => `\x1b[32m${s}\x1b[0m`;

  console.log();
  console.log(
    bold(
      'wasm4pm Deployment Profile Guide — Answer a few quick questions to find the right profile for your use case'
    )
  );
  console.log();

  // Question 1: Log size
  console.log(cyan('Question 1: How large are your event logs?'));
  console.log('  [S] Small (<1K events)   — testing, demos');
  console.log('  [M] Medium (1K-100K)     — typical process mining');
  console.log('  [L] Large (>100K events) — high-volume production');
  console.log();
  let logSizeAnswer = (await question('Choose [S/M/L] (default: M): ')).toUpperCase();
  if (!logSizeAnswer) logSizeAnswer = 'M';
  const logSize =
    logSizeAnswer === 'S' ? 'small' : logSizeAnswer === 'L' ? 'large' : 'medium';

  // Question 2: ML algorithms needed
  console.log();
  console.log(cyan('Question 2: Do you need ML algorithms?'));
  console.log('  [Y] Yes  — classification, clustering, forecasting, anomaly detection');
  console.log('  [N] No   — only process discovery and conformance checking');
  console.log();
  let mlAnswer = (await question('Choose [Y/N] (default: N): ')).toUpperCase();
  if (!mlAnswer) mlAnswer = 'N';
  const needsML = mlAnswer === 'Y';

  // Question 3: Size constraint
  console.log();
  console.log(cyan('Question 3: Are you size-constrained?'));
  console.log('  [M] Mobile device (< 500KB) — phones, tablets, edge devices');
  console.log('  [I] IoT device (< 1MB)      — embedded systems, sensors');
  console.log('  [B] Browser/Web (~2.7MB)    — no constraint, full features OK');
  console.log('  [N] None                    — maximize features, size not a concern');
  console.log();
  let sizeAnswer = (await question('Choose [M/I/B/N] (default: N): ')).toUpperCase();
  if (!sizeAnswer) sizeAnswer = 'N';
  const sizeConstrained =
    sizeAnswer === 'M' ? 'mobile' : sizeAnswer === 'I' ? 'iot' : sizeAnswer === 'B' ? 'browser' : 'none';

  rl.close();

  return {
    logSize,
    needsML,
    sizeConstrained,
  };
}

/**
 * Recommend a deployment profile based on questionnaire responses
 */
export function recommendProfile(response: ProfileGuideResponse): ProfileRecommendation {
  const { logSize, needsML, sizeConstrained } = response;

  // Hard constraint: if mobile/IoT selected, use those
  if (sizeConstrained === 'mobile') {
    return {
      profile: 'mobile',
      reasoning:
        'You selected mobile device constraint. Mobile profile is optimized for ~500KB WASM binary with minimal features.',
      sizeEstimate: '~500KB',
      features: ['Process discovery (DFG)', 'Basic conformance checking'],
      tradeoffs: [
        'No ML algorithms',
        'No advanced discovery (genetic, ILP)',
        'No POWL support',
        'Minimal streaming support',
      ],
      nextSteps: [
        'If you need ML later, upgrade to IoT or Edge profile',
        'Run: wpm run <log.xes>',
        'Use fast profile execution for best performance',
      ],
    };
  }

  if (sizeConstrained === 'iot') {
    return {
      profile: 'iot',
      reasoning:
        'You selected IoT device constraint. IoT profile is optimized for ~1MB WASM binary with basic algorithms.',
      sizeEstimate: '~1MB',
      features: ['Process discovery (DFG, Heuristic, Alpha)', 'Basic conformance checking', 'No ML'],
      tradeoffs: [
        'No ML algorithms',
        'No advanced discovery (genetic, ILP)',
        'No POWL support',
        'No streaming algorithms',
      ],
      nextSteps: [
        'If you need ML, upgrade to Edge or Fog profile',
        'Run: wpm run <log.xes> --algorithm dfg',
        'Test with medium-sized logs (< 50K events)',
      ],
    };
  }

  // Soft constraint: browser selected but no specific size worry
  if (sizeConstrained === 'browser') {
    if (needsML) {
      return {
        profile: 'browser',
        reasoning:
          'You need ML and accept full-size browser profile. Browser profile includes all 38 algorithms.',
        sizeEstimate: '~2.7MB',
        features: [
          'All discovery algorithms',
          'Full ML suite (classify, cluster, forecast, anomaly, regress, PCA)',
          'POWL support',
          'Full streaming (SIMD)',
          'Complete conformance checking',
        ],
        tradeoffs: ['Large binary size (~2.7MB)', 'Requires modern browsers or Node.js'],
        nextSteps: [
          'Use profile: balanced or quality depending on speed vs. quality',
          'Run: wpm run <log.xes> --profile balanced',
          'All ML algorithms available',
        ],
      };
    }

    return {
      profile: 'browser',
      reasoning: 'You accept full-size browser profile. All algorithms available.',
      sizeEstimate: '~2.7MB',
      features: [
        'All discovery algorithms',
        'Full ML suite (classify, cluster, forecast, anomaly, regress, PCA)',
        'POWL support',
        'Full streaming (SIMD)',
        'Complete conformance checking',
      ],
      tradeoffs: ['Large binary size (~2.7MB)'],
      nextSteps: [
        'Start with fast profile for quick results',
        'Run: wpm run <log.xes> --profile fast',
        'Upgrade to quality profile for better models',
      ],
    };
  }

  // No size constraint: sizeConstrained === 'none'
  if (needsML) {
    if (logSize === 'large') {
      // Large logs + ML needs = Fog (best balance)
      return {
        profile: 'fog',
        reasoning:
          'Large logs with ML needs: Fog profile balances features and size with all ML algorithms but no POWL.',
        sizeEstimate: '~2MB',
        features: [
          'All ML algorithms (classify, cluster, forecast, anomaly, regress, PCA)',
          'Advanced discovery (genetic, ILP, ACO, PSO)',
          'OCEL support',
          'Full streaming (SIMD)',
          'Complete conformance checking',
        ],
        tradeoffs: ['No POWL support', 'Large binary (~2MB)'],
        nextSteps: [
          'Use profile: balanced for fast results, quality for best models',
          'Run: wpm run <log.xes> --profile balanced',
          'Consider multiple passes: fast discovery → quality refinement',
        ],
      };
    }

    // Medium/Small logs + ML needs = Browser (all features, overkill but future-proof)
    return {
      profile: 'browser',
      reasoning:
        'ML needed on medium/small logs: Browser profile gives you all algorithms including POWL.',
      sizeEstimate: '~2.7MB',
      features: [
        'All ML algorithms (classify, cluster, forecast, anomaly, regress, PCA)',
        'All discovery algorithms (genetic, ILP, ACO, PSO, etc.)',
        'POWL support',
        'Full streaming (SIMD)',
        'Complete conformance checking',
      ],
      tradeoffs: ['Full-size binary (~2.7MB)', 'May be overkill for small logs'],
      nextSteps: [
        'Start with balanced profile for balance',
        'Run: wpm run <log.xes> --profile balanced',
        'Upgrade to quality profile for higher accuracy',
      ],
    };
  }

  // No ML needed
  if (logSize === 'large') {
    // Large logs, no ML = Edge (streaming focus)
    return {
      profile: 'edge',
      reasoning:
        'Large logs without ML: Edge profile optimizes for streaming and advanced discovery without ML bulk.',
      sizeEstimate: '~1.5MB',
      features: [
        'All discovery algorithms (DFG, Heuristic, Alpha++, Inductive, etc.)',
        'Advanced discovery (genetic, ILP, ACO, PSO)',
        'Streaming algorithms (SIMD DFG)',
        'Complete conformance checking',
        'No ML algorithms',
      ],
      tradeoffs: ['No ML algorithms', 'No POWL support'],
      nextSteps: [
        'Use streaming profile for high-throughput scenarios',
        'Run: wpm run <log.xes> --profile stream',
        'For best results on large logs, use quality profile with heuristic or genetic',
      ],
    };
  }

  // Medium/Small logs, no ML = Fast recommended, but browser is safe
  return {
    profile: 'browser',
    reasoning:
      'Small/medium logs without ML: Browser profile is future-proof with all algorithms available.',
    sizeEstimate: '~2.7MB',
    features: [
      'All discovery algorithms',
      'Full streaming support',
      'Complete conformance checking',
      'ML algorithms available for future use',
    ],
    tradeoffs: ['Larger than needed for small logs'],
    nextSteps: [
      'Start with fast profile for quick results',
      'Run: wpm run <log.xes> --profile fast',
      'Add ML algorithms later if needed (no rebuild required)',
    ],
  };
}

/**
 * Format recommendation as human-readable output
 */
export function formatRecommendation(rec: ProfileRecommendation): string {
  const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
  const green = (s: string) => `\x1b[32m${s}\x1b[0m`;

  const lines = [
    '',
    bold(`Recommendation: ${green(rec.profile.toUpperCase())} profile`),
    '',
    `Reasoning: ${rec.reasoning}`,
    '',
    bold('Binary Size:'),
    `  ${rec.sizeEstimate}`,
    '',
    bold('Features:'),
    ...rec.features.map((f) => `  ✓ ${f}`),
    '',
    bold('Tradeoffs:'),
    ...rec.tradeoffs.map((t) => `  ⚠ ${t}`),
    '',
    bold('Next Steps:'),
    ...rec.nextSteps.map((step) => `  → ${step}`),
    '',
  ];

  return lines.join('\n');
}
