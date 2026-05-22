import { Instrumentation } from './src/instrumentation.ts';

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
console.log('algorithm.profile:', result.otelEvent.attributes?.['algorithm.profile']);
