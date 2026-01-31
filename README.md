# SHIELD 🛡️

![GitHub Downloads](https://img.shields.io/github/downloads/BuQQzz/SHIELD2.0-releases/total?style=flat-square&logo=github&label=Downloads&color=blue)
![GitHub Release](https://img.shields.io/github/v/release/BuQQzz/SHIELD2.0-releases?style=flat-square&logo=github&label=Latest%20Release&color=green)
![License](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)

Privacy-first local AI chatbot for Windows. All processing happens locally - no external APIs, no data leaving your machine.

> **🧠 AI Memory System**: This project uses [OpenMemory](https://github.com/CaviraOSS/OpenMemory) to give GitHub Copilot persistent memory during development. See [AI-MEMORY-README.md](./AI-MEMORY-README.md) for details.

## What It Is

Local AI assistant powered by llama.cpp with:

- **Local inference** - Everything runs on your Windows machine
- **Thinking animation** - See AI's reasoning process with collapsible chain-of-thought display
- **GPU layer offloading** - Run large models (32B+) on limited VRAM by automatically splitting layers between VRAM and RAM
- **File operations** - Read/write files via MCP with explicit permission dialogs
- **Web search** - DuckDuckGo integration with local encrypted caching
- **Chain-of-Thought reasoning** - Transparent AI analysis before answering
- **Context-aware queries** - Smart follow-up handling with conversation context
- **Modern UI** - React + shadcn/ui with smooth animations

**Status**: Experimental - Active Development

See [docs/ROADMAP.md](docs/ROADMAP.md) for detailed development progress and plans.

## Quick Start

### Prerequisites

- Windows 10/11
- Node.js 18+
- 16GB+ RAM (32GB optimal)
- NVIDIA GPU with 12GB+ VRAM recommended (RTX 4070 or better)

### ⚠️ Windows SmartScreen Warning

When running SHIELD for the first time, Windows SmartScreen will show a security warning:

**"Microsoft Defender SmartScreen couldn't verify if this file is safe..."**

This happens because SHIELD is **not yet code-signed** with a digital certificate. The application is completely safe and open-source - you can verify the code yourself in this repository.

**To run SHIELD:**

1. Click **"More info"** in the SmartScreen dialog
2. Click **"Run anyway"** at the bottom
3. SHIELD will launch normally

This warning appears for all unsigned applications. Code signing certificates cost $100-400/year, which we'll implement in a future release as the project grows.

### Installation

```powershell
git clone https://github.com/BuQQzz/SHIELD2.0.git
cd SHIELD2.0
npm install
npm run download-model qwen-7b  # Downloads ~4.4GB
npm run dev:electron
```

First launch downloads the model (~4.4GB) and loads it automatically.

## Tech Stack

- **Frontend**: React 19, TypeScript, shadcn/ui, Tailwind CSS 4, Vite 7
- **Backend**: Electron 39, Node.js 20, llama.cpp (node-llama-cpp)
- **AI Models**: GGUF format (Q4_K_M quantization)
- **Web Search**: Playwright + DuckDuckGo
- **Storage**: sqlite3, AES-256-GCM encryption

## Windows Build

Build distributable Windows installers:

```powershell
npm run build:win:installer  # NSIS installer (~310 MB)
npm run build:win:portable   # Portable executable
```

Output: `release/{version}/SHIELD-{version}-x64.exe`

**Note**: Models are not bundled - users download via in-app model manager.

See [docs/WINDOWS_BUILD.md](docs/WINDOWS_BUILD.md) for detailed build documentation.

## Development

```powershell
npm run dev:electron  # Run app
npm test              # Run tests
npm run lint          # Lint code
npm run build         # Production build
```

**Code Guidelines**:

- Files <300 lines (refactor when approaching limit)
- Feature branch workflow (no direct commits to main)
- All tests must pass before merge
- See [.github/copilot-instructions.md](.github/copilot-instructions.md)

## Documentation

- **Windows Build**: [docs/WINDOWS_BUILD.md](docs/WINDOWS_BUILD.md) - Building installers
- **Development Progress**: [docs/ROADMAP.md](docs/ROADMAP.md) - Detailed feature tracking and plans
- **Changelog**: [CHANGELOG.md](CHANGELOG.md) - Version history and changes
- **LLM Integration**: [docs/LLM-INTEGRATION.md](docs/LLM-INTEGRATION.md) - Technical integration guide
- **Thinking Animation**: [docs/features/THINKING_ANIMATION.md](docs/features/THINKING_ANIMATION.md) - Chain-of-thought UI transparency
- **GPU Layer Offloading**: [docs/features/GPU_LAYER_OFFLOADING.md](docs/features/GPU_LAYER_OFFLOADING.md) - Running large models on limited hardware
- **MCP Integration**: [docs/features/MCP_INTEGRATION.md](docs/features/MCP_INTEGRATION.md) - File operations guide
- **Component API**: [docs/COMPONENT-API.md](docs/COMPONENT-API.md) - UI component reference

---

**Note**: Experimental project. Local-only processing. No external APIs except DuckDuckGo when web search enabled.
