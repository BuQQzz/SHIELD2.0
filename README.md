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

**Status**: Experimental - Active Development 🚀

**Current Features**: 
- ✅ Complete llama.cpp integration with streaming inference
- ✅ Electron desktop application with IPC bridge
- ✅ Modern React chat interface with real-time responses
- ✅ Model downloading and caching system
- ✅ Privacy-first local AI processing

This is a learning and experimentation project. Features and architecture may evolve rapidly.

## Architecture

```
SHIELD2.0/
├── electron/              # Electron main process
│   ├── main.ts           # Application entry point
│   ├── preload.ts        # Secure IPC bridge
│   └── services/         # Backend services
│       └── LlamaService.ts  # llama.cpp wrapper
├── src/                  # React frontend
│   ├── components/       # UI components
│   │   ├── chat/         # Chat interface components
│   │   └── ui/           # shadcn/ui base components
│   ├── hooks/            # Custom React hooks
│   │   └── useLlama.ts   # LLM integration hook
│   ├── types/            # TypeScript definitions
│   ├── stores/           # Zustand state stores
│   └── App.tsx           # Main application
├── docs/                 # Documentation
│   ├── LLM-INTEGRATION.md  # Integration guide
│   └── COMPONENT-API.md    # Component reference
└── models/               # Downloaded LLM models (gitignored)
```

## Technology Stack

### Frontend
- **Framework**: React 18+ with TypeScript
- **UI Components**: shadcn/ui
- **Icons**: Lucide React
- **Styling**: Tailwind CSS
- **Build Tool**: Vite

### Backend
- **Desktop Framework**: Electron 39.0.0
- **Runtime**: Node.js 20.18.3
- **LLM Engine**: llama.cpp (via node-llama-cpp 3.14.2)
- **Model Format**: GGUF (Q4_K_M quantization)
- **IPC**: Electron contextBridge (secure)

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
# Run Electron app in development mode
npm run dev:electron

# Run React app only (web view)
npm run dev

# Run tests
npm test

# Lint code
npm run lint

# Build for production
npm run build

# Package Electron app for Windows
npm run package
```

### First Launch

1. Start the app: `npm run dev:electron`
2. Wait for model to download (~4.2GB, first time only)
3. Model loads automatically (shows "Loading model..." in header)
4. Once loaded, try the suggested prompts or type your own message
5. Watch responses stream in real-time!

**Performance**: First model download takes 2-10 minutes depending on internet speed. Subsequent launches load the cached model in ~10-30 seconds.

## Development Guidelines

This project follows strict development practices:

- ✅ **Code files limited to 300 lines** - refactor into modules when approaching limit
- ✅ **Feature branch workflow** - no direct commits to main
- ✅ **MCP tools first** - automate testing and validation
- ✅ **Modern best practices** - latest language features and frameworks
- ✅ **Continuous updates** - stay current with llama.cpp and dependencies

See [.github/copilot-instructions.md](.github/copilot-instructions.md) for complete guidelines.

## Usage

### Chat Interface

The SHIELD 2.0 chat interface provides a clean, intuitive experience:

1. **Start a Conversation**: Type in the input box or click a suggested prompt
2. **Real-time Streaming**: Watch responses appear token-by-token
3. **Clear History**: Click the "Clear History" button in the sidebar to reset
4. **Model Status**: Check the header for current model and loading state

### Example Interactions

```
You: What can you help me with?
SHIELD: I'm SHIELD 2.0, your local AI assistant. I can help with...
[Response streams in real-time]

You: Explain how you work
SHIELD: I run entirely on your local machine using llama.cpp...
```

### Available Models

Currently auto-loads **Qwen2.5-7B-Instruct** (Q4_K_M):
- Size: ~4.2GB
- Quality: Excellent multilingual understanding
- Speed: ~30-50 tokens/sec (RTX 3060)

Future updates will add model selection UI for:
- Llama 3.2 3B (faster, smaller)
- Mistral 7B (alternative 7B model)

### Keyboard Shortcuts

- `Enter` - Send message
- `Shift + Enter` - New line in input
- `Escape` - Stop generation (when implemented)

For detailed API documentation, see [docs/COMPONENT-API.md](docs/COMPONENT-API.md).

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

**Current Phase**: Core Chat Interface ✅

### Completed
- [x] Project scaffolding and modern framework setup
- [x] llama.cpp integration with node-llama-cpp
- [x] Model downloading system (Hugging Face)
- [x] Inference testing and validation
- [x] Electron desktop application with IPC
- [x] Core chat interface with streaming responses
- [x] Message history and conversation management

### In Progress
- [ ] Model selector UI (switch between models)
- [ ] Persistent chat sessions
- [ ] Conversation history search

### Planned
- [ ] Windows tool integration (MCP servers)
- [ ] Permission system for system operations
- [ ] File operations and navigation
- [ ] Markdown rendering in chat
- [ ] Code syntax highlighting
- [ ] Export chat history
- [ ] System tray integration

## License

(To be determined)

## Acknowledgments

- [llama.cpp](https://github.com/ggerganov/llama.cpp) - Efficient LLM inference
- [shadcn/ui](https://ui.shadcn.com/) - Beautiful UI components
- [Lucide](https://lucide.dev/) - Icon library

---

**Note**: This is an experimental project. Use at your own risk and always review what permissions you grant to the system.
