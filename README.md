# SHIELD 2.0 🛡️

A privacy-first, local AI chatbot for Windows with intelligent tool integration capabilities.

## Overview

SHIELD 2.0 is an experimental AI assistant that runs entirely on your local Windows machine. It combines the power of large language models (via llama.cpp) with Windows system integration, enabling natural language interaction while maintaining complete privacy and control over your data.

### Key Features

- 🔒 **Privacy First**: All AI processing happens locally - your data never leaves your machine
- 🤖 **Powered by llama.cpp**: Efficient local LLM inference with state-of-the-art models
- 🌐 **Privacy-First Web Search**: DuckDuckGo integration with local caching and no tracking
- 🧠 **Chain-of-Thought Reasoning**: Transparent AI thinking process for accurate answers
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
- ✅ Model selector UI (Qwen 7B, Llama 3B, Mistral 7B)
- ✅ Framer Motion animations throughout
- ✅ Markdown rendering with syntax highlighting
- ✅ Copy message functionality
- ✅ Collapsible sidebar with icon-only mode
- ✅ Borderless design with shadow-based depth
- ✅ Stop/cancel generation
- ✅ Model downloading and caching system
- ✅ Privacy-first local AI processing
- ✅ **Conversation management** - Save, load, search, and delete chat sessions
- ✅ **Automatic conversation titling** - LLM-powered descriptive titles
- ✅ **Context restoration** - Persistent memory across conversation switches
- ✅ **Inline delete confirmation** - Smooth UX without browser dialogs
- ✅ **Auto-focus input** - Always ready to type
- ✅ **Privacy-first web search** - DuckDuckGo integration with stealth mode
- ✅ **Chain-of-Thought reasoning** - Transparent AI thinking for accurate answers
- ✅ **Local web caching** - Encrypted cache with AES-256-GCM
- ✅ **Show Reasoning toggle** - Configurable visibility of AI's analysis
- ✅ **Collapsible sources** - Clean source display with expand/collapse

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
- **Database**: sqlite3 v5.1.7 (Node-API for ABI stability)
- **Web Automation**: Playwright (for privacy-first web search)
- **Encryption**: AES-256-GCM (for local web cache)

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
2. **Real-time Streaming**: Watch responses appear token-by-token with animated cursor
3. **Markdown Support**: Messages render with headings, bold text, lists, code blocks, and more
4. **Copy Messages**: Hover over any message and click the copy button
5. **Stop Generation**: Click the stop button to cancel ongoing responses
6. **Collapsible Sidebar**: Toggle between full (260px) and minimal (64px icon-only) view
7. **Clear History**: Click the "Clear History" button in the sidebar to reset
8. **Model Selection**: Choose between Qwen 7B, Llama 3B, or Mistral 7B models
9. **Model Status**: Check the header for current model and loading state
10. **Web Search**: Toggle web search to get real-time information (privacy-protected)

### Web Search Feature

SHIELD 2.0 includes privacy-first web search integration powered by DuckDuckGo:

#### Privacy Protections
- **No Tracking**: Uses DuckDuckGo HTML endpoint (no JavaScript trackers)
- **Stealth Mode**: Browser navigator properties modified to prevent detection
- **Local Processing**: All searches cached locally with AES-256-GCM encryption
- **No External APIs**: Direct DuckDuckGo access, no intermediary services

#### How It Works
1. **Toggle Web Search**: Enable in Settings → Web Search
2. **Ask Questions**: Type naturally - web search activates automatically for factual queries
3. **Watch Searching**: Animated globe indicator shows when fetching results
4. **See Reasoning**: (Optional) Enable "Show AI Reasoning Steps" to understand how AI analyzes results
5. **View Sources**: Click "View Sources" button to see where information came from

#### Chain-of-Thought Reasoning
When web search is enabled, SHIELD uses a 3-step reasoning process:

**STEP 1 - Extract Key Facts**: Quote exact text from search results  
**STEP 2 - Analyze**: Evaluate facts with explicit temporal logic (critical for dates/releases)  
**STEP 3 - Answer**: Respond using ONLY extracted facts

This ensures accurate, grounded answers instead of hallucinations.

#### Configuration
Settings → Web Search:
- **Enable Web Search**: Turn on/off real-time search
- **Show AI Reasoning Steps**: Display how AI analyzes results (helpful for understanding)
- **Max Results**: Number of search results to fetch (3-10)
- **Cache Settings**: Enable caching and set expiry time (24 hours default)

#### Technical Details
- **Search Engine**: DuckDuckGo HTML search
- **Page Fetching**: Top 2 pages fetched for full content + 10 snippets
- **Timeout**: 3-second per-page timeout to prevent hanging
- **Temperature**: Lowered to 0.1 for deterministic, fact-based responses
- **Vague Follow-up Detection**: Skips search for "please check again" style queries

#### Example Usage
```
You: Did Outer Worlds 2 come out on PS5?
[Web search activates - fetches live results]

AI Reasoning (if enabled):
STEP 1: [Quote: "As of November 2025, not yet released"]
STEP 2: Today is Nov 4, 2025. Results say "not yet released".
STEP 3: No, The Outer Worlds 2 has not been released yet.

Answer: No, The Outer Worlds 2 has not been released on PS5 yet...
[View Sources (4)] ← Click to see where info came from
```

#### Known Limitations
- 7B model may struggle with very complex temporal reasoning
- Search quality depends on DuckDuckGo availability
- Page fetching may timeout on slow connections
- Follow-up context limited (web search doesn't use conversation history)

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
- `Hover over message` - Show copy button
- Click sidebar toggle - Collapse/expand sidebar

### UI Features

- **Smooth Animations**: Framer Motion animations for all interactions
- **Borderless Design**: Clean, modern interface with subtle shadow effects
- **Responsive Layout**: Adapts to different window sizes
- **Icon-Only Sidebar**: Collapse sidebar to maximize chat space
- **Message Formatting**: Full markdown support with syntax highlighting
  - Headings (H1-H6) with bold, large typography
  - Bold (`**text**`) and italic (`*text*`) formatting
  - Code blocks with OneDark syntax highlighting
  - Inline code, tables, lists, blockquotes, links
  - Copy any message with one click

For detailed API documentation, see [docs/COMPONENT-API.md](docs/COMPONENT-API.md).

## Privacy & Security

- **Local Processing**: All LLM inference runs on your machine
- **No External APIs**: Web search uses direct DuckDuckGo access (no tracking)
- **Encrypted Caching**: AES-256-GCM encryption for local web cache
- **Stealth Browsing**: Anti-detection measures for privacy protection
- **Permission-Based**: Every system operation requires explicit user approval
- **No Telemetry**: No data collection or external API calls (except DuckDuckGo when enabled)
- **Audit Trail**: Optional logging of system operations for transparency

### Why sqlite3 over better-sqlite3?
We migrated from `better-sqlite3` to `sqlite3` v5.1.7 for Electron 39 compatibility:
- **better-sqlite3**: Precompiled binaries tied to specific Node.js ABI versions (MODULE_VERSION)
- **sqlite3**: Uses Node-API (N-API) for ABI stability across Electron versions
- **Result**: No more native module rebuilds when Electron updates

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

See [docs/ROADMAP.md](docs/ROADMAP.md) for detailed development plan.

**Current Phase**: UI/UX Improvements ✅ **COMPLETED**

### Completed
- [x] Project scaffolding and modern framework setup (React 19, Vite 7, Tailwind 4)
- [x] llama.cpp integration with node-llama-cpp
- [x] Model downloading system (Hugging Face)
- [x] Inference testing and validation
- [x] Electron desktop application with IPC
- [x] Core chat interface with streaming responses
- [x] Message history and conversation management
- [x] **Model selector UI** (Qwen 7B, Llama 3B, Mistral 7B)
- [x] **Framer Motion animations** (messages, cursor, sidebar, buttons)
- [x] **Collapsible sidebar** (260px ↔ 64px icon-only mode)
- [x] **Borderless design** with shadow-based depth
- [x] **Stop/cancel generation** with clean abort handling
- [x] **Model loading progress** with dynamic status messages
- [x] **Markdown rendering** with GitHub Flavored Markdown
- [x] **Code syntax highlighting** with OneDark theme
- [x] **Copy message functionality** with visual feedback
- [x] **Enhanced heading styles** (large, bold H1-H6)
- [x] **Privacy-first web search** with DuckDuckGo integration
- [x] **Chain-of-Thought reasoning** for accurate answers
- [x] **Local encrypted caching** (AES-256-GCM)
- [x] **Show Reasoning toggle** for transparency
- [x] **sqlite3 migration** for Electron 39 compatibility

### In Progress
- [ ] Windows tool integration (MCP servers)
- [ ] RAG-based learning system (MemoryService)

### Planned
- [ ] Windows tool integration (MCP servers)
- [ ] Permission system for system operations
- [ ] File operations and navigation
- [ ] RAG-based learning system full integration
- [ ] Export chat history (JSON, Markdown, PDF)
- [ ] System tray integration
- [ ] Dark mode toggle
- [ ] Settings UI improvements
- [ ] Embeddings for semantic memory search

## License

(To be determined)

## Acknowledgments

- [llama.cpp](https://github.com/ggerganov/llama.cpp) - Efficient LLM inference
- [shadcn/ui](https://ui.shadcn.com/) - Beautiful UI components
- [Lucide](https://lucide.dev/) - Icon library

---

**Note**: This is an experimental project. Use at your own risk and always review what permissions you grant to the system.
