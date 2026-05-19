import { defineCommand } from 'citty';
import { createHash } from 'crypto';
import { existsSync, readFileSync, readdirSync } from 'fs';
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

// ── root claude command ───────────────────────────────────────────────────────

export const claude = defineCommand({
  meta: {
    name: 'claude',
    description: 'Claude Code integration layer: session evidence, hook verification, proof status',
  },
  subCommands: { session, hooks },
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
          p.log('Subcommands:');
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
