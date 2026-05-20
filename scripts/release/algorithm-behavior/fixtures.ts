import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Use the existing Rust test fixtures to ensure determinism and reuse
const FIXTURES_DIR = path.resolve(process.cwd(), 'wasm4pm/tests/fixtures');

function loadFixtureAsBuffer(relativePath: string): Buffer {
  const fullPath = path.join(FIXTURES_DIR, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Fixture not found: ${fullPath}`);
  }
  return fs.readFileSync(fullPath);
}

function computeHash(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export const fixtures = {
  valid: {
    runningExampleXes: loadFixtureAsBuffer('running-example.xes'),
    runningExampleJson: loadFixtureAsBuffer('running-example.json'),
    runningExampleHash: computeHash(loadFixtureAsBuffer('running-example.xes')),
  },
  invalid: {
    emptyLog: Buffer.from('<log></log>', 'utf-8'),
    emptyLogHash: computeHash('<log></log>'),
    malformed: Buffer.from('<log><trace><event><string key="concept:name" value="a" /></event>', 'utf-8'),
    malformedHash: computeHash('<log><trace><event><string key="concept:name" value="a" /></event>'),
    missingActivity: loadFixtureAsBuffer('dirty_data/missing_attribute.xes'),
    missingActivityHash: computeHash(loadFixtureAsBuffer('dirty_data/missing_attribute.xes')),
    missingTimestamp: loadFixtureAsBuffer('dirty_data/missing_timestamps.xes'),
    missingTimestampHash: computeHash(loadFixtureAsBuffer('dirty_data/missing_timestamps.xes')),
  },
  ocel: {
    // Basic fallback for OCEL tests if actual fixture isn't present
    minimalOcel: Buffer.from('{"ocel:global-log": {}, "ocel:events": {}, "ocel:objects": {}}', 'utf-8'),
  },
  prediction: {
    // Basic fallback for prediction
    minimalFeatures: Buffer.from('[]', 'utf-8')
  },
  models: {
    // Basic fallback for models
    minimalPetriNet: Buffer.from('<pnml></pnml>', 'utf-8')
  }
};
