import fs from 'node:fs';
import path from 'node:path';

/**
 * redaction-scan.ts
 * 
 * Mandated Security script to ensure no artifacts (receipts, logs, certs) 
 * contain credentials or unredacted sensitive data.
 * 
 * Uses patterns from packages/observability/src/secret-redaction.ts.
 */

const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /bearer/i,
  /authorization/i,
  /credential/i,
  /sb-[a-z0-9]{32}/i, // Supabase project refs
  /[a-zA-Z0-9+/]{40,}/,  // Potential base64/long keys
];

function scanFile(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf8');
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(content)) {
      // Exception: allow certain patterns in known safe contexts (like schemas)
      if (content.includes('"@type": "SecretRedactionRecord"')) continue;
      
      throw new Error(`[SECURITY FAILURE] Potential credential detected in ${filePath} (pattern: ${pattern})`);
    }
  }
}

async function main() {
  console.log('--- Executing Redaction Scan (Security Gate) ---');
  
  const rootDir = process.cwd();
  const scanDirs = [
    path.join(rootDir, 'artifacts'),
    path.join(rootDir, '.wasm4pm/results'),
    path.join(rootDir, 'docs'),
  ];
  
  let filesScanned = 0;
  
  for (const dir of scanDirs) {
    if (!fs.existsSync(dir)) continue;
    
    const files = fs.readdirSync(dir, { recursive: true }) as string[];
    for (const file of files) {
       const fullPath = path.join(dir, file);
       if (fs.statSync(fullPath).isDirectory()) continue;
       if (file.endsWith('.json') || file.endsWith('.md') || file.endsWith('.log')) {
         scanFile(fullPath);
         filesScanned++;
       }
    }
  }

  console.log(`[PASS] ${filesScanned} artifacts scanned. No credentials detected.`);
}

main().catch(err => {
  console.error(`\n[SECURITY FAILURE] ${err.message}`);
  process.exit(1);
});
