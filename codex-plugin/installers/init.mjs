#!/usr/bin/env node
// Dependency-free Agent Scratchpad Kit installer.

import {
  accessSync,
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'fs';
import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import { dirname, join, relative, resolve, sep } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(__dirname, '..');
const version = readKitVersion();

const END_MARKER = '<!-- END Agent Scratchpad Kit -->';
const BEGIN_RE = /<!-- BEGIN Agent Scratchpad Kit(?: v([^ >]+))? -->/g;
const MANAGED_BLOCK_NOTE = '<!-- Do not edit inside this managed block. Put custom instructions before or after it. -->';
const AIDER_CONFIG_TARGET = '.aider.conf.yml';
const AIDER_READ_TARGET = 'CONVENTIONS.md';

const SCAFFOLD_FILES = [
  { src: 'examples/minimal/.agent/README.md', dest: '.agent/README.md' },
  { src: 'examples/minimal/.agent/SCRATCHPAD.template.md', dest: '.agent/SCRATCHPAD.template.md' },
  { src: 'VERSION', dest: '.agent/VERSION' },
];

const ADAPTERS = [
  {
    name: 'codex',
    label: 'Codex',
    target: 'AGENTS.md',
    source: 'adapters/AGENTS.md',
  },
  {
    name: 'claude',
    label: 'Claude Code',
    target: 'CLAUDE.md',
    source: 'adapters/CLAUDE.md',
  },
  {
    name: 'copilot',
    label: 'GitHub Copilot',
    target: '.github/copilot-instructions.md',
    source: 'adapters/copilot-instructions.md',
  },
  {
    name: 'gemini',
    label: 'Gemini CLI',
    target: 'GEMINI.md',
    source: 'adapters/GEMINI.md',
  },
  {
    name: 'cursor',
    label: 'Cursor',
    target: '.cursor/rules/agent-scratchpad.mdc',
    source: 'adapters/cursor-rule.mdc',
    cursorMdc: true,
  },
  {
    name: 'aider',
    label: 'Aider',
    target: 'CONVENTIONS.md',
    source: 'adapters/CONVENTIONS.md',
    aiderConfig: true,
  },
];

const GITIGNORE_RULES = [
  '!.agent/',
  '!.agent/README.md',
  '!.agent/SCRATCHPAD.template.md',
  '!.agent/VERSION',
  '.agent/SCRATCHPAD.local.md',
  '.agent/backups/',
];

const ROOT_GITIGNORE_EXPECTATIONS = [
  { path: '.agent/README.md', ignored: false },
  { path: '.agent/SCRATCHPAD.template.md', ignored: false },
  { path: '.agent/VERSION', ignored: false },
  { path: '.agent/SCRATCHPAD.local.md', ignored: true },
  { path: '.agent/backups/example.txt', ignored: true },
];

const NESTED_AGENT_GITIGNORE_RULES = [
  '!README.md',
  '!SCRATCHPAD.template.md',
  '!VERSION',
  'SCRATCHPAD.local.md',
  'backups/',
];

const NESTED_AGENT_GITIGNORE_EXPECTATIONS = [
  { path: 'README.md', ignored: false },
  { path: 'SCRATCHPAD.template.md', ignored: false },
  { path: 'VERSION', ignored: false },
  { path: 'SCRATCHPAD.local.md', ignored: true },
  { path: 'backups/example.txt', ignored: true },
];

const LEGACY_SCRATCHPAD_PATHS = [
  '.agent/SCRATCHPAD.local.md',
  '.agent/SCRATCHPAD.template.md',
];
const LEGACY_SKILL_SOURCE_MARKER = '> Skill source: [Agent Scratchpad Kit](https://github.com/zartosht/agent-scratchpad-kit)';

const LEGACY_ADAPTER_SHA256 = {
  'adapters/AGENTS.md': '06254c203c280288faa2e79772dee6ff84c0b40bb6ef44d83597e15418db59f8',
  'adapters/CLAUDE.md': 'cd75752781647a30ce0123866b2918eaf2174e78188e32ddae64d0e2b4955682',
  'adapters/copilot-instructions.md': 'e5f7d3b0d48a8dc562ff6ddf6f014b19f7f1b862dbd89491f1beb775c83843cb',
  'adapters/GEMINI.md': 'd850c4dd3a49c0a54f57998b3681d030b6318860428b523817333750e272d278',
  'adapters/cursor-rule.mdc': '9091fece3e7365e2e7a0e38c0c5355a541212eaf2d4a0d0b895ea50c0c507cf8',
  'adapters/CONVENTIONS.md': 'df136e376a770b5291766336b4bd84871a549dc358c50d97c2d2784dd2983591',
};

main();

function main() {
  let options;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`Error: ${error.message}`);
    printUsage();
    process.exit(1);
  }

  if (options.help) {
    printUsage();
    return;
  }

  if (options.versionOnly) {
    console.log(version);
    return;
  }

  const run = createRunContext(options);

  try {
    preflight(run);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }

  updateGitignore(run);
  if (run.failures.length > 0) {
    finish(run);
    return;
  }

  installScaffold(run);
  if (run.failures.length > 0) {
    finish(run);
    return;
  }

  if (!run.options.noAdapters) {
    for (const adapter of run.selectedAdapters) {
      const adapterInstalled = installAdapter(run, adapter);
      if (adapter.aiderConfig && adapterInstalled) {
        installAiderConfig(run);
      }
    }
  }

  finish(run);
}

function parseArgs(argv) {
  const options = {
    target: '.',
    agentValues: [],
    noAdapters: false,
    dryRun: false,
    repair: false,
    forceManagedBlock: false,
    versionOnly: false,
    help: false,
  };
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--version') {
      options.versionOnly = true;
    } else if (arg === '--no-adapters') {
      options.noAdapters = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--repair') {
      options.repair = true;
    } else if (arg === '--force-managed-block') {
      options.forceManagedBlock = true;
    } else if (arg === '--agent') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--agent requires a value');
      }
      options.agentValues.push(value);
      i += 1;
    } else if (arg.startsWith('--agent=')) {
      const value = arg.slice('--agent='.length);
      if (!value) {
        throw new Error('--agent requires a value');
      }
      options.agentValues.push(value);
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (positional.length > 1) {
    throw new Error(`Expected at most one target path, got ${positional.length}`);
  }
  if (positional.length === 1) {
    options.target = positional[0];
  }
  if (options.noAdapters && options.agentValues.length > 0) {
    throw new Error('Use either --no-adapters or --agent, not both');
  }

  options.selectedAgentNames = resolveAgentSelection(options.agentValues);
  return options;
}

function resolveAgentSelection(values) {
  if (values.length === 0) {
    return ADAPTERS.map(adapter => adapter.name);
  }

  const requested = values.flatMap(value => value.split(',').map(part => part.trim().toLowerCase()));

  if (requested.some(name => name.length === 0)) {
    throw new Error('Agent names must not be empty');
  }

  const known = new Set(['all', ...ADAPTERS.map(adapter => adapter.name)]);
  const unknown = requested.filter(name => !known.has(name));
  if (unknown.length > 0) {
    throw new Error(`Unknown agent name(s): ${unknown.join(', ')}`);
  }

  if (requested.includes('all')) {
    if (requested.length > 1) {
      throw new Error('Use --agent all by itself, or list specific agent names without all');
    }
    return ADAPTERS.map(adapter => adapter.name);
  }

  return [...new Set(requested)];
}

function createRunContext(options) {
  const targetRoot = resolve(options.target);
  const selectedAdapters = options.noAdapters
    ? []
    : ADAPTERS.filter(adapter => options.selectedAgentNames.includes(adapter.name));

  return {
    options,
    targetRoot,
    targetRootReal: targetRoot,
    selectedAdapters,
    results: [],
    failures: [],
    manualActions: [],
    backups: [],
    backupStamp: timestampForPath(new Date()),
  };
}

function preflight(run) {
  validateSource('VERSION');
  for (const file of SCAFFOLD_FILES) {
    validateSource(file.src);
  }
  for (const adapter of run.selectedAdapters) {
    validateSource(adapter.source);
  }

  if (existsSync(run.targetRoot)) {
    const stat = statSync(run.targetRoot);
    if (!stat.isDirectory()) {
      throw new Error(`Target path is not a directory: ${run.targetRoot}`);
    }
  } else if (!run.options.dryRun) {
    mkdirSync(run.targetRoot, { recursive: true });
    record(run, 'created', '.', 'created target directory');
  } else {
    record(run, 'would-create', '.', 'target directory');
  }

  if (existsSync(run.targetRoot)) {
    run.targetRootReal = resolve(run.targetRoot);
  }
}

function validateSource(relPath) {
  const srcAbs = join(kitRoot, relPath);
  if (!existsSync(srcAbs)) {
    throw new Error(`Source not found: ${srcAbs}`);
  }
}

function installScaffold(run) {
  for (const { src, dest } of SCAFFOLD_FILES) {
    try {
      const content = readFileSync(join(kitRoot, src), 'utf8');
      if (run.options.repair && shouldPreserveExistingScaffold(run, dest, content)) {
        manualAction(
          run,
          dest,
          'skipped-user-edited-scaffold',
          'existing scaffold differs; repair will not overwrite it automatically',
        );
        continue;
      }
      writeDesiredFile(run, dest, content, 'scaffold');
    } catch (error) {
      fail(run, dest, error);
    }
  }
}

function shouldPreserveExistingScaffold(run, relPath, desired) {
  const destAbs = safePath(run, relPath);
  if (!existsSync(destAbs)) {
    return false;
  }

  const stat = lstatSync(destAbs);
  if (!stat.isFile()) {
    throw new Error('target exists but is not a regular file');
  }

  const existing = readFileSync(destAbs, 'utf8');
  if (relPath === '.agent/VERSION' && isGeneratedVersionContent(existing)) {
    return false;
  }

  return normalizeLineEndings(existing) !== normalizeLineEndings(desired);
}

function updateGitignore(run) {
  try {
    const relPath = '.gitignore';
    const destAbs = safePath(run, relPath);
    const existing = existsSync(destAbs) ? readFileSync(destAbs, 'utf8') : null;
    const updated = buildGitignoreContent(existing, gitignoreMatchOptions(run));

    if (existing === updated) {
      record(run, 'unchanged', relPath, 'required ignore rules already present');
      updateNestedAgentGitignore(run);
      return;
    }

    if (existing !== null && !run.options.dryRun) {
      assertWritableDestination(destAbs);
    }

    if (writeDesiredFile(run, relPath, updated, 'gitignore')) {
      updateNestedAgentGitignore(run);
    }
  } catch (error) {
    fail(run, '.gitignore', error);
  }
}

function updateNestedAgentGitignore(run) {
  const relPath = '.agent/.gitignore';
  try {
    const destAbs = safePath(run, relPath);
    if (!existsSync(destAbs)) {
      return;
    }

    const stat = lstatSync(destAbs);
    if (!stat.isFile()) {
      throw new Error('target exists but is not a regular file');
    }

    const existing = readFileSync(destAbs, 'utf8');
    const updated = buildGitignoreContent(
      existing,
      gitignoreMatchOptions(run),
      NESTED_AGENT_GITIGNORE_RULES,
      NESTED_AGENT_GITIGNORE_EXPECTATIONS,
    );
    if (existing === updated) {
      record(run, 'unchanged', relPath, 'nested ignore rules already preserve scratchpad files');
      return;
    }

    if (existing !== null && !run.options.dryRun) {
      assertWritableDestination(destAbs);
    }
    writeDesiredFile(run, relPath, updated, 'nested gitignore');
  } catch (error) {
    fail(run, relPath, error);
  }
}

function assertWritableDestination(destAbs) {
  accessSync(destAbs, constants.W_OK);
}

function buildGitignoreContent(
  existing,
  options = {},
  requiredRules = GITIGNORE_RULES,
  expectations = ROOT_GITIGNORE_EXPECTATIONS,
) {
  if (existing === null) {
    return `# Agent Scratchpad local state\n${requiredRules.join('\n')}\n`;
  }

  const lines = existing.split(/\r?\n/);
  const present = new Set();
  for (const line of lines) {
    const rule = line.split('#')[0].trim();
    for (const required of requiredRules) {
      if (rule === required || rule === `/${required}`) {
        present.add(required);
      }
    }
  }

  const missing = requiredRules.filter(rule => !present.has(rule));
  const effective = gitignoreRulesAreEffective(lines, expectations, options);
  if (missing.length === 0 && effective) {
    return existing;
  }

  const rules = effective ? missing : requiredRules;
  const block = `# Agent Scratchpad local state\n${rules.join('\n')}\n`;
  if (existing.length === 0) {
    return block;
  }
  return existing.endsWith('\n') ? `${existing}${block}` : `${existing}\n${block}`;
}

function gitignoreMatchOptions(run) {
  return { ignoreCase: gitCoreIgnoreCase(run) };
}

function gitCoreIgnoreCase(run) {
  if (!existsSync(run.targetRoot)) {
    return false;
  }
  if (!existsSync(join(run.targetRoot, '.git'))) {
    return false;
  }

  const result = spawnSync('git', ['config', '--bool', 'core.ignorecase'], {
    cwd: run.targetRoot,
    encoding: 'utf8',
  });
  return result.status === 0 && result.stdout.trim().toLowerCase() === 'true';
}

function gitignoreRulesAreEffective(lines, expectations, options = {}) {
  return expectations.every(({ path, ignored }) => gitignorePathIgnoredByRelevantRules(lines, path, options) === ignored);
}

function gitignorePathIgnoredByRelevantRules(lines, path, options = {}) {
  const paths = [...gitignoreParentPaths(path), path];
  const ignoredByPath = new Map(paths.map(candidate => [candidate, false]));
  for (const line of lines) {
    const parsed = parseGitignoreRule(line);
    if (!parsed) {
      continue;
    }
    for (const candidate of paths) {
      if (!gitignoreRuleMatchesPath(parsed, candidate, options)) {
        continue;
      }
      if (parsed.negated && gitignoreHasIgnoredParent(ignoredByPath, candidate)) {
        continue;
      }
      gitignoreSetIgnoredState(ignoredByPath, paths, candidate, !parsed.negated);
    }
  }
  return ignoredByPath.get(path) ?? false;
}

function gitignoreSetIgnoredState(ignoredByPath, paths, candidate, ignored) {
  for (const path of paths) {
    if (path === candidate || path.startsWith(`${candidate}/`)) {
      ignoredByPath.set(path, ignored);
    }
  }
}

function gitignoreParentPaths(path) {
  const parts = path.split('/');
  const parents = [];
  for (let index = 1; index < parts.length; index += 1) {
    parents.push(parts.slice(0, index).join('/'));
  }
  return parents;
}

function gitignoreHasIgnoredParent(ignoredByPath, path) {
  return gitignoreParentPaths(path).some(parent => ignoredByPath.get(parent));
}

function parseGitignoreRule(line) {
  let rule = line.replace(/\r$/, '').replace(/[ \t]+$/, '');
  if (!rule || rule.startsWith('#')) {
    return null;
  }
  if (rule.startsWith('\\#')) {
    rule = rule.slice(1);
  }

  const negated = rule.startsWith('!');
  if (negated) {
    rule = rule.slice(1);
  }
  const anchored = rule.startsWith('/');
  if (anchored) {
    rule = rule.replace(/^\/+/, '');
  }

  return rule ? { negated, pattern: rule, anchored } : null;
}

function gitignoreRuleMatchesPath(rule, path, options = {}) {
  const pattern = typeof rule === 'string' ? rule : rule.pattern;
  const anchored = typeof rule === 'string' ? false : rule.anchored;

  if (pattern === '.agent/**') {
    return path === '.agent' || path.startsWith('.agent/');
  }
  if (pattern === '.agent/*') {
    return path.startsWith('.agent/') && path.slice('.agent/'.length).split('/').length === 1;
  }

  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return path === prefix.slice(0, -1) || path.startsWith(prefix);
  }

  if (pattern.endsWith('/')) {
    return gitignoreDirectoryRuleMatchesPath(pattern, path, anchored, options);
  }

  if (anchored) {
    return gitignoreGlobMatches(pattern, path, options);
  }

  if (pattern.includes('/')) {
    return gitignoreGlobMatches(pattern, path, options);
  }

  return path.split('/').some(segment => gitignoreGlobMatches(pattern, segment, options));
}

function gitignoreDirectoryRuleMatchesPath(pattern, path, anchored, options) {
  const prefix = pattern.slice(0, -1);
  if (anchored || prefix.includes('/')) {
    return [...gitignoreParentPaths(path), path].some(candidate => gitignoreGlobMatches(prefix, candidate, options));
  }

  return path.split('/').some(segment => gitignoreGlobMatches(prefix, segment, options));
}

function gitignoreGlobMatches(pattern, value, options = {}) {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    if (pattern.startsWith('**/', index)) {
      source += '(?:.*/)?';
      index += 2;
      continue;
    }
    const char = pattern[index];
    if (char === '\\' && index + 1 < pattern.length) {
      source += escapeRegExp(pattern[index + 1]);
      index += 1;
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else if (char === '[') {
      const bracket = gitignoreBracketRangeSource(pattern, index);
      if (bracket) {
        source += bracket.source;
        index = bracket.end;
      } else {
        source += '\\[';
      }
    } else {
      source += escapeRegExp(char);
    }
  }
  const regex = new RegExp(`^${source}$`, options.ignoreCase ? 'i' : '');
  return regex.test(value);
}

function gitignoreBracketRangeSource(pattern, start) {
  const end = findGitignoreBracketEnd(pattern, start);
  if (end === -1) {
    return null;
  }

  let content = pattern.slice(start + 1, end);
  if (content.length === 0) {
    return null;
  }

  const negated = content.startsWith('!') || content.startsWith('^');
  if (negated) {
    content = content.slice(1);
  }
  if (content.length === 0) {
    return null;
  }

  return {
    source: `[${negated ? '^' : ''}${gitignoreBracketContentSource(content)}]`,
    end,
  };
}

function findGitignoreBracketEnd(pattern, start) {
  for (let index = start + 1; index < pattern.length; index += 1) {
    if (pattern[index] === '[' && ['.', ':', '='].includes(pattern[index + 1])) {
      const closing = `${pattern[index + 1]}]`;
      const end = pattern.indexOf(closing, index + 2);
      if (end !== -1) {
        index = end + 1;
        continue;
      }
    }
    if (pattern[index] === ']') {
      return index;
    }
  }
  return -1;
}

function gitignoreBracketContentSource(content) {
  let source = '';
  for (let index = 0; index < content.length; index += 1) {
    if (content.startsWith('[:', index)) {
      const end = content.indexOf(':]', index + 2);
      if (end !== -1) {
        source += gitignorePosixClassSource(content.slice(index + 2, end));
        index = end + 1;
        continue;
      }
    }
    source += escapeRegExpCharClass(content[index]);
  }
  return source;
}

function gitignorePosixClassSource(name) {
  const classes = {
    alnum: 'A-Za-z0-9',
    alpha: 'A-Za-z',
    blank: ' \\t',
    digit: '0-9',
    lower: 'a-z',
    space: '\\s',
    upper: 'A-Z',
    xdigit: 'A-Fa-f0-9',
  };
  return classes[name] ?? escapeRegExpCharClass(`[:${name}:]`);
}

function escapeRegExpCharClass(value) {
  return value.replace(/\\/g, '\\\\').replace(/\]/g, '\\]').replace(/\[/g, '\\[').replace(/\^/g, '\\^');
}

function installAdapter(run, adapter) {
  const relPath = adapter.target;

  try {
    const sourceRaw = readFileSync(join(kitRoot, adapter.source), 'utf8');
    const sourceParts = adapter.cursorMdc
      ? splitLeadingFrontmatter(sourceRaw)
      : { frontmatter: '', body: sourceRaw };
    const payload = normalizePayload(sourceParts.body);
    const block = buildManagedBlock(adapter, payload, sourceParts);
    const destAbs = safePath(run, relPath);

    if (!existsSync(destAbs)) {
      const desired = adapter.cursorMdc ? `${sourceParts.frontmatter}${block}` : block;
      return writeDesiredFile(run, relPath, desired, `${adapter.name} adapter`);
    }

    const existing = readFileSync(destAbs, 'utf8');
    const merge = mergeAdapterContent({
      existing,
      block,
      sourceRaw,
      sourceParts,
      adapter,
      repair: run.options.repair,
      forceManagedBlock: run.options.forceManagedBlock,
    });

    if (merge.status === 'unchanged') {
      record(run, 'unchanged', relPath, `${adapter.label} adapter already current`);
      return true;
    }

    if (merge.status === 'skipped') {
      manualAction(run, relPath, merge.reason, merge.detail);
      return false;
    }

    return writeDesiredFile(run, relPath, merge.content, `${adapter.name} adapter`);
  } catch (error) {
    fail(run, relPath, error);
    return false;
  }
}

function installAiderConfig(run) {
  const relPath = AIDER_CONFIG_TARGET;

  try {
    const destAbs = safePath(run, relPath);
    if (!existsSync(destAbs)) {
      writeDesiredFile(run, relPath, defaultAiderConfigContent(), 'Aider config');
      return;
    }

    const stat = lstatSync(destAbs);
    if (!stat.isFile()) {
      throw new Error('target exists but is not a regular file');
    }

    const existing = readFileSync(destAbs, 'utf8');
    const merge = mergeAiderConfig(existing);
    if (merge.status === 'unchanged') {
      record(run, 'unchanged', relPath, 'Aider config already reads CONVENTIONS.md');
      return;
    }
    if (merge.status === 'skipped') {
      manualAction(run, relPath, merge.reason, merge.detail);
      return;
    }

    writeDesiredFile(run, relPath, merge.content, 'Aider config');
  } catch (error) {
    fail(run, relPath, error);
  }
}

function defaultAiderConfigContent() {
  return [
    '# Agent Scratchpad Kit: load Aider conventions automatically.',
    `read: ${AIDER_READ_TARGET}`,
    '',
  ].join('\n');
}

function mergeAiderConfig(existing) {
  const normalized = normalizeLineEndings(existing);
  const lines = normalized.split('\n');
  const readIndexes = [];

  lines.forEach((line, index) => {
    if (matchTopLevelAiderRead(line)) {
      readIndexes.push(index);
    }
  });

  if (readIndexes.length === 0) {
    if (hasIndentedAiderRead(lines)) {
      return {
        status: 'skipped',
        reason: 'skipped-ambiguous-aider-config',
        detail: 'indented read entries are not safe to edit automatically; add CONVENTIONS.md manually',
      };
    }
    if (hasTopLevelYamlFlowMapping(lines)) {
      return {
        status: 'skipped',
        reason: 'skipped-ambiguous-aider-config',
        detail: 'top-level flow-style YAML mappings are not safe to edit automatically; add CONVENTIONS.md manually',
      };
    }
    return {
      status: 'updated',
      content: appendAiderReadConfig(normalized),
    };
  }
  if (readIndexes.length > 1) {
    return {
      status: 'skipped',
      reason: 'skipped-ambiguous-aider-config',
      detail: 'multiple top-level read entries found; add CONVENTIONS.md manually',
    };
  }

  const readIndex = readIndexes[0];
  const readMatch = matchTopLevelAiderRead(lines[readIndex]);
  const readPrefix = readMatch[1];
  const value = stripYamlLineComment(readMatch[2]).trim();
  if (value === '') {
    return mergeAiderBlockList(lines, readIndex);
  }
  if (yamlScalarMatches(value, AIDER_READ_TARGET)) {
    return { status: 'unchanged' };
  }
  if (isYamlInlineList(value)) {
    return mergeAiderInlineList(lines, readIndex, value, readPrefix);
  }
  if (isSimpleYamlScalar(value)) {
    lines[readIndex] = `${readPrefix}[${value}, ${AIDER_READ_TARGET}]`;
    return { status: 'updated', content: ensureTrailingNewline(lines.join('\n')) };
  }

  return {
    status: 'skipped',
    reason: 'skipped-ambiguous-aider-config',
    detail: 'existing read entry is not in a safe-to-merge format; add CONVENTIONS.md manually',
  };
}

function appendAiderReadConfig(existing) {
  if (existing.length === 0) {
    return defaultAiderConfigContent();
  }
  const separator = existing.endsWith('\n') ? '' : '\n';
  return `${existing}${separator}${defaultAiderConfigContent()}`;
}

function hasTopLevelYamlFlowMapping(lines) {
  return lines.some(line => {
    if (/^\s/.test(line)) {
      return false;
    }
    const trimmed = stripYamlLineComment(line).trim();
    return trimmed.startsWith('{');
  });
}

function hasIndentedAiderRead(lines) {
  return lines.some(line => /^\s+(?:read|"read"|'read')\s*:/.test(line));
}

function stripYamlLineComment(value) {
  let quoted = null;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quoted) {
      if (char === quoted) {
        quoted = null;
      } else if (quoted === '"' && char === '\\') {
        index += 1;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quoted = char;
      continue;
    }
    if (char === '#' && (index === 0 || /\s/.test(value[index - 1]))) {
      return value.slice(0, index).trimEnd();
    }
  }
  return value;
}

function mergeAiderBlockList(lines, readIndex) {
  const end = findYamlBlockEnd(lines, readIndex);
  const blockLines = lines.slice(readIndex + 1, end);

  if (blockLines.some(line => yamlListItemMatches(line, AIDER_READ_TARGET))) {
    return { status: 'unchanged' };
  }
  if (blockLines.some(line => line.trim() && !line.trim().startsWith('#') && !/^\s*-\s+/.test(line))) {
    return {
      status: 'skipped',
      reason: 'skipped-ambiguous-aider-config',
      detail: 'existing read block is not a simple YAML list; add CONVENTIONS.md manually',
    };
  }

  const listIndents = new Set(
    blockLines
      .map(line => line.match(/^(\s*)-\s+/))
      .filter(Boolean)
      .map(match => match[1]),
  );
  if (listIndents.size > 1) {
    return {
      status: 'skipped',
      reason: 'skipped-ambiguous-aider-config',
      detail: 'existing read list uses mixed indentation; add CONVENTIONS.md manually',
    };
  }
  const listIndent = listIndents.size === 1 ? [...listIndents][0] : '  ';

  let insertAt = end;
  while (insertAt > readIndex + 1 && lines[insertAt - 1].trim() === '') {
    insertAt -= 1;
  }
  lines.splice(insertAt, 0, `${listIndent}- ${AIDER_READ_TARGET}`);
  return { status: 'updated', content: ensureTrailingNewline(lines.join('\n')) };
}

function matchTopLevelAiderRead(line) {
  return line.match(/^((?:read|"read"|'read')\s*:\s*)(.*)$/);
}

function mergeAiderInlineList(lines, readIndex, value, readPrefix) {
  const inner = value.slice(1, -1).trim();
  const items = inner.length === 0
    ? []
    : inner.split(',').map(item => item.trim()).filter(Boolean);

  if (items.some(item => yamlScalarMatches(item, AIDER_READ_TARGET))) {
    return { status: 'unchanged' };
  }
  if (!items.every(isSimpleYamlScalar)) {
    return {
      status: 'skipped',
      reason: 'skipped-ambiguous-aider-config',
      detail: 'existing read list is not in a safe-to-merge format; add CONVENTIONS.md manually',
    };
  }

  lines[readIndex] = `${readPrefix}[${[...items, AIDER_READ_TARGET].join(', ')}]`;
  return { status: 'updated', content: ensureTrailingNewline(lines.join('\n')) };
}

function findYamlBlockEnd(lines, start) {
  let index = start + 1;
  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#') || /^\s/.test(line) || trimmed.startsWith('- ')) {
      index += 1;
      continue;
    }
    break;
  }
  return index;
}

function yamlListItemMatches(line, expected) {
  const match = line.match(/^\s*-\s+(.+?)\s*(?:#.*)?$/);
  return Boolean(match && yamlScalarMatches(match[1], expected));
}

function yamlScalarMatches(value, expected) {
  return unquoteYamlScalar(value) === expected;
}

function isYamlInlineList(value) {
  return value.startsWith('[') && value.endsWith(']');
}

function isSimpleYamlScalar(value) {
  return /^[A-Za-z0-9._/-]+$/.test(unquoteYamlScalar(value));
}

function unquoteYamlScalar(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function mergeAdapterContent({
  existing,
  block,
  sourceRaw,
  sourceParts,
  adapter,
  repair,
  forceManagedBlock,
}) {
  const managed = findManagedBlock(existing);
  if (managed.multiple) {
    return {
      status: 'skipped',
      reason: 'skipped-ambiguous-managed-blocks',
      detail: 'multiple managed blocks found; manual review required',
    };
  }

  if (managed.block) {
    if (normalizeLineEndings(managed.block.raw) === block) {
      return { status: 'unchanged' };
    }

    const pristine = isManagedBlockPristine(managed.block.raw, adapter);
    if (!pristine && !forceManagedBlock) {
      return {
        status: 'skipped',
        reason: 'skipped-user-edited-managed-block',
        detail: 'managed block checksum changed; rerun with --force-managed-block to replace it',
      };
    }

    return {
      status: 'updated',
      content: replaceManagedBlock(existing, managed.block, block, adapter, sourceParts),
    };
  }

  if (
    hasLegacyScratchpadSection(existing)
    || isKnownLegacyAdapter(adapter, existing, sourceRaw, sourceParts.body)
  ) {
    if (repair && isKnownLegacyAdapter(adapter, existing, sourceRaw, sourceParts.body)) {
      return {
        status: 'updated',
        content: adapter.cursorMdc ? `${sourceParts.frontmatter}${block}` : block,
      };
    }

    return {
      status: 'skipped',
      reason: 'skipped-legacy-section',
      detail: repair
        ? 'legacy scratchpad section is not known-safe to convert; manual review required'
        : 'legacy scratchpad text exists; rerun with --repair only if it is generated text',
    };
  }

  return {
    status: 'updated',
    content: appendAdapterBlock(existing, block, adapter.cursorMdc),
  };
}

function findManagedBlock(content) {
  BEGIN_RE.lastIndex = 0;
  const matches = [...content.matchAll(BEGIN_RE)];
  if (matches.length === 0) {
    return {};
  }
  if (matches.length > 1) {
    return { multiple: true };
  }

  const match = matches[0];
  const start = match.index;
  const endMarkerIndex = content.indexOf(END_MARKER, start);
  if (endMarkerIndex === -1) {
    return { multiple: true };
  }

  let end = endMarkerIndex + END_MARKER.length;
  if (content.slice(end, end + 2) === '\r\n') {
    end += 2;
  } else if (content.slice(end, end + 1) === '\n') {
    end += 1;
  }

  return {
    block: {
      start,
      end,
      raw: content.slice(start, end),
    },
  };
}

function isManagedBlockPristine(rawBlock, adapter) {
  const normalized = normalizeLineEndings(rawBlock);
  const checksum = normalized.match(/<!-- Checksum: sha256:([a-f0-9]+) -->/);
  if (!checksum) {
    return false;
  }

  const payload = extractPayloadFromBlock(normalized);
  const frontmatterChecksum = extractCursorFrontmatterChecksum(normalized);
  if (frontmatterChecksum && !adapter.cursorMdc) {
    return false;
  }
  const currentChecksum = managedBlockChecksum(adapter, payload, frontmatterChecksum);
  const legacyManagedChecksum = managedBlockChecksum(adapter, payload);
  const legacyPayloadChecksum = sha256(payload);
  if (
    currentChecksum !== checksum[1]
    && legacyManagedChecksum !== checksum[1]
    && legacyPayloadChecksum !== checksum[1]
  ) {
    return false;
  }

  const lines = normalized.split('\n');
  if (!isSemverManagedBeginLine(lines[0])) {
    return false;
  }
  if (lines[1] !== `<!-- Source: ${adapter.source} -->`) {
    return false;
  }
  let metadataIndex = 2;
  if (lines[metadataIndex]?.startsWith('<!-- Frontmatter-Checksum: sha256:')) {
    if (lines[metadataIndex] !== `<!-- Frontmatter-Checksum: sha256:${frontmatterChecksum} -->`) {
      return false;
    }
    metadataIndex += 1;
  }
  return lines[metadataIndex] === `<!-- Checksum: sha256:${checksum[1]} -->`
    && lines[metadataIndex + 1] === MANAGED_BLOCK_NOTE;
}

function extractPayloadFromBlock(rawBlock) {
  const normalized = normalizeLineEndings(rawBlock);
  const withoutEnd = normalized.replace(new RegExp(`\\n?${escapeRegExp(END_MARKER)}\\n?$`), '');
  const firstBlank = withoutEnd.indexOf('\n\n');
  if (firstBlank === -1) {
    return '';
  }
  return normalizePayload(withoutEnd.slice(firstBlank + 2));
}

function hasLegacyScratchpadSection(content) {
  const normalized = normalizeLineEndings(content);
  const hasScratchpadPaths = LEGACY_SCRATCHPAD_PATHS.every(needle => normalized.includes(needle));
  return hasScratchpadPaths && normalized.includes(LEGACY_SKILL_SOURCE_MARKER);
}

function isKnownLegacyAdapter(adapter, existing, sourceRaw, sourceBody) {
  const existingNormalized = normalizeLineEndings(existing).trim();
  const candidates = [
    sourceRaw,
    sourceBody,
  ].map(value => normalizeLineEndings(value).trim());

  return candidates.includes(existingNormalized)
    || sha256(existingNormalized) === LEGACY_ADAPTER_SHA256[adapter.source];
}

function replaceManagedBlock(existing, managedBlock, block, adapter, sourceParts) {
  const updated = `${existing.slice(0, managedBlock.start)}${block}${existing.slice(managedBlock.end)}`;
  return replaceManagedCursorFrontmatter(updated, managedBlock, adapter, sourceParts);
}

function replaceManagedCursorFrontmatter(content, managedBlock, adapter, sourceParts) {
  if (!adapter.cursorMdc || !cursorFrontmatterCanBeManaged(content, managedBlock.start)) {
    return content;
  }
  const { frontmatter, body } = splitLeadingFrontmatter(content);
  if (normalizeLineEndings(frontmatter) === normalizeLineEndings(sourceParts.frontmatter)) {
    return content;
  }
  const expectedChecksum = extractCursorFrontmatterChecksum(managedBlock.raw);
  if (!expectedChecksum || cursorFrontmatterChecksum(frontmatter) !== expectedChecksum) {
    return content;
  }
  return `${sourceParts.frontmatter}${body}`;
}

function cursorFrontmatterCanBeManaged(content, managedBlockStart) {
  const { frontmatter } = splitLeadingFrontmatter(content);
  return managedBlockStart === 0 || managedBlockStart === frontmatter.length;
}

function extractCursorFrontmatterChecksum(rawBlock) {
  const match = normalizeLineEndings(rawBlock).match(/<!-- Frontmatter-Checksum: sha256:([a-f0-9]+) -->/);
  return match ? match[1] : null;
}

function cursorFrontmatterChecksum(frontmatter) {
  return sha256(normalizeLineEndings(frontmatter));
}

function appendAdapterBlock(existing, block, cursorMdc) {
  if (cursorMdc) {
    const { frontmatter, body } = splitLeadingFrontmatter(existing);
    if (frontmatter) {
      const beforeBody = body.length === 0 ? '' : body.startsWith('\n') || body.startsWith('\r\n') ? '' : '\n';
      return `${frontmatter}${block}${beforeBody}${body}`;
    }
  }

  if (existing.length === 0) {
    return block;
  }

  const separator = existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
  return `${existing}${separator}${block}`;
}

function buildManagedBlock(adapter, payload, sourceParts = { frontmatter: '' }) {
  const metadata = [
    `<!-- BEGIN Agent Scratchpad Kit v${version} -->`,
    `<!-- Source: ${adapter.source} -->`,
  ];
  const frontmatterChecksum = adapter.cursorMdc
    ? cursorFrontmatterChecksum(sourceParts.frontmatter)
    : null;
  if (frontmatterChecksum) {
    metadata.push(`<!-- Frontmatter-Checksum: sha256:${frontmatterChecksum} -->`);
  }
  metadata.push(
    `<!-- Checksum: sha256:${managedBlockChecksum(adapter, payload, frontmatterChecksum)} -->`,
    MANAGED_BLOCK_NOTE,
  );
  return [
    ...metadata,
    '',
    payload.trimEnd(),
    '',
    END_MARKER,
    '',
  ].join('\n');
}

function managedBlockChecksum(adapter, payload, frontmatterChecksum = null) {
  const parts = [
    `Source: ${adapter.source}`,
  ];
  if (frontmatterChecksum) {
    parts.push(`Frontmatter-Checksum: sha256:${frontmatterChecksum}`);
  }
  parts.push(MANAGED_BLOCK_NOTE, normalizePayload(payload));
  return sha256(parts.join('\n'));
}

function splitLeadingFrontmatter(content) {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    return { frontmatter: '', body: content };
  }

  const newline = content.startsWith('---\r\n') ? '\r\n' : '\n';
  const closing = `${newline}---${newline}`;
  const end = content.indexOf(closing, 3);
  if (end === -1) {
    return { frontmatter: '', body: content };
  }

  const frontmatterEnd = end + closing.length;
  return {
    frontmatter: content.slice(0, frontmatterEnd),
    body: content.slice(frontmatterEnd),
  };
}

function normalizePayload(value) {
  return `${normalizeLineEndings(value).trim()}\n`;
}

function normalizeLineEndings(value) {
  return value.replace(/\r\n/g, '\n');
}

function writeDesiredFile(run, relPath, desired, detail) {
  try {
    const destAbs = safePath(run, relPath);
    const exists = existsSync(destAbs);

    if (exists) {
      const stat = lstatSync(destAbs);
      if (!stat.isFile()) {
        throw new Error('target exists but is not a regular file');
      }

      const current = readFileSync(destAbs, 'utf8');
      if (current === desired) {
        record(run, 'unchanged', relPath, detail);
        return true;
      }

      backupExistingFile(run, relPath, destAbs);
      if (run.options.dryRun) {
        record(run, 'would-update', relPath, detail);
        return true;
      }

      ensureParentDirectory(run, destAbs);
      writeFileSync(destAbs, desired, 'utf8');
      record(run, 'updated', relPath, detail);
      return true;
    }

    if (run.options.dryRun) {
      record(run, 'would-create', relPath, detail);
      return true;
    }

    ensureParentDirectory(run, destAbs);
    writeFileSync(destAbs, desired, 'utf8');
    record(run, 'created', relPath, detail);
    return true;
  } catch (error) {
    fail(run, relPath, error);
    return false;
  }
}

function backupExistingFile(run, relPath, destAbs) {
  const backupRel = uniqueBackupPath(run, relPath);
  const backupAbs = safePath(run, backupRel);

  if (run.options.dryRun) {
    record(run, 'would-backup', relPath, `to ${backupRel}`);
    return;
  }

  ensureParentDirectory(run, backupAbs);
  copyFileSync(destAbs, backupAbs);
  run.backups.push(backupRel);
  record(run, 'backed-up', relPath, `to ${backupRel}`);
}

function uniqueBackupPath(run, relPath) {
  let candidate = `.agent/backups/${run.backupStamp}/${relPath}`;
  let index = 1;
  while (existsSync(safePath(run, candidate))) {
    candidate = `.agent/backups/${run.backupStamp}-${index}/${relPath}`;
    index += 1;
  }
  return candidate;
}

function ensureParentDirectory(run, filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    const relDir = normalizeRelPath(relative(run.targetRootReal, dir));
    record(run, 'created-directory', relDir, '');
  }
}

function safePath(run, relPath) {
  const normalized = normalizeRelPath(relPath);
  if (normalized.startsWith('../') || normalized === '..') {
    throw new Error(`unsafe relative path: ${relPath}`);
  }

  const destAbs = resolve(run.targetRootReal, normalized);
  const relFromRoot = relative(run.targetRootReal, destAbs);
  if (
    relFromRoot === '..'
    || relFromRoot.startsWith(`..${sep}`)
    || relFromRoot.length === 0 && normalized !== '.'
  ) {
    throw new Error(`path escapes target root: ${relPath}`);
  }

  assertNoSymlinkInPath(run.targetRootReal, destAbs);
  return destAbs;
}

function assertNoSymlinkInPath(root, destAbs) {
  const rel = relative(root, destAbs);
  if (!rel || rel === '.') {
    return;
  }

  const parts = rel.split(sep);
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    if (!existsSync(current)) {
      continue;
    }
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Error(`refusing to write through symlink: ${normalizeRelPath(relative(root, current))}`);
    }
  }
}

function record(run, status, path, detail) {
  run.results.push({ status, path, detail });
}

function fail(run, path, error) {
  const detail = error instanceof Error ? error.message : String(error);
  run.failures.push({ path, detail });
  record(run, 'failed', path, detail);
}

function manualAction(run, path, reason, detail) {
  run.manualActions.push({ path, reason, detail });
  record(run, 'manual-action-required', path, `${reason}: ${detail}`);
}

function finish(run) {
  printSummary(run);
  if (run.failures.length > 0 || run.manualActions.length > 0) {
    process.exitCode = 1;
  }
}

function printSummary(run) {
  const title = run.failures.length === 0 && run.manualActions.length === 0
    ? 'Agent Scratchpad Kit - init complete'
    : 'Agent Scratchpad Kit - init incomplete';

  console.log(`\n${title}\n`);
  console.log(`Version: ${version}`);
  console.log(`Target: ${run.targetRoot}`);
  console.log(`Adapters: ${run.options.noAdapters ? 'none' : run.selectedAdapters.map(adapter => adapter.name).join(', ')}`);
  console.log(`Mode: ${run.options.dryRun ? 'dry-run' : 'write'}${run.options.repair ? ', repair' : ''}${run.options.forceManagedBlock ? ', force-managed-block' : ''}\n`);

  console.log('Summary:');
  for (const result of run.results) {
    const detail = result.detail ? ` - ${result.detail}` : '';
    console.log(`  ${result.status}: ${result.path}${detail}`);
  }
  if (run.results.length === 0) {
    console.log('  unchanged: no actions needed');
  }

  if (run.backups.length > 0) {
    console.log('\nBackups:');
    for (const backup of run.backups) {
      console.log(`  ${backup}`);
    }
  }

  if (run.failures.length > 0) {
    console.log('\nFailures:');
    for (const failure of run.failures) {
      console.log(`  ${failure.path}: ${failure.detail}`);
    }
  }

  if (run.manualActions.length > 0) {
    console.log('\nManual action required:');
    for (const item of run.manualActions) {
      console.log(`  ${item.path}: ${item.reason} - ${item.detail}`);
    }
  }

  if (run.failures.length > 0 || run.manualActions.length > 0) {
    console.log('\nRecovery: inspect any backups under .agent/backups/ before retrying.');
    return;
  }

  console.log('\nNext steps:');
  console.log('  1. Commit .gitignore, .agent/README.md, .agent/SCRATCHPAD.template.md, .agent/VERSION, selected adapter files, and selected adapter support files if this setup should persist for collaborators or fresh clones.');
  console.log('  2. Keep .agent/SCRATCHPAD.local.md and .agent/backups/ ignored.');
  console.log('  3. Put custom agent guidance outside managed Agent Scratchpad Kit blocks.');
}

function printUsage() {
  console.log(`
Usage:
  node installers/init.mjs [target-repo-path] [options]

Options:
  --agent all|codex,claude,copilot,gemini,cursor,aider
      Install selected adapter files. Defaults to all supported adapters.
  --no-adapters
      Install only the .agent scaffold and ignore rules.
  --dry-run
      Print planned actions without writing files.
  --repair
      Fill missing pieces, preserve edited scaffold files, and convert only known-safe legacy generated sections.
  --force-managed-block
      Replace user-edited managed blocks after manual review.
  --version
      Print the Agent Scratchpad Kit version.
  --help
      Show this help.
`);
}

function readKitVersion() {
  const versionPath = join(kitRoot, 'VERSION');
  if (existsSync(versionPath)) {
    return readFileSync(versionPath, 'utf8').trim();
  }
  return '0.0.0';
}

function isGeneratedVersionContent(value) {
  return isSemver(value.trim());
}

function isSemverManagedBeginLine(value) {
  const match = value.match(/^<!-- BEGIN Agent Scratchpad Kit v([^ >]+) -->$/);
  return Boolean(match && isSemver(match[1]));
}

function isSemver(value) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
}

function ensureTrailingNewline(value) {
  return value.endsWith('\n') ? value : `${value}\n`;
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function timestampForPath(date) {
  const pad = value => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
    '-',
    String(date.getMilliseconds()).padStart(3, '0'),
    '-p',
    process.pid,
  ].join('');
}

function normalizeRelPath(value) {
  return value.split(/[\\/]+/).filter(Boolean).join('/');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
