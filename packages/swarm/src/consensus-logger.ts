/**
 * consensus-logger.ts — Consensus Decision Logging
 *
 * Records all consensus decisions and performance updates to a JSONL log
 * for post-run analysis and debugging.
 *
 * File format: `.wasm4pm/swarm/consensus-log.jsonl`
 * Each line is a JSON object with timestamp, decision, and performance metrics.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getTracer } from '@wasm4pm/observability';
import type { ConsensusDecision, AlgorithmPerformance } from './algorithm-consensus.js';

export interface ConsensusLogEntry {
  timestamp: string;
  type: 'decision' | 'update';
  cycle?: number;
  decision?: ConsensusDecision;
  algorithmMetrics?: Record<string, AlgorithmPerformance>;
}

/**
 * Logger for consensus decisions.
 * Writes JSONL to `.wasm4pm/swarm/consensus-log.jsonl` (creates directory if needed).
 */
export class ConsensusLogger {
  private logPath: string;
  private buffer: ConsensusLogEntry[] = [];
  private flushInterval = 5000; // Flush every 5 seconds
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(baseDir: string = '.wasm4pm') {
    this.logPath = path.join(baseDir, 'swarm', 'consensus-log.jsonl');
  }

  /**
   * Initialize the logger (create directory if needed, start flush timer).
   */
  async init(): Promise<void> {
    const tracer = getTracer();
    const span = tracer.startSpan('consensus.logger.init', {
      attributes: { 'logger.path': this.logPath },
    });

    try {
      const logDir = path.dirname(this.logPath);
      try {
        await fs.mkdir(logDir, { recursive: true });
      } catch {
        // Directory may already exist
      }

      // Start periodic flush
      this.flushTimer = setInterval(() => {
        this.flush().catch((err) => {
          console.error('Failed to flush consensus log:', err);
        });
      }, this.flushInterval);
    } finally {
      span.end();
    }
  }

  /**
   * Log a consensus decision.
   */
  async logDecision(decision: ConsensusDecision, cycle?: number): Promise<void> {
    const entry: ConsensusLogEntry = {
      timestamp: new Date().toISOString(),
      type: 'decision',
      cycle,
      decision,
    };

    this.buffer.push(entry);

    // Flush if buffer is large
    if (this.buffer.length >= 10) {
      await this.flush();
    }
  }

  /**
   * Log algorithm performance metrics snapshot.
   */
  async logPerformanceUpdate(
    metrics: Record<string, AlgorithmPerformance>,
    cycle?: number
  ): Promise<void> {
    const entry: ConsensusLogEntry = {
      timestamp: new Date().toISOString(),
      type: 'update',
      cycle,
      algorithmMetrics: metrics,
    };

    this.buffer.push(entry);

    // Flush if buffer is large
    if (this.buffer.length >= 10) {
      await this.flush();
    }
  }

  /**
   * Flush buffered entries to disk.
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return; // Nothing to write
    }

    const tracer = getTracer();
    const span = tracer.startSpan('consensus.logger.flush', {
      attributes: { 'logger.entries_count': this.buffer.length },
    });

    try {
      const lines = this.buffer.map((entry) => JSON.stringify(entry));
      const content = lines.join('\n') + '\n';

      await fs.appendFile(this.logPath, content, 'utf-8');
      this.buffer = [];
    } catch (err) {
      span.setStatus('ERROR', String(err));
      throw err;
    } finally {
      span.end();
    }
  }

  /**
   * Cleanup: flush remaining entries and stop timer.
   */
  async cleanup(): Promise<void> {
    const tracer = getTracer();
    const span = tracer.startSpan('consensus.logger.cleanup', {
      attributes: { 'logger.buffered_entries': this.buffer.length },
    });

    try {
      if (this.flushTimer) {
        clearInterval(this.flushTimer);
        this.flushTimer = null;
      }

      await this.flush();
    } finally {
      span.end();
    }
  }

  /**
   * Read the log file and parse all entries.
   * Useful for post-run analysis.
   */
  async readLog(): Promise<ConsensusLogEntry[]> {
    try {
      const content = await fs.readFile(this.logPath, 'utf-8');
      return content
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as ConsensusLogEntry);
    } catch {
      return []; // File doesn't exist or is empty
    }
  }

  /**
   * Get the path to the consensus log file.
   */
  getLogPath(): string {
    return this.logPath;
  }
}

/**
 * Global consensus logger instance.
 */
let globalLogger: ConsensusLogger | null = null;

/**
 * Get or create the global consensus logger.
 */
export function getConsensusLogger(baseDir?: string): ConsensusLogger {
  if (!globalLogger) {
    globalLogger = new ConsensusLogger(baseDir);
  }
  return globalLogger;
}

/**
 * Reset the global logger (useful for testing).
 */
export function resetConsensusLogger(): void {
  globalLogger = null;
}
