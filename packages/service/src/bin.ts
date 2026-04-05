#!/usr/bin/env node

/**
 * bin.ts
 * CLI entry point for running the wasm4pm service
 */

import { HttpServer, ServiceConfig } from './index';
import { createSimpleEngine } from '@wasm4pm/engine';

/**
 * Minimal kernel implementation for standalone service
 */
class StandaloneKernel {
  private ready = false;

  async init(): Promise<void> {
    console.log('[Kernel] Initializing standalone kernel');
    this.ready = true;
  }

  async shutdown(): Promise<void> {
    console.log('[Kernel] Shutting down kernel');
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }
}

/**
 * Parse CLI arguments
 */
function parseArgs(): ServiceConfig {
  const args = process.argv.slice(2);
  const config: ServiceConfig = {
    port: parseInt(process.env.PORT || '3001', 10),
    host: process.env.HOST || 'localhost',
    gracefulShutdownTimeoutMs: 30000,
    maxQueueSize: 10,
    enableCors: true,
    logFormat: 'json',
  };

  // Parse command line flags
  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--port' && i + 1 < args.length) {
      config.port = parseInt(args[++i], 10);
    } else if (arg === '--host' && i + 1 < args.length) {
      config.host = args[++i];
    } else if (arg === '--queue-size' && i + 1 < args.length) {
      config.maxQueueSize = parseInt(args[++i], 10);
    } else if (arg === '--help') {
      printHelp();
      process.exit(0);
    } else if (arg === '--version') {
      console.log('wasm4pm-service 26.4.5');
      process.exit(0);
    }

    i++;
  }

  return config;
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
wasm4pm Service - HTTP API for process mining

Usage:
  wasm4pm-service [options]

Options:
  --port <number>      HTTP server port (default: 3001, env: PORT)
  --host <address>     HTTP server host (default: localhost, env: HOST)
  --queue-size <n>     Max queued runs (default: 10)
  --help               Show this help message
  --version            Show version

Environment Variables:
  PORT                 Server port (default: 3001)
  HOST                 Server host (default: localhost)
  LOG_FORMAT           Log format: json or text (default: json)

Endpoints:
  POST   /run                Submit process mining execution
  GET    /run/:run_id        Get execution status and receipt
  GET    /run/:run_id/watch  Stream execution progress
  DELETE /run/:run_id        Cancel queued execution
  POST   /explain            Generate config explanation
  GET    /status             Server health and stats
  GET    /api/docs           OpenAPI specification
`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    console.log('[Service] Starting wasm4pm service v26.4.5');

    // Parse configuration
    const config = parseArgs();
    console.log('[Service] Configuration:', {
      port: config.port,
      host: config.host,
      maxQueueSize: config.maxQueueSize,
      logFormat: config.logFormat,
    });

    // Create kernel
    const kernel = new StandaloneKernel();
    await kernel.init();

    // Create engine
    const engine = createSimpleEngine(kernel);
    await engine.bootstrap();

    // Create and start server
    const server = new HttpServer(engine, config);
    await server.start();

    // Setup graceful shutdown
    let shutdownInProgress = false;

    const shutdown = async (signal: string) => {
      if (shutdownInProgress) return;
      shutdownInProgress = true;

      console.log(`\n[Service] Received ${signal}, shutting down gracefully...`);

      try {
        await server.shutdown();
        await engine.shutdown();
        await kernel.shutdown();
        console.log('[Service] Shutdown complete');
        process.exit(0);
      } catch (err) {
        console.error('[Service] Error during shutdown:', err);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    console.log(`[Service] Listening on http://${config.host}:${config.port}`);
    console.log('[Service] Endpoints:');
    console.log(`  POST   /run                 Submit execution`);
    console.log(`  GET    /run/:run_id         Get status`);
    console.log(`  GET    /watch/:run_id       Stream progress`);
    console.log(`  DELETE /run/:run_id         Cancel execution`);
    console.log(`  POST   /explain             Generate explanation`);
    console.log(`  GET    /status              Server status`);
    console.log(`  GET    /api/docs            API documentation`);
  } catch (err) {
    console.error('[Service] Fatal error:', err);
    process.exit(1);
  }
}

// Run if executed directly
main();
