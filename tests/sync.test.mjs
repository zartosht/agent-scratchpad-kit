import assert from 'assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
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
assert.equal(read('.agent/README.md'), read('examples/minimal/.agent/README.md'));
assert.equal(read('.agent/SCRATCHPAD.template.md'), read('skills/agent-scratchpad/references/SCRATCHPAD.template.md'));
assert.equal(read('examples/minimal/.agent/SCRATCHPAD.template.md'), read('skills/agent-scratchpad/references/SCRATCHPAD.template.md'));
assert.equal(read('codex-plugin/examples/minimal/.agent/README.md'), read('examples/minimal/.agent/README.md'));
assert.equal(
  read('claude-plugin/examples/minimal/.agent/SCRATCHPAD.template.md'),
  read('skills/agent-scratchpad/references/SCRATCHPAD.template.md'),
);

runCrlfSkillMetadataSyncCheck();
runCrlfGeneratedExampleCheck();
runScaffoldCanonicalSourceSyncCheck();
runGeneratedPluginManifestDriftCheck();
runMarketplaceMetadataDriftCheck();
runGeneratedPackageSymlinkCheck();

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
      '.agent/VERSION',
      '.agents/plugins/marketplace.json',
      'codex-plugin/.codex-plugin/plugin.json',
      'codex-plugin/VERSION',
      'claude-plugin/.claude-plugin/plugin.json',
      'examples/multi-agent/AGENTS.md',
      'examples/multi-agent/.gitignore',
      'codex-plugin/examples/multi-agent/AGENTS.md',
      'codex-plugin/examples/multi-agent/.gitignore',
      'claude-plugin/examples/multi-agent/AGENTS.md',
      'claude-plugin/examples/multi-agent/.gitignore',
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

function runScaffoldCanonicalSourceSyncCheck() {
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

    const canonicalReadme = '# Canonical minimal scaffold README\n';
    const canonicalTemplate = '# Canonical skill reference template\n';
    writeFileSync(join(tempRepo, 'examples/minimal/.agent/README.md'), canonicalReadme, 'utf8');
    writeFileSync(join(tempRepo, 'skills/agent-scratchpad/references/SCRATCHPAD.template.md'), canonicalTemplate, 'utf8');
    writeFileSync(join(tempRepo, '.agent/README.md'), '# stale dogfood README\n', 'utf8');
    writeFileSync(join(tempRepo, '.agent/SCRATCHPAD.template.md'), '# stale dogfood template\n', 'utf8');
    writeFileSync(join(tempRepo, 'examples/minimal/.agent/SCRATCHPAD.template.md'), '# stale example template\n', 'utf8');

    const sync = spawnSync(process.execPath, ['scripts/sync-packages.mjs'], {
      cwd: tempRepo,
      encoding: 'utf8',
    });
    assert.equal(sync.status, 0, `${sync.stdout}\n${sync.stderr}`);

    assert.equal(readFileSync(join(tempRepo, '.agent/README.md'), 'utf8'), canonicalReadme);
    assert.equal(readFileSync(join(tempRepo, '.agent/SCRATCHPAD.template.md'), 'utf8'), canonicalTemplate);
    assert.equal(readFileSync(join(tempRepo, 'examples/minimal/.agent/SCRATCHPAD.template.md'), 'utf8'), canonicalTemplate);
    assert.equal(readFileSync(join(tempRepo, 'codex-plugin/examples/minimal/.agent/README.md'), 'utf8'), canonicalReadme);
    assert.equal(
      readFileSync(join(tempRepo, 'claude-plugin/examples/minimal/.agent/SCRATCHPAD.template.md'), 'utf8'),
      canonicalTemplate,
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function runGeneratedPluginManifestDriftCheck() {
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

    const codexManifestPath = join(tempRepo, 'codex-plugin/.codex-plugin/plugin.json');
    const codexManifest = JSON.parse(readFileSync(codexManifestPath, 'utf8'));
    codexManifest.description = 'drifted generated description';
    writeFileSync(codexManifestPath, `${JSON.stringify(codexManifest, null, 2)}\n`, 'utf8');

    const claudeManifestPath = join(tempRepo, 'claude-plugin/.claude-plugin/plugin.json');
    const claudeManifest = JSON.parse(readFileSync(claudeManifestPath, 'utf8'));
    claudeManifest.keywords = [...claudeManifest.keywords, 'drifted-keyword'];
    writeFileSync(claudeManifestPath, `${JSON.stringify(claudeManifest, null, 2)}\n`, 'utf8');

    const check = spawnSync(process.execPath, ['scripts/sync-packages.mjs', '--check'], {
      cwd: tempRepo,
      encoding: 'utf8',
    });
    assert.notEqual(check.status, 0, `${check.stdout}\n${check.stderr}`);
    assert.match(check.stdout, /codex-plugin\/\.codex-plugin\/plugin\.json: content drift/);
    assert.match(check.stdout, /claude-plugin\/\.claude-plugin\/plugin\.json: content drift/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function runMarketplaceMetadataDriftCheck() {
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

    const marketplacePath = join(tempRepo, '.agents/plugins/marketplace.json');
    const marketplace = JSON.parse(readFileSync(marketplacePath, 'utf8'));
    const plugin = marketplace.plugins.find(entry => entry.name === 'agent-scratchpad');
    plugin.source.source = 'git';
    plugin.source.url = 'https://github.com/example/wrong-repo.git';
    plugin.policy.installation = 'HIDDEN';
    marketplace.interface.displayName = 'Drifted Marketplace';
    writeFileSync(marketplacePath, `${JSON.stringify(marketplace, null, 2)}\n`, 'utf8');

    const claudeMarketplacePath = join(tempRepo, '.claude-plugin/marketplace.json');
    const claudeMarketplace = JSON.parse(readFileSync(claudeMarketplacePath, 'utf8'));
    const claudePlugin = claudeMarketplace.plugins.find(entry => entry.name === 'agent-scratchpad');
    claudePlugin.description = 'Drifted description';
    claudePlugin.author.name = 'Someone Else';
    writeFileSync(claudeMarketplacePath, `${JSON.stringify(claudeMarketplace, null, 2)}\n`, 'utf8');

    const check = spawnSync(process.execPath, ['scripts/sync-packages.mjs', '--check'], {
      cwd: tempRepo,
      encoding: 'utf8',
    });
    assert.notEqual(check.status, 0, `${check.stdout}\n${check.stderr}`);
    assert.match(check.stdout, /\.agents\/plugins\/marketplace\.json: content drift/);
    assert.match(check.stdout, /\.claude-plugin\/marketplace\.json: content drift/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function runGeneratedPackageSymlinkCheck() {
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

    symlinkSync('README.md', join(tempRepo, 'codex-plugin/examples/minimal/.agent/README.link.md'));

    const check = spawnSync(process.execPath, ['scripts/sync-packages.mjs', '--check'], {
      cwd: tempRepo,
      encoding: 'utf8',
    });
    assert.notEqual(check.status, 0, `${check.stdout}\n${check.stderr}`);
    assert.match(check.stdout, /symlink not allowed in generated tree/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
