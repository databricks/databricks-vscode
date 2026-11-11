# Agent skills

The skills here are shared by Codex and Claude Code. Codex reads them from
`.agents/skills/`; Claude Code reads `.claude/skills/`, where each entry is a
relative symlink back to this directory.

- Each skill is a folder with a `SKILL.md`. Its frontmatter has only `name`
  and `description`, so both tools accept it.
- Every skill needs a matching symlink:
  `ln -s ../../.agents/skills/<name> .claude/skills/<name>`. Commit the
  symlink, not a copy.
