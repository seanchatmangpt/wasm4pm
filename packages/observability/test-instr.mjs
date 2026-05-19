import { Instrumentation } from './dist/instrumentation.js';

const requiredAttrs = {
  'run.id': 'test-run-123',
  'config.hash': 'abc123',
  'input.hash': 'def456',
  'plan.hash': 'ghi789',
  'execution.profile': 'test',
  'source.kind': 'test',
  'sink.kind': 'test',
};
const traceId = Instrumentation.generateTraceId();
const result = Instrumentation.createAlgorithmStartedEvent(traceId, 'dijkstra', requiredAttrs);
console.log('Keys in otelEvent:', Object.keys(result.otelEvent));
console.log('otelEvent.attributes exists?', !!result.otelEvent.attributes);
console.log('algorithm.profile value:', result.otelEvent.attributes?.['algorithm.profile']);
