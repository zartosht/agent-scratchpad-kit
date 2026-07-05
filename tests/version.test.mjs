import assert from 'assert/strict';
import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = read('VERSION').trim();
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

assert.match(version, SEMVER_RE);
assert.match('0.2.0-dev.1', SEMVER_RE);
assert.match('0.2.0+build.1', SEMVER_RE);
assert.match('0.2.0-dev.1+build.1', SEMVER_RE);
assert.equal(json('package.json').version, version);
assert.equal(json('codex-plugin/.codex-plugin/plugin.json').version, version);
assert.equal(json('claude-plugin/.claude-plugin/plugin.json').version, version);

const claudeMarketplace = findPluginByName(json('.claude-plugin/marketplace.json').plugins, 'agent-scratchpad');
assert.equal(claudeMarketplace.version, version);
assert.equal(claudeMarketplace.source, './claude-plugin');
assert.equal(existsSync(join(repoRoot, 'claude-plugin')), true);

const codexMarketplace = findPluginByName(json('.agents/plugins/marketplace.json').plugins, 'agent-scratchpad');
assert.equal(codexMarketplace.source.path, './codex-plugin');
assert.equal(codexMarketplace.source.ref, `v${version}`);
assert.equal(existsSync(join(repoRoot, 'codex-plugin')), true);

for (const relPath of [
  'skills/agent-scratchpad/SKILL.md',
  'codex-plugin/skills/agent-scratchpad/SKILL.md',
  'claude-plugin/skills/agent-scratchpad/SKILL.md',
]) {
  const metadataVersionRe = new RegExp(`metadata:\\r?\\n  version: "${escapeRegExp(version)}"`);
  const content = read(relPath);
  assert.match(content, metadataVersionRe, relPath);
  assert.match(toCrLf(content), metadataVersionRe, `${relPath} with CRLF line endings`);
}

for (const relPath of [
  '.agent/VERSION',
  'examples/minimal/.agent/VERSION',
  'codex-plugin/VERSION',
  'claude-plugin/VERSION',
]) {
  assert.equal(read(relPath).trim(), version, relPath);
}

for (const relPath of [
  'examples/multi-agent/AGENTS.md',
  'examples/multi-agent/CLAUDE.md',
  'examples/multi-agent/.github/copilot-instructions.md',
  'examples/multi-agent/GEMINI.md',
  'examples/multi-agent/.cursor/rules/agent-scratchpad.mdc',
  'examples/multi-agent/CONVENTIONS.md',
]) {
  assert.match(read(relPath), new RegExp(`BEGIN Agent Scratchpad Kit v${escapeRegExp(version)}`), relPath);
}

assert.match(read('CHANGELOG.md'), new RegExp(`## \\[${escapeRegExp(version)}\\]`));

const cli = spawnSync(process.execPath, ['installers/init.mjs', '--version'], {
  cwd: repoRoot,
  encoding: 'utf8',
});
assert.equal(cli.status, 0, cli.stderr);
assert.equal(cli.stdout.trim(), version);

if (existsSync(join(repoRoot, '.git'))) {
  for (const relPath of [
    '.agent/SCRATCHPAD.local.md',
    '.agent/backups/example.txt',
    'PLAN.md',
  ]) {
    const ignored = spawnSync('git', ['check-ignore', relPath], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.equal(ignored.status, 0, `${relPath} should be ignored`);
  }

  for (const relPath of [
    '.agent/README.md',
    '.agent/SCRATCHPAD.template.md',
    '.agent/VERSION',
    '.gitignore',
    'VERSION',
    'package.json',
    'scripts/sync-packages.mjs',
    'tests/installer.test.mjs',
    'tests/sync.test.mjs',
    'tests/version.test.mjs',
    '.github/workflows/ci.yml',
    '.github/workflows/release-tag.yml',
    'examples/multi-agent/AGENTS.md',
    'codex-plugin/.codex-plugin/plugin.json',
    'claude-plugin/.claude-plugin/plugin.json',
  ]) {
    const tracked = spawnSync('git', ['ls-files', '--error-unmatch', relPath], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.equal(tracked.status, 0, `${relPath} should be tracked in CI`);
  }
}

console.log('ok - versions are consistent');

function read(relPath) {
  return readFileSync(join(repoRoot, relPath), 'utf8');
}

function json(relPath) {
  return JSON.parse(read(relPath));
}

function findPluginByName(plugins, name) {
  const plugin = plugins.find(entry => entry.name === name);
  assert.ok(plugin, `missing ${name} plugin entry`);
  return plugin;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toCrLf(value) {
  return value.replace(/\r?\n/g, '\r\n');
}
