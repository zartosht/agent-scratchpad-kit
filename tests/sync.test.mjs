import assert from 'assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, relative, resolve } from 'path';
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

runCrlfSkillMetadataSyncCheck();
runCrlfGeneratedExampleCheck();

console.log('ok - packaged plugin copies are synced');

function read(relPath) {
  return readFileSync(join(repoRoot, relPath), 'utf8');
}

function runCrlfGeneratedExampleCheck() {
  const tempRoot = mkdtempSync(join(tmpdir(), 'agent-scratchpad-sync-'));
  const tempRepo = join(tempRoot, 'repo');
  try {
    cpSync(repoRoot, tempRepo, {
      recursive: true,
      filter: src => {
        const parts = relative(repoRoot, src).split(/[\\/]/);
        return !parts.includes('.git') && !parts.includes('node_modules');
      },
    });

    for (const relPath of [
      'examples/multi-agent/AGENTS.md',
      'codex-plugin/examples/multi-agent/AGENTS.md',
      'claude-plugin/examples/multi-agent/AGENTS.md',
    ]) {
      const absPath = join(tempRepo, relPath);
      writeFileSync(absPath, readFileSync(absPath, 'utf8').replace(/\r?\n/g, '\r\n'), 'utf8');
    }

    const check = spawnSync(process.execPath, ['scripts/sync-packages.mjs', '--check'], {
      cwd: tempRepo,
      encoding: 'utf8',
    });
    assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function runCrlfSkillMetadataSyncCheck() {
  const tempRoot = mkdtempSync(join(tmpdir(), 'agent-scratchpad-sync-'));
  const tempRepo = join(tempRoot, 'repo');
  try {
    cpSync(repoRoot, tempRepo, {
      recursive: true,
      filter: src => {
        const parts = relative(repoRoot, src).split(/[\\/]/);
        return !parts.includes('.git') && !parts.includes('node_modules');
      },
    });

    const nextVersion = '0.2.1-dev.1';
    const skillPath = join(tempRepo, 'skills/agent-scratchpad/SKILL.md');
    const crlfSkill = readFileSync(skillPath, 'utf8')
      .replace(/\r?\n/g, '\r\n')
      .replace(/metadata:\r\n  version: "[^"]+"/, 'metadata:\r\n  version: "0.0.0-dev.0"');
    writeFileSync(join(tempRepo, 'VERSION'), `${nextVersion}\n`, 'utf8');
    writeFileSync(skillPath, crlfSkill, 'utf8');

    const sync = spawnSync(process.execPath, ['scripts/sync-packages.mjs'], {
      cwd: tempRepo,
      encoding: 'utf8',
    });
    assert.equal(sync.status, 0, `${sync.stdout}\n${sync.stderr}`);
    assert.match(
      readFileSync(skillPath, 'utf8'),
      /metadata:\r\n  version: "0\.2\.1-dev\.1"/,
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
