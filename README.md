# SHIELD 2.0 🛡️

A privacy-first, local AI chatbot for Windows with intelligent tool integration capabilities.

## Overview

SHIELD 2.0 is an experimental AI assistant that runs entirely on your local Windows machine. It combines the power of large language models (via llama.cpp) with Windows system integration, enabling natural language interaction while maintaining complete privacy and control over your data.

### Key Features

- 🔒 **Privacy First**: All AI processing happens locally - your data never leaves your machine
- 🤖 **Powered by llama.cpp**: Efficient local LLM inference with state-of-the-art models
- 🪟 **Windows Integration**: Navigate and control Windows with natural language (with your permission)
- 🎨 **Modern UI**: Clean, minimalistic interface built with React, shadcn/ui, and Lucide icons
- 🔧 **Tool Integration**: Execute system tasks safely with explicit user consent
- ⚡ **High Performance**: Optimized for responsive interactions and efficient resource usage

## Project Status

**Status**: Experimental - Active Development

This is a learning and experimentation project. Features and architecture may evolve rapidly.

## Architecture

```
SHIELD2.0/
├── src/
│   ├── frontend/          # React UI with TypeScript
│   │   ├── components/    # shadcn/ui components
│   │   ├── hooks/         # Custom React hooks
│   │   └── pages/         # Application pages
│   ├── backend/           # Core application logic
│   │   ├── llm/          # llama.cpp integration
│   │   ├── tools/        # Windows integration tools
│   │   └── services/     # Business logic services
│   └── shared/           # Shared types and utilities
├── models/               # LLM models (not tracked in git)
└── tests/               # Test suites
```

## Technology Stack

### Frontend
- **Framework**: React 18+ with TypeScript
- **UI Components**: shadcn/ui
- **Icons**: Lucide React
- **Styling**: Tailwind CSS
- **Build Tool**: Vite

### Backend
- **Runtime**: Node.js with TypeScript
- **LLM Engine**: llama.cpp (via node-llama-cpp)
- **Model Format**: GGUF (Q4_K_M quantization)
- **Windows Integration**: Native Windows APIs (planned)
- **IPC**: Electron (planned)

## Getting Started

### Prerequisites

- Windows 10/11
- Node.js 18+
- Git
- 16GB+ RAM recommended (32GB optimal)
- NVIDIA GPU with 12GB+ VRAM recommended (for RTX 4070 or better)

### Installation

```powershell
# Clone the repository
git clone https://github.com/BuQQzz/SHIELD2.0.git
cd SHIELD2.0

# Install dependencies
npm install

# Download a recommended model (optimized for RTX 4070)
npm run download-model qwen-7b

# Test the model
npm run test:inference
```

### Available Models

The project includes pre-configured models optimized for RTX 4070 (12GB VRAM):

- **Qwen 7B** (4.4GB) - `npm run download-model qwen-7b` - Excellent multilingual
- **Llama 3B** (1.9GB) - `npm run download-model llama-3b` - Fast, smaller model
- **Mistral 7B** (4.1GB) - `npm run download-model mistral-7b` - Good general purpose

Models are automatically downloaded from Hugging Face and saved to `models/` directory.

### Development

```powershell
# Run in development mode
npm run dev

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format

# Build for production
npm run build
```

## Development Guidelines

This project follows strict development practices:

- ✅ **Code files limited to 300 lines** - refactor into modules when approaching limit
- ✅ **Feature branch workflow** - no direct commits to main
- ✅ **MCP tools first** - automate testing and validation
- ✅ **Modern best practices** - latest language features and frameworks
- ✅ **Continuous updates** - stay current with llama.cpp and dependencies

See [.github/copilot-instructions.md](.github/copilot-instructions.md) for complete guidelines.

## Usage

(Coming soon - usage examples and screenshots)

## Privacy & Security

- **Local Processing**: All LLM inference runs on your machine
- **Permission-Based**: Every system operation requires explicit user approval
- **No Telemetry**: No data collection or external API calls
- **Audit Trail**: Optional logging of system operations for transparency

## Contributing

This is an experimental personal project. Contributions, ideas, and feedback are welcome!

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes (follow the code guidelines)
4. Run tests and ensure they pass
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Roadmap

See [ROADMAP.md](ROADMAP.md) for detailed development plan.

**Current Phase**: llama.cpp Integration ✅

- [x] Project scaffolding and modern framework setup
- [x] llama.cpp integration with node-llama-cpp
- [x] Model downloading system (Hugging Face)
- [x] Inference testing and validation
- [ ] Electron desktop application
- [ ] Core chat interface
- [ ] Windows tool integration
- [ ] Permission system

## License

(To be determined)

## Acknowledgments

- [llama.cpp](https://github.com/ggerganov/llama.cpp) - Efficient LLM inference
- [shadcn/ui](https://ui.shadcn.com/) - Beautiful UI components
- [Lucide](https://lucide.dev/) - Icon library

---

**Note**: This is an experimental project. Use at your own risk and always review what permissions you grant to the system.
