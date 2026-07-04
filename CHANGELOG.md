# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-07-04

### Added

- Adapter installation defaults to all supported agents during explicit bootstrap and direct CLI installs.
- Managed adapter blocks with version and checksum metadata.
- Safe merge behavior for existing instruction files, including backups under `.agent/backups/`.
- `--agent`, `--no-adapters`, `--dry-run`, `--repair`, `--force-managed-block`, and `--version` installer options.
- `.agent/VERSION` scaffold file.
- Canonical `VERSION` source, package metadata, sync script, validation scripts, and CI workflow.
- Multi-agent installed example.
- Root `AGENTS.md` contributor guidance for this repository.

### Changed

- Skill instructions now separate installed workflow, bootstrap, and repair modes.
- Plugin packages are generated from canonical sources instead of being manually duplicated.
- Documentation now states supported-agent discovery limits and commit requirements for tracked scaffold and adapter files.

### Security

- Existing instruction files are backed up before modification.
- User-edited managed blocks require `--force-managed-block` before replacement.
- Local scratchpads and backups remain ignored by git.

## [0.1.0] - 2026-07-03

### Added

- Initial release of Agent Scratchpad Kit.
- Core skill: `skills/agent-scratchpad/SKILL.md`.
- Scratchpad template: `skills/agent-scratchpad/references/SCRATCHPAD.template.md`.
- Codex plugin under `codex-plugin/`.
- Claude Code plugin under `claude-plugin/`.
- Codex marketplace entry: `.agents/plugins/marketplace.json`.
- Adapters for Codex, Claude Code, GitHub Copilot, Gemini CLI, Cursor, and Aider.
- Node installer script: `installers/init.mjs`.
- Minimal example: `examples/minimal/`.
