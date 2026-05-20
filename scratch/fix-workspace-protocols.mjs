import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const files = execSync('find . -name "package.json" -not -path "*/node_modules/*"').toString().trim().split('\n');

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('workspace:')) {
    console.log(`Updating ${file}`);
    const updated = content.replace(/"workspace:\*"/g, '"*"');
    fs.writeFileSync(file, updated);
  }
}
