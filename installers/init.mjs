#!/usr/bin/env node
// installers/init.mjs
// Copies Agent Scratchpad template files into a target repo.
// Usage: node installers/init.mjs [target-repo-path]
// No external dependencies required.

import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(__dirname, '..');

const targetRoot = resolve(process.argv[2] ?? '.');

// Files to copy from examples/minimal/.agent/ into <target>/.agent/
const FILES_TO_COPY = [
  { src: 'examples/minimal/.agent/README.md', dest: '.agent/README.md' },
  { src: 'examples/minimal/.agent/SCRATCHPAD.template.md', dest: '.agent/SCRATCHPAD.template.md' },
];

const GITIGNORE_ENTRY = '.agent/SCRATCHPAD.local.md';
const GITIGNORE_COMMENT = '# Agent local scratchpad state';
const GITIGNORE_BLOCK = `${GITIGNORE_COMMENT}\n${GITIGNORE_ENTRY}`;

const changes = [];

function ensureDir(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    changes.push(`  created directory: ${dir}`);
  }
}

function copyWithBackup(srcAbs, destAbs, destRel) {
  if (existsSync(destAbs)) {
    let suffix = '.bak';
    for (let i = 1; existsSync(`${destAbs}${suffix}`); i += 1) {
      suffix = `.bak${i}`;
    }
    copyFileSync(destAbs, `${destAbs}${suffix}`);
    changes.push(`  backed up: ${destRel} → ${destRel}${suffix}`);
  }
  copyFileSync(srcAbs, destAbs);
  changes.push(`  copied: ${destRel}`);
}

// Copy template files
for (const { src, dest } of FILES_TO_COPY) {
  const srcAbs = join(kitRoot, src);
  const destAbs = join(targetRoot, dest);

  if (!existsSync(srcAbs)) {
    console.error(`Source not found: ${srcAbs}`);
    process.exit(1);
  }

  ensureDir(destAbs);
  copyWithBackup(srcAbs, destAbs, dest);
}

// Update .gitignore
const gitignorePath = join(targetRoot, '.gitignore');
if (existsSync(gitignorePath)) {
  const content = readFileSync(gitignorePath, 'utf8');
  const hasEntry = content
    .split(/\r?\n/)
    .some(line => {
      const rule = line.split('#')[0].trim();
      return rule === GITIGNORE_ENTRY || rule === `/${GITIGNORE_ENTRY}`;
    });

  if (!hasEntry) {
    const updated = content.endsWith('\n')
      ? `${content}${GITIGNORE_BLOCK}\n`
      : `${content}\n${GITIGNORE_BLOCK}\n`;
    writeFileSync(gitignorePath, updated, 'utf8');
    changes.push(`  added to .gitignore: ${GITIGNORE_COMMENT}`);
    changes.push(`  added to .gitignore: ${GITIGNORE_ENTRY}`);
  } else {
    changes.push(`  .gitignore already contains: ${GITIGNORE_ENTRY}`);
  }
} else {
  writeFileSync(gitignorePath, `${GITIGNORE_BLOCK}\n`, 'utf8');
  changes.push(`  created .gitignore with: ${GITIGNORE_COMMENT}`);
  changes.push(`  created .gitignore with: ${GITIGNORE_ENTRY}`);
}

// Summary
console.log('\nAgent Scratchpad Kit — init complete\n');
console.log(`Target: ${targetRoot}\n`);
if (changes.length > 0) {
  console.log('Changes:');
  changes.forEach(c => console.log(c));
} else {
  console.log('No changes made.');
}
console.log('\nNext steps:');
console.log('  1. Read .agent/README.md to learn the scratchpad workflow.');
console.log('  2. Copy .agent/SCRATCHPAD.template.md to .agent/SCRATCHPAD.local.md to start a session.');
console.log('  3. Add an adapter from adapters/ to your repo (e.g., AGENTS.md, CLAUDE.md).');
