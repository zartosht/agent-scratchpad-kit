# Claude Code Instructions

This repository uses the **Agent Scratchpad** workflow for durable working memory.

## Scratchpad convention

Before starting any complex task (multi-step coding, refactoring, debugging, migration, or investigation):

1. Check if `.agent/SCRATCHPAD.local.md` exists. If not, copy `.agent/SCRATCHPAD.template.md` to `.agent/SCRATCHPAD.local.md`.
2. Read the scratchpad to restore context from previous sessions.
3. Update the scratchpad continuously as you work — record your objective, plan, decisions, files inspected/changed, commands run, and next steps.
4. Fill in the **Handoff notes** section before ending a session.

`.agent/SCRATCHPAD.local.md` is git-ignored. Never commit it. Never write secrets or credentials into the scratchpad.

See `.agent/README.md` for full instructions and `.agent/SCRATCHPAD.template.md` for the template.

> Skill source: [Agent Scratchpad Kit](https://github.com/zartosht/agent-scratchpad-kit)
