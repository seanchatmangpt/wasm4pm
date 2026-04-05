/**
 * types.ts
 * Type definitions for the service layer
 */

import { EngineStatus, ExecutionReceipt, StatusUpdate } from '@wasm4pm/types';

/**
 * Request body for POST /run
 */
export interface RunRequest {
  config: string;
  input_file?: string;
  profile?: string;
}

/**
 * Response for POST /run
 */
export interface RunResponse {
  run_id: string;
  status: 'queued' | 'running';
  started_at: string;
}

/**
 * Request body for POST /explain
 */
export interface ExplainRequest {
  config: string;
  mode?: 'brief' | 'full';
}

/**
 * Response for POST /explain
 */
export interface ExplainResponse {
  explanation: string;
  mode: 'brief' | 'full';
  config: string;
  timestamp: string;
}

/**
 * Response for GET /status
 */
export interface StatusResponse {
  server: 'healthy' | 'degraded';
  uptime_ms: number;
  current_run?: {
    run_id: string;
    status: string;
    progress: number;
    elapsed_ms: number;
  };
  queued: number;
  completed: number;
  failed: number;
  timestamp: string;
}

/**
 * Response for GET /run/:run_id
 */
export interface RunStatusResponse {
  run_id: string;
  status: string;
  progress: number;
  started_at: string;
  finished_at?: string;
  duration_ms?: number;
  receipt?: ExecutionReceipt;
  error?: {
    code: string;
    message: string;
    timestamp: string;
  };
}

/**
 * Internal run state for tracking
 */
export interface InternalRunState {
  run_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  created_at: Date;
  started_at?: Date;
  finished_at?: Date;
  config: string;
  input_file?: string;
  profile?: string;
  progress: number;
  receipt?: ExecutionReceipt;
  error?: {
    code: string;
    message: string;
    timestamp: Date;
  };
  watchers?: Set<(update: WatchEventOutput) => void>;
}

/**
 * Watch event output for WebSocket streaming
 */
export interface WatchEventOutput {
  event: 'start' | 'progress' | 'complete' | 'error';
  run_id: string;
  timestamp: string;
  data: {
    progress?: number;
    message?: string;
    receipt?: ExecutionReceipt;
    error?: {
      code: string;
      message: string;
    };
  };
}

/**
 * Server configuration
 */
export interface ServiceConfig {
  port: number;
  host: string;
  gracefulShutdownTimeoutMs: number;
  maxQueueSize: number;
  enableCors: boolean;
  logFormat: 'json' | 'text';
}

/**
 * Request log entry
 */
export interface RequestLog {
  timestamp: string;
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  request_id: string;
  error?: string;
}
