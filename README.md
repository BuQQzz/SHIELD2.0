# SHIELD 2.0 🛡️

Privacy-first local AI chatbot for Windows. All processing happens locally - no external APIs, no data leaving your machine.

## What It Is

Local AI assistant powered by llama.cpp with:
- **Local inference** - Everything runs on your Windows machine
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

- **Development Progress**: [docs/ROADMAP.md](docs/ROADMAP.md) - Detailed feature tracking and plans
- **Changelog**: [CHANGELOG.md](CHANGELOG.md) - Version history and changes
- **LLM Integration**: [docs/LLM-INTEGRATION.md](docs/LLM-INTEGRATION.md) - Technical integration guide
- **Component API**: [docs/COMPONENT-API.md](docs/COMPONENT-API.md) - UI component reference

---

**Note**: Experimental project. Local-only processing. No external APIs except DuckDuckGo when web search enabled.
