/**
 * wasm4pm Observability Setup Examples
 * Version: 26.4.5
 *
 * Examples for configuring logging, metrics, and observability
 */

import { createObserver, LogLevel, Sink } from '@wasm4pm/observability';
import { createEngine } from '@wasm4pm/engine';
import { loadConfig } from '@wasm4pm/config';

/**
 * Example 1: Basic Console Logging
 */
export async function example1_basicConsoleLogging() {
  console.log('\n=== Example 1: Basic Console Logging ===');

  const observer = createObserver({
    level: 'info',
    sinks: [
      {
        type: 'console',
        format: 'json' // or 'text'
      }
    ]
  });

  // Log events
  observer.debug('initializing', { version: '26.4.5' });
  observer.info('processing', { logFile: 'data.xes', eventCount: 1000 });
  observer.warn('slow_algorithm', { algorithm: 'genetic', estimatedTime: '10s' });
  observer.error('failed_discovery', { algorithm: 'ilp', reason: 'timeout' });

  console.log('✓ Console logging configured');
}

/**
 * Example 2: File-Based Logging
 */
export async function example2_fileLogging() {
  console.log('\n=== Example 2: File-Based Logging ===');

  const observer = createObserver({
    level: 'info',
    sinks: [
      {
        type: 'file',
        path: './wasm4pm.log',
        maxSize: 100, // MB
        maxFiles: 5,
        format: 'json'
      }
    ]
  });

  observer.info('started_discovery', {
    algorithm: 'genetic',
    profile: 'quality'
  });

  observer.info('discovered_model', {
    activities: 5,
    transitions: 8,
    fitness: 0.92
  });

  console.log('✓ File logging configured (logs to ./wasm4pm.log)');
}

/**
 * Example 3: Multiple Sinks (Console + File + HTTP)
 */
export async function example3_multipleSinks() {
  console.log('\n=== Example 3: Multiple Sinks ===');

  const observer = createObserver({
    level: 'info',
    sinks: [
      // Local console for immediate feedback
      {
        type: 'console',
        format: 'json'
      },
      // Local file for persistence
      {
        type: 'file',
        path: './wasm4pm.log',
        maxSize: 100,
        maxFiles: 5
      },
      // Remote HTTP endpoint for centralized logging
      {
        type: 'http',
        endpoint: 'http://logs.example.com:9200/_bulk',
        batchSize: 10,
        flushInterval: 5000
      }
    ]
  });

  observer.info('multi_sink_test', {
    message: 'Logged to console, file, and HTTP simultaneously'
  });

  console.log('✓ Multiple sinks configured');
}

/**
 * Example 4: Context Propagation
 */
export async function example4_contextPropagation() {
  console.log('\n=== Example 4: Context Propagation ===');

  const observer = createObserver({
    level: 'info',
    sinks: [{ type: 'console', format: 'json' }]
  });

  // Create execution context
  const context = {
    requestId: 'req-12345',
    userId: 'user@example.com',
    environment: 'production'
  };

  // Log with context - automatically included in all subsequent logs
  observer.withContext(context, () => {
    observer.info('discovery_started', {
      algorithm: 'genetic'
    });
    // Context (requestId, userId, environment) is automatically added

    observer.info('discovery_complete', {
      fitness: 0.92
    });
    // Context is still included
  });

  console.log('✓ Context propagation working');
}

/**
 * Example 5: Structured Logging with Metadata
 */
export async function example5_structuredLogging() {
  console.log('\n=== Example 5: Structured Logging ===');

  const observer = createObserver({
    level: 'info',
    sinks: [{ type: 'console', format: 'json' }]
  });

  // Structured logs with rich metadata
  const startTime = Date.now();

  observer.info('processing_started', {
    file: 'eventlog.xes',
    size_bytes: 2048576,
    algorithms: ['dfg', 'alpha++', 'genetic'],
    profile: 'quality'
  });

  // Simulate processing
  await new Promise(r => setTimeout(r, 100));

  const duration = Date.now() - startTime;
  observer.info('processing_complete', {
    file: 'eventlog.xes',
    duration_ms: duration,
    algorithms_completed: ['dfg', 'alpha++'],
    status: 'success'
  });

  console.log('✓ Structured logging with metadata');
}

/**
 * Example 6: Metrics and Timing
 */
export async function example6_metricsAndTiming() {
  console.log('\n=== Example 6: Metrics and Timing ===');

  const observer = createObserver({
    level: 'info',
    sinks: [{ type: 'console', format: 'json' }]
  });

  // Track performance metrics
  const startTime = process.hrtime.bigint();

  // Simulate discovery
  await new Promise(r => setTimeout(r, 50));

  const endTime = process.hrtime.bigint();
  const durationMs = Number(endTime - startTime) / 1_000_000;

  observer.info('algorithm_performance', {
    algorithm: 'genetic',
    duration_ms: durationMs,
    event_count: 1000,
    events_per_second: Math.round(1000 / (durationMs / 1000)),
    memory_mb: process.memoryUsage().heapUsed / 1024 / 1024
  });

  console.log('✓ Metrics and timing captured');
}

/**
 * Example 7: Conditional Logging (Log Levels)
 */
export async function example7_logLevels() {
  console.log('\n=== Example 7: Log Levels ===');

  // Only log INFO and above (not DEBUG)
  const observer = createObserver({
    level: 'info', // DEBUG, INFO, WARN, ERROR
    sinks: [{ type: 'console', format: 'json' }]
  });

  observer.debug('this_is_not_logged', { data: '...' });
  // ^ Skipped because level='info'

  observer.info('this_is_logged', { data: 'important' });
  // ^ Logged because INFO >= level

  observer.warn('warning_always_logged', { issue: 'high_memory' });
  // ^ Logged

  observer.error('error_always_logged', { issue: 'failed' });
  // ^ Logged

  console.log('✓ Log levels working correctly');
}

/**
 * Example 8: Integration with Engine
 */
export async function example8_engineIntegration() {
  console.log('\n=== Example 8: Engine Integration ===');

  const observer = createObserver({
    level: 'info',
    sinks: [
      { type: 'console', format: 'json' },
      { type: 'file', path: './engine.log' }
    ]
  });

  // Create engine with observability
  const engine = createEngine({
    profile: 'quality',
    timeout: 300000,
    observer // Pass observer to engine
  });

  engine.on('state-change', (prev, next) => {
    observer.info('engine_state_change', {
      from: prev,
      to: next,
      timestamp: new Date().toISOString()
    });
  });

  engine.on('error', (error) => {
    observer.error('engine_error', {
      message: error.message,
      stack: error.stack
    });
  });

  observer.info('engine_initialized', {
    profile: 'quality',
    observability: 'enabled'
  });

  console.log('✓ Engine integration configured');
}

/**
 * Example 9: Configuration-Driven Observability
 */
export async function example9_configDriven() {
  console.log('\n=== Example 9: Configuration-Driven Observability ===');

  // Load from config file
  const config = await loadConfig();

  const observer = createObserver({
    level: config.observability?.level || 'info',
    sinks: config.observability?.sinks || [
      { type: 'console', format: 'json' }
    ]
  });

  observer.info('loaded_from_config', {
    level: config.observability?.level,
    sinks: config.observability?.sinks?.map(s => s.type)
  });

  console.log('✓ Observability loaded from configuration');
}

/**
 * Example 10: Custom Error Handler
 */
export async function example10_customErrorHandler() {
  console.log('\n=== Example 10: Custom Error Handler ===');

  const observer = createObserver({
    level: 'info',
    sinks: [{ type: 'console', format: 'json' }]
  });

  // Custom error handling
  process.on('unhandledRejection', (reason, promise) => {
    observer.error('unhandled_rejection', {
      reason: String(reason),
      promise: String(promise)
    });
  });

  process.on('uncaughtException', (error) => {
    observer.error('uncaught_exception', {
      message: error.message,
      stack: error.stack
    });
    process.exit(1);
  });

  observer.info('error_handlers_registered', {
    handlers: ['unhandledRejection', 'uncaughtException']
  });

  console.log('✓ Custom error handlers registered');
}

/**
 * Example 11: Performance Monitoring
 */
export async function example11_performanceMonitoring() {
  console.log('\n=== Example 11: Performance Monitoring ===');

  const observer = createObserver({
    level: 'info',
    sinks: [{ type: 'console', format: 'json' }]
  });

  // Monitor function execution
  async function monitoredDiscovery(algorithm: string) {
    const startTime = process.hrtime.bigint();
    const startMemory = process.memoryUsage().heapUsed;

    observer.info('discovery_started', { algorithm });

    try {
      // Simulate discovery
      await new Promise(r => setTimeout(r, 100));

      const endTime = process.hrtime.bigint();
      const endMemory = process.memoryUsage().heapUsed;

      const durationMs = Number(endTime - startTime) / 1_000_000;
      const memoryUsedMb = (endMemory - startMemory) / 1024 / 1024;

      observer.info('discovery_complete', {
        algorithm,
        duration_ms: durationMs,
        memory_mb: memoryUsedMb,
        status: 'success'
      });
    } catch (error) {
      observer.error('discovery_failed', {
        algorithm,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  await monitoredDiscovery('genetic');

  console.log('✓ Performance monitoring demonstrated');
}

/**
 * Example 12: Batch Operations Logging
 */
export async function example12_batchOperations() {
  console.log('\n=== Example 12: Batch Operations ===');

  const observer = createObserver({
    level: 'info',
    sinks: [{ type: 'console', format: 'json' }]
  });

  const logs = ['log1.xes', 'log2.xes', 'log3.xes'];
  const results = [];

  observer.info('batch_started', {
    total_logs: logs.length,
    algorithm: 'alpha++'
  });

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    observer.info('processing_log', {
      log,
      progress: `${i + 1}/${logs.length}`
    });

    // Simulate processing
    await new Promise(r => setTimeout(r, 50));

    results.push({
      log,
      activities: Math.floor(Math.random() * 10) + 1,
      fitness: 0.8 + Math.random() * 0.2
    });

    observer.info('log_complete', {
      log,
      activities: results[i].activities,
      fitness: results[i].fitness.toFixed(2)
    });
  }

  observer.info('batch_complete', {
    total_logs: logs.length,
    successful: results.length,
    summary: results
  });

  console.log('✓ Batch operations logged');
}

/**
 * Main execution
 */
async function main() {
  console.log('wasm4pm Observability Setup Examples');
  console.log('====================================\n');

  try {
    await example1_basicConsoleLogging();
    await example2_fileLogging();
    await example3_multipleSinks();
    await example4_contextPropagation();
    await example5_structuredLogging();
    await example6_metricsAndTiming();
    await example7_logLevels();
    await example8_engineIntegration();
    await example9_configDriven();
    await example10_customErrorHandler();
    await example11_performanceMonitoring();
    await example12_batchOperations();

    console.log('\n====================================');
    console.log('✓ All examples completed successfully');
  } catch (error) {
    console.error('Error running examples:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export default {
  example1_basicConsoleLogging,
  example2_fileLogging,
  example3_multipleSinks,
  example4_contextPropagation,
  example5_structuredLogging,
  example6_metricsAndTiming,
  example7_logLevels,
  example8_engineIntegration,
  example9_configDriven,
  example10_customErrorHandler,
  example11_performanceMonitoring,
  example12_batchOperations
};
