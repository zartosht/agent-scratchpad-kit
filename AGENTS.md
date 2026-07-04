# Agent Scratchpad Kit Contributor Guidance

This file is guidance for contributors working in the `agent-scratchpad-kit` repository. It is not the Codex adapter installed into user repositories. The distributable Codex adapter template lives at `adapters/AGENTS.md`.

## Source Of Truth

- `VERSION` is the canonical kit version.
- `skills/agent-scratchpad/SKILL.md` is the canonical skill content.
- `skills/agent-scratchpad/references/` contains canonical skill references.
- `adapters/` contains canonical adapter templates.
- `installers/` contains canonical installer scripts.
- `examples/` contains canonical examples.
- `codex-plugin/` and `claude-plugin/` contain generated package copies and plugin manifests.

Do not hand-edit generated copies under `codex-plugin/skills/`, `codex-plugin/adapters/`, `codex-plugin/installers/`, `codex-plugin/examples/`, `codex-plugin/VERSION`, `codex-plugin/.codex-plugin/plugin.json`, `claude-plugin/skills/`, `claude-plugin/adapters/`, `claude-plugin/installers/`, `claude-plugin/examples/`, `claude-plugin/VERSION`, or `claude-plugin/.claude-plugin/plugin.json`. Edit the canonical source, then run:

```bash
npm run sync
```

## Scratchpad Files

This repository dogfoods Agent Scratchpad:

- Track `.agent/README.md`.
- Track `.agent/SCRATCHPAD.template.md`.
- Track `.agent/VERSION`.
- Keep `.agent/SCRATCHPAD.local.md` ignored.
- Keep `.agent/backups/` ignored.
- Keep `PLAN.md` ignored.

Use `.agent/SCRATCHPAD.local.md` for live task notes, but never commit it.

## Installer Rules

- Direct installer use defaults to all supported adapters.
- Narrow installs use `--agent <name>` or `--no-adapters`.
- Managed `BEGIN/END Agent Scratchpad Kit` blocks are generated output. Do not edit inside them by hand; put project-specific guidance before or after the block.
- `--repair` must not erase user-edited managed blocks. Replacing those requires `--force-managed-block`.
- Backups belong under `.agent/backups/`, never beside the modified file.

## Review Discipline

When reviewing installer, sync, packaging, or adapter changes, do not stop at happy paths. Include adversarial checks for valid existing repository states that should keep working:

- Existing instruction files with project-specific prose that merely mentions Agent Scratchpad terms must still allow safe managed-block append unless they are known generated legacy adapter text.
- Tests that inspect Markdown, YAML, or generated metadata must tolerate CRLF line endings when the behavior should be platform-independent.
- Existing config files must be tested in absent, already-correct, simple-merge, and ambiguous/manual-action forms.
- Generated copies must be checked from canonical source, but generated-copy drift passing is not evidence that canonical behavior is correct.
- For every broad substring, regex, or heuristic, add at least one harmless false-positive fixture and one real-positive fixture.

## Validation

Before release or handoff, run:

```bash
npm run check
```

This checks installer syntax, package sync drift, installer behavior, version consistency, and packaging safety.

## Release Workflow

1. Choose the next SemVer version and update `VERSION`.
2. Run `npm run sync`.
3. Update `CHANGELOG.md`.
4. Run `npm run check`.
5. Confirm `.agent/SCRATCHPAD.local.md`, `.agent/backups/`, and `PLAN.md` are not tracked.
6. Confirm stable marketplace refs in the release commit point at the intended release tag, for example `v0.2.0`.
7. Commit the release changes.
8. Create and push the release tag on that commit.
9. Verify the tag exists remotely before relying on marketplace install, for example `git ls-remote --tags origin v0.2.0`.
10. Use release tags for stable marketplace refs. Use `main` only for a documented latest/dev channel.
