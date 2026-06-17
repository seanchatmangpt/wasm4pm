/**
 * crash-detector.ts
 * Detects process crashes using lock files and PID checks
 */

import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import type { ICheckpointStore } from './checkpoint-store.js';
import type { Checkpoint } from './checkpointing.js';

export const ProcessLockSchema = z.object({
  runId: z.string(),
  pid: z.number(),
  startedAt: z.number(),
  hostname: z.string(),
});

export type ProcessLock = z.infer<typeof ProcessLockSchema>;

export const CrashDetectionResultSchema = z.object({
  crashed: z.boolean(),
  reason: z.string().optional(),
  lastLock: ProcessLockSchema.optional(),
  recoveryAvailable: z.boolean(),
});

export type CrashDetectionResult = z.infer<typeof CrashDetectionResultSchema>;

export class CrashDetector {
  private lockDir: string;
  private lockFile: string;
  private staleThresholdMs: number;

  constructor(
    private runId: string,
    lockDir = '.wasm4pm/lock',
    _unused?: number,
    staleThresholdMs = 24 * 60 * 60 * 1000
  ) {
    this.lockDir = lockDir;
    this.lockFile = path.join(this.lockDir, `${runId}.lock`);
    this.staleThresholdMs = staleThresholdMs;

    if (!fs.existsSync(this.lockDir)) {
      fs.mkdirSync(this.lockDir, { recursive: true });
    }
  }

  createLock(): void {
    const lock: ProcessLock = {
      runId: this.runId,
      pid: process.pid,
      startedAt: Date.now(),
      hostname: require('os').hostname(),
    };

    try {
      fs.writeFileSync(this.lockFile, JSON.stringify(lock, null, 2));
    } catch (error) {
      console.error(`Failed to create lock file: ${error}`);
    }
  }

  detectCrash(): CrashDetectionResult {
    if (!fs.existsSync(this.lockFile)) {
      return { crashed: false, recoveryAvailable: false };
    }

    try {
      const lockContent = fs.readFileSync(this.lockFile, 'utf-8');
      const lastLock: ProcessLock = JSON.parse(lockContent);

      if (lastLock.runId !== this.runId) {
        return { crashed: false, recoveryAvailable: false };
      }

      const lockAge = Date.now() - lastLock.startedAt;
      if (lockAge > this.staleThresholdMs) {
        return {
          crashed: true,
          reason: `Lock file stale (${(lockAge / 1000).toFixed(1)}s old)`,
          lastLock,
          recoveryAvailable: true,
        };
      }

      const processAlive = this.isProcessAlive(lastLock.pid);
      if (!processAlive) {
        return {
          crashed: true,
          reason: `Process ${lastLock.pid} is not alive`,
          lastLock,
          recoveryAvailable: true,
        };
      }

      return { crashed: false, recoveryAvailable: false, lastLock };
    } catch (error) {
      return {
        crashed: true,
        reason: `Failed to read lock file: ${error}`,
        recoveryAvailable: true,
      };
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      if (process.platform === 'win32') {
        return false;
      }
      process.kill(pid, 0);
      return true;
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ESRCH') {
        return false;
      }
      return true;
    }
  }

  clearLock(): void {
    try {
      if (fs.existsSync(this.lockFile)) {
        fs.unlinkSync(this.lockFile);
      }
    } catch (error) {
      console.error(`Failed to clear lock file: ${error}`);
    }
  }

  getLastLock(): ProcessLock | null {
    try {
      if (!fs.existsSync(this.lockFile)) {
        return null;
      }
      const content = fs.readFileSync(this.lockFile, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  cleanupStaleLocks(): number {
    if (!fs.existsSync(this.lockDir)) {
      return 0;
    }

    let cleaned = 0;
    const files = fs.readdirSync(this.lockDir).filter((f) => f.endsWith('.lock'));

    for (const file of files) {
      const lockPath = path.join(this.lockDir, file);
      try {
        const content = fs.readFileSync(lockPath, 'utf-8');
        const lock: ProcessLock = JSON.parse(content);
        const age = Date.now() - lock.startedAt;

        if (age > this.staleThresholdMs) {
          fs.unlinkSync(lockPath);
          cleaned++;
        }
      } catch {
        try {
          fs.unlinkSync(lockPath);
          cleaned++;
        } catch {
          // Ignore
        }
      }
    }

    return cleaned;
  }

  registerGracefulShutdown(): void {
    const handler = () => {
      this.clearLock();
      process.exit(0);
    };

    process.on('SIGTERM', handler);
    process.on('SIGINT', handler);
    process.on('SIGHUP', handler);
  }
}

export class AutonomicRecovery {
  private crashDetector: CrashDetector;

  constructor(
    runId: string,
    private checkpointStore: ICheckpointStore,
    lockDir?: string
  ) {
    this.crashDetector = new CrashDetector(runId, lockDir);
  }

  async attemptRecovery(): Promise<Checkpoint | null> {
    const crashResult = this.crashDetector.detectCrash();

    if (!crashResult.crashed) {
      return null;
    }

    if (crashResult.lastLock && crashResult.recoveryAvailable) {
      try {
        const metadata = await this.checkpointStore.list({
          runId: crashResult.lastLock.runId,
        });

        if (metadata.length > 0) {
          const latest = metadata[metadata.length - 1];
          const checkpoint = await this.checkpointStore.load(latest.id);
          return checkpoint;
        }
      } catch (error) {
        console.error(`Failed to load recovery checkpoint: ${error}`);
      }
    }

    return null;
  }

  initialize(): void {
    this.crashDetector.createLock();
    this.crashDetector.registerGracefulShutdown();
    this.crashDetector.cleanupStaleLocks();
  }

  finalize(): void {
    this.crashDetector.clearLock();
  }
}
