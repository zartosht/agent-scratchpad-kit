#!/usr/bin/env node

import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join, relative, resolve } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const checkOnly = process.argv.includes('--check');
const version = readText('VERSION').trim();

const pluginRoots = ['codex-plugin', 'claude-plugin'];
const generatedPaths = [
  'skills/agent-scratchpad/SKILL.md',
  'skills/agent-scratchpad/references',
  'adapters',
  'installers',
  'examples',
  'VERSION',
];

const results = [];
const failures = [];

syncVersionedJson('package.json');
syncSkillMetadata('skills/agent-scratchpad/SKILL.md');
syncCodexPluginManifest();
syncClaudePluginManifest();
syncClaudeMarketplace();
syncCodexMarketplace();
syncVersionFiles();
syncScaffoldFiles();
validateManifests();
syncMultiAgentExample();

for (const pluginRoot of pluginRoots) {
  for (const generatedPath of generatedPaths) {
    syncPath(generatedPath, join(pluginRoot, generatedPath));
  }
}

printSummary();

if (failures.length > 0) {
  process.exitCode = 1;
}

function syncPath(srcRel, destRel) {
  const srcAbs = join(repoRoot, srcRel);
  const destAbs = join(repoRoot, destRel);
  const stat = statSync(srcAbs);

  if (stat.isDirectory()) {
    syncDirectory(srcRel, destRel);
    return;
  }

  syncFile(srcRel, destRel);
}

function syncDirectory(srcRel, destRel) {
  const srcFiles = listFiles(srcRel);
  const destFiles = existsSync(join(repoRoot, destRel)) ? listFiles(destRel) : [];
  const srcSet = new Set(srcFiles);

  for (const file of srcFiles) {
    syncFile(join(srcRel, file), join(destRel, file));
  }

  for (const file of destFiles) {
    if (srcSet.has(file)) {
      continue;
    }
    const extraRel = join(destRel, file);
    if (checkOnly) {
      fail(extraRel, 'extra generated file');
    } else {
      rmSync(join(repoRoot, extraRel), { force: true });
      record('removed', extraRel);
    }
  }
}

function syncFile(srcRel, destRel) {
  const srcText = readText(srcRel);
  writeIfChanged(destRel, srcText);
}

function syncVersionedJson(relPath) {
  const json = JSON.parse(readText(relPath));
  if (json.version !== version) {
    json.version = version;
  }
  writeJson(relPath, json);
}

function syncSkillMetadata(relPath) {
  const current = readText(relPath);
  const metadataVersionRe = /(metadata:\r?\n  version: )"([^"]+)"/;
  const next = current.replace(metadataVersionRe, (_, prefix) => `${prefix}"${version}"`);
  if (next === current && !metadataVersionRe.test(current)) {
    fail(relPath, 'could not find metadata.version');
    return;
  }
  writeIfChanged(relPath, next);
}

function syncCodexPluginManifest() {
  writeJson('codex-plugin/.codex-plugin/plugin.json', {
    name: 'agent-scratchpad',
    version,
    description: 'Durable scratchpad workflow for long-running coding-agent tasks.',
    author: {
      name: 'Zartosht',
    },
    homepage: 'https://github.com/zartosht/agent-scratchpad-kit',
    repository: 'https://github.com/zartosht/agent-scratchpad-kit',
    license: 'MIT',
    keywords: [
      'scratchpad',
      'agent-skills',
      'codex',
      'coding-agents',
      'handoff',
      'context-management',
    ],
    skills: './skills/',
    interface: {
      displayName: 'Agent Scratchpad',
      shortDescription: 'Durable working memory for coding agents.',
      longDescription: 'Maintains a repo-local scratchpad for long-running coding tasks, debugging sessions, refactors, migrations, context compaction, and handoffs.',
      developerName: 'Zartosht',
      category: 'Productivity',
      capabilities: [
        'Read',
        'Write',
      ],
      websiteURL: 'https://github.com/zartosht/agent-scratchpad-kit',
      defaultPrompt: [
        'Install the Agent Scratchpad workflow in this repository.',
        'Use Agent Scratchpad while working on this refactor.',
        'Read the scratchpad, continue the task, and update handoff notes.',
      ],
    },
  });
}

function syncClaudePluginManifest() {
  writeJson('claude-plugin/.claude-plugin/plugin.json', {
    name: 'agent-scratchpad',
    displayName: 'Agent Scratchpad',
    version,
    description: 'Durable scratchpad workflow for long-running coding-agent tasks.',
    author: {
      name: 'Zartosht',
      url: 'https://github.com/zartosht',
    },
    homepage: 'https://github.com/zartosht/agent-scratchpad-kit',
    repository: 'https://github.com/zartosht/agent-scratchpad-kit',
    license: 'MIT',
    keywords: [
      'scratchpad',
      'agent-skills',
      'claude-code',
      'coding-agents',
      'handoff',
      'context-management',
    ],
    skills: './skills/',
  });
}

function syncClaudeMarketplace() {
  const relPath = '.claude-plugin/marketplace.json';
  const json = JSON.parse(readText(relPath));
  let found = false;
  for (const plugin of json.plugins ?? []) {
    if (plugin.name === 'agent-scratchpad') {
      found = true;
      plugin.version = version;
    }
  }
  if (!found) {
    fail(relPath, 'missing agent-scratchpad plugin entry');
  }
  writeJson(relPath, json);
}

function syncCodexMarketplace() {
  const relPath = '.agents/plugins/marketplace.json';
  const json = JSON.parse(readText(relPath));
  let found = false;
  for (const plugin of json.plugins ?? []) {
    if (plugin.name === 'agent-scratchpad' && plugin.source?.ref) {
      found = true;
      plugin.source.ref = `v${version}`;
    }
  }
  if (!found) {
    fail(relPath, 'missing agent-scratchpad plugin entry with source.ref');
  }
  writeJson(relPath, json);
}

function syncVersionFiles() {
  for (const relPath of [
    '.agent/VERSION',
    'examples/minimal/.agent/VERSION',
  ]) {
    writeIfChanged(relPath, `${version}\n`);
  }
}

function syncScaffoldFiles() {
  syncFile('examples/minimal/.agent/README.md', '.agent/README.md');
  syncFile('skills/agent-scratchpad/references/SCRATCHPAD.template.md', '.agent/SCRATCHPAD.template.md');
  syncFile('skills/agent-scratchpad/references/SCRATCHPAD.template.md', 'examples/minimal/.agent/SCRATCHPAD.template.md');
}

function syncMultiAgentExample() {
  const exampleDir = 'examples/multi-agent';

  if (checkOnly) {
    compareGeneratedMultiAgentExample(exampleDir);
    return;
  }

  rmSync(join(repoRoot, exampleDir), { recursive: true, force: true });
  const result = spawnSync(process.execPath, ['installers/init.mjs', exampleDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    fail(exampleDir, `failed to regenerate: ${result.stderr || result.stdout}`);
    return;
  }

  record('regenerated', exampleDir);
}

function compareGeneratedMultiAgentExample(exampleDir) {
  if (!existsSync(join(repoRoot, exampleDir))) {
    fail(exampleDir, 'missing generated multi-agent example');
    return;
  }

  const tmpRoot = mkdtempSync(join(tmpdir(), 'agent-scratchpad-kit-sync-'));
  const generatedRel = 'generated';
  const generatedAbs = join(tmpRoot, generatedRel);

  try {
    const result = spawnSync(process.execPath, [join(repoRoot, 'installers/init.mjs'), generatedAbs], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    if (result.status !== 0) {
      fail(exampleDir, `failed to regenerate for check: ${result.stderr || result.stdout}`);
      return;
    }

    compareDirectories(exampleDir, generatedAbs);
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
}

function compareDirectories(actualRel, expectedAbs) {
  const actualFiles = listFiles(actualRel);
  const expectedFiles = listFilesAbs(expectedAbs);
  const actualSet = new Set(actualFiles);
  const expectedSet = new Set(expectedFiles);
  let drift = false;

  for (const file of expectedFiles) {
    if (!actualSet.has(file)) {
      fail(join(actualRel, file), 'missing generated file');
      drift = true;
      continue;
    }
    const actual = readText(join(actualRel, file));
    const expected = readFileSync(join(expectedAbs, file), 'utf8');
    if (normalizeLineEndings(actual) !== normalizeLineEndings(expected)) {
      fail(join(actualRel, file), 'content drift');
      drift = true;
    }
  }

  for (const file of actualFiles) {
    if (!expectedSet.has(file)) {
      fail(join(actualRel, file), 'extra generated file');
      drift = true;
    }
  }

  if (!drift) {
    record('unchanged', actualRel);
  }
}

function validateManifests() {
  validatePackageJson();
  validateCodexPluginManifest();
  validateClaudePluginManifest();
  validateMarketplaceFiles();
}

function validatePackageJson() {
  const json = JSON.parse(readText('package.json'));
  if (json.type !== 'module') {
    fail('package.json', 'type must be module');
  }
  if (json.engines?.node !== '>=20') {
    fail('package.json', 'engines.node must be >=20');
  }
  for (const script of ['sync', 'check:sync', 'test', 'check']) {
    if (!json.scripts?.[script]) {
      fail('package.json', `missing ${script} script`);
    }
  }
}

function validateCodexPluginManifest() {
  const relPath = 'codex-plugin/.codex-plugin/plugin.json';
  const json = JSON.parse(readText(relPath));
  if (json.name !== 'agent-scratchpad') {
    fail(relPath, 'name must be agent-scratchpad');
  }
  validateSkillsPath(relPath, 'codex-plugin', json.skills);
}

function validateClaudePluginManifest() {
  const relPath = 'claude-plugin/.claude-plugin/plugin.json';
  const json = JSON.parse(readText(relPath));
  if (json.name !== 'agent-scratchpad') {
    fail(relPath, 'name must be agent-scratchpad');
  }
  validateSkillsPath(relPath, 'claude-plugin', json.skills);
}

function validateSkillsPath(manifestRelPath, pluginRoot, skillsPath) {
  if (typeof skillsPath !== 'string' || skillsPath.length === 0) {
    fail(manifestRelPath, 'skills must be a non-empty relative path');
    return;
  }
  if (skillsPath.startsWith('/') || skillsPath.includes('..')) {
    fail(manifestRelPath, 'skills path must not be absolute or escape the plugin root');
    return;
  }

  const normalized = skillsPath.replace(/^\.\/?/, '');
  const skillPath = join(pluginRoot, normalized, 'agent-scratchpad/SKILL.md');
  if (!existsSync(join(repoRoot, skillPath))) {
    fail(manifestRelPath, `skills path missing ${skillPath}`);
  }
}

function validateMarketplaceFiles() {
  const codex = findPlugin('.agents/plugins/marketplace.json');
  if (codex) {
    if (codex.source?.path !== './codex-plugin') {
      fail('.agents/plugins/marketplace.json', 'agent-scratchpad source.path must be ./codex-plugin');
    }
    if (codex.source?.ref !== `v${version}`) {
      fail('.agents/plugins/marketplace.json', `agent-scratchpad source.ref must be v${version}`);
    }
  }

  const claude = findPlugin('.claude-plugin/marketplace.json');
  if (claude) {
    if (claude.source !== './claude-plugin') {
      fail('.claude-plugin/marketplace.json', 'agent-scratchpad source must be ./claude-plugin');
    }
    if (claude.version !== version) {
      fail('.claude-plugin/marketplace.json', `agent-scratchpad version must be ${version}`);
    }
  }
}

function findPlugin(relPath) {
  const json = JSON.parse(readText(relPath));
  const plugin = (json.plugins ?? []).find(entry => entry.name === 'agent-scratchpad');
  if (!plugin) {
    fail(relPath, 'missing agent-scratchpad plugin entry');
    return null;
  }
  return plugin;
}

function writeJson(relPath, value) {
  writeIfChanged(relPath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeIfChanged(relPath, next) {
  const abs = join(repoRoot, relPath);
  const current = existsSync(abs) ? readFileSync(abs, 'utf8') : null;

  if (current === next || (checkOnly && lineEndingsMatchForCheck(relPath, current, next))) {
    record('unchanged', relPath);
    return;
  }

  if (checkOnly) {
    fail(relPath, current === null ? 'missing generated file' : 'content drift');
    return;
  }

  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, next, 'utf8');
  record(current === null ? 'created' : 'updated', relPath);
}

function listFiles(relDir) {
  const absDir = join(repoRoot, relDir);
  const output = [];

  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const entryRel = join(relDir, entry.name);
    const fromRoot = relative(relDir, entryRel);
    if (entry.isDirectory()) {
      for (const nested of listFiles(entryRel)) {
        output.push(join(entry.name, nested));
      }
    } else if (entry.isFile()) {
      output.push(fromRoot);
    }
  }

  return output.sort();
}

function listFilesAbs(absDir, prefix = '') {
  const output = [];

  for (const entry of readdirSync(join(absDir, prefix), { withFileTypes: true })) {
    const rel = prefix ? join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) {
      output.push(...listFilesAbs(absDir, rel));
    } else if (entry.isFile()) {
      output.push(rel);
    }
  }

  return output.sort();
}

function readText(relPath) {
  return readFileSync(join(repoRoot, relPath), 'utf8');
}

function normalizeLineEndings(value) {
  return value.replace(/\r\n/g, '\n');
}

function lineEndingsMatchForCheck(relPath, current, next) {
  return current !== null
    && isLineEndingTolerantGeneratedPath(relPath)
    && normalizeLineEndings(current) === normalizeLineEndings(next);
}

function isLineEndingTolerantGeneratedPath(relPath) {
  const lower = relPath.toLowerCase();
  return lower.endsWith('.md')
    || lower.endsWith('.mdc')
    || lower.endsWith('.yml')
    || lower.endsWith('.yaml')
    || lower.endsWith('.json')
    || relPath === 'VERSION'
    || relPath.endsWith('/VERSION');
}

function record(status, path) {
  results.push({ status, path });
}

function fail(path, reason) {
  failures.push({ path, reason });
  record('failed', path);
}

function printSummary() {
  const mode = checkOnly ? 'check' : 'write';
  console.log(`Agent Scratchpad Kit package sync (${mode})`);
  for (const result of results) {
    console.log(`  ${result.status}: ${result.path}`);
  }
  if (failures.length > 0) {
    console.log('\nDrift detected:');
    for (const failure of failures) {
      console.log(`  ${failure.path}: ${failure.reason}`);
    }
  }
}
