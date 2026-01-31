# SHIELD 2.0 Agent Skills

This directory contains Agent Skills for GitHub Copilot (and compatible AI agents like Claude Code).

## What are Agent Skills?

Agent Skills are folders containing instructions that AI agents automatically load when relevant to your task. They help the AI understand project-specific patterns, conventions, and best practices.

## Available Skills

| Skill                                                         | Description                              |
| ------------------------------------------------------------- | ---------------------------------------- |
| [shield-development](./shield-development/SKILL.md)           | Core coding guidelines and architecture  |
| [shield-testing](./shield-testing/SKILL.md)                   | Testing requirements and CI/CD checklist |
| [shield-git-workflow](./shield-git-workflow/SKILL.md)         | Branch strategy and commit conventions   |
| [shield-electron](./shield-electron/SKILL.md)                 | Electron/IPC patterns                    |
| [shield-llama-cpp](./shield-llama-cpp/SKILL.md)               | node-llama-cpp integration               |
| [shield-react-components](./shield-react-components/SKILL.md) | React and shadcn/ui patterns             |
| [shield-mcp](./shield-mcp/SKILL.md)                           | MCP tool integration                     |

## How Skills Work

When you ask Copilot (or another compatible agent) to help with a task, it automatically:

1. Reads the skill descriptions
2. Loads relevant skills based on your prompt
3. Follows the instructions in those skills

For example, asking "help me write a test" would load `shield-testing`, while "create a new IPC handler" would load `shield-electron`.

## Compatibility

These skills work with:

- ✅ GitHub Copilot (agent mode, coding agent, CLI)
- ✅ Claude Code (`.claude/skills` symlink supported)
- ✅ Other MCP-compatible AI agents

## Adding New Skills

1. Create a new directory: `.github/skills/skill-name/`
2. Add a `SKILL.md` file with YAML frontmatter:

```markdown
---
name: skill-name
description: When to use this skill and what it does
---

# Skill Title

Instructions for the AI to follow...
```

## Learn More

- [GitHub Docs: About Agent Skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)
- [Anthropic Skills Repository](https://github.com/anthropics/skills)
- [Agent Skills Specification](https://agentskills.io/)
