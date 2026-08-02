#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const REVIEW_DATE = '2026-08-02';
const ARCHIVE_ROOT = `docs/archive/${REVIEW_DATE}`;
const STATUS_RE = /(?:^|[-_.])(audit|audits|status|summary|summaries|complete|completion|completed|report|reports|checklist|deliverable|deliverables|migration|implementation|validation|findings|results|retrospective|handoff|mission)(?:[-_.]|$)/i;
const ACTIVE_ROOT = new Set([
  'AGENTS.md',
  'CHATGPT-CLOUD-AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  'README.md',
  'CHANGELOG.md',
  'CODE_OF_CONDUCT.md',
  'COMMERCIAL_LICENSE.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'TESTING.md',
  'WASM_API.md',
]);
const GENERATED_MARKDOWN = new Set([
  'docs/reference/cli_commands.md',
  'docs/reference/algorithms.md',
]);
const ACTIVE_DOC_PREFIXES = [
  'docs/tutorials/',
  'docs/how-to/',
  'docs/reference/',
  'docs/explanation/',
  'docs/adr/',
  'docs/architecture/',
];
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'target',
  'dist',
  'coverage',
  '.next',
  '.turbo',
]);

function unix(filePath) {
  return filePath.split(path.sep).join('/');
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function walk(root, directory = root, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(root, absolute, output);
    else if (entry.isFile() && /\.md$/i.test(entry.name)) {
      output.push(unix(path.relative(root, absolute)));
    }
  }
  return output.sort();
}

function classify(filePath) {
  const base = path.posix.basename(filePath);
  if (
    filePath.startsWith('docs/archive/') ||
    filePath.startsWith('docs_quarantine/')
  ) {
    return { status: 'archived', reason: 'already in an archive surface' };
  }
  if (GENERATED_MARKDOWN.has(filePath)) {
    return {
      status: 'generated',
      reason: 'generated projection; regenerate from owning source',
    };
  }
  if (base === 'AGENTS.md' || base.toLowerCase() === 'readme.md') {
    return { status: 'active', reason: 'path-local authority or entrypoint' };
  }
  if (ACTIVE_ROOT.has(filePath)) {
    return { status: 'active', reason: 'root governance or canonical reference' };
  }
  if (filePath.startsWith('.github/') || filePath.startsWith('.claude/')) {
    return { status: 'active', reason: 'tooling or agent control surface' };
  }
  if (
    ACTIVE_DOC_PREFIXES.some((prefix) => filePath.startsWith(prefix)) &&
    !STATUS_RE.test(filePath)
  ) {
    return { status: 'active', reason: 'canonical Diátaxis or ADR surface' };
  }
  if (
    STATUS_RE.test(filePath) ||
    filePath.startsWith('artifacts/') ||
    filePath.startsWith('reports/') ||
    filePath.startsWith('results/') ||
    filePath.startsWith('test-results/') ||
    filePath.startsWith('receipts/')
  ) {
    return {
      status: 'archive',
      reason: 'historical, generated, status, or evidence narrative',
    };
  }
  return {
    status: 'active',
    reason: 'path-local documentation retained pending domain-specific supersession',
  };
}

function metadata(status, original, reason, digest) {
  const safeReason = reason.replace(/-->/g, '-- >');
  return `<!-- wasm4pm-doc-status: ${status}; reviewed: ${REVIEW_DATE}; original: ${original}; source-sha256: ${digest}; reason: ${safeReason} -->`;
}

function stripMetadata(text) {
  return text.replace(
    /^<!-- wasm4pm-doc-status: .*? -->\r?\n(?:\r?\n)?/,
    '',
  );
}

function statusMetadata(text) {
  const match = text.match(
    /^<!-- wasm4pm-doc-status: ([^;]+); reviewed: ([^;]+); original: ([^;]+); source-sha256: ([^;]+); reason: (.*?) -->/,
  );
  return match
    ? {
        status: match[1],
        reviewed: match[2],
        original: match[3],
        digest: match[4],
        reason: match[5],
      }
    : null;
}

function rewriteActive(text, filePath, reason) {
  const body = stripMetadata(text);
  return `${metadata('active', filePath, reason, sha256(body))}\n\n${body}`;
}

function rewriteArchived(text, filePath, reason) {
  const existing = statusMetadata(text);
  if (existing?.status === 'archived') return text;
  const body = stripMetadata(text);
  return `${metadata('archived', filePath, reason, sha256(body))}\n\n${body}`;
}

function archiveStub(filePath, archivePath, reason, digest) {
  const relativeArchive =
    path.posix.relative(path.posix.dirname(filePath), archivePath) ||
    path.posix.basename(archivePath);
  const relativeIndex =
    path.posix.relative(path.posix.dirname(filePath), 'docs/README.md') ||
    'docs/README.md';
  return `${metadata('archive-pointer', filePath, reason, digest)}

# Archived documentation

This document is retained as historical evidence and is not current product truth.

- Archived copy: [\`${archivePath}\`](${relativeArchive})
- Original path: \`${filePath}\`
- Archived: ${REVIEW_DATE}
- Reason: ${reason}
- Source SHA-256: \`${digest}\`

Current documentation starts at [\`docs/README.md\`](${relativeIndex}).
`;
}

function writeAtomic(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, filePath);
}

function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const check = args.has('--check');
  const rootArg = process.argv.find((argument) => argument.startsWith('--root='));
  const root = path.resolve(
    rootArg ? rootArg.slice('--root='.length) : process.cwd(),
  );
  const paths = walk(root);
  const manifest = [];
  let changed = 0;

  for (const filePath of paths) {
    if (filePath === 'docs/DOCUMENTATION_MANIFEST.md') continue;
    const absolute = path.join(root, filePath);
    const current = fs.readFileSync(absolute, 'utf8');
    const existing = statusMetadata(current);
    const classification =
      existing?.status === 'archive-pointer'
        ? { status: 'archive-pointer', reason: existing.reason }
        : classify(filePath);
    let target = filePath;
    let next = current;

    if (classification.status === 'generated') {
      next = current;
    } else if (classification.status === 'archive-pointer') {
      target = `${ARCHIVE_ROOT}/${filePath}`;
    } else if (classification.status === 'archive') {
      target = `${ARCHIVE_ROOT}/${filePath}`;
      const archiveAbsolute = path.join(root, target);
      const digest = sha256(stripMetadata(current));
      if (apply && !fs.existsSync(archiveAbsolute)) {
        writeAtomic(
          archiveAbsolute,
          rewriteArchived(current, filePath, classification.reason),
        );
      }
      next = archiveStub(filePath, target, classification.reason, digest);
    } else if (classification.status === 'archived') {
      next = rewriteArchived(current, filePath, classification.reason);
    } else {
      next = rewriteActive(current, filePath, classification.reason);
    }

    const differs = next !== current;
    if (differs) changed += 1;
    if (apply && differs) writeAtomic(absolute, next);
    manifest.push({
      path: filePath,
      status:
        classification.status === 'archive'
          ? 'archive-pointer'
          : classification.status,
      target,
      reason: classification.reason,
      changed: differs,
    });
  }

  const counts = manifest.reduce((result, item) => {
    result[item.status] = (result[item.status] ?? 0) + 1;
    return result;
  }, {});
  const lines = [
    metadata(
      'active',
      'docs/DOCUMENTATION_MANIFEST.md',
      'generated documentation inventory',
      sha256(JSON.stringify(manifest)),
    ),
    '',
    '# Documentation manifest',
    '',
    `Generated by \`scripts/docs/migrate-markdown.mjs\` for review date ${REVIEW_DATE}.`,
    '',
    `- Markdown files inspected: ${manifest.length}`,
    `- Files requiring rewrite in this run: ${changed}`,
    ...Object.entries(counts)
      .sort()
      .map(([status, count]) => `- ${status}: ${count}`),
    '',
    '| Path | Status | Target | Reason |',
    '|---|---|---|---|',
    ...manifest.map(
      (item) =>
        `| \`${item.path}\` | ${item.status} | \`${item.target}\` | ${item.reason.replace(/\|/g, '\\|')} |`,
    ),
    '',
  ];
  const manifestPath = path.join(root, 'docs/DOCUMENTATION_MANIFEST.md');
  if (apply) writeAtomic(manifestPath, `${lines.join('\n')}\n`);

  const result = {
    status: apply ? 'APPLIED' : 'PLANNED',
    inspected: manifest.length,
    changed,
    counts,
  };
  if (check && changed > 0) {
    console.error(JSON.stringify({ ...result, status: 'BLOCKED' }, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

main();
