import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { loadAlgorithmFeedback, getAlgorithmStats, type FeedbackRecord } from '@wasm4pm/observability';
import { exitWithFlush } from '../otel/exit.js';
import { withSpan } from './_otel.js';

// ─── User-facing feedback types (submit/list/summary/analyze) ─────────────────

export interface UserFeedbackItem {
  id: string;
  type: 'bug' | 'improvement' | 'question';
  message: string;
  status: 'open' | 'resolved' | 'answered';
  created_at: string;
  resolved_at?: string;
  tags?: string[];
}

export interface FeedbackIssue {
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  observation: string;
  suggestion: string;
  command?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFeedbackDir(): string {
  return path.resolve(process.cwd(), '.wasm4pm', 'feedback');
}

function generateId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const rand = Math.floor(Math.random() * 900) + 100;
  return `fb-${date}-${rand}`;
}

async function listUserFeedback(): Promise<UserFeedbackItem[]> {
  const dir = getFeedbackDir();
  try {
    const files = await fs.readdir(dir);
    const items: UserFeedbackItem[] = [];
    for (const file of files.filter((f) => f.endsWith('.json'))) {
      try {
        const content = await fs.readFile(path.join(dir, file), 'utf8');
        items.push(JSON.parse(content) as UserFeedbackItem);
      } catch {
        // Skip malformed files
      }
    }
    return items.sort((a, b) => b.created_at.localeCompare(a.created_at));
  } catch {
    return [];
  }
}

// ─── submit ───────────────────────────────────────────────────────────────────

const submitCmd = defineCommand({
  meta: {
    name: 'submit',
    description: 'Submit feedback: bugs, improvements, or questions. Example: wpm feedback submit --type improvement --message "DFG should show percentages"',
  },
  args: {
    type: {
      type: 'string',
      description: 'Feedback type: bug | improvement | question',
      alias: 't',
      default: 'improvement',
    },
    message: {
      type: 'string',
      description: 'Feedback message',
      alias: 'm',
    },
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const type = (ctx.args.type as UserFeedbackItem['type']) ?? 'improvement';
    const message = ctx.args.message as string | undefined;

    return withSpan('feedback_submit', { type }, async () => {
      const t0 = Date.now();

      if (!message || message.trim() === '') {
        const result = makeErrorResult('feedback submit', new Error('--message is required. Example: wpm feedback submit --type bug --message "describe the issue"'), EXIT_CODES.config_error, 'MISSING_MESSAGE');
        emitResult(result, { format, verbose: false, quiet: false });
        return exitWithFlush(result.exit_code);
      }

      const validTypes: UserFeedbackItem['type'][] = ['bug', 'improvement', 'question'];
      if (!validTypes.includes(type)) {
        const result = makeErrorResult('feedback submit', new Error(`Invalid type "${type}". Use: bug | improvement | question`), EXIT_CODES.config_error, 'INVALID_TYPE');
        emitResult(result, { format, verbose: false, quiet: false });
        return exitWithFlush(result.exit_code);
      }

      const id = generateId();
      const item: UserFeedbackItem = {
        id,
        type,
        message: message.trim(),
        status: 'open',
        created_at: new Date().toISOString(),
      };

      const dir = getFeedbackDir();
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(item, null, 2), 'utf8');

      const payload = {
        schema: 'wasm4pm.feedback.submit.v1',
        id,
        type,
        message: item.message,
        status: item.status,
        created_at: item.created_at,
      };

      const result = makeResult('feedback submit', payload, Date.now() - t0, EXIT_CODES.success);
      emitResult(result, { format, verbose: false, quiet: false }, (res, p) => {
        const d = res.payload as typeof payload;
        p.log('');
        p.success('Feedback Submitted');
        p.log('==================');
        p.log(`ID:      ${d.id}`);
        p.log(`Type:    ${d.type}`);
        p.log(`Message: "${d.message.slice(0, 80)}${d.message.length > 80 ? '...' : ''}"`);
        p.log(`Status:  ${d.status}`);
        p.log('');
        p.log('View feedback with: wpm feedback list');
      });

      return exitWithFlush(EXIT_CODES.success);
    });
  },
});

// ─── list ─────────────────────────────────────────────────────────────────────

const listCmd = defineCommand({
  meta: {
    name: 'list',
    description: 'List all submitted feedback items. Example: wpm feedback list',
  },
  args: {
    type: {
      type: 'string',
      description: 'Filter by type: bug | improvement | question',
      alias: 't',
    },
    status: {
      type: 'string',
      description: 'Filter by status: open | resolved | answered',
      alias: 's',
    },
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const typeFilter = ctx.args.type as string | undefined;
    const statusFilter = ctx.args.status as string | undefined;

    return withSpan('feedback_list', {}, async () => {
      const t0 = Date.now();
      let items = await listUserFeedback();

      if (typeFilter) items = items.filter((i) => i.type === typeFilter);
      if (statusFilter) items = items.filter((i) => i.status === statusFilter);

      const payload = {
        schema: 'wasm4pm.feedback.list.v1',
        total: items.length,
        items: items.map((i, idx) => ({
          '#': idx + 1,
          id: i.id,
          type: i.type,
          status: i.status,
          message: i.message,
          created_at: i.created_at,
        })),
      };

      const result = makeResult('feedback list', payload, Date.now() - t0, EXIT_CODES.success);
      emitResult(result, { format, verbose: false, quiet: false }, (res, p) => {
        const d = res.payload as typeof payload;
        p.log('');
        p.success('Feedback History');
        p.log('================');

        if (d.items.length === 0) {
          p.log('No feedback items found.');
          p.log('Submit feedback with: wpm feedback submit --type improvement --message "your feedback"');
          return;
        }

        const colW = [4, 20, 12, 10, 55];
        const header = ['#', 'ID', 'Type', 'Status', 'Message'];
        p.log(header.map((h, i) => h.padEnd(colW[i] ?? 10)).join(' '));
        p.log('-'.repeat(colW.reduce((a, b) => a + b + 1, 0)));

        for (const item of d.items) {
          const msg = item.message.length > 53 ? item.message.slice(0, 50) + '...' : item.message;
          const row = [
            String(item['#']).padEnd(colW[0] ?? 4),
            item.id.padEnd(colW[1] ?? 20),
            item.type.padEnd(colW[2] ?? 12),
            item.status.padEnd(colW[3] ?? 10),
            `"${msg}"`,
          ];
          p.log(row.join(' '));
        }
        p.log('');
      });

      return exitWithFlush(EXIT_CODES.success);
    });
  },
});

// ─── summary ──────────────────────────────────────────────────────────────────

const summaryCmd = defineCommand({
  meta: {
    name: 'summary',
    description: 'Show feedback summary with counts and top requests. Example: wpm feedback summary',
  },
  args: {
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';

    return withSpan('feedback_summary', {}, async () => {
      const t0 = Date.now();
      const items = await listUserFeedback();

      const open = items.filter((i) => i.status === 'open');
      const resolved = items.filter((i) => i.status === 'resolved' || i.status === 'answered');

      const openBugs = open.filter((i) => i.type === 'bug').length;
      const openImprovements = open.filter((i) => i.type === 'improvement').length;
      const openQuestions = open.filter((i) => i.type === 'question').length;

      // Find top requested topics by simple keyword frequency
      const topicCounts: Record<string, number> = {};
      for (const item of items.filter((i) => i.type === 'improvement')) {
        const words = item.message.toLowerCase().split(/\s+/);
        for (const word of words) {
          if (word.length > 4) {
            topicCounts[word] = (topicCounts[word] ?? 0) + 1;
          }
        }
      }
      const topTopics = Object.entries(topicCounts)
        .filter(([, count]) => count > 1)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([topic, count]) => ({ topic, count }));

      const payload = {
        schema: 'wasm4pm.feedback.summary.v1',
        total: items.length,
        open: open.length,
        resolved: resolved.length,
        open_breakdown: { bugs: openBugs, improvements: openImprovements, questions: openQuestions },
        top_topics: topTopics,
      };

      const result = makeResult('feedback summary', payload, Date.now() - t0, EXIT_CODES.success);
      emitResult(result, { format, verbose: false, quiet: false }, (res, p) => {
        const d = res.payload as typeof payload;
        p.log('');
        p.success('Feedback Summary');
        p.log('================');
        p.log(`Total: ${d.total} items`);
        if (d.open > 0) {
          p.log(`  Open:     ${d.open} (bugs: ${d.open_breakdown.bugs}, improvements: ${d.open_breakdown.improvements}, questions: ${d.open_breakdown.questions})`);
        }
        if (d.resolved > 0) {
          p.log(`  Resolved: ${d.resolved}`);
        }
        if (d.total === 0) {
          p.log('');
          p.log('No feedback yet. Submit with: wpm feedback submit --type improvement --message "your feedback"');
        }
        if (d.top_topics.length > 0) {
          p.log('');
          p.log('Top requested improvements:');
          d.top_topics.forEach((t, i) => {
            p.log(`  ${i + 1}. ${t.topic} (${t.count} mentions)`);
          });
        }
        p.log('');
      });

      return exitWithFlush(EXIT_CODES.success);
    });
  },
});

// ─── analyze ──────────────────────────────────────────────────────────────────

const analyzeCmd = defineCommand({
  meta: {
    name: 'analyze',
    description: 'Automatically generate feedback by analyzing an event log. Example: wpm feedback analyze -i log.xes',
  },
  args: {
    input: {
      type: 'string',
      description: 'Path to XES event log',
      alias: 'i',
    },
    algorithm: {
      type: 'string',
      description: 'Discovery algorithm to use for analysis (default: dfg)',
      alias: 'a',
      default: 'dfg',
    },
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    save: {
      type: 'boolean',
      description: 'Save generated feedback items to .wasm4pm/feedback/',
      default: true,
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const inputPath = ctx.args.input as string | undefined;
    const algorithm = (ctx.args.algorithm as string | undefined) ?? 'dfg';
    const saveItems = ctx.args.save !== false;

    return withSpan('feedback_analyze', { algorithm }, async () => {
      const t0 = Date.now();

      if (!inputPath) {
        const result = makeErrorResult('feedback analyze', new Error('--input/-i is required. Example: wpm feedback analyze -i log.xes'), EXIT_CODES.config_error, 'MISSING_INPUT');
        emitResult(result, { format, verbose: false, quiet: false });
        return exitWithFlush(result.exit_code);
      }

      // Load and parse the XES file
      let xesContent: string;
      try {
        xesContent = await fs.readFile(path.resolve(inputPath), 'utf8');
      } catch {
        const result = makeErrorResult('feedback analyze', new Error(`Cannot read file: ${inputPath}`), EXIT_CODES.source_error, 'FILE_NOT_FOUND');
        emitResult(result, { format, verbose: false, quiet: false });
        return exitWithFlush(result.exit_code);
      }

      // Derive log statistics from XES content
      const traceCount = (xesContent.match(/<trace[\s>]/g) ?? []).length;
      const eventCount = (xesContent.match(/<event[\s>]/g) ?? []).length;

      const activitySet = new Set<string>();
      const actRe = /key="concept:name"[^>]*value="([^"]+)"/g;
      let m: RegExpExecArray | null;
      while ((m = actRe.exec(xesContent)) !== null) {
        if (m[1]) activitySet.add(m[1]);
      }
      const activityCount = activitySet.size;

      // Count activity frequencies for rare-activity detection
      const actFreq: Record<string, number> = {};
      const freqRe = /key="concept:name"[^>]*value="([^"]+)"/g;
      while ((m = freqRe.exec(xesContent)) !== null) {
        if (m[1]) actFreq[m[1]] = (actFreq[m[1]] ?? 0) + 1;
      }
      const rareActivities = Object.entries(actFreq).filter(([, count]) => count < 5);

      // Variant count approximation (unique trace signatures)
      const traceBlocks = xesContent.match(/<trace[\s\S]*?<\/trace>/g) ?? [];
      const variantSigs = new Set<string>();
      for (const tb of traceBlocks) {
        const acts: string[] = [];
        const taRe = /key="concept:name"[^>]*value="([^"]+)"/g;
        let tm: RegExpExecArray | null;
        while ((tm = taRe.exec(tb)) !== null) {
          if (tm[1]) acts.push(tm[1]);
        }
        variantSigs.add(acts.join('->'));
      }
      const variantCount = variantSigs.size;

      // Generate issues from observations
      const issues: FeedbackIssue[] = [];

      // Issue: high variant count
      if (traceCount > 0 && variantCount / traceCount > 0.5) {
        issues.push({
          severity: 'MEDIUM',
          title: `High variant count (${variantCount} variants for ${traceCount} traces)`,
          observation: `${Math.round((variantCount / traceCount) * 100)}% of traces are unique — high process complexity`,
          suggestion: 'Consider grouping rare variants or filtering noise before analysis',
          command: `wpm deduplicate -i ${inputPath}`,
        });
      }

      // Issue: rare activities
      if (rareActivities.length > 5) {
        issues.push({
          severity: 'LOW',
          title: `${rareActivities.length} rare activities (appear < 5 times)`,
          observation: 'Rare activities may be noise, exceptions, or data quality issues',
          suggestion: 'Run data quality validation to check for logging errors',
          command: `wpm validate -i ${inputPath}`,
        });
      }

      // Issue: very small log
      if (traceCount < 20) {
        issues.push({
          severity: 'HIGH',
          title: `Small log (${traceCount} traces)`,
          observation: 'Statistical power is limited with fewer than 20 traces',
          suggestion: 'Results may not generalize. Collect more event data for reliable analysis',
        });
      }

      // Issue: large log — suggest fast algorithm
      if (eventCount > 50000 && algorithm === 'genetic_algorithm') {
        issues.push({
          severity: 'MEDIUM',
          title: 'Large log with slow algorithm',
          observation: `${eventCount.toLocaleString()} events with genetic_algorithm may take minutes`,
          suggestion: 'Use dfg or heuristic_miner for faster initial analysis',
          command: `wpm run ${inputPath} --algorithm heuristic_miner`,
        });
      }

      // Issue: no timestamps
      const hasTimestamps = xesContent.includes('time:timestamp');
      if (!hasTimestamps) {
        issues.push({
          severity: 'INFO',
          title: 'No timestamps detected',
          observation: 'Event log lacks time:timestamp attributes',
          suggestion: 'Temporal analysis and performance metrics require timestamps',
        });
      }

      // Issue: algorithm suggestion
      if (activityCount > 30 && (algorithm === 'dfg' || algorithm === 'alpha_plus_plus')) {
        issues.push({
          severity: 'INFO',
          title: `Complex process (${activityCount} activities) — consider a better algorithm`,
          observation: `DFG/Alpha produce spaghetti models for ${activityCount}+ activities`,
          suggestion: 'inductive_miner or heuristic_miner handle complexity better',
          command: `wpm run ${inputPath} --algorithm inductive_miner`,
        });
      }

      // Save issues as feedback items
      const savedIds: string[] = [];
      if (saveItems && issues.length > 0) {
        const dir = getFeedbackDir();
        await fs.mkdir(dir, { recursive: true });
        for (const issue of issues) {
          const id = generateId();
          const item: UserFeedbackItem = {
            id,
            type: issue.severity === 'HIGH' ? 'bug' : 'improvement',
            message: `[AUTO] ${issue.title}: ${issue.observation}`,
            status: 'open',
            created_at: new Date().toISOString(),
            tags: ['auto-generated', algorithm],
          };
          await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(item, null, 2), 'utf8');
          savedIds.push(id);
        }
      }

      const logName = path.basename(inputPath);
      const payload = {
        schema: 'wasm4pm.feedback.analyze.v1',
        input: logName,
        log_stats: { traces: traceCount, events: eventCount, activities: activityCount, variants: variantCount },
        issues,
        saved: savedIds.length,
        saved_ids: savedIds,
      };

      const result = makeResult('feedback analyze', payload, Date.now() - t0, EXIT_CODES.success);
      emitResult(result, { format, verbose: false, quiet: false }, (res, p) => {
        const d = res.payload as typeof payload;
        p.log('');
        p.success(`Automatic Process Analysis Feedback`);
        p.log(`=====================================`);
        p.log(`Based on quality assessment of ${d.input}:`);
        p.log(`  ${d.log_stats.events.toLocaleString()} events, ${d.log_stats.traces} traces, ${d.log_stats.activities} activities, ${d.log_stats.variants} variants`);
        p.log('');

        if (d.issues.length === 0) {
          p.success('No significant issues detected. Log looks well-structured.');
          return;
        }

        d.issues.forEach((issue, i) => {
          const severityIcon = issue.severity === 'HIGH' ? '[HIGH]' : issue.severity === 'MEDIUM' ? '[MEDIUM]' : issue.severity === 'LOW' ? '[LOW]' : '[INFO]';
          p.log(`Issue ${i + 1} ${severityIcon}: ${issue.title}`);
          p.log(`  Observation: ${issue.observation}`);
          p.log(`  Suggestion: ${issue.suggestion}`);
          if (issue.command) p.log(`  Run: ${issue.command}`);
          p.log('');
        });

        if (d.saved > 0) {
          p.log(`${d.saved} feedback item${d.saved !== 1 ? 's' : ''} saved. View with: wpm feedback list`);
        }
      });

      return exitWithFlush(EXIT_CODES.success);
    });
  },
});

// ─── Legacy algorithm-feedback subcommands (stats / clear / export) ───────────

interface FeedbackStatsPayload {
  schema: string;
  algorithm: string;
  count: number;
  meanFitness: number;
  medianFitness: number;
  meanPrecision: number | null;
  bucketStats: Record<string, { count: number; meanFitness: number }>;
}

interface FeedbackClearPayload {
  schema: string;
  status: string;
  algorithms_deleted: string[];
  records_deleted: number;
}

interface FeedbackExportPayload {
  schema: string;
  status: string;
  file: string;
  records_exported: number;
  algorithms_included: string[];
}

const stats = defineCommand({
  meta: { name: 'stats', description: 'Show aggregated statistics for algorithm feedback' },
  args: {
    algorithm: { type: 'string', description: 'Algorithm ID. If omitted, shows all', alias: 'a' },
    format: { type: 'string', description: 'Output format (human or json)', default: 'human' },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const algorithmFilter = ctx.args.algorithm as string | undefined;

    return withSpan('feedback_stats', { algorithm: algorithmFilter || 'all' }, async () => {
      try {
        const t0 = Date.now();
        const feedbackDir = path.resolve(process.cwd(), '.wasm4pm', 'algorithm-feedback');
        let algorithms: string[] = [];

        if (algorithmFilter) {
          algorithms = [algorithmFilter];
        } else {
          try {
            const files = await fs.readdir(feedbackDir);
            algorithms = files.filter((f) => f.endsWith('_feedback.jsonl')).map((f) => f.replace('_feedback.jsonl', ''));
          } catch { algorithms = []; }
        }

        if (algorithms.length === 0) {
          const payload = { schema: 'chatmangpt.wasm4pm.feedback.stats.v1', status: 'no_data', message: 'No algorithm feedback data available. Run discovery commands first.' };
          const result = makeResult('feedback stats', payload, Date.now() - t0, EXIT_CODES.success);
          emitResult(result, { format, verbose: false, quiet: false });
          return exitWithFlush(EXIT_CODES.success);
        }

        const allStats: Record<string, FeedbackStatsPayload> = {};
        for (const algo of algorithms) {
          const s = await getAlgorithmStats(algo);
          allStats[algo] = { schema: 'chatmangpt.wasm4pm.feedback.stats.v1', algorithm: algo, count: s.count, meanFitness: s.meanFitness, medianFitness: s.medianFitness, meanPrecision: s.meanPrecision, bucketStats: s.bucketStats };
        }

        const result = makeResult('feedback stats', allStats, Date.now() - t0, EXIT_CODES.success);
        emitResult(result, { format, verbose: false, quiet: false }, (res, p) => {
          p.log('');
          p.success('Algorithm Feedback Statistics');
          p.log('');
          for (const [algo, s] of Object.entries(res.payload as Record<string, FeedbackStatsPayload>)) {
            if (algo === 'schema') continue;
            p.log(`  ${s.algorithm}  Records: ${s.count}  Mean fitness: ${s.meanFitness.toFixed(3)}`);
          }
        });
        return exitWithFlush(EXIT_CODES.success);
      } catch (error) {
        const result = makeErrorResult('feedback stats', error, EXIT_CODES.execution_error, 'EXECUTION_ERROR');
        emitResult(result, { format, verbose: false, quiet: false });
        return exitWithFlush(result.exit_code);
      }
    });
  },
});

const clear = defineCommand({
  meta: { name: 'clear', description: 'Clear algorithm feedback data' },
  args: {
    algorithm: { type: 'string', description: 'Algorithm ID to clear. If omitted, clears all', alias: 'a' },
  },
  async run(ctx) {
    const algorithmFilter = ctx.args.algorithm as string | undefined;

    return withSpan('feedback_clear', { algorithm: algorithmFilter || 'all' }, async () => {
      const t0 = Date.now();
      const feedbackDir = path.resolve(process.cwd(), '.wasm4pm', 'algorithm-feedback');
      let filesToDelete: string[] = [];

      if (algorithmFilter) {
        filesToDelete = [`${algorithmFilter}_feedback.jsonl`];
      } else {
        try {
          const files = await fs.readdir(feedbackDir);
          filesToDelete = files.filter((f) => f.endsWith('_feedback.jsonl'));
        } catch {
          const payload: FeedbackClearPayload = { schema: 'chatmangpt.wasm4pm.feedback.clear.v1', status: 'success', algorithms_deleted: [], records_deleted: 0 };
          const result = makeResult('feedback clear', payload, Date.now() - t0, EXIT_CODES.success);
          emitResult(result, { format: 'human', verbose: false, quiet: false });
          return exitWithFlush(EXIT_CODES.success);
        }
      }

      let totalRecords = 0;
      for (const file of filesToDelete) {
        try {
          const content = await fs.readFile(path.join(feedbackDir, file), 'utf8');
          totalRecords += content.split('\n').filter((l) => l.trim()).length;
        } catch { /* skip */ }
      }

      const deletedAlgos: string[] = [];
      for (const file of filesToDelete) {
        try {
          await fs.unlink(path.join(feedbackDir, file));
          deletedAlgos.push(file.replace('_feedback.jsonl', ''));
        } catch { /* skip */ }
      }

      const payload: FeedbackClearPayload = { schema: 'chatmangpt.wasm4pm.feedback.clear.v1', status: 'success', algorithms_deleted: deletedAlgos, records_deleted: totalRecords };
      const result = makeResult('feedback clear', payload, Date.now() - t0, EXIT_CODES.success);
      emitResult(result, { format: 'human', verbose: false, quiet: false }, (res, p) => {
        if (deletedAlgos.length > 0) p.success(`Cleared ${totalRecords} feedback records from ${deletedAlgos.length} algorithm(s)`);
        else p.log('No feedback files found to delete');
      });
      return exitWithFlush(EXIT_CODES.success);
    });
  },
});

const exportCmd = defineCommand({
  meta: { name: 'export', description: 'Export algorithm feedback data to CSV' },
  args: {
    algorithm: { type: 'string', description: 'Algorithm ID. If omitted, exports all', alias: 'a' },
    out: { type: 'string', description: 'Output file path (default: ./algorithm-feedback.csv)', alias: 'o' },
  },
  async run(ctx) {
    const algorithmFilter = ctx.args.algorithm as string | undefined;
    const outputFile = (ctx.args.out as string) || './algorithm-feedback.csv';

    return withSpan('feedback_export', { algorithm: algorithmFilter || 'all', output: outputFile }, async () => {
      const t0 = Date.now();
      const feedbackDir = path.resolve(process.cwd(), '.wasm4pm', 'algorithm-feedback');
      let algorithms: string[] = [];

      if (algorithmFilter) {
        algorithms = [algorithmFilter];
      } else {
        try {
          const files = await fs.readdir(feedbackDir);
          algorithms = files.filter((f) => f.endsWith('_feedback.jsonl')).map((f) => f.replace('_feedback.jsonl', ''));
        } catch { algorithms = []; }
      }

      if (algorithms.length === 0) {
        const payload: FeedbackExportPayload = { schema: 'chatmangpt.wasm4pm.feedback.export.v1', status: 'no_data', file: outputFile, records_exported: 0, algorithms_included: [] };
        const result = makeResult('feedback export', payload, Date.now() - t0, EXIT_CODES.success);
        emitResult(result, { format: 'human', verbose: false, quiet: false });
        return exitWithFlush(EXIT_CODES.success);
      }

      const allRecords: FeedbackRecord[] = [];
      for (const algo of algorithms) {
        const records = await loadAlgorithmFeedback(algo);
        allRecords.push(...records);
      }

      if (allRecords.length > 0) {
        const headers = ['algorithm', 'log_size_bucket', 'timestamp', 'execution_time_ms', 'fitness', 'precision', 'generalization', 'simplicity'];
        const rows = allRecords.map((r) => [r.algorithm, r.log_size_bucket, r.timestamp, String(r.execution_time_ms), String(r.metrics.fitness), String(r.metrics.precision), String(r.metrics.generalization), String(r.metrics.simplicity)]);
        const csv = [headers.join(','), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))].join('\n');
        const fullPath = path.resolve(process.cwd(), outputFile);
        await fs.writeFile(fullPath, csv, 'utf8');
      }

      const payload: FeedbackExportPayload = { schema: 'chatmangpt.wasm4pm.feedback.export.v1', status: 'success', file: path.resolve(process.cwd(), outputFile), records_exported: allRecords.length, algorithms_included: algorithms };
      const result = makeResult('feedback export', payload, Date.now() - t0, EXIT_CODES.success);
      emitResult(result, { format: 'human', verbose: false, quiet: false }, (res, p) => {
        p.success(`Exported ${allRecords.length} records to ${(res.payload as FeedbackExportPayload).file}`);
      });
      return exitWithFlush(EXIT_CODES.success);
    });
  },
});

// ─── Root feedback command ─────────────────────────────────────────────────────

/**
 * Feedback command — continuous improvement loop for wasm4pm users.
 *
 * Subcommands:
 * - wpm feedback submit --type <type> --message <msg>   Submit user feedback
 * - wpm feedback list                                    List all feedback
 * - wpm feedback summary                                 Summarise feedback
 * - wpm feedback analyze -i <log.xes>                   Auto-generate feedback from log
 * - wpm feedback stats [--algorithm <algo>]              Algorithm feedback stats (legacy)
 * - wpm feedback clear [--algorithm <algo>]              Clear algorithm feedback (legacy)
 * - wpm feedback export [--algorithm <algo>]             Export to CSV (legacy)
 */
export const feedback = defineCommand({
  meta: {
    name: 'feedback',
    description: 'Continuous improvement loop: submit, list, and analyze feedback. Example: wpm feedback submit --type improvement --message "..."',
  },
  subCommands: {
    submit: submitCmd,
    list: listCmd,
    summary: summaryCmd,
    analyze: analyzeCmd,
    stats,
    clear,
    export: exportCmd,
  },
});
