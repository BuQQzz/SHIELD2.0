# SHIELD Documentation

SHIELD is a privacy-first, local AI assistant. Start with [HANDOFF.md](./HANDOFF.md) for where things stand.

## Current state and design

| Document                                                                                         | What it is                                             |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| [HANDOFF.md](./HANDOFF.md)                                                                       | Session handoff: current state, open todos, read first |
| [SHIELD_AGENT_ARCHITECTURE.md](./SHIELD_AGENT_ARCHITECTURE.md)                                   | Agent harness design, decision log, priorities         |
| [SHIELD_OPTIMIZATION_TOOLING_CONTEXT_DESIGN.md](./SHIELD_OPTIMIZATION_TOOLING_CONTEXT_DESIGN.md) | Optimization, tooling and context architecture         |
| [testing/AGENT_BENCHMARK.md](./testing/AGENT_BENCHMARK.md)                                       | The agent benchmark (`npm run bench:agent`)            |

## Guides

| Document                                                           | What it is                         |
| ------------------------------------------------------------------ | ---------------------------------- |
| [QUICK-START.md](./QUICK-START.md)                                 | Getting SHIELD running             |
| [FEATURES.md](./FEATURES.md)                                       | Feature overview                   |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)                         | Common issues                      |
| [CONTRIBUTING.md](./CONTRIBUTING.md)                               | Contribution guidelines            |
| [DEVELOPMENT.md](./DEVELOPMENT.md)                                 | Development environment variables  |
| [TESTING.md](./TESTING.md)                                         | Testing guide                      |
| [WINDOWS_BUILD.md](./WINDOWS_BUILD.md)                             | Building for Windows               |
| [REVIEW_AUTOMATION.md](./REVIEW_AUTOMATION.md)                     | PR review automation               |
| [LLM-INTEGRATION.md](./LLM-INTEGRATION.md)                         | llama.cpp integration              |
| [mcp-integration.md](./mcp-integration.md)                         | Model Context Protocol integration |
| [features/MODEL_CAPABILITIES.md](./features/MODEL_CAPABILITIES.md) | Model capability detection         |
| [features/MODEL_DOWNLOAD.md](./features/MODEL_DOWNLOAD.md)         | Model downloads                    |

## Archive

[archive/](./archive/) holds finished plans, research write-ups and docs that describe earlier versions of SHIELD: the roadmap, the model-library and permission-mode plans, the prompt, runtime-speed, Unreal and Qwen-Agent research, and the 2025 feature write-ups. They are kept for history; the design docs above link to them where a decision came from one.

Release notes for 0.1.2–0.1.4 are in [releases/](./releases/); the [changelog](../CHANGELOG.md) covers every version.
