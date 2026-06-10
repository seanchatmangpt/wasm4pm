// JTBD (Jobs-To-Be-Done) hook verification probes and doctorHooks subcommand
import { defineCommand } from 'citty';
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { execSync, spawnSync } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import { emitResult, makeResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { exitWithFlush } from '../../otel/exit.js';

export interface JtbdProbe {
  job: string; // What job is this hook supposed to do?
  scenario: string; // The specific scenario being exercised
  observed: string; // What was actually observed
  verdict: 'verified' | 'refuted' | 'inconclusive';
  evidence: string; // The specific data points that support the verdict
}

export function runHook(
  hookPath: string,
  inputObj: unknown,
  projectDir: string
): { status: number; stdout: string; stderr: string } {
  const result = spawnSync('bash', [hookPath], {
    input: JSON.stringify(inputObj),
    encoding: 'utf8',
    cwd: projectDir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function todayDir(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

export async function probeHooks(projectDir: string): Promise<JtbdProbe[]> {
  const hookDir = path.join(projectDir, '.claude', 'hooks');
  const preToolUse = path.join(hookDir, 'pre-tool-use.sh');
  const postToolUse = path.join(hookDir, 'post-tool-use.sh');
  const stopGate = path.join(hookDir, 'stop-proof-gate.sh');
  const userPrompt = path.join(hookDir, 'user-prompt.sh');
  const agentRunsBase = path.join(projectDir, 'wasm4pm', 'target', 'agent-runs');

  const probes: JtbdProbe[] = [];

  // ── Probe 1: PreToolUse blocks handwritten verdict writes ─────────────────
  {
    const r = runHook(
      preToolUse,
      {
        tool_name: 'Write',
        tool_input: {
          file_path: 'wasm4pm/target/proof-packs/jtbd-test/FINAL/verdict.json',
          content: '{"verdict":"Accepted"}',
        },
      },
      projectDir
    );
    const blocked = r.status === 2;
    const hasGuardMsg = r.stderr.includes('PROOF PACK INTEGRITY GUARD');
    probes.push({
      job: 'Prevent handwritten verdict writes',
      scenario:
        'Write tool targeting wasm4pm/target/proof-packs/*/FINAL/verdict.json with {"verdict":"Accepted"}',
      observed: blocked
        ? 'Hook exited 2 — write was blocked before reaching disk; guard message present in stderr'
        : `Hook exited ${r.status} — write was NOT blocked (expected exit 2)`,
      verdict: blocked && hasGuardMsg ? 'verified' : 'refuted',
      evidence: `exit_code=${r.status}; guard_msg_in_stderr=${hasGuardMsg}`,
    });
  }

  // ── Probe 2: PreToolUse allows safe writes ────────────────────────────────
  {
    const r = runHook(
      preToolUse,
      {
        tool_name: 'Write',
        tool_input: { file_path: 'wasm4pm/src/testing/harness.rs', content: 'pub struct Test {}' },
      },
      projectDir
    );
    const allowed = r.status === 0;
    probes.push({
      job: 'Allow writes to non-protected paths',
      scenario: 'Write tool targeting wasm4pm/src/testing/harness.rs (not a proof artifact)',
      observed: allowed
        ? 'Hook exited 0 — write passed through without blocking'
        : `Hook exited ${r.status} — write was unexpectedly blocked`,
      verdict: allowed ? 'verified' : 'refuted',
      evidence: `exit_code=${r.status}`,
    });
  }

  // ── Probe 3: PreToolUse blocks audit JSON tampering ───────────────────────
  {
    const r = runHook(
      preToolUse,
      {
        tool_name: 'Edit',
        tool_input: {
          file_path: 'wasm4pm/target/audits/route-driven-tdd-independent-verification.json',
          old_string: 'AndonPull',
          new_string: 'Accepted',
        },
      },
      projectDir
    );
    const blocked = r.status === 2;
    probes.push({
      job: 'Prevent tampering with audit verdict JSON',
      scenario:
        'Edit tool changing AndonPull→Accepted in route-driven-tdd-independent-verification.json',
      observed: blocked
        ? 'Hook exited 2 — edit was blocked; audit JSON is write-protected'
        : `Hook exited ${r.status} — edit was NOT blocked (expected exit 2)`,
      verdict: blocked ? 'verified' : 'refuted',
      evidence: `exit_code=${r.status}`,
    });
  }

  // ── Probe 4: PreToolUse blocks Bash shell redirects into protected files ──
  {
    const r = runHook(
      preToolUse,
      {
        tool_name: 'Bash',
        tool_input: {
          command:
            'echo \'{"verdict":"Accepted"}\' >> /tmp/jtbd-wasm4pm/target/proof-packs/x/FINAL/verdict.json',
        },
      },
      projectDir
    );
    // Note: the path in the command contains "target/proof-packs" and "verdict.json"
    // The hook checks for those patterns in the Bash command string
    const blocked = r.status === 2;
    probes.push({
      job: 'Block Bash shell redirects into proof artifact paths',
      scenario: 'Bash tool with echo >> target/proof-packs/*/FINAL/verdict.json',
      observed: blocked
        ? 'Hook exited 2 — bash redirect was blocked'
        : `Hook exited ${r.status} — redirect was NOT blocked (expected exit 2)`,
      verdict: blocked ? 'verified' : 'refuted',
      evidence: `exit_code=${r.status}`,
    });
  }

  // ── Probe 5: PostToolUse records tool evidence ────────────────────────────
  {
    const eventsPath = path.join(agentRunsBase, todayDir(), 'tool-events.jsonl');
    const beforeLines = existsSync(eventsPath)
      ? readFileSync(eventsPath, 'utf8').split('\n').filter(Boolean).length
      : 0;
    runHook(
      postToolUse,
      {
        tool_name: 'Edit',
        tool_input: { file_path: 'wasm4pm/src/testing/harness.rs' },
      },
      projectDir
    );
    const afterLines = existsSync(eventsPath)
      ? readFileSync(eventsPath, 'utf8').split('\n').filter(Boolean).length
      : 0;
    const recorded = afterLines > beforeLines;
    probes.push({
      job: 'Append tool evidence to session audit log after each tool use',
      scenario: 'PostToolUse fires after Edit tool on wasm4pm/src/testing/harness.rs',
      observed: recorded
        ? `tool-events.jsonl grew from ${beforeLines} to ${afterLines} lines — evidence appended`
        : `tool-events.jsonl unchanged at ${afterLines} lines — nothing was recorded`,
      verdict: recorded ? 'verified' : 'refuted',
      evidence: `events_file=${eventsPath}; before=${beforeLines}; after=${afterLines}`,
    });
  }

  // ── Probe 6: UserPromptSubmit records work orders ─────────────────────────
  {
    const promptsPath = path.join(agentRunsBase, todayDir(), 'prompts.jsonl');
    const beforeLines = existsSync(promptsPath)
      ? readFileSync(promptsPath, 'utf8').split('\n').filter(Boolean).length
      : 0;
    runHook(
      userPrompt,
      {
        prompt: 'jtbd-test-probe: verify work order recording',
        session_id: 'jtbd-test',
      },
      projectDir
    );
    const afterLines = existsSync(promptsPath)
      ? readFileSync(promptsPath, 'utf8').split('\n').filter(Boolean).length
      : 0;
    const recorded = afterLines > beforeLines;
    probes.push({
      job: 'Record user prompts as timestamped work orders',
      scenario: 'UserPromptSubmit fires with prompt text and session_id',
      observed: recorded
        ? `prompts.jsonl grew from ${beforeLines} to ${afterLines} lines — work order appended`
        : `prompts.jsonl unchanged at ${afterLines} lines — work order was not recorded`,
      verdict: recorded ? 'verified' : 'refuted',
      evidence: `prompts_file=${promptsPath}; before=${beforeLines}; after=${afterLines}`,
    });
  }

  // ── Probe 7: Stop gate allows stop when no critical files modified ─────────
  {
    const gitStatus = spawnSync(
      'git',
      [
        'status',
        '--short',
        '--',
        'wasm4pm/src/testing/conformance.rs',
        'wasm4pm/src/testing/harness.rs',
        'wasm4pm/src/testing/proof_pack.rs',
      ],
      { cwd: projectDir, encoding: 'utf8' }
    );
    const hasMods = (gitStatus.stdout ?? '').trim().length > 0;

    if (!hasMods) {
      const r = runHook(stopGate, { stop_hook_active: false }, projectDir);
      const allowed = r.status === 0;
      const noBlock = !r.stdout.includes('"decision":"block"');
      probes.push({
        job: 'Allow stop when no critical testing files have uncommitted changes',
        scenario: 'Stop signal with stop_hook_active=false and clean git status on testing files',
        observed:
          allowed && noBlock
            ? 'Hook exited 0 with no block decision — stop allowed through'
            : `Hook exited ${r.status}; block_in_stdout=${!noBlock} — stop was incorrectly prevented`,
        verdict: allowed && noBlock ? 'verified' : 'refuted',
        evidence: `exit_code=${r.status}; block_in_stdout=${!noBlock}`,
      });
    } else {
      probes.push({
        job: 'Allow stop when no critical testing files have uncommitted changes',
        scenario: 'Stop signal with stop_hook_active=false and clean git status on testing files',
        observed:
          'Skipped — critical files currently have uncommitted changes; stop gate correctly engaged',
        verdict: 'inconclusive',
        evidence: `git_modified=${(gitStatus.stdout ?? '').trim().slice(0, 120)}`,
      });
    }
  }

  // ── Probe 8: Stop gate prevents hook re-entry loops ───────────────────────
  {
    const r = runHook(stopGate, { stop_hook_active: true }, projectDir);
    const allowed = r.status === 0;
    probes.push({
      job: 'Prevent infinite hook re-entry via stop_hook_active guard',
      scenario: 'Stop signal with stop_hook_active=true (Claude Code re-entry sentinel)',
      observed: allowed
        ? 'Hook exited 0 immediately — re-entry guard fired, no recursive audit'
        : `Hook exited ${r.status} — re-entry guard may not be working`,
      verdict: allowed ? 'verified' : 'refuted',
      evidence: `exit_code=${r.status}`,
    });
  }

  // ── Probe 9: Settings.json wires all required hook types ──────────────────
  {
    const settingsPath = path.join(projectDir, '.claude', 'settings.json');
    const required = [
      'SessionStart',
      'UserPromptSubmit',
      'PreToolUse',
      'PostToolUse',
      'TaskCompleted',
      'Stop',
    ];
    if (existsSync(settingsPath)) {
      let settings: { hooks?: Record<string, unknown> };
      try {
        settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      } catch {
        settings = {};
      }
      const wired = Object.keys(settings.hooks ?? {});
      const missing = required.filter((k) => !wired.includes(k));
      probes.push({
        job: 'Wire all required lifecycle hook types in .claude/settings.json',
        scenario: 'Read .claude/settings.json and verify hook registrations for 6 lifecycle points',
        observed:
          missing.length === 0
            ? `All ${required.length} required hook types registered: ${wired.filter((k) => required.includes(k)).join(', ')}`
            : `Missing ${missing.length} hook type(s): ${missing.join(', ')}`,
        verdict: missing.length === 0 ? 'verified' : 'refuted',
        evidence: `wired=[${wired.join(',')}]; missing=[${missing.join(',') || 'none'}]`,
      });
    } else {
      probes.push({
        job: 'Wire all required lifecycle hook types in .claude/settings.json',
        scenario: 'Read .claude/settings.json',
        observed: '.claude/settings.json not found — hooks are not configured',
        verdict: 'refuted',
        evidence: `settings_path=${settingsPath}`,
      });
    }
  }

  // ── Probe A1: Stop gate blocks dirty critical file + failing audit ────────────
  {
    let probe: JtbdProbe;
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'jtbd-stop-'));
    try {
      // Minimal git repo so git status works
      spawnSync('git', ['init', '-q'], { cwd: tmpDir });
      spawnSync('git', ['config', 'user.email', 'jtbd@wasm4pm.test'], { cwd: tmpDir });
      spawnSync('git', ['config', 'user.name', 'JTBD Probe'], { cwd: tmpDir });

      // Create the critical file (committed = clean state)
      const criticalDir = path.join(tmpDir, 'wasm4pm', 'src', 'testing');
      mkdirSync(criticalDir, { recursive: true });
      const criticalFile = path.join(criticalDir, 'harness.rs');
      writeFileSync(criticalFile, '// initial\n');
      spawnSync('git', ['add', '-A'], { cwd: tmpDir });
      spawnSync('git', ['commit', '-m', 'init', '--allow-empty'], { cwd: tmpDir });

      // Dirty the file → git status will report it modified
      writeFileSync(criticalFile, '// modified — jtbd probe dirty state\n');

      // Fake wpm CLI that immediately returns AndonPull for `proof audit`
      const fakeWpmDir = path.join(tmpDir, 'apps', 'wasm4pm', 'dist', 'bin');
      mkdirSync(fakeWpmDir, { recursive: true });
      writeFileSync(
        path.join(fakeWpmDir, 'wpm.js'),
        [
          '#!/usr/bin/env node',
          'const args = process.argv.slice(2);',
          'if (args.includes("audit")) {',
          '  process.stdout.write(JSON.stringify({',
          '    status:"error",message:"proof audit",',
          '    payload:{final_verdict:"AndonPull(4_cargo_tests)",',
          '    verdict_reason:"JTBD probe: simulated test failure",',
          '    gates_passed:3,gates_failed:2}}) + "\\n");',
          '  process.exit(3);',
          '}',
          'process.exit(0);',
        ].join('\n')
      );

      // Copy the real stop gate to the temp project
      const hooksDir = path.join(tmpDir, '.claude', 'hooks');
      mkdirSync(hooksDir, { recursive: true });
      execSync(
        `cp "${path.join(hookDir, 'stop-proof-gate.sh')}" "${path.join(hooksDir, 'stop-proof-gate.sh')}"`
      );

      const r = runHook(
        path.join(hooksDir, 'stop-proof-gate.sh'),
        { stop_hook_active: false },
        tmpDir
      );
      const blocked = r.stdout.includes('"decision":"block"');
      const hasAndon = r.stdout.includes('AndonPull') || r.stderr.includes('AndonPull');

      probe = {
        job: 'Block stop when critical testing files are dirty and proof audit returns AndonPull',
        scenario: 'harness.rs modified (git dirty), fake wpm returns AndonPull(4_cargo_tests)',
        observed: blocked
          ? 'Stop hook emitted {"decision":"block"} — agent cannot claim done with dirty files + failing audit'
          : `Stop hook did not block (exit=${r.status}; andon_in_output=${hasAndon})`,
        verdict: blocked ? 'verified' : 'refuted',
        evidence: `exit_code=${r.status}; block_decision_in_stdout=${blocked}; andon_msg=${hasAndon}`,
      };
    } catch (err) {
      probe = {
        job: 'Block stop when critical testing files are dirty and proof audit returns AndonPull',
        scenario: 'harness.rs modified (git dirty), fake wpm returns AndonPull(4_cargo_tests)',
        observed: `Probe setup failed: ${err instanceof Error ? err.message : String(err)}`,
        verdict: 'inconclusive',
        evidence: 'probe-error',
      };
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
    probes.push(probe);
  }

  // ── Probe B1: Python write bypass is blocked ──────────────────────────────
  {
    const r = runHook(
      preToolUse,
      {
        tool_name: 'Bash',
        tool_input: {
          command:
            "python3 -c \"open('wasm4pm/target/proof-packs/bypass/FINAL/verdict.json','w').write('{}')",
        },
      },
      projectDir
    );
    const blocked = r.status === 2;
    probes.push({
      job: 'Block Python scripted writes to proof artifact paths',
      scenario: "Bash: python3 -c \"open('...verdict.json','w').write(...)\"",
      observed: blocked
        ? 'Hook exited 2 — Python write bypass was blocked'
        : `Hook exited ${r.status} — Python write bypass was NOT blocked`,
      verdict: blocked ? 'verified' : 'refuted',
      evidence: `exit_code=${r.status}`,
    });
  }

  // ── Probe B2: Absolute path write is blocked ──────────────────────────────
  {
    const absPath = path.join(
      projectDir,
      'wasm4pm',
      'target',
      'proof-packs',
      'bypass',
      'FINAL',
      'verdict.json'
    );
    const r = runHook(
      preToolUse,
      {
        tool_name: 'Write',
        tool_input: { file_path: absPath, content: '{"verdict":"Accepted"}' },
      },
      projectDir
    );
    const blocked = r.status === 2;
    probes.push({
      job: 'Block absolute-path writes to proof artifact paths',
      scenario: `Write tool with absolute path: ...wasm4pm/target/proof-packs/bypass/FINAL/verdict.json`,
      observed: blocked
        ? 'Hook exited 2 — absolute path bypass was blocked (pattern match is path-substring, not prefix)'
        : `Hook exited ${r.status} — absolute path bypass was NOT blocked`,
      verdict: blocked ? 'verified' : 'refuted',
      evidence: `exit_code=${r.status}; path=${absPath.slice(-60)}`,
    });
  }

  // ── Probe B3: Heredoc (cat >) bypass is blocked ───────────────────────────
  {
    const r = runHook(
      preToolUse,
      {
        tool_name: 'Bash',
        tool_input: {
          command:
            'cat > wasm4pm/target/proof-packs/bypass/FINAL/verdict.json << EOF\n{"verdict":"Accepted"}\nEOF',
        },
      },
      projectDir
    );
    const blocked = r.status === 2;
    probes.push({
      job: 'Block heredoc (cat >) writes to proof artifact paths',
      scenario: 'Bash: cat > ...verdict.json << EOF ... EOF',
      observed: blocked
        ? 'Hook exited 2 — heredoc redirect bypass was blocked'
        : `Hook exited ${r.status} — heredoc redirect bypass was NOT blocked`,
      verdict: blocked ? 'verified' : 'refuted',
      evidence: `exit_code=${r.status}`,
    });
  }

  return probes;
}

export const doctorHooks = defineCommand({
  meta: {
    name: 'hooks',
    description: 'Verify Claude Code hooks work as declared. Tests that git hooks, pre-commit gates, and proof checks actually execute and enforce their constraints.',
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
    const probes = await probeHooks(projectDir);

    const verified = probes.filter((p) => p.verdict === 'verified').length;
    const refuted = probes.filter((p) => p.verdict === 'refuted').length;
    const inconclusive = probes.filter((p) => p.verdict === 'inconclusive').length;
    const healthy = refuted === 0 && inconclusive === 0;

    const exitCode = healthy ? EXIT_CODES.success : EXIT_CODES.config_error;

    // Write disk audit — the hooks probe must itself leave proof of execution.
    // Under .wasm4pm/audits/ (already gitignored) so it never gets committed
    // and never lands in apps/wasm4pm/wasm4pm/target/ via cwd accidents.
    const auditDir = path.join(projectDir, '.wasm4pm', 'audits');
    const auditPath = path.join(auditDir, 'claude-hooks-jtbd-verification.json');
    try {
      mkdirSync(auditDir, { recursive: true });
      writeFileSync(
        auditPath,
        JSON.stringify(
          {
            audit_timestamp: new Date().toISOString(),
            auditor: 'wpm-doctor-hooks-jtbd',
            probes: probes.map((p) => ({ ...p })),
            summary: { verified, refuted, inconclusive, total: probes.length },
            verdict: healthy ? 'Accepted' : 'AndonPull(RefutedJobs)',
            refuted_jobs: probes.filter((p) => p.verdict === 'refuted').map((p) => p.job),
          },
          null,
          2
        ),
        'utf8'
      );
    } catch {
      /* non-blocking: disk write failure does not suppress CLI output */
    }

    const result = makeResult(
      'doctor hooks',
      {
        probes,
        summary: { verified, refuted, inconclusive, total: probes.length },
        healthy,
        audit_path: auditPath,
      },
      performance.now() - t0,
      exitCode
    );

    emitResult(result, { format, verbose, quiet }, (res, p) => {
      p.log('');
      p.log('wpm doctor hooks — Jobs-To-Be-Done (JTBD) verification');
      p.log('Tests whether hooks do their jobs, not whether files exist.');
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
      p.log(`Summary: ${verified} verified, ${refuted} refuted, ${inconclusive} inconclusive`);
      p.log(`Audit:   ${(res.payload as { audit_path?: string }).audit_path ?? 'not written'}`);
      if (healthy) {
        p.success('All hooks are doing their declared jobs.');
      } else {
        p.error(`${refuted} hook job(s) refuted — hooks are not enforcing the proof contract.`);
      }
    });

    return await exitWithFlush(exitCode);
  },
});

