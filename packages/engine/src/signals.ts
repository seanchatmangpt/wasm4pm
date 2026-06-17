/**
 * signals.ts
 * Signal handlers for graceful shutdown with checkpoint persistence
 * Integrates crash detection with engine lifecycle
 */

import { z } from 'zod';
import { Engine } from './engine.js';
import { CrashDetector, AutonomicRecovery } from './crash-detector.js';
import { CheckpointManager } from './checkpointing.js';
import { ICheckpointStore } from './checkpoint-store.js';

export const SignalHandlerConfigSchema = z.object({
  runId: z.string(),
  checkpointStore: z.unknown().optional() as z.ZodOptional<z.ZodType<ICheckpointStore>>,
  lockDir: z.string().optional(),
  enabled: z.boolean().optional(),
});

export type SignalHandlerConfig = z.infer<typeof SignalHandlerConfigSchema>;

/**
 * Manages signal handlers and graceful shutdown for an engine
 */
export class SignalHandler {
  private engine: Engine;
  private crashDetector: CrashDetector;
  private autonomicRecovery: AutonomicRecovery;
  private checkpointManager: CheckpointManager;
  private handlers: (() => void)[] = [];
  private isShuttingDown = false;

  constructor(
    engine: Engine,
    checkpointStore: ICheckpointStore,
    config: SignalHandlerConfig
  ) {
    this.engine = engine;
    this.crashDetector = new CrashDetector(config.runId, config.lockDir);
    this.autonomicRecovery = new AutonomicRecovery(
      config.runId,
      checkpointStore,
      config.lockDir
    );
    this.checkpointManager = new CheckpointManager(config.runId);

    if (config.enabled !== false) {
      this.registerHandlers();
    }
  }

  /**
   * Register signal handlers for graceful shutdown
   */
  private registerHandlers(): void {
    const handleShutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        return;
      }

      this.isShuttingDown = true;
      console.log(`\n${signal} received. Saving checkpoint and shutting down gracefully...`);

      try {
        // Save final checkpoint
        const currentState = this.engine.state();
        const checkpoint = this.checkpointManager.create(currentState, 1.0, {
          signal,
          shutdownTime: new Date().toISOString(),
        });

        console.log(`Saved checkpoint: ${checkpoint.id} (state: ${currentState}, signal: ${signal})`);

        // Clear lock file
        this.crashDetector.clearLock();
        console.log('Checkpoint saved, lock file cleared. Exiting with code 0.');
        process.exit(0);
      } catch (error) {
        console.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    const sigTermHandler = () => handleShutdown('SIGTERM');
    const sigIntHandler = () => handleShutdown('SIGINT');
    const sigHupHandler = () => handleShutdown('SIGHUP');

    process.on('SIGTERM', sigTermHandler);
    process.on('SIGINT', sigIntHandler);
    process.on('SIGHUP', sigHupHandler);

    this.handlers = [sigTermHandler, sigIntHandler, sigHupHandler];
  }

  /**
   * Deregister signal handlers (cleanup)
   */
  deregister(): void {
    if (this.handlers.length > 0) {
      process.removeListener('SIGTERM', this.handlers[0]);
      process.removeListener('SIGINT', this.handlers[1]);
      process.removeListener('SIGHUP', this.handlers[2]);
      this.handlers = [];
    }
  }

  /**
   * Initialize crash detection: check for previous crash and create new lock
   */
  async initializeCrashDetection(): Promise<boolean> {
    const crashResult = this.crashDetector.detectCrash();

    if (crashResult.crashed) {
      console.log(
        `Previous crash detected: ${crashResult.reason}. ` +
          `Checkpoint recovery available: ${crashResult.recoveryAvailable}`
      );

      return true;
    }

    // Create new lock file
    this.crashDetector.createLock();

    // Clean up stale locks
    const cleaned = this.crashDetector.cleanupStaleLocks();
    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} stale lock file(s).`);
    }

    return false;
  }

  /**
   * Load recovery checkpoint if available after detected crash
   */
  async loadRecoveryCheckpoint(): Promise<any | null> {
    try {
      const checkpoint = await this.autonomicRecovery.attemptRecovery();

      if (checkpoint) {
        console.log(
          `Recovered from checkpoint: ${checkpoint.id} ` +
            `(state: ${checkpoint.state}, progress: ${checkpoint.progress})`
        );

        return checkpoint;
      }
    } catch (error) {
      console.error('Failed to load recovery checkpoint:', error);
    }

    return null;
  }

  /**
   * Get the crash detector instance
   */
  getCrashDetector(): CrashDetector {
    return this.crashDetector;
  }

  /**
   * Get the checkpoint manager instance
   */
  getCheckpointManager(): CheckpointManager {
    return this.checkpointManager;
  }

}
