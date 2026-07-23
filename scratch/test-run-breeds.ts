import fs from 'node:fs';
import path from 'node:path';
import { runContract } from '../packages/cognition/src/contract/run.js';

async function main() {
  const untested = ['morphological', 'triz', 'ocpm_route_discoverer'];
  for (const breed of untested) {
    const fixturePath = path.resolve('packages/cognition/src/__tests__/fixtures/papers', `${breed}.json`);
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    
    console.log(`Running breed: ${breed}`);
    try {
      const result = await runContract(breed, fixture.input);
      console.log('Result:', JSON.stringify(result, null, 2));
    } catch (err) {
      console.error(`Error running ${breed}:`, err);
    }
  }
}

main();
