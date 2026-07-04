import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const result = spawnSync(process.execPath, ['scripts/sync-packages.mjs', '--check'], {
  cwd: repoRoot,
  encoding: 'utf8',
});

assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

const rootSkill = read('skills/agent-scratchpad/SKILL.md');
assert.equal(read('codex-plugin/skills/agent-scratchpad/SKILL.md'), rootSkill);
assert.equal(read('claude-plugin/skills/agent-scratchpad/SKILL.md'), rootSkill);

assert.equal(read('codex-plugin/adapters/AGENTS.md'), read('adapters/AGENTS.md'));
assert.equal(read('claude-plugin/installers/init.mjs'), read('installers/init.mjs'));
assert.equal(read('examples/minimal/.agent/README.md'), read('.agent/README.md'));
assert.equal(read('examples/minimal/.agent/SCRATCHPAD.template.md'), read('.agent/SCRATCHPAD.template.md'));
assert.equal(read('skills/agent-scratchpad/references/SCRATCHPAD.template.md'), read('.agent/SCRATCHPAD.template.md'));
assert.equal(read('codex-plugin/examples/minimal/.agent/README.md'), read('.agent/README.md'));
assert.equal(read('claude-plugin/examples/minimal/.agent/SCRATCHPAD.template.md'), read('.agent/SCRATCHPAD.template.md'));

console.log('ok - packaged plugin copies are synced');

function read(relPath) {
  return readFileSync(join(repoRoot, relPath), 'utf8');
}
