// Shared SARIF 2.1.0 output builder for wasm4pm

export interface SarifResult {
  verdict: string;
  actor?: string;
  action?: string;
  traceName?: string;
  explanation?: string;
  missingEvidence?: string[];
}

export function verdictToLevel(v: string): 'none' | 'note' | 'warning' | 'error' {
  const lv = v.toLowerCase().replace(/_/g, '');
  if (lv === 'allow' || lv === 'allowwithreceipt') return 'note';
  if (lv === 'warn') return 'warning';
  return 'error'; // escalate, quarantine, requireevidence, deny, stopline
}

export function verdictToRule(v: string): string {
  const lv = v.toLowerCase().replace(/_/g, '');
  if (lv.includes('custody') || lv === 'deny' || lv === 'requireevidence') return 'AM001';
  if (lv === 'escalate' || lv === 'warn') return 'AM002';
  return 'AM003';
}

export function buildSarifOutput(toolVersion: string, results: SarifResult[]) {
  return {
    $schema:
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'wasm4pm-automembrane',
            version: toolVersion,
            rules: [
              {
                id: 'AM001',
                name: 'CustodyViolation',
                shortDescription: {
                  text: 'High-stakes action without required custody evidence',
                },
              },
              {
                id: 'AM002',
                name: 'ActorAnomaly',
                shortDescription: {
                  text: 'Actor or AutoML behavior deviates from learned envelope',
                },
              },
              {
                id: 'AM003',
                name: 'RouteDeviation',
                shortDescription: {
                  text: 'Request follows unexpected process route or pattern',
                },
              },
            ],
          },
        },
        results: results.map((r) => ({
          ruleId: verdictToRule(r.verdict),
          level: verdictToLevel(r.verdict),
          message: {
            text:
              r.explanation ||
              `Verdict: ${r.verdict}` +
                (r.missingEvidence?.length
                  ? ` (missing: ${r.missingEvidence.join(', ')})`
                  : ''),
          },
          locations: [],
          properties: {
            verdict: r.verdict,
            actor: r.actor,
            action: r.action,
            trace: r.traceName,
          },
        })),
      },
    ],
  };
}
