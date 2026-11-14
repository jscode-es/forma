# .claude

Shared Claude Code configuration for contributors.

- `settings.json` safe default permissions
- `agents/` subagents (security review of `electron/`, feature builder)
- `skills/` repeatable procedures (Kivora UI, IPC channels, new features)
- `reference/` background knowledge for any AI agent (also referenced from `AGENTS.md`, so Codex and others can read it)

Personal overrides go in `.claude/settings.local.json` (git-ignored).

## GitHub MCP

`../.mcp.json` connects Claude Code to GitHub's remote MCP server (Codex: `../.codex/config.toml`). Set `GITHUB_PERSONAL_ACCESS_TOKEN` in your shell environment (see `.env.example`) before starting the agent. Never commit the token.
