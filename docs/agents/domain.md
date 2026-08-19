# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root — it points at one `CONTEXT.md` per context:
  - `core/CONTEXT.md` — the knowledge engine + account domain (Ziru API, worker, shared library)
  - `webui/CONTEXT.md` — the WebUI workspace/chat domain
- **`core/docs/adr/`** — architecture decision records for the core system. Read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill creates them lazily when terms or decisions actually get resolved.

## File structure

This is a multi-context repo (the root `CONTEXT-MAP.md` exists):

```
/
├── CONTEXT-MAP.md
├── docs/agents/            ← skill configuration (this file)
└── core/
    ├── CONTEXT.md          ← knowledge/account domain glossary
    ├── AGENTS.md           ← core repo instructions
    └── docs/adr/           ← system-wide decisions
└── webui/
    ├── CONTEXT.md          ← webui domain glossary
    ├── AGENTS.md           ← webui repo instructions
    └── CLAUDE.md           ← alias of webui/AGENTS.md
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the relevant `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0003 (keep retrieval workflow policy explicit) — but worth reopening because…_
