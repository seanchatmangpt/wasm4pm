const { execSync } = require('child_process');
const fs = require('fs');

const input = JSON.parse(fs.readFileSync('crates/wasm4pm-cognition/tests/fixtures/papers/ebl.json', 'utf8')).input;
const result = execSync('npx tsx scripts/run-breed.ts ebl', { input: JSON.stringify(input) }).toString();
console.log(result);
