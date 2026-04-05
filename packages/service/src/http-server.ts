/**
 * http-server.ts
 * Express HTTP server with request queuing and WebSocket streaming
 */

import express, { Express, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import {
  RunRequest,
  RunResponse,
  ExplainRequest,
  ExplainResponse,
  StatusResponse,
  RunStatusResponse,
  ServiceConfig,
  InternalRunState,
  WatchEventOutput,
} from './types';
import {
  requestIdMiddleware,
  corsMiddleware,
  loggingMiddleware,
  sendError,
  sendSuccess,
  sendValidationError,
} from './middleware';
import { generateOpenAPISpec } from './openapi';
import { Engine } from '@wasm4pm/engine';

/**
 * Request validation schemas
 */
const RunRequestSchema = z.object({
  config: z.string().min(1, 'config is required'),
  input_file: z.string().optional(),
  profile: z.string().optional(),
});

const ExplainRequestSchema = z.object({
  config: z.string().min(1, 'config is required'),
  mode: z.enum(['brief', 'full']).optional().default('brief'),
});

/**
 * Main HTTP server class
 */
export class HttpServer {
  private app: Express;
  private port: number;
  private host: string;
  private engine: Engine;
  private config: ServiceConfig;
  private runs: Map<string, InternalRunState> = new Map();
  private runQueue: string[] = [];
  private currentRunId?: string;
  private startTime: Date = new Date();
  private stats = {
    completed: 0,
    failed: 0,
  };
  private server?: any;

  constructor(engine: Engine, config: ServiceConfig) {
    this.app = express();
    this.engine = engine;
    this.config = config;
    this.port = config.port;
    this.host = config.host;

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    this.app.use(requestIdMiddleware);
    this.app.use(corsMiddleware);
    this.app.use(loggingMiddleware);
    this.app.use(express.json());
  }

  /**
   * Setup HTTP routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get('/status', (req: Request, res: Response) => this.handleStatus(req, res));

    // Submit run
    this.app.post('/run', (req: Request, res: Response) => this.handleRun(req, res));

    // Get run status
    this.app.get('/run/:run_id', (req: Request, res: Response) =>
      this.handleGetRunStatus(req, res)
    );

    // Cancel run
    this.app.delete('/run/:run_id', (req: Request, res: Response) =>
      this.handleCancelRun(req, res)
    );

    // Watch run (WebSocket upgrade)
    this.app.get('/watch/:run_id', (req: Request, res: Response) =>
      this.handleWatch(req, res)
    );

    // Generate explanation
    this.app.post('/explain', (req: Request, res: Response) => this.handleExplain(req, res));

    // API documentation
    this.app.get('/api/docs', (req: Request, res: Response) => this.handleDocs(req, res));

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      sendError(res, 404, 'NOT_FOUND', 'Endpoint not found', { path: req.path });
    });

    // Error handler
    this.app.use(
      (
        err: Error,
        req: Request & { id?: string },
        res: Response,
        next: express.NextFunction
      ) => {
        console.error('[Error]', err);
        sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error', {
          request_id: req.id,
        });
      }
    );
  }

  /**
   * Handle GET /status
   */
  private handleStatus(req: Request, res: Response): void {
    const uptime = Date.now() - this.startTime.getTime();
    const response: StatusResponse = {
      server: this.engine.isFailed() ? 'degraded' : 'healthy',
      uptime_ms: uptime,
      queued: this.runQueue.length,
      completed: this.stats.completed,
      failed: this.stats.failed,
      timestamp: new Date().toISOString(),
    };

    // Add current run info if available
    if (this.currentRunId) {
      const run = this.runs.get(this.currentRunId);
      if (run && run.status === 'running') {
        const elapsed = (run.started_at ? Date.now() - run.started_at.getTime() : 0);
        response.current_run = {
          run_id: run.run_id,
          status: run.status,
          progress: run.progress,
          elapsed_ms: elapsed,
        };
      }
    }

    sendSuccess(res, 200, response);
  }

  /**
   * Handle POST /run
   */
  private handleRun(req: Request, res: Response): void {
    // Validate request
    const validation = RunRequestSchema.safeParse(req.body);
    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors as Record<string, string[]>;
      sendValidationError(res, errors);
      return;
    }

    const body = validation.data as RunRequest;

    // Check queue size
    if (this.runQueue.length >= this.config.maxQueueSize) {
      sendError(res, 503, 'QUEUE_FULL', 'Server at capacity, queue is full');
      return;
    }

    // Create run state
    const runId = this.generateRunId();
    const runState: InternalRunState = {
      run_id: runId,
      status: 'queued',
      created_at: new Date(),
      config: body.config,
      input_file: body.input_file,
      profile: body.profile,
      progress: 0,
    };

    this.runs.set(runId, runState);
    this.runQueue.push(runId);

    // Determine initial status
    const status: 'queued' | 'running' = this.currentRunId ? 'queued' : 'running';

    // If no current run, start this one
    if (!this.currentRunId) {
      this.executeNextRun();
    }

    const response: RunResponse = {
      run_id: runId,
      status,
      started_at: new Date().toISOString(),
    };

    sendSuccess(res, 202, response);
  }

  /**
   * Handle GET /run/:run_id
   */
  private handleGetRunStatus(req: Request, res: Response): void {
    const { run_id } = req.params;

    const run = this.runs.get(run_id);
    if (!run) {
      sendError(res, 404, 'NOT_FOUND', 'Run not found', { run_id });
      return;
    }

    const response: RunStatusResponse = {
      run_id: run.run_id,
      status: run.status,
      progress: run.progress,
      started_at: run.started_at?.toISOString() || run.created_at.toISOString(),
    };

    if (run.finished_at) {
      response.finished_at = run.finished_at.toISOString();
      if (run.started_at) {
        response.duration_ms = run.finished_at.getTime() - run.started_at.getTime();
      }
    }

    if (run.receipt) {
      response.receipt = run.receipt;
    }

    if (run.error) {
      response.error = {
        code: run.error.code,
        message: run.error.message,
        timestamp: run.error.timestamp.toISOString(),
      };
    }

    sendSuccess(res, 200, response);
  }

  /**
   * Handle DELETE /run/:run_id
   */
  private handleCancelRun(req: Request, res: Response): void {
    const { run_id } = req.params;

    const run = this.runs.get(run_id);
    if (!run) {
      sendError(res, 404, 'NOT_FOUND', 'Run not found', { run_id });
      return;
    }

    // Can only cancel queued runs
    if (run.status === 'running') {
      sendError(
        res,
        409,
        'CANNOT_CANCEL',
        'Cannot cancel running execution',
        { run_id }
      );
      return;
    }

    if (run.status !== 'queued') {
      sendError(res, 409, 'INVALID_STATE', `Cannot cancel ${run.status} execution`, {
        run_id,
      });
      return;
    }

    // Remove from queue
    const index = this.runQueue.indexOf(run_id);
    if (index > -1) {
      this.runQueue.splice(index, 1);
    }

    run.status = 'cancelled';
    run.finished_at = new Date();

    sendSuccess(res, 200, {
      run_id,
      status: 'cancelled',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle GET /watch/:run_id (WebSocket upgrade)
   */
  private handleWatch(req: Request, res: Response): void {
    const { run_id } = req.params;

    const run = this.runs.get(run_id);
    if (!run) {
      sendError(res, 404, 'NOT_FOUND', 'Run not found', { run_id });
      return;
    }

    // Check for WebSocket upgrade capability
    const upgrade = req.headers.upgrade?.toLowerCase();
    if (upgrade !== 'websocket') {
      // For non-WebSocket clients, return streaming response as JSONL
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Transfer-Encoding', 'chunked');

      // Register watcher
      if (!run.watchers) {
        run.watchers = new Set();
      }

      const watcher = (event: WatchEventOutput) => {
        res.write(JSON.stringify(event) + '\n');
      };

      run.watchers.add(watcher);

      // Send initial event
      const initialEvent: WatchEventOutput = {
        event: 'start',
        run_id,
        timestamp: new Date().toISOString(),
        data: {
          progress: run.progress,
          message: `Watching run ${run_id}`,
        },
      };

      res.write(JSON.stringify(initialEvent) + '\n');

      // Clean up on close
      req.on('close', () => {
        if (run.watchers) {
          run.watchers.delete(watcher);
        }
      });
    } else {
      // WebSocket not implemented in base version
      sendError(res, 501, 'NOT_IMPLEMENTED', 'WebSocket streaming not yet implemented');
    }
  }

  /**
   * Handle POST /explain
   */
  private handleExplain(req: Request, res: Response): void {
    const validation = ExplainRequestSchema.safeParse(req.body);
    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors as Record<string, string[]>;
      sendValidationError(res, errors);
      return;
    }

    const body = validation.data as ExplainRequest;

    // Generate simple explanation (in real implementation, would parse config)
    const explanation = this.generateExplanation(body.config, body.mode || 'brief');

    const response: ExplainResponse = {
      explanation,
      mode: body.mode || 'brief',
      config: body.config,
      timestamp: new Date().toISOString(),
    };

    sendSuccess(res, 200, response);
  }

  /**
   * Handle GET /api/docs
   */
  private handleDocs(req: Request, res: Response): void {
    const baseUrl = `http://${this.host}:${this.port}`;
    const spec = generateOpenAPISpec(baseUrl);
    sendSuccess(res, 200, spec);
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, this.host, () => {
          console.log(`[Service] HTTP server listening on ${this.host}:${this.port}`);
          resolve();
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Gracefully shut down the server
   */
  async shutdown(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      // Stop accepting new requests
      this.server.close(() => {
        console.log('[Service] HTTP server closed');
        resolve();
      });

      // Force close after timeout
      const timeout = setTimeout(() => {
        console.warn('[Service] Forcing server shutdown after timeout');
        resolve();
      }, this.config.gracefulShutdownTimeoutMs);

      timeout.unref();
    });
  }

  /**
   * Execute the next queued run
   */
  private executeNextRun(): void {
    if (this.currentRunId || this.runQueue.length === 0) {
      return;
    }

    const runId = this.runQueue.shift();
    if (!runId) return;

    const run = this.runs.get(runId);
    if (!run) return;

    this.currentRunId = runId;
    run.status = 'running';
    run.started_at = new Date();

    // Simulate execution with progress updates
    this.simulateExecution(runId).catch((err) => {
      console.error('[Service] Execution error:', err);
      const run = this.runs.get(runId);
      if (run) {
        run.status = 'failed';
        run.finished_at = new Date();
        run.error = {
          code: 'EXECUTION_ERROR',
          message: err instanceof Error ? err.message : String(err),
          timestamp: new Date(),
        };
        this.stats.failed++;
      }
      this.currentRunId = undefined;
      this.executeNextRun();
    });
  }

  /**
   * Simulate execution (in real implementation, would call engine)
   */
  private async simulateExecution(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;

    try {
      // Simulate progress over time
      for (let i = 0; i <= 100; i += 10) {
        await new Promise((resolve) => setTimeout(resolve, 100));

        run.progress = i;

        // Notify watchers
        if (run.watchers) {
          const event: WatchEventOutput = {
            event: i === 100 ? 'complete' : 'progress',
            run_id: runId,
            timestamp: new Date().toISOString(),
            data: {
              progress: i,
              message: `Processing: ${i}%`,
            },
          };

          run.watchers.forEach((watcher) => watcher(event));
        }
      }

      // Mark as completed
      run.status = 'completed';
      run.finished_at = new Date();
      run.receipt = {
        runId,
        planId: `plan_${uuidv4()}`,
        state: 'ready',
        startedAt: run.started_at || new Date(),
        finishedAt: new Date(),
        durationMs: run.finished_at.getTime() - (run.started_at?.getTime() || 0),
        progress: 100,
        errors: [],
      };

      this.stats.completed++;
    } finally {
      this.currentRunId = undefined;
      this.executeNextRun();
    }
  }

  /**
   * Generate run ID
   */
  private generateRunId(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const random = Math.random().toString(36).substring(2, 6);
    return `run_${timestamp}_${random}`;
  }

  /**
   * Generate explanation for config
   */
  private generateExplanation(config: string, mode: 'brief' | 'full'): string {
    if (mode === 'brief') {
      return `Configuration analysis for provided TOML config (${config.length} bytes). Parsing would analyze algorithm selection, input sources, and output sinks.`;
    }

    return `Detailed Analysis of Process Mining Configuration\n\n` +
      `Configuration Size: ${config.length} bytes\n` +
      `Format: TOML\n\n` +
      `The provided configuration would be parsed to extract:\n` +
      `- Algorithm selection and parameters\n` +
      `- Input event log sources\n` +
      `- Output format and destination\n` +
      `- Processing parameters (filtering, sampling, etc)\n` +
      `- Performance tuning options\n\n` +
      `The engine would then validate all parameters against the registered` +
      ` algorithm schemas before execution.`;
  }
}
