const fs = require('fs');
const content = fs.readFileSync('packages/kernel/ALGORITHMS.md', 'utf8');
const regex = /-\s+\*\*`([a-z0-9_]+)`\*\*/g;
const algos = [];
let m;
while ((m = regex.exec(content)) !== null) {
  algos.push(m[1]);
}
console.log('Algos found:', algos.length);
