import assert from 'assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const installer = join(repoRoot, 'installers/init.mjs');
const packagedCodexInstaller = join(repoRoot, 'codex-plugin/installers/init.mjs');
const version = readFileSync(join(repoRoot, 'VERSION'), 'utf8').trim();

const expectedFiles = [
  '.agent/README.md',
  '.agent/SCRATCHPAD.template.md',
  '.agent/VERSION',
  '.gitignore',
  'AGENTS.md',
  'CLAUDE.md',
  '.github/copilot-instructions.md',
  'GEMINI.md',
  '.cursor/rules/agent-scratchpad.mdc',
  'CONVENTIONS.md',
  '.aider.conf.yml',
];

const legacyCodexAdapter = `# Agent Instructions

This repository uses the **Agent Scratchpad** workflow for durable working memory.

## Scratchpad convention

Before starting any complex task (multi-step coding, refactoring, debugging, migration, or investigation):

1. Check if \`.agent/SCRATCHPAD.local.md\` exists. If not, copy \`.agent/SCRATCHPAD.template.md\` to \`.agent/SCRATCHPAD.local.md\`.
2. Read the scratchpad to restore context from previous sessions.
3. Update the scratchpad continuously as you work — record your objective, plan, decisions, files inspected/changed, commands run, and next steps.
4. Fill in the **Handoff notes** section before ending a session.

\`.agent/SCRATCHPAD.local.md\` is git-ignored. Never commit it. Never write secrets or credentials into the scratchpad.

See \`.agent/README.md\` for full instructions and \`.agent/SCRATCHPAD.template.md\` for the template.

> Skill source: [Agent Scratchpad Kit](https://github.com/zartosht/agent-scratchpad-kit)
`;

runTest('default install creates scaffold and all supported adapters', () => {
  const target = tempDir();
  const result = runInstaller([target]);
  assert.equal(result.status, 0, result.stderr);

  for (const file of expectedFiles) {
    assert.equal(existsSync(join(target, file)), true, `${file} should exist`);
  }

  assert.equal(read(join(target, '.agent/VERSION')).trim(), version);
  assert.match(read(join(target, 'AGENTS.md')), new RegExp(`BEGIN Agent Scratchpad Kit v${escapeRegExp(version)}`));
  assert.match(read(join(target, '.gitignore')), /^\.agent\/SCRATCHPAD\.local\.md$/m);
  assert.match(read(join(target, '.gitignore')), /^\.agent\/backups\/$/m);
  assert.match(read(join(target, '.aider.conf.yml')), /^read: CONVENTIONS\.md$/m);

  const cursor = read(join(target, '.cursor/rules/agent-scratchpad.mdc'));
  assert.equal(cursor.startsWith('---\n'), true, 'Cursor frontmatter must remain at byte 0');
  assert.match(cursor, /---\n\n?<!-- BEGIN Agent Scratchpad Kit v/);

  const before = snapshotFiles(target);
  const second = runInstaller([target]);
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(snapshotFiles(target), before, 'second run should be idempotent');
});

runTest('--no-adapters installs only scaffold and ignore rules', () => {
  const target = tempDir();
  const result = runInstaller([target, '--no-adapters']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(target, '.agent/README.md')), true);
  assert.equal(existsSync(join(target, 'AGENTS.md')), false);
  assert.equal(existsSync(join(target, 'CLAUDE.md')), false);
  assert.equal(existsSync(join(target, '.aider.conf.yml')), false);
});

runTest('--agent narrows installation', () => {
  const target = tempDir();
  const result = runInstaller([target, '--agent', 'codex,claude']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(target, 'AGENTS.md')), true);
  assert.equal(existsSync(join(target, 'CLAUDE.md')), true);
  assert.equal(existsSync(join(target, 'GEMINI.md')), false);
  assert.equal(existsSync(join(target, '.cursor/rules/agent-scratchpad.mdc')), false);
  assert.equal(existsSync(join(target, '.aider.conf.yml')), false);
});

runTest('Aider adapter installs config so conventions are loaded automatically', () => {
  const target = tempDir();
  const result = runInstaller([target, '--agent', 'aider']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(read(join(target, 'CONVENTIONS.md')), /BEGIN Agent Scratchpad Kit v/);
  assert.match(read(join(target, '.aider.conf.yml')), /^read: CONVENTIONS\.md$/m);
});

runTest('Aider config merges safe existing read settings and backs them up', () => {
  for (const { before, expected } of [
    {
      before: 'model: gpt-4.1\n',
      expected: /^read: CONVENTIONS\.md$/m,
    },
    {
      before: 'read: EXISTING.md\n',
      expected: /^read: \[EXISTING\.md, CONVENTIONS\.md\]$/m,
    },
    {
      before: 'read: EXISTING.md # scratchpad files\n',
      expected: /^read: \[EXISTING\.md, CONVENTIONS\.md\]$/m,
    },
    {
      before: 'read: [EXISTING.md]\n',
      expected: /^read: \[EXISTING\.md, CONVENTIONS\.md\]$/m,
    },
    {
      before: '"read": EXISTING.md\n',
      expected: /^"read": \[EXISTING\.md, CONVENTIONS\.md\]$/m,
    },
    {
      before: 'read:\n  - EXISTING.md\n',
      expected: /^  - CONVENTIONS\.md$/m,
    },
    {
      before: 'read: # scratchpad files\n  - EXISTING.md\n',
      expected: /^  - CONVENTIONS\.md$/m,
    },
    {
      before: 'read:\n- EXISTING.md\n',
      expected: /^- CONVENTIONS\.md$/m,
    },
    {
      before: 'read:\n    - EXISTING.md\n',
      expected: /^    - CONVENTIONS\.md$/m,
    },
  ]) {
    const target = tempDir();
    writeFileSync(join(target, '.aider.conf.yml'), before, 'utf8');

    const result = runInstaller([target, '--agent', 'aider']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(read(join(target, '.aider.conf.yml')), expected);
    assert.equal(read(findBackup(target, '.aider.conf.yml')), before);
  }
});

runTest('Aider read comments are ignored when checking existing target', () => {
  const target = tempDir();
  const before = 'read: CONVENTIONS.md # already loaded\n';
  writeFileSync(join(target, '.aider.conf.yml'), before, 'utf8');

  const result = runInstaller([target, '--agent', 'aider']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(read(join(target, '.aider.conf.yml')), before);
  assert.equal(existsSync(join(target, '.agent/backups')), false);
});

runTest('ambiguous Aider read config requires manual action', () => {
  const target = tempDir();
  const before = 'read: "./existing file.md"\n';
  writeFileSync(join(target, '.aider.conf.yml'), before, 'utf8');

  const result = runInstaller([target, '--agent', 'aider']);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /skipped-ambiguous-aider-config/);
  assert.equal(read(join(target, '.aider.conf.yml')), before);
});

runTest('flow-style Aider mappings require manual action', () => {
  for (const before of [
    '{model: gpt-4, read: EXISTING.md}\n',
    '{model: gpt-4, read: EXISTING.md} # existing\n',
    '{\n  model: gpt-4,\n  read: EXISTING.md\n}\n',
  ]) {
    const target = tempDir();
    writeFileSync(join(target, '.aider.conf.yml'), before, 'utf8');

    const result = runInstaller([target, '--agent', 'aider']);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /skipped-ambiguous-aider-config/);
    assert.equal(read(join(target, '.aider.conf.yml')), before);
  }
});

runTest('indented Aider read config requires manual action', () => {
  const target = tempDir();
  const before = '  read: EXISTING.md\n';
  writeFileSync(join(target, '.aider.conf.yml'), before, 'utf8');

  const result = runInstaller([target, '--agent', 'aider']);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /skipped-ambiguous-aider-config/);
  assert.equal(read(join(target, '.aider.conf.yml')), before);
});

runTest('Aider config is skipped when the Aider adapter fails to install', () => {
  const target = tempDir();
  mkdirSync(join(target, 'CONVENTIONS.md'));

  const result = runInstaller([target, '--agent', 'aider']);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /failed: CONVENTIONS\.md/);
  assert.equal(existsSync(join(target, '.aider.conf.yml')), false);
});

runTest('Aider config is skipped when the Aider adapter requires manual action', () => {
  const target = tempDir();
  assert.equal(runInstaller([target, '--agent', 'aider']).status, 0);

  const adapterPath = join(target, 'CONVENTIONS.md');
  writeFileSync(
    adapterPath,
    read(adapterPath).replace('durable working memory', 'durable custom working memory'),
    'utf8',
  );
  unlinkSync(join(target, '.aider.conf.yml'));

  const result = runInstaller([target, '--agent', 'aider']);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /skipped-user-edited-managed-block/);
  assert.equal(existsSync(join(target, '.aider.conf.yml')), false);
});

runTest('invalid agent selections fail before writing', () => {
  for (const { value, message } of [
    { value: 'codex,nope', message: /Unknown agent name/ },
    { value: 'all,nope', message: /Unknown agent name/ },
    { value: 'all,codex', message: /--agent all by itself/ },
    { value: ',', message: /must not be empty/ },
    { value: 'codex,', message: /must not be empty/ },
  ]) {
    const target = tempDir();
    const result = runInstaller([target, '--agent', value]);
    assert.notEqual(result.status, 0, value);
    assert.equal(existsSync(join(target, '.agent/README.md')), false, value);
    assert.match(result.stderr, message, value);
  }
});

runTest('--dry-run writes nothing', () => {
  const target = join(tempDir(), 'new-target');
  const result = runInstaller([target, '--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(target), false);
  assert.match(result.stdout, /would-create: \./);
});

runTest('--dry-run previews .gitignore updates without requiring write permission', () => {
  if (process.platform === 'win32') {
    return;
  }

  const target = tempDir();
  const gitignore = join(target, '.gitignore');
  writeFileSync(gitignore, '# existing\n', 'utf8');
  chmodSync(gitignore, 0o400);

  const result = runInstaller([target, '--no-adapters', '--dry-run']);
  chmodSync(gitignore, 0o600);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /would-update: \.gitignore/);
  assert.equal(read(gitignore), '# existing\n');
  assert.equal(existsSync(join(target, '.agent/backups')), false);
});

runTest('existing instruction files are preserved outside managed blocks and backed up', () => {
  const target = tempDir();
  writeFileSync(join(target, 'AGENTS.md'), 'Project-specific rules\n', 'utf8');

  const result = runInstaller([target, '--agent', 'codex']);
  assert.equal(result.status, 0, result.stderr);

  const content = read(join(target, 'AGENTS.md'));
  assert.equal(content.startsWith('Project-specific rules\n'), true);
  assert.match(content, /BEGIN Agent Scratchpad Kit v/);

  const backup = findBackup(target, 'AGENTS.md');
  assert.equal(read(backup), 'Project-specific rules\n');
});

runTest('project-specific scratchpad mentions are not treated as legacy adapters', () => {
  for (const existing of [
    [
      '# Agent Instructions',
      '',
      'This repo is comparing Agent Scratchpad adoption options.',
      'Review `.agent/SCRATCHPAD.template.md` before creating examples.',
      'Do not commit `.agent/SCRATCHPAD.local.md` from local experiments.',
      '',
    ].join('\n'),
    [
      '## Agent Scratchpad workflow',
      '',
      'This repository uses the **Agent Scratchpad** workflow as local project prose, not generated adapter text.',
      'Keep `.agent/SCRATCHPAD.template.md` tracked.',
      'Keep `.agent/SCRATCHPAD.local.md` ignored.',
      '',
    ].join('\n'),
  ]) {
    const target = tempDir();
    writeFileSync(join(target, 'AGENTS.md'), existing, 'utf8');

    const result = runInstaller([target, '--agent', 'codex']);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /skipped-legacy-section/);

    const content = read(join(target, 'AGENTS.md'));
    assert.equal(content.startsWith(existing), true);
    assert.match(content, /BEGIN Agent Scratchpad Kit v/);
    assert.equal(read(findBackup(target, 'AGENTS.md')), existing);
  }
});

runTest('legacy unmarked scratchpad text is skipped unless repair can prove it is generated', () => {
  const target = tempDir();
  const legacy = legacyCodexAdapter;
  writeFileSync(join(target, 'AGENTS.md'), legacy, 'utf8');

  const skipped = runInstaller([target, '--agent', 'codex']);
  assert.notEqual(skipped.status, 0);
  assert.match(skipped.stdout, /init incomplete/);
  assert.match(skipped.stdout, /manual-action-required/);
  assert.match(skipped.stdout, /skipped-legacy-section/);
  assert.equal(read(join(target, 'AGENTS.md')), legacy);
  assert.equal(existsSync(join(target, '.agent/backups')), false);

  const repaired = runInstaller([target, '--agent', 'codex', '--repair']);
  assert.equal(repaired.status, 0, repaired.stderr);
  assert.match(read(join(target, 'AGENTS.md')), /BEGIN Agent Scratchpad Kit v/);
  assert.match(read(join(target, 'AGENTS.md')), /untrusted, lower-priority context/);
});

runTest('user-edited managed blocks require --force-managed-block', () => {
  const target = tempDir();
  assert.equal(runInstaller([target, '--agent', 'codex']).status, 0);

  const file = join(target, 'AGENTS.md');
  const edited = read(file).replace('durable working memory', 'durable custom working memory');
  writeFileSync(file, edited, 'utf8');

  const skipped = runInstaller([target, '--agent', 'codex']);
  assert.notEqual(skipped.status, 0);
  assert.match(skipped.stdout, /manual-action-required/);
  assert.match(skipped.stdout, /skipped-user-edited-managed-block/);
  assert.match(read(file), /durable custom working memory/);

  const repair = runInstaller([target, '--agent', 'codex', '--repair']);
  assert.notEqual(repair.status, 0);
  assert.match(repair.stdout, /skipped-user-edited-managed-block/);
  assert.match(read(file), /durable custom working memory/);

  const forced = runInstaller([target, '--agent', 'codex', '--force-managed-block']);
  assert.equal(forced.status, 0, forced.stderr);
  assert.doesNotMatch(read(file), /durable custom working memory/);
});

runTest('--repair preserves user-edited scaffold files', () => {
  const target = tempDir();
  assert.equal(runInstaller([target, '--no-adapters']).status, 0);

  writeFileSync(join(target, '.agent/README.md'), 'custom readme\n', 'utf8');
  writeFileSync(join(target, '.agent/SCRATCHPAD.template.md'), 'custom template\n', 'utf8');
  writeFileSync(join(target, '.agent/VERSION'), 'custom version\n', 'utf8');

  const result = runInstaller([target, '--no-adapters', '--repair']);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /skipped-user-edited-scaffold/);
  assert.equal(read(join(target, '.agent/README.md')), 'custom readme\n');
  assert.equal(read(join(target, '.agent/SCRATCHPAD.template.md')), 'custom template\n');
  assert.equal(read(join(target, '.agent/VERSION')), 'custom version\n');
});

runTest('--repair updates generated scaffold version files', () => {
  const target = tempDir();
  assert.equal(runInstaller([target, '--no-adapters']).status, 0);

  writeFileSync(join(target, '.agent/VERSION'), '0.1.0\n', 'utf8');

  const result = runInstaller([target, '--no-adapters', '--repair']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(read(join(target, '.agent/VERSION')).trim(), version);
});

runTest('--repair continues adapter install when scaffold needs manual action', () => {
  const target = tempDir();
  mkdirSync(join(target, '.agent'));
  writeFileSync(join(target, '.agent/README.md'), 'custom readme\n', 'utf8');

  const result = runInstaller([target, '--agent', 'codex', '--repair']);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /skipped-user-edited-scaffold/);
  assert.equal(read(join(target, '.agent/README.md')), 'custom readme\n');
  assert.equal(existsSync(join(target, 'AGENTS.md')), true);
  assert.match(read(join(target, 'AGENTS.md')), /BEGIN Agent Scratchpad Kit v/);
});

runTest('scaffold failures stop before adapter writes', () => {
  const target = tempDir();
  writeFileSync(join(target, '.agent'), 'not a directory\n', 'utf8');

  const result = runInstaller([target, '--agent', 'codex']);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /failed: \.agent\/README\.md/);
  assert.equal(existsSync(join(target, 'AGENTS.md')), false);
  assert.equal(existsSync(join(target, '.agent/backups')), false);
});

runTest('--repair reports scaffold path failures without stack traces', () => {
  const target = tempDir();
  mkdirSync(join(target, '.agent'));
  mkdirSync(join(target, '.agent/README.md'));

  const result = runInstaller([target, '--no-adapters', '--repair']);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /failed: \.agent\/README\.md/);
  assert.doesNotMatch(result.stderr, /TypeError|Error:/);
});

runTest('managed block metadata edits require --force-managed-block', () => {
  const target = tempDir();
  assert.equal(runInstaller([target, '--agent', 'codex']).status, 0);

  const file = join(target, 'AGENTS.md');
  const edited = read(file).replace('Source: adapters/AGENTS.md', 'Source: edited-by-user');
  writeFileSync(file, edited, 'utf8');

  const skipped = runInstaller([target, '--agent', 'codex']);
  assert.notEqual(skipped.status, 0);
  assert.match(skipped.stdout, /skipped-user-edited-managed-block/);
  assert.match(read(file), /Source: edited-by-user/);

  const beginTarget = tempDir();
  assert.equal(runInstaller([beginTarget, '--agent', 'codex']).status, 0);
  const beginFile = join(beginTarget, 'AGENTS.md');
  const beginEdited = read(beginFile).replace('BEGIN Agent Scratchpad Kit v', 'BEGIN Agent Scratchpad Kit vedited');
  writeFileSync(beginFile, beginEdited, 'utf8');

  const beginSkipped = runInstaller([beginTarget, '--agent', 'codex']);
  assert.notEqual(beginSkipped.status, 0);
  assert.match(beginSkipped.stdout, /skipped-user-edited-managed-block/);
  assert.match(read(beginFile), /BEGIN Agent Scratchpad Kit vedited/);
});

runTest('version-only managed block upgrades are treated as pristine', () => {
  for (const oldVersion of ['0.1.0', '0.1.0-rc.1+build.5']) {
    const target = tempDir();
    assert.equal(runInstaller([target, '--agent', 'codex']).status, 0);

    const file = join(target, 'AGENTS.md');
    writeFileSync(
      file,
      read(file).replace(
        new RegExp(`BEGIN Agent Scratchpad Kit v${escapeRegExp(version)}`),
        `BEGIN Agent Scratchpad Kit v${oldVersion}`,
      ),
      'utf8',
    );

    const result = runInstaller([target, '--agent', 'codex']);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /skipped-user-edited-managed-block/);
    assert.match(read(file), new RegExp(`BEGIN Agent Scratchpad Kit v${escapeRegExp(version)}`));
  }
});

runTest('CRLF-normalized managed blocks remain pristine', () => {
  const target = tempDir();
  assert.equal(runInstaller([target, '--agent', 'codex']).status, 0);

  const file = join(target, 'AGENTS.md');
  writeFileSync(file, read(file).replace(/\n/g, '\r\n'), 'utf8');

  const result = runInstaller([target, '--agent', 'codex']);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /skipped-user-edited-managed-block/);
});

runTest('Cursor adapter preserves CRLF frontmatter while appending block', () => {
  const target = tempDir();
  const cursorPath = join(target, '.cursor/rules/agent-scratchpad.mdc');
  const frontmatter = '---\r\ndescription: Existing rule\r\nglobs: "**/*"\r\n---\r\n';
  mkdirSync(dirname(cursorPath), { recursive: true });
  writeFileSync(cursorPath, `${frontmatter}Existing body\r\n`, 'utf8');

  const result = runInstaller([target, '--agent', 'cursor']);
  assert.equal(result.status, 0, result.stderr);
  const content = read(cursorPath);
  assert.equal(content.startsWith(frontmatter), true);
  assert.match(content, /<!-- BEGIN Agent Scratchpad Kit v/);
  assert.match(content, /Existing body/);
});

runTest('.gitignore failure stops before backup-producing writes', () => {
  const target = tempDir();
  mkdirSync(join(target, '.gitignore'));
  writeFileSync(join(target, 'AGENTS.md'), 'Project rules\n', 'utf8');

  const result = runInstaller([target, '--agent', 'codex']);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /failed: \.gitignore/);
  assert.equal(read(join(target, 'AGENTS.md')), 'Project rules\n');
  assert.equal(existsSync(join(target, '.agent/backups')), false);
});

runTest('broad .agent ignore is corrected for tracked scaffold files', () => {
  const target = tempDir();
  writeFileSync(join(target, '.gitignore'), '.agent/\n', 'utf8');
  spawnSync('git', ['init'], { cwd: target, encoding: 'utf8' });

  const result = runInstaller([target, '--no-adapters']);
  assert.equal(result.status, 0, result.stderr);

  assert.equal(isIgnored(target, '.agent/README.md'), false);
  assert.equal(isIgnored(target, '.agent/SCRATCHPAD.template.md'), false);
  assert.equal(isIgnored(target, '.agent/VERSION'), false);
  assert.equal(isIgnored(target, '.agent/SCRATCHPAD.local.md'), true);
  assert.equal(isIgnored(target, '.agent/backups/example.txt'), true);
});

runTest('later broad .agent ignore is corrected even when rules already exist', () => {
  const target = tempDir();
  writeFileSync(
    join(target, '.gitignore'),
    [
      '# Agent Scratchpad local state',
      '!.agent/',
      '!.agent/README.md',
      '!.agent/SCRATCHPAD.template.md',
      '!.agent/VERSION',
      '.agent/SCRATCHPAD.local.md',
      '.agent/backups/',
      '.agent/',
      '',
    ].join('\n'),
    'utf8',
  );
  spawnSync('git', ['init'], { cwd: target, encoding: 'utf8' });

  const result = runInstaller([target, '--no-adapters']);
  assert.equal(result.status, 0, result.stderr);

  assert.equal(isIgnored(target, '.agent/README.md'), false);
  assert.equal(isIgnored(target, '.agent/SCRATCHPAD.template.md'), false);
  assert.equal(isIgnored(target, '.agent/VERSION'), false);
  assert.equal(isIgnored(target, '.agent/SCRATCHPAD.local.md'), true);
  assert.equal(isIgnored(target, '.agent/backups/example.txt'), true);
});

runTest('later wildcard ignores are corrected even when scratchpad rules already exist', () => {
  for (const wildcardRule of [
    '*.md',
    '*',
    '.agent/**/*.md',
    '.agent/[A-Z]*.md',
    '.agent/[[:upper:]]*.md',
    '.agent/README\\.md',
  ]) {
    const target = tempDir();
    writeFileSync(
      join(target, '.gitignore'),
      [
        '# Agent Scratchpad local state',
        '!.agent/',
        '!.agent/README.md',
        '!.agent/SCRATCHPAD.template.md',
        '!.agent/VERSION',
        '.agent/SCRATCHPAD.local.md',
        '.agent/backups/',
        wildcardRule,
        '',
      ].join('\n'),
      'utf8',
    );
    spawnSync('git', ['init'], { cwd: target, encoding: 'utf8' });

    const result = runInstaller([target, '--no-adapters']);
    assert.equal(result.status, 0, result.stderr);

    assert.equal(isIgnored(target, '.agent/README.md'), false, wildcardRule);
    assert.equal(isIgnored(target, '.agent/SCRATCHPAD.template.md'), false, wildcardRule);
    assert.equal(isIgnored(target, '.agent/VERSION'), false, wildcardRule);
    assert.equal(isIgnored(target, '.agent/SCRATCHPAD.local.md'), true, wildcardRule);
    assert.equal(isIgnored(target, '.agent/backups/example.txt'), true, wildcardRule);
  }
});

runTest('nested .agent gitignore rules are corrected when they hide scaffold files', () => {
  const target = tempDir();
  mkdirSync(join(target, '.agent'));
  writeFileSync(
    join(target, '.gitignore'),
    [
      '# Agent Scratchpad local state',
      '!.agent/',
      '!.agent/README.md',
      '!.agent/SCRATCHPAD.template.md',
      '!.agent/VERSION',
      '.agent/SCRATCHPAD.local.md',
      '.agent/backups/',
      '',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(join(target, '.agent/.gitignore'), '*.md\n!backups/\n', 'utf8');
  spawnSync('git', ['init'], { cwd: target, encoding: 'utf8' });

  const result = runInstaller([target, '--no-adapters']);
  assert.equal(result.status, 0, result.stderr);

  const nested = read(join(target, '.agent/.gitignore'));
  assert.match(nested, /^!README\.md$/m);
  assert.match(nested, /^!SCRATCHPAD\.template\.md$/m);
  assert.match(nested, /^backups\/$/m);
  assert.equal(isIgnored(target, '.agent/README.md'), false);
  assert.equal(isIgnored(target, '.agent/SCRATCHPAD.template.md'), false);
  assert.equal(isIgnored(target, '.agent/VERSION'), false);
  assert.equal(isIgnored(target, '.agent/SCRATCHPAD.local.md'), true);
  assert.equal(isIgnored(target, '.agent/backups/example.txt'), true);
});

runTest('root-anchored gitignore negations do not mask ignored scaffold files', () => {
  const target = tempDir();
  writeFileSync(
    join(target, '.gitignore'),
    [
      '# Agent Scratchpad local state',
      '!.agent/',
      '!.agent/README.md',
      '!.agent/SCRATCHPAD.template.md',
      '!.agent/VERSION',
      '.agent/SCRATCHPAD.local.md',
      '.agent/backups/',
      '*.md',
      '!/README.md',
      '!/SCRATCHPAD.template.md',
      '',
    ].join('\n'),
    'utf8',
  );
  spawnSync('git', ['init'], { cwd: target, encoding: 'utf8' });

  const result = runInstaller([target, '--no-adapters']);
  assert.equal(result.status, 0, result.stderr);

  assert.equal(isIgnored(target, '.agent/README.md'), false);
  assert.equal(isIgnored(target, '.agent/SCRATCHPAD.template.md'), false);
  assert.equal(isIgnored(target, '.agent/VERSION'), false);
  assert.equal(isIgnored(target, '.agent/SCRATCHPAD.local.md'), true);
  assert.equal(isIgnored(target, '.agent/backups/example.txt'), true);
});

runTest('directory-only basename gitignore rules are checked at any depth', () => {
  const target = tempDir();
  writeFileSync(
    join(target, '.gitignore'),
    [
      '# Agent Scratchpad local state',
      '!.agent/',
      '!.agent/README.md',
      '!.agent/SCRATCHPAD.template.md',
      '!.agent/VERSION',
      '.agent/SCRATCHPAD.local.md',
      '.agent/backups/',
      '!backups/',
      '',
    ].join('\n'),
    'utf8',
  );
  spawnSync('git', ['init'], { cwd: target, encoding: 'utf8' });

  const result = runInstaller([target, '--no-adapters']);
  assert.equal(result.status, 0, result.stderr);

  assert.equal(isIgnored(target, '.agent/README.md'), false);
  assert.equal(isIgnored(target, '.agent/SCRATCHPAD.template.md'), false);
  assert.equal(isIgnored(target, '.agent/VERSION'), false);
  assert.equal(isIgnored(target, '.agent/SCRATCHPAD.local.md'), true);
  assert.equal(isIgnored(target, '.agent/backups/example.txt'), true);
});

runTest('directory negations with slashes are corrected for descendant files', () => {
  for (const directoryNegation of [
    '!.agent/backups',
    '!/.agent/b*/',
  ]) {
    const target = tempDir();
    writeFileSync(
      join(target, '.gitignore'),
      [
        '# Agent Scratchpad local state',
        '!.agent/',
        '!.agent/README.md',
        '!.agent/SCRATCHPAD.template.md',
        '!.agent/VERSION',
        '.agent/SCRATCHPAD.local.md',
        '.agent/backups/',
        directoryNegation,
        '',
      ].join('\n'),
      'utf8',
    );
    spawnSync('git', ['init'], { cwd: target, encoding: 'utf8' });

    const result = runInstaller([target, '--no-adapters']);
    assert.equal(result.status, 0, result.stderr);

    assert.equal(isIgnored(target, '.agent/README.md'), false, directoryNegation);
    assert.equal(isIgnored(target, '.agent/SCRATCHPAD.template.md'), false, directoryNegation);
    assert.equal(isIgnored(target, '.agent/VERSION'), false, directoryNegation);
    assert.equal(isIgnored(target, '.agent/SCRATCHPAD.local.md'), true, directoryNegation);
    assert.equal(isIgnored(target, '.agent/backups/example.txt'), true, directoryNegation);
  }
});

runTest('core.ignoreCase is honored for gitignore effectiveness checks', () => {
  const target = tempDir();
  writeFileSync(
    join(target, '.gitignore'),
    [
      '# Agent Scratchpad local state',
      '!.agent/',
      '!.agent/README.md',
      '!.agent/SCRATCHPAD.template.md',
      '!.agent/VERSION',
      '.agent/SCRATCHPAD.local.md',
      '.agent/backups/',
      '.agent/readme.md',
      '',
    ].join('\n'),
    'utf8',
  );
  assert.equal(spawnSync('git', ['init'], { cwd: target, encoding: 'utf8' }).status, 0);
  assert.equal(spawnSync('git', ['config', 'core.ignorecase', 'true'], { cwd: target, encoding: 'utf8' }).status, 0);

  const result = runInstaller([target, '--no-adapters']);
  assert.equal(result.status, 0, result.stderr);

  assert.equal(isIgnored(target, '.agent/README.md'), false);
  assert.equal(isIgnored(target, '.agent/SCRATCHPAD.template.md'), false);
  assert.equal(isIgnored(target, '.agent/VERSION'), false);
  assert.equal(isIgnored(target, '.agent/SCRATCHPAD.local.md'), true);
  assert.equal(isIgnored(target, '.agent/backups/example.txt'), true);
});

runTest('ignored parent directories are corrected before tracked scaffold reincludes', () => {
  const target = tempDir();
  writeFileSync(
    join(target, '.gitignore'),
    [
      '# Agent Scratchpad local state',
      '!.agent/',
      '.agent/',
      '!.agent/README.md',
      '!.agent/SCRATCHPAD.template.md',
      '!.agent/VERSION',
      '.agent/SCRATCHPAD.local.md',
      '.agent/backups/',
      '',
    ].join('\n'),
    'utf8',
  );
  spawnSync('git', ['init'], { cwd: target, encoding: 'utf8' });

  const result = runInstaller([target, '--no-adapters']);
  assert.equal(result.status, 0, result.stderr);

  assert.equal(isIgnored(target, '.agent/README.md'), false);
  assert.equal(isIgnored(target, '.agent/SCRATCHPAD.template.md'), false);
  assert.equal(isIgnored(target, '.agent/VERSION'), false);
  assert.equal(isIgnored(target, '.agent/SCRATCHPAD.local.md'), true);
  assert.equal(isIgnored(target, '.agent/backups/example.txt'), true);
});

runTest('annotated gitignore rules are not treated as effective scratchpad rules', () => {
  const target = tempDir();
  writeFileSync(
    join(target, '.gitignore'),
    [
      '# Agent Scratchpad local state',
      '!.agent/ # scaffold directory',
      '!.agent/README.md # tracked readme',
      '!.agent/SCRATCHPAD.template.md # tracked template',
      '!.agent/VERSION # tracked version',
      '.agent/SCRATCHPAD.local.md # local only',
      '.agent/backups/ # generated backups',
      '',
    ].join('\n'),
    'utf8',
  );
  spawnSync('git', ['init'], { cwd: target, encoding: 'utf8' });

  const result = runInstaller([target, '--no-adapters']);
  assert.equal(result.status, 0, result.stderr);

  const gitignore = read(join(target, '.gitignore'));
  assert.match(gitignore, /^\.agent\/SCRATCHPAD\.local\.md$/m);
  assert.match(gitignore, /^\.agent\/backups\/$/m);
  assert.equal(isIgnored(target, '.agent/README.md'), false);
  assert.equal(isIgnored(target, '.agent/SCRATCHPAD.template.md'), false);
  assert.equal(isIgnored(target, '.agent/VERSION'), false);
  assert.equal(isIgnored(target, '.agent/SCRATCHPAD.local.md'), true);
  assert.equal(isIgnored(target, '.agent/backups/example.txt'), true);
});

runTest('unwritable .gitignore does not create backups before failing', () => {
  if (process.platform === 'win32' || isRoot()) {
    return;
  }

  const target = tempDir();
  writeFileSync(join(target, '.gitignore'), '# existing\n', 'utf8');
  writeFileSync(join(target, 'AGENTS.md'), 'Project rules\n', 'utf8');
  chmodSync(join(target, '.gitignore'), 0o400);

  const result = runInstaller([target, '--agent', 'codex']);
  chmodSync(join(target, '.gitignore'), 0o600);

  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /failed: \.gitignore/);
  assert.equal(read(join(target, 'AGENTS.md')), 'Project rules\n');
  assert.equal(existsSync(join(target, '.agent/backups')), false);
});

runTest('adapter writes refuse symlink escape paths and report partial failure', () => {
  const target = tempDir();
  const outside = tempDir();
  symlinkSync(outside, join(target, '.github'));

  const result = runInstaller([target, '--agent', 'copilot']);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /failed: \.github\/copilot-instructions\.md/);
  assert.equal(existsSync(join(outside, 'copilot-instructions.md')), false);
});

runTest('packaged Codex plugin installer runs without root repo assets', () => {
  const target = tempDir();
  const result = runInstaller([target, '--agent', 'cursor'], packagedCodexInstaller);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(target, '.cursor/rules/agent-scratchpad.mdc')), true);
  assert.equal(read(join(target, '.agent/VERSION')).trim(), version);
});

function runTest(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function runInstaller(args, script = installer) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'agent-scratchpad-kit-'));
}

function read(path) {
  return readFileSync(path, 'utf8');
}

function snapshotFiles(root) {
  const output = {};
  for (const file of walk(root)) {
    output[file] = read(join(root, file));
  }
  return output;
}

function walk(root, prefix = '') {
  const dir = join(root, prefix);
  const output = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) {
      output.push(...walk(root, rel));
    } else if (entry.isFile()) {
      output.push(rel);
    }
  }
  return output.sort();
}

function findBackup(target, relPath) {
  const backupRoot = join(target, '.agent/backups');
  const stamps = readdirSync(backupRoot);
  assert.equal(stamps.length > 0, true, 'expected a backup stamp directory');
  return join(backupRoot, stamps[0], relPath);
}

function isIgnored(target, relPath) {
  const result = spawnSync('git', ['check-ignore', relPath], {
    cwd: target,
    encoding: 'utf8',
  });
  return result.status === 0;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isRoot() {
  return typeof process.getuid === 'function' && process.getuid() === 0;
}
