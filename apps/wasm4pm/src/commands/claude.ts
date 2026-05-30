import { defineCommand } from 'citty';
import { createHash } from 'crypto';
import { existsSync, readFileSync, readdirSync } from 'fs';
import * as fsAsync from 'fs/promises';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';
import { probeHooks, type JtbdProbe } from './doctor.js';
import { withSpanRaw } from './_otel.js';

// ── shared chain helpers ───────────────────────────────────────────────────────

function hashData(data: string, algo: string): string {
  if (algo === 'blake3') {
    const r = spawnSync('b3sum', ['--no-names'], { input: data, encoding: 'utf8' });
    if ((r.status ?? 1) === 0) return (r.stdout ?? '').trim().split(/\s/)[0] ?? '';
  }
  return createHash('sha256').update(data).digest('hex');
}

export function verifyEventChain(events: Record<string, unknown>[]): {
  valid: boolean; break_at?: number; reason?: string; chain_head?: string;
} {
  let prev = '0'.repeat(64);
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    // Skip legacy pre-hashing entries (non-object fragments from old jq -n format)
    if (!ev || typeof ev !== 'object' || Array.isArray(ev)) continue;
    const storedEH = ev['event_hash'] as string | undefined;
    const storedCH = ev['chain_hash'] as string | undefined;
    const algo = (ev['hash_algo'] as string | undefined) ?? 'sha256';
    if (!storedEH || !storedCH) { prev = storedCH ?? prev; continue; }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { event_hash: _a, chain_hash: _b, hash_algo: _c, ...base } = ev as Record<string, unknown>;
    const expectedEH = hashData(JSON.stringify(base), algo);
    if (expectedEH !== storedEH) {
      return { valid: false, break_at: i, reason: `event_hash mismatch at entry ${i}` };
    }
    const expectedCH = hashData(prev + storedEH, algo);
    if (expectedCH !== storedCH) {
      return { valid: false, break_at: i, reason: `chain_hash break at entry ${i}` };
    }
    prev = storedCH;
  }
  return { valid: true, chain_head: prev };
}

// ── session verify ────────────────────────────────────────────────────────────

const sessionVerify = defineCommand({
  meta: {
    name: 'verify',
    description: 'Verify session evidence chain integrity — detects tampered, deleted, or reordered events. Example: wpm claude verify --verbose',
  },
  args: {
    date: { type: 'string', description: 'Date to verify (YYYYMMDD, default: today)' },
    format: { type: 'string', default: 'human' },
    verbose: { type: 'boolean', alias: 'v' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    const projectDir = process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd();
    const dateKey = (ctx.args.date as string | undefined) ?? new Date().toISOString().slice(0, 10).replace(/-/g, '');

    let checkCount = 0;
    let chainValid = false;
    return withSpanRaw(
      'wasm4pm.command.claude.session.verify',
      { 'claude.subcommand': 'session.verify', 'claude.date': dateKey },
      async () => {
        const runDir = join(projectDir, 'wasm4pm', 'target', 'agent-runs', dateKey);
        const chainFile = join(runDir, 'tool-events.jsonl');
        const chainHeadFile = join(runDir, 'CHAIN_HEAD');

        const checks: Array<{ check: string; ok: boolean; detail?: string }> = [];

        if (!existsSync(chainFile)) {
          checks.push({ check: 'tool-events.jsonl exists', ok: false, detail: 'no session evidence for this date' });
        } else {
          const raw = readFileSync(chainFile, 'utf8').split('\n').filter(Boolean);
          checks.push({ check: 'tool-events.jsonl parseable', ok: true, detail: `${raw.length} lines` });

          const events: Record<string, unknown>[] = [];
          let parseErrors = 0;
          for (const line of raw) {
            try { events.push(JSON.parse(line) as Record<string, unknown>); }
            catch { parseErrors++; }
          }
          if (parseErrors > 0) checks.push({ check: 'JSONL integrity', ok: false, detail: `${parseErrors} parse errors` });
          else checks.push({ check: 'JSONL integrity', ok: true, detail: 'all lines parse' });

          const chainResult = verifyEventChain(events);
          checks.push({
            check: 'chain integrity',
            ok: chainResult.valid,
            detail: chainResult.valid
              ? `${events.length} events; head=${chainResult.chain_head?.slice(0, 12)}...`
              : `break at entry ${chainResult.break_at}: ${chainResult.reason}`,
          });

          if (existsSync(chainHeadFile)) {
            const storedHead = readFileSync(chainHeadFile, 'utf8').trim();
            const computedHead = chainResult.chain_head ?? '';
            const anchored = storedHead === computedHead;
            checks.push({
              check: 'CHAIN_HEAD anchor matches',
              ok: anchored,
              detail: anchored
                ? `${storedHead.slice(0, 16)}...`
                : `stored=${storedHead.slice(0, 12)}... computed=${computedHead.slice(0, 12)}... MISMATCH — log may be rewritten`,
            });
          } else {
            checks.push({ check: 'CHAIN_HEAD anchor exists', ok: false, detail: 'not yet written (post-tool-use.sh updated)' });
          }
        }

        checkCount = checks.length;
        const allOk = checks.every((c) => c.ok);
        chainValid = allOk;
        const exitCode = allOk ? EXIT_CODES.success : EXIT_CODES.execution_error;
        const result = makeResult('claude session verify', { date: dateKey, checks, valid: allOk }, performance.now() - t0, exitCode);

        emitResult(result, { format, verbose, quiet }, (res, p) => {
          const d = res.payload as { date: string; checks: typeof checks; valid: boolean };
          p.log('');
          p.log(`wpm claude session verify — ${d.date}`);
          p.log('─'.repeat(52));
          for (const c of d.checks) {
            const icon = c.ok ? '✓' : '✗';
            p.log(`  ${icon} ${c.check}${c.detail ? `: ${c.detail}` : ''}`);
          }
          p.log('');
          if (d.valid) p.success('Session chain is intact.');
          else p.error('Session chain is TAMPERED or incomplete.');
        });

        return exitWithFlush(exitCode);
      },
      () => ({ 'claude.check_count': checkCount, 'claude.chain_valid': chainValid }),
    );
  },
});

// ── session ───────────────────────────────────────────────────────────────────

const session = defineCommand({
  meta: {
    name: 'session',
    description: 'Show Claude Code session evidence from the current agent-run log',
  },
  subCommands: { verify: sessionVerify },
  args: {
    date: {
      type: 'string',
      description: 'Date to inspect (YYYYMMDD, default: today)',
    },
    format: { type: 'string', default: 'human' },
    verbose: { type: 'boolean', alias: 'v' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    const projectDir = process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd();
    const dateKey = (ctx.args.date as string | undefined)
      ?? new Date().toISOString().slice(0, 10).replace(/-/g, '');

    let toolEventCount = 0;
    let workOrderCount = 0;
    return withSpanRaw(
      'wasm4pm.command.claude.session',
      { 'claude.subcommand': 'session', 'claude.date': dateKey },
      async () => {
        const runDir = join(projectDir, 'wasm4pm', 'target', 'agent-runs', dateKey);

        if (!existsSync(runDir)) {
          const result = makeErrorResult(
            'claude session',
            `No session evidence for ${dateKey} at ${runDir}. Hooks write evidence when Claude Code tools fire.`,
            EXIT_CODES.source_error,
            'NO_SESSION',
          );
          emitResult(result, { format, verbose, quiet });
          return exitWithFlush(EXIT_CODES.source_error);
        }

        const toolEventsPath = join(runDir, 'tool-events.jsonl');
        const promptsPath = join(runDir, 'prompts.jsonl');

        const toolEvents = existsSync(toolEventsPath)
          ? readFileSync(toolEventsPath, 'utf8').split('\n').filter(Boolean).map((l) => {
              try { return JSON.parse(l) as Record<string, unknown>; } catch { return null; }
            }).filter(Boolean)
          : [];

        const workOrders = existsSync(promptsPath)
          ? readFileSync(promptsPath, 'utf8').split('\n').filter(Boolean).map((l) => {
              try { return JSON.parse(l) as Record<string, unknown>; } catch { return null; }
            }).filter(Boolean)
          : [];

        toolEventCount = toolEvents.length;
        workOrderCount = workOrders.length;

        const toolCounts: Record<string, number> = {};
        for (const e of toolEvents) {
          const t = (e as { tool?: string }).tool ?? 'unknown';
          toolCounts[t] = (toolCounts[t] ?? 0) + 1;
        }

        const payload = {
          date: dateKey,
          run_dir: runDir,
          tool_events: { count: toolEvents.length, by_tool: toolCounts, recent: toolEvents.slice(-5) },
          work_orders: { count: workOrders.length, recent: workOrders.slice(-3) },
        };

        const result = makeResult('claude session', payload, performance.now() - t0, EXIT_CODES.success);
        emitResult(result, { format, verbose, quiet }, (res, p) => {
          const d = res.payload as typeof payload;
          p.log('');
          p.log(`Claude Code session evidence — ${d.date}`);
          p.log(`  Session dir: ${d.run_dir}`);
          p.log('');
          p.log(`  Tool uses recorded: ${d.tool_events.count}`);
          for (const [tool, count] of Object.entries(d.tool_events.by_tool)) {
            p.log(`    ${tool}: ${count}`);
          }
          p.log('');
          p.log(`  Work orders recorded: ${d.work_orders.count}`);
          if (verbose && d.work_orders.recent.length > 0) {
            for (const wo of d.work_orders.recent) {
              const w = wo as { timestamp?: string; prompt?: string };
              p.log(`    [${w.timestamp ?? '?'}] ${String(w.prompt ?? '').slice(0, 80)}`);
            }
          }
          p.log('');
          if (verbose && d.tool_events.recent.length > 0) {
            p.log('  Recent tool uses:');
            for (const te of d.tool_events.recent) {
              const e = te as { timestamp?: string; tool?: string; file_path?: string; command?: string };
              const detail = e.file_path ?? String(e.command ?? '').slice(0, 60);
              p.log(`    [${e.timestamp ?? '?'}] ${e.tool ?? '?'} ${detail}`);
            }
          }
        });

        return exitWithFlush(EXIT_CODES.success);
      },
      () => ({ 'claude.tool_event_count': toolEventCount, 'claude.work_order_count': workOrderCount }),
    );
  },
});

// ── hooks ─────────────────────────────────────────────────────────────────────

const hooks = defineCommand({
  meta: {
    name: 'hooks',
    description: 'JTBD verification: test whether each Claude Code hook does its declared job',
  },
  args: {
    format: { type: 'string', default: 'human' },
    verbose: { type: 'boolean', alias: 'v' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    const projectDir = process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd();

    let verifiedCount = 0;
    let refutedCount = 0;
    let inconclusiveCount = 0;
    return withSpanRaw(
      'wasm4pm.command.claude.hooks',
      { 'claude.subcommand': 'hooks' },
      async () => {
        const probes = await probeHooks(projectDir);

        verifiedCount = probes.filter((p) => p.verdict === 'verified').length;
        refutedCount = probes.filter((p) => p.verdict === 'refuted').length;
        inconclusiveCount = probes.filter((p) => p.verdict === 'inconclusive').length;
        const healthy = refutedCount === 0 && inconclusiveCount === 0;

        const exitCode = healthy ? EXIT_CODES.success : EXIT_CODES.config_error;
        const result = makeResult('claude hooks', {
          probes,
          summary: { verified: verifiedCount, refuted: refutedCount, inconclusive: inconclusiveCount, total: probes.length },
          healthy,
        }, performance.now() - t0, exitCode);

        emitResult(result, { format, verbose, quiet }, (res, p) => {
          p.log('');
          p.log('wpm claude hooks — JTBD (Jobs-To-Be-Done) verification');
          p.log('Each probe exercises a hook\'s declared job, not just its existence.');
          p.log('─'.repeat(72));

          for (const probe of res.payload.probes as JtbdProbe[]) {
            const icon = probe.verdict === 'verified' ? '✓' : probe.verdict === 'refuted' ? '✗' : '~';
            p.log('');
            p.log(`JOB: ${probe.job}`);
            p.log(`  Scenario: ${probe.scenario}`);
            p.log(`  Observed: ${probe.observed}`);
            if (verbose) p.log(`  Evidence: ${probe.evidence}`);
            p.log(`  ${icon} ${probe.verdict.toUpperCase()}`);
          }

          p.log('');
          p.log('─'.repeat(72));
          p.log(`Summary: ${verifiedCount} verified, ${refutedCount} refuted, ${inconclusiveCount} inconclusive`);
          if (healthy) {
            p.success('All hooks are doing their declared jobs.');
          } else {
            p.error(`${refutedCount} hook job(s) refuted — hooks are not enforcing the proof contract.`);
          }
        });

        return exitWithFlush(exitCode);
      },
      () => ({
        'claude.hooks.verified': verifiedCount,
        'claude.hooks.refuted': refutedCount,
        'claude.hooks.inconclusive': inconclusiveCount,
      }),
    );
  },
});

// ── Process mining AI assistant subcommands ───────────────────────────────────

interface AlgorithmProfile {
  name: string;
  speed: number;
  quality: number;
  output: string;
  bestFor: string[];
  keywords: string[];
}

const ALGORITHM_PROFILES: AlgorithmProfile[] = [
  { name: 'dfg', speed: 5, quality: 30, output: 'Directly-Follows Graph', bestFor: ['quick overview', 'large logs', 'first look'], keywords: ['fast', 'quick', 'overview', 'large', 'simple', 'dfg'] },
  { name: 'heuristic_miner', speed: 25, quality: 50, output: 'DFG with dependency threshold', bestFor: ['noisy logs', 'balanced speed/quality', 'medium logs'], keywords: ['balanced', 'noise', 'medium', 'heuristic'] },
  { name: 'inductive_miner', speed: 30, quality: 55, output: 'Sound process tree', bestFor: ['sound models', 'healthcare', 'no deadlocks required'], keywords: ['sound', 'hospital', 'healthcare', 'safe', 'structured', 'reliable'] },
  { name: 'alpha_plus_plus', speed: 20, quality: 45, output: 'Petri net', bestFor: ['educational use', 'simple sequential processes'], keywords: ['alpha', 'petri', 'academic', 'simple', 'sequential'] },
  { name: 'ilp', speed: 80, quality: 90, output: 'Optimal Petri net (ILP)', bestFor: ['best precision', 'small logs', 'research'], keywords: ['best', 'optimal', 'precise', 'research', 'ilp'] },
  { name: 'genetic_algorithm', speed: 75, quality: 80, output: 'Petri net (evolved)', bestFor: ['complex processes', 'best quality', 'time not critical'], keywords: ['genetic', 'evolve', 'complex', 'quality', 'best result'] },
  { name: 'simd_streaming_dfg', speed: 2, quality: 28, output: 'Streaming DFG', bestFor: ['real-time', 'streaming', 'IoT', 'very large logs'], keywords: ['stream', 'real-time', 'realtime', 'iot', 'huge', 'online'] },
];

const METRIC_EXPLANATIONS: Record<string, { threshold: number; good: string; low: string }> = {
  fitness:        { threshold: 0.85, good: 'Model reliably replays the observed process', low: '~X% of cases follow paths not captured in the model' },
  precision:      { threshold: 0.85, good: 'Model stays tightly within observed behavior', low: 'Model allows ~X% more behavior than observed — consider ilp for +0.10' },
  generalization: { threshold: 0.75, good: 'Model generalizes well to unseen cases', low: 'Model may be overfit to this specific log' },
  simplicity:     { threshold: 0.75, good: 'Process is clean and easy to understand', low: 'Spaghetti model — high complexity may hide structural issues' },
};

function scoreRelevance(profile: AlgorithmProfile, queryLower: string): number {
  let score = 0;
  for (const kw of profile.keywords) {
    if (queryLower.includes(kw)) score += 3;
  }
  for (const use of profile.bestFor) {
    if (use.split(' ').some((w) => queryLower.includes(w))) score += 1;
  }
  const countMatch = queryLower.match(/(\d[\d,]+)\s*events?/);
  if (countMatch) {
    const count = parseInt(countMatch[1].replace(/,/g, ''), 10);
    if (count > 100_000 && profile.speed <= 5) score += 4;
    else if (count < 5_000 && profile.quality >= 80) score += 2;
  }
  return score;
}

function parseMetricFromText(text: string): Array<{ metric: string; value: number }> {
  const results: Array<{ metric: string; value: number }> = [];
  const metricRe = /\b(fitness|precision|generalization|simplicity|silhouette)\s*[=:]?\s*(0?\.\d+|\d+(?:\.\d+)?%?)/gi;
  let m: RegExpExecArray | null;
  while ((m = metricRe.exec(text)) !== null) {
    const metricName = m[1].toLowerCase();
    let value = parseFloat(m[2].replace('%', ''));
    if (m[2].includes('%')) value /= 100;
    if (value >= 0 && value <= 1) results.push({ metric: metricName, value });
  }
  return results;
}

function interpretMetrics(metrics: Array<{ metric: string; value: number }>): string[] {
  const lines: string[] = [];
  if (metrics.length === 0) return lines;

  const fitness = metrics.find((m) => m.metric === 'fitness');
  const precision = metrics.find((m) => m.metric === 'precision');

  if (fitness && precision) {
    if (fitness.value < 0.85 && precision.value < 0.85) {
      lines.push(`Both fitness (${fitness.value}) and precision (${precision.value}) are below 0.85.`);
      lines.push('  This suggests the model does not accurately represent observed behavior.');
      lines.push('  Recommendation: try --algorithm ilp for higher precision (+~0.10)');
    } else if (fitness.value >= 0.85 && precision.value < 0.70) {
      lines.push(`High fitness (${fitness.value}) with low precision (${precision.value}).`);
      lines.push('  The model explains the log but is too permissive — allows many unobserved paths.');
      lines.push('  Recommendation: wpm run log.xes --algorithm ilp (tighter precision)');
    }
  }

  for (const { metric, value } of metrics) {
    const spec = METRIC_EXPLANATIONS[metric];
    if (!spec) continue;
    const pct = Math.round((1 - value) * 100);
    if (value >= spec.threshold) {
      lines.push(`${metric}: ${value} — ${spec.good}`);
    } else {
      const explanation = spec.low.replace('X', String(pct));
      lines.push(`${metric}: ${value} — ${explanation}`);
    }
  }
  return lines;
}

function generateAlgorithmAnswer(query: string): string[] {
  const qLower = query.toLowerCase();
  const ranked = ALGORITHM_PROFILES
    .map((p) => ({ profile: p, score: scoreRelevance(p, qLower) }))
    .sort((a, b) => b.score - a.score);

  const top3 = ranked.slice(0, 3);
  const lines: string[] = [];

  const hasHospital = /hospital|patient|healthcare|clinical|medical/.test(qLower);
  const hasStreaming = /stream|realtime|real-time|iot|online/.test(qLower);
  const hasBigLog = /(\d[\d,]{4,})\s*events/.test(qLower);

  if (hasHospital) lines.push('For healthcare/hospital event logs, I recommend:');
  else if (hasStreaming) lines.push('For streaming/real-time analysis, I recommend:');
  else if (hasBigLog) lines.push('For large event logs, I recommend starting with fast algorithms:');
  else lines.push('Based on your query, here are my recommendations:');
  lines.push('');

  top3.forEach(({ profile }, i) => {
    const speed = profile.speed <= 10 ? 'very fast' : profile.speed <= 30 ? 'fast' : profile.speed <= 60 ? 'moderate' : 'slow but thorough';
    lines.push(`${i + 1}. **${profile.name}** (${speed}, quality: ${profile.quality}/100)`);
    lines.push(`   Output: ${profile.output}`);
    lines.push(`   Best for: ${profile.bestFor.join(', ')}`);
    lines.push(`   Use: wpm run log.xes --algorithm ${profile.name}`);
    lines.push('');
  });

  if (hasHospital) {
    lines.push('Healthcare logs often have parallel activities (triage + registration).');
    lines.push('inductive_miner handles these better than DFG.');
    lines.push('');
    lines.push('Try: wpm suggest -i hospital.xes --goal "understand patient flow"');
  } else if (hasStreaming) {
    lines.push('For real-time analysis, simd_streaming_dfg processes events as they arrive.');
    lines.push('Try: wpm drift-watch -i stream.xes');
  }
  return lines;
}

// ── ask ───────────────────────────────────────────────────────────────────────

const ask = defineCommand({
  meta: {
    name: 'ask',
    description: 'Ask the Claude process mining assistant a question. Example: wpm claude ask "What algorithm for a hospital log with 5000 events?"',
  },
  args: {
    question: { type: 'string', description: 'Your question (wrap in quotes)' },
    format: { type: 'string', description: 'Output format (human or json)', default: 'human' },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const rawArgs = ctx.args as Record<string, unknown>;
    const question = (ctx.args.question as string | undefined) ?? (rawArgs['_'] as string[] | undefined)?.[0];

    return withSpanRaw('wasm4pm.command.claude.ask', { 'claude.subcommand': 'ask' }, async () => {
      if (!question || question.trim() === '') {
        const result = makeErrorResult('claude ask', 'A question is required. Example: wpm claude ask "What algorithm should I use for a hospital log with 5000 events?"', EXIT_CODES.config_error, 'MISSING_QUESTION');
        emitResult(result, { format, verbose: false, quiet: false });
        return exitWithFlush(result.exit_code);
      }

      const qTrimmed = question.trim();
      const metrics = parseMetricFromText(qTrimmed);
      let answerLines: string[];

      if (metrics.length > 0) {
        answerLines = ['Metric interpretation:', '', ...interpretMetrics(metrics)];
        answerLines.push('');
        answerLines.push(`For a full interactive explanation: wpm interpret fitness ${metrics[0].value}`);
      } else {
        answerLines = generateAlgorithmAnswer(qTrimmed);
      }

      const payload = {
        schema: 'wasm4pm.claude.ask.v1',
        query: qTrimmed,
        answer: answerLines.join('\n'),
        lines: answerLines,
      };

      const result = makeResult('claude ask', payload, performance.now() - t0, EXIT_CODES.success);
      emitResult(result, { format, verbose: false, quiet: false }, (res, p) => {
        const d = res.payload as typeof payload;
        p.log('');
        p.success('Claude Process Mining Assistant');
        p.log('=================================');
        p.log(`Query: "${d.query}"`);
        p.log('');
        for (const line of d.lines) p.log(line);
      });

      return exitWithFlush(EXIT_CODES.success);
    }, () => ({}));
  },
});

// ── interpret (claude subcommand) ──────────────────────────────────────────────

const interpretCmd = defineCommand({
  meta: {
    name: 'interpret',
    description: 'Interpret process mining metrics in plain language. Example: wpm claude interpret "fitness 0.73 precision 0.68"',
  },
  args: {
    text: { type: 'string', description: 'Metric string to interpret (e.g. "fitness 0.73 precision 0.68")' },
    format: { type: 'string', description: 'Output format (human or json)', default: 'human' },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const rawArgs = ctx.args as Record<string, unknown>;
    const text = (ctx.args.text as string | undefined) ?? (rawArgs['_'] as string[] | undefined)?.join(' ');

    return withSpanRaw('wasm4pm.command.claude.interpret', { 'claude.subcommand': 'interpret' }, async () => {
      if (!text || text.trim() === '') {
        const result = makeErrorResult('claude interpret', 'A metric string is required. Example: wpm claude interpret "fitness 0.73 precision 0.68"', EXIT_CODES.config_error, 'MISSING_TEXT');
        emitResult(result, { format, verbose: false, quiet: false });
        return exitWithFlush(result.exit_code);
      }

      const metrics = parseMetricFromText(text);
      if (metrics.length === 0) {
        const result = makeErrorResult('claude interpret', `No metrics found in: "${text}". Expected: "fitness 0.73" or "fitness=0.73"`, EXIT_CODES.config_error, 'NO_METRICS');
        emitResult(result, { format, verbose: false, quiet: false });
        return exitWithFlush(result.exit_code);
      }

      const interpretationLines = interpretMetrics(metrics);
      const avgScore = metrics.reduce((s, m) => s + m.value, 0) / metrics.length;
      const overall =
        avgScore >= 0.85 ? 'Excellent overall quality — model reliably represents the process.' :
        avgScore >= 0.70 ? 'Good quality — model is useful for analysis and improvement.' :
        avgScore >= 0.55 ? 'Moderate quality — consider improving with a better algorithm.' :
        'Low quality — significant structural issues. Review log quality and algorithm choice.';

      const nextSteps = [
        'wpm validate -i log.xes --full     — Check data quality',
        'wpm quality -i log.xes             — Full 4-dimension quality report',
        'wpm suggest -i log.xes             — Get algorithm recommendations',
      ];

      const payload = {
        schema: 'wasm4pm.claude.interpret.v1',
        input: text,
        metrics,
        interpretation: interpretationLines.join('\n'),
        overall,
        next_steps: nextSteps,
      };

      const result = makeResult('claude interpret', payload, performance.now() - t0, EXIT_CODES.success);
      emitResult(result, { format, verbose: false, quiet: false }, (res, p) => {
        const d = res.payload as typeof payload;
        p.log('');
        p.success('Claude Interpretation');
        p.log('=====================');
        p.log(`Input: "${d.input}"`);
        p.log('');
        for (const line of d.interpretation.split('\n')) p.log(line);
        p.log('');
        p.log(d.overall);
        p.log('');
        p.log('Recommended next steps:');
        for (const step of d.next_steps) p.log(`  ${step}`);
      });

      return exitWithFlush(EXIT_CODES.success);
    }, () => ({}));
  },
});

// ── suggest (claude subcommand) ───────────────────────────────────────────────

const claudeSuggest = defineCommand({
  meta: {
    name: 'suggest',
    description: 'Generate intelligent suggestions by analyzing an event log. Example: wpm claude suggest -i log.xes',
  },
  args: {
    input: { type: 'string', description: 'Path to XES event log', alias: 'i' },
    goal: { type: 'string', description: 'Analysis goal (e.g. "understand patient flow")', alias: 'g', default: 'discover the process' },
    format: { type: 'string', description: 'Output format (human or json)', default: 'human' },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const inputPath = ctx.args.input as string | undefined;
    const goal = (ctx.args.goal as string | undefined) ?? 'discover the process';

    return withSpanRaw('wasm4pm.command.claude.suggest', { 'claude.subcommand': 'suggest' }, async () => {
      if (!inputPath) {
        const result = makeErrorResult('claude suggest', '--input/-i is required. Example: wpm claude suggest -i log.xes', EXIT_CODES.config_error, 'MISSING_INPUT');
        emitResult(result, { format, verbose: false, quiet: false });
        return exitWithFlush(result.exit_code);
      }

      let xesContent: string;
      try {
        const { readFile } = await import('fs/promises');
        xesContent = await readFile(inputPath, 'utf8');
      } catch {
        const result = makeErrorResult('claude suggest', `Cannot read file: ${inputPath}`, EXIT_CODES.source_error, 'FILE_NOT_FOUND');
        emitResult(result, { format, verbose: false, quiet: false });
        return exitWithFlush(result.exit_code);
      }

      const traceCount = (xesContent.match(/<trace[\s>]/g) ?? []).length;
      const eventCount = (xesContent.match(/<event[\s>]/g) ?? []).length;
      const activitySet = new Set<string>();
      const actRe = /key="concept:name"[^>]*value="([^"]+)"/g;
      let m: RegExpExecArray | null;
      while ((m = actRe.exec(xesContent)) !== null) {
        if (m[1]) activitySet.add(m[1]);
      }
      const activityCount = activitySet.size;
      const hasTimestamps = xesContent.includes('time:timestamp');
      const hasResources = xesContent.includes('org:resource');

      const queryParts: string[] = [];
      if (eventCount > 100_000) queryParts.push('very large log');
      else if (eventCount > 10_000) queryParts.push('medium log');
      else queryParts.push('small log');
      if (activityCount > 50) queryParts.push('complex process');
      if (/patient|hospital/.test(goal.toLowerCase())) queryParts.push('hospital healthcare');
      if (/stream|real-time/.test(goal.toLowerCase())) queryParts.push('streaming realtime');
      queryParts.push(`${eventCount} events`);

      const syntheticQuery = queryParts.join(' ');
      const algoLines = generateAlgorithmAnswer(syntheticQuery);

      const analysisRecs: string[] = [];
      if (hasTimestamps) {
        analysisRecs.push(`• wpm temporal -i ${inputPath}   — Analyze timing patterns and bottlenecks`);
        analysisRecs.push(`• wpm drift-watch -i ${inputPath}  — Monitor for process drift over time`);
      }
      if (hasResources) {
        analysisRecs.push(`• wpm social -i ${inputPath}   — Mine social network (resource handovers)`);
      }
      analysisRecs.push(`• wpm validate -i ${inputPath}   — Validate log quality`);
      analysisRecs.push(`• wpm conformance -i ${inputPath}  — Check model-to-log fitness after discovery`);

      const bestAlgo = ALGORITHM_PROFILES.find((p) => scoreRelevance(p, syntheticQuery) > 0)?.name ?? 'heuristic_miner';
      const payload = {
        schema: 'wasm4pm.claude.suggest.v1',
        input: inputPath,
        goal,
        log_stats: { events: eventCount, traces: traceCount, activities: activityCount, has_timestamps: hasTimestamps, has_resources: hasResources },
        algorithm_suggestions: algoLines.join('\n'),
        analysis_recommendations: analysisRecs,
        quick_start: `wpm run ${inputPath} --algorithm ${bestAlgo}`,
      };

      const result = makeResult('claude suggest', payload, performance.now() - t0, EXIT_CODES.success);
      emitResult(result, { format, verbose: false, quiet: false }, (res, p) => {
        const d = res.payload as typeof payload;
        p.log('');
        p.success('Claude Process Mining Suggestions');
        p.log('===================================');
        p.log(`Analyzing: ${d.input}`);
        p.log(`Goal:      ${d.goal}`);
        p.log('');
        p.log(`Log Stats: ${d.log_stats.events.toLocaleString()} events, ${d.log_stats.traces} traces, ${d.log_stats.activities} activities`);
        if (d.log_stats.has_timestamps) p.log('           Timestamps: yes — temporal analysis available');
        if (d.log_stats.has_resources) p.log('           Resources: yes — social network mining available');
        p.log('');
        p.log('ALGORITHM RECOMMENDATIONS');
        for (const line of d.algorithm_suggestions.split('\n')) p.log(line);
        if (d.analysis_recommendations.length > 0) {
          p.log('ANALYSIS RECOMMENDATIONS');
          for (const rec of d.analysis_recommendations) p.log(rec);
          p.log('');
        }
        p.log('QUICK START');
        p.log(`  ${d.quick_start}`);
        p.log('');
      });

      return exitWithFlush(EXIT_CODES.success);
    }, () => ({}));
  },
});

// ── root claude command ───────────────────────────────────────────────────────

export const claude = defineCommand({
  meta: {
    name: 'claude',
    description: 'Claude AI process mining assistant + Code integration layer. Example: wpm claude ask "what algorithm for hospital logs?"',
  },
  subCommands: { ask, interpret: interpretCmd, suggest: claudeSuggest, session, hooks },
  args: {
    format: { type: 'string', default: 'human' },
    verbose: { type: 'boolean', alias: 'v' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    const projectDir = process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd();

    let todayEventCount = 0;
    let hookTypeCount = 0;
    let sessionDateCount = 0;
    return withSpanRaw(
      'wasm4pm.command.claude',
      { 'claude.subcommand': 'status' },
      async () => {
        // Quick status: count session evidence + check settings.json
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const agentRunsDir = join(projectDir, 'wasm4pm', 'target', 'agent-runs');
        const sessionDirs = existsSync(agentRunsDir) ? readdirSync(agentRunsDir) : [];
        sessionDateCount = sessionDirs.length;
        const todayEventsPath = join(agentRunsDir, today, 'tool-events.jsonl');
        todayEventCount = existsSync(todayEventsPath)
          ? readFileSync(todayEventsPath, 'utf8').split('\n').filter(Boolean).length
          : 0;

        const settingsPath = join(projectDir, '.claude', 'settings.json');
        const settingsOk = existsSync(settingsPath);
        const hookTypes = settingsOk
          ? Object.keys((JSON.parse(readFileSync(settingsPath, 'utf8')) as { hooks?: Record<string, unknown> }).hooks ?? {})
          : [];
        hookTypeCount = hookTypes.length;

        const auditPath = join(projectDir, 'wasm4pm', 'target', 'audits', 'route-driven-tdd-independent-verification.json');
        const lastAuditVerdict = existsSync(auditPath)
          ? (JSON.parse(readFileSync(auditPath, 'utf8')) as { final_verdict?: string }).final_verdict ?? 'unknown'
          : 'no audit yet';

        const payload = {
          session_dates: sessionDirs,
          today_tool_events: todayEventCount,
          hook_types_wired: hookTypes,
          settings_ok: settingsOk,
          last_audit_verdict: lastAuditVerdict,
        };

        const result = makeResult('claude', payload, performance.now() - t0, EXIT_CODES.success);
        emitResult(result, { format, verbose, quiet }, (res, p) => {
          const d = res.payload as typeof payload;
          p.log('');
          p.log('wpm claude — Claude Code integration layer');
          p.log('─'.repeat(52));
          p.log(`  Settings:           ${d.settings_ok ? 'configured' : 'MISSING .claude/settings.json'}`);
          p.log(`  Hook types wired:   ${d.hook_types_wired.length} (${d.hook_types_wired.join(', ')})`);
          p.log(`  Today tool events:  ${d.today_tool_events}`);
          p.log(`  Session dates:      ${d.session_dates.length} (${d.session_dates.slice(-3).join(', ')})`);
          p.log(`  Last proof audit:   ${d.last_audit_verdict}`);
          p.log('');
          p.log('AI Assistant:');
          p.log('  wpm claude ask "..."     Ask a process mining question');
          p.log('  wpm claude interpret "fitness 0.73"  Interpret metrics in plain language');
          p.log('  wpm claude suggest -i log.xes        Intelligent log analysis + recommendations');
          p.log('');
          p.log('Code Integration:');
          p.log('  wpm claude session       Show today\'s tool evidence + work orders');
          p.log('  wpm claude hooks         JTBD verification of all hook jobs');
          p.log('');
        });

        return exitWithFlush(EXIT_CODES.success);
      },
      () => ({
        'claude.today_event_count': todayEventCount,
        'claude.hook_type_count': hookTypeCount,
        'claude.session_date_count': sessionDateCount,
      }),
    );
  },
});
