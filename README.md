# Agent Scratchpad Kit

**Durable working memory for coding agents.**

Agent Scratchpad is an open-source, repo-local scratchpad workflow that gives coding agents a structured place to record task state, plans, decisions, progress, and handoff notes—without losing context mid-task.

Works with Codex, Claude Code, GitHub Copilot, Gemini CLI, Cursor, Aider, and any agent that can read Markdown instructions.

---

## Why agents need durable scratchpads

Modern coding agents lose state between turns, context windows, and sessions. Without a scratchpad:

- Plans evaporate when context is compacted.
- Handoffs between sessions or agents require re-discovery.
- Debugging trails disappear, causing repeated work.
- Long refactors or migrations stall because the agent "forgot" what it was doing.

A durable, repo-local scratchpad solves this by giving the agent a stable file it can read and write throughout a task.

---

## Quick install

### Codex

Add this repository as a Codex plugin marketplace source:

```bash
codex plugin marketplace add zartosht/agent-scratchpad-kit
```

Then open Codex, run `/plugins`, choose **Agent Scratchpad Kit**, and install `agent-scratchpad`.

### Claude Code

For local testing:

```bash
claude --plugin-dir ./claude-plugin
```

For marketplace install, add the marketplace and install the plugin:

```bash
/plugin marketplace add zartosht/agent-scratchpad-kit
/plugin install agent-scratchpad@agent-scratchpad-kit
```

### Manual install

```bash
node installers/init.mjs [target-repo-path]
```

This copies `.agent/README.md` and `.agent/SCRATCHPAD.template.md` into your target repo and adds `.agent/SCRATCHPAD.local.md` to `.gitignore`.

---

## Adapter matrix

| Agent | Adapter file | How to use |
|---|---|---|
| Codex | `adapters/AGENTS.md` | Copy to `AGENTS.md` in your repo root |
| Claude Code | `adapters/CLAUDE.md` | Copy to `CLAUDE.md` in your repo root |
| GitHub Copilot | `adapters/copilot-instructions.md` | Copy to `.github/copilot-instructions.md` |
| Gemini CLI | `adapters/GEMINI.md` | Copy to `GEMINI.md` in your repo root |
| Cursor | `adapters/cursor-rule.mdc` | Copy to `.cursor/rules/agent-scratchpad.mdc` |
| Aider | `adapters/CONVENTIONS.md` | Copy to `CONVENTIONS.md` in your repo root |

Each adapter is a short Markdown snippet that instructs the respective agent to use the scratchpad workflow.

---

## How it works

1. The agent reads `.agent/README.md` at the start of a task to understand the scratchpad convention.
2. The agent copies `.agent/SCRATCHPAD.template.md` to `.agent/SCRATCHPAD.local.md` and fills it in.
3. `.agent/SCRATCHPAD.local.md` is git-ignored (local only), so it never pollutes the repo.
4. `.agent/README.md` and `.agent/SCRATCHPAD.template.md` are committed and tracked.

---

## Security & privacy

- **Never write secrets, credentials, tokens, API keys, or personal data into the scratchpad.**
- Summarize command output instead of dumping raw logs.
- The local scratchpad (`.agent/SCRATCHPAD.local.md`) is git-ignored by design.
- Review `.gitignore` to confirm the ignore rule is present before committing.

---

## Validation

Verify the installer and plugin before contributing or publishing:

```bash
# Check installer syntax
node --check installers/init.mjs

# Run installer against a temp directory
node installers/init.mjs /tmp/agent-scratchpad-test

# Validate the Claude plugin
claude plugin validate ./claude-plugin
```

---

## Contributing

1. Fork the repo.
2. Create a branch: `git checkout -b feat/your-feature`.
3. Make your changes. Keep files small and readable.
4. Open a pull request against `main`.

Please keep adapter files short. Each adapter should point agents to the same core workflow without duplicating the skill content.

---

## Roadmap

- [ ] VS Code extension to bootstrap scratchpads
- [ ] GitHub Action to auto-archive scratchpads on PR close
- [ ] More agent adapters (Devin, SWE-agent, etc.)
- [ ] Schema validation for `SCRATCHPAD.template.md`
- [ ] CLI tool (`npx agent-scratchpad init`)

