# SHIELD Documentation

Welcome to the SHIELD documentation! This directory contains comprehensive guides, technical documentation, and project resources for SHIELD - a privacy-first, local AI assistant for Windows.

## 📚 Documentation Structure

### Core Documentation

| Document                             | Description                             |
| ------------------------------------ | --------------------------------------- |
| [ROADMAP.md](./ROADMAP.md)           | Project roadmap with development phases |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Guidelines for contributors             |
| [QUICK-START.md](./QUICK-START.md)   | Quick start guide for new users         |
| [FEATURES.md](./FEATURES.md)         | Overview of all SHIELD features         |

### Development Guides

| Document                                       | Description                         |
| ---------------------------------------------- | ----------------------------------- |
| [DEVELOPMENT.md](./DEVELOPMENT.md)             | Development setup and workflow      |
| [TESTING.md](./TESTING.md)                     | Testing guidelines and practices    |
| [WINDOWS_BUILD.md](./WINDOWS_BUILD.md)         | Windows-specific build instructions |
| [REVIEW_AUTOMATION.md](./REVIEW_AUTOMATION.md) | PR review automation system         |

### Technical Documentation

| Document                                   | Description                        |
| ------------------------------------------ | ---------------------------------- |
| [COMPONENT-API.md](./COMPONENT-API.md)     | Component API reference            |
| [LLM-INTEGRATION.md](./LLM-INTEGRATION.md) | llama.cpp integration guide        |
| [mcp-integration.md](./mcp-integration.md) | Model Context Protocol integration |
| [PERFORMANCE.md](./PERFORMANCE.md)         | Performance optimization guide     |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Common issues and solutions        |

### AI & Memory

| Document                                   | Description                  |
| ------------------------------------------ | ---------------------------- |
| [AI_MEMORY_SETUP.md](./AI_MEMORY_SETUP.md) | OpenMemory integration setup |

### Feature Documentation

All feature-specific documentation is in the [features/](./features/) directory:

| Feature                                                                   | Description                               |
| ------------------------------------------------------------------------- | ----------------------------------------- |
| [EXPORT_IMPORT.md](./features/EXPORT_IMPORT.md)                           | Conversation export/import                |
| [GPU_LAYER_OFFLOADING.md](./features/GPU_LAYER_OFFLOADING.md)             | GPU acceleration settings                 |
| [HELP_PAGE.md](./features/HELP_PAGE.md)                                   | Built-in help page                        |
| [MODEL_CAPABILITIES.md](./features/MODEL_CAPABILITIES.md)                 | Dynamic model feature detection           |
| [MODEL_DOWNLOAD.md](./features/MODEL_DOWNLOAD.md)                         | Model downloading & HuggingFace auth      |
| [SPECULATIVE_DECODING.md](./features/SPECULATIVE_DECODING.md)             | Speculative decoding for faster inference |
| [SYSTEM_PROMPT_IMPROVEMENTS.md](./features/SYSTEM_PROMPT_IMPROVEMENTS.md) | System prompt customization               |
| [TAGGING.md](./features/TAGGING.md)                                       | Conversation tagging system               |
| [THINKING_ANIMATION.md](./features/THINKING_ANIMATION.md)                 | AI thinking animations                    |
| [WEB_SEARCH.md](./features/WEB_SEARCH.md)                                 | Web search feature design                 |
| [WEB_SEARCH_IMPLEMENTATION.md](./features/WEB_SEARCH_IMPLEMENTATION.md)   | Web search implementation details         |

### Testing

| Document                                                               | Description                   |
| ---------------------------------------------------------------------- | ----------------------------- |
| [testing/MCP-MANUAL-TEST-GUIDE.md](./testing/MCP-MANUAL-TEST-GUIDE.md) | MCP manual testing procedures |

### Milestones

| Document                                             | Description       |
| ---------------------------------------------------- | ----------------- |
| [milestones/M1-ChatUI.md](./milestones/M1-ChatUI.md) | Chat UI milestone |

## 🎯 Quick Links

### For New Users

1. [QUICK-START.md](./QUICK-START.md) - Get SHIELD running
2. [FEATURES.md](./FEATURES.md) - Learn what SHIELD can do
3. [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - If you have issues

### For Contributors

1. [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines
2. [DEVELOPMENT.md](./DEVELOPMENT.md) - Development setup
3. [TESTING.md](./TESTING.md) - Testing requirements
4. [ROADMAP.md](./ROADMAP.md) - Project direction

### For Developers

1. [COMPONENT-API.md](./COMPONENT-API.md) - Component APIs
2. [LLM-INTEGRATION.md](./LLM-INTEGRATION.md) - LLM integration
3. [mcp-integration.md](./mcp-integration.md) - MCP/tool calling
4. [PERFORMANCE.md](./PERFORMANCE.md) - Performance optimization

## 🏗️ Project Structure

```
docs/
├── README.md                 # This file
├── ROADMAP.md               # Project roadmap
├── CONTRIBUTING.md          # Contribution guidelines
├── QUICK-START.md           # Getting started
├── FEATURES.md              # Feature overview
├── DEVELOPMENT.md           # Dev setup
├── TESTING.md               # Testing guide
├── WINDOWS_BUILD.md         # Windows build guide
├── REVIEW_AUTOMATION.md     # PR automation
├── COMPONENT-API.md         # Component reference
├── LLM-INTEGRATION.md       # LLM integration
├── mcp-integration.md       # MCP integration
├── PERFORMANCE.md           # Performance guide
├── TROUBLESHOOTING.md       # Issue resolution
├── AI_MEMORY_SETUP.md       # AI memory setup
├── features/                # Feature-specific docs
│   ├── EXPORT_IMPORT.md
│   ├── GPU_LAYER_OFFLOADING.md
│   ├── HELP_PAGE.md
│   ├── MODEL_CAPABILITIES.md
│   ├── MODEL_DOWNLOAD.md
│   ├── SPECULATIVE_DECODING.md
│   ├── SYSTEM_PROMPT_IMPROVEMENTS.md
│   ├── TAGGING.md
│   ├── THINKING_ANIMATION.md
│   ├── WEB_SEARCH.md
│   └── WEB_SEARCH_IMPLEMENTATION.md
├── testing/                 # Testing docs
│   └── MCP-MANUAL-TEST-GUIDE.md
└── milestones/              # Milestone tracking
    └── M1-ChatUI.md
```

## 🔗 External Resources

- **Main README**: [../README.md](../README.md) - Project overview and setup
- **Changelog**: [../CHANGELOG.md](../CHANGELOG.md) - Version history
- **AI Memory**: [../AI-MEMORY-README.md](../AI-MEMORY-README.md) - OpenMemory integration

## 📝 Documentation Guidelines

When contributing to documentation:

1. **Keep it clean** - Remove outdated content promptly
2. **Stay current** - Update docs when code changes
3. **Be concise** - Clear, scannable writing
4. **Include examples** - Practical code samples
5. **Follow structure** - Use existing patterns

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

---

**Last Updated**: January 2025  
**Version**: 0.1.4  
**Status**: Active Development
