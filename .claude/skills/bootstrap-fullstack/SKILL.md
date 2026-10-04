---
name: bootstrap-fullstack
description: Use when creating a new full-stack project from an empty folder, rebuilding this stack for a new application, or when setup of the Spring Boot plus React monorepo is taking long or needs repeated manual fixes
---

# Bootstrap full-stack

The procedure lives in `docs/guides/setup-playbook.md`. This skill only enforces how to follow it, so the two cannot drift.

**REQUIRED SUB-SKILL:** run `preflight` first.

## How to run it

1. Read "Decide first" in the playbook. Ask the user only for answers they have not already given, in one message.
2. Do phases 2 to 8 in order. After each phase run its **gate** and show the actual output.
3. A red gate stops the run: check `docs/guides/pitfalls.md` for the symptom, fix, re-run the gate.
4. Replace names, package and ports from the decisions; verify versions with the playbook's registry commands.
5. Before calling hooks done, plant one defect per hook and see it fail (playbook phase 7).

## Rules

- Do not commit or push unless the user asks. Never add an AI co-author trailer.
- Do not say a gate passed unless you ran it in this session.
- Stage files before `npm run check`; hooks ignore untracked files.
- A guard test that could create a commit must undo it on success.
