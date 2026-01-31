# SHIELD v0.1.4 Release Notes

**Release Date:** January 31, 2026

## 🚀 What's New

### ⚡ Speculative Decoding
New **InputLookupTokenPredictor** for faster inference:
- **20-50% speedup** for code completion and summarization tasks
- Uses pattern matching on input text (no additional model required)
- Toggle in **Settings → Model Settings → Advanced**
- Zero memory overhead compared to draft model approaches

### 🧠 Model-Specific System Prompts
Intelligent prompt composition based on model capabilities:
- **Automatic model family detection** (Llama, Qwen, Mistral, Phi, Gemma, DeepSeek)
- **Capability-based prompt modules** (tool calling, web search, reasoning, code generation)
- **ReAct-style prompts** for better tool calling and reasoning
- **Chain-of-thought prompts** for complex reasoning tasks
- Optimized prompts for each model family's strengths

## 📦 Updated Dependencies

### node-llama-cpp 3.14.2 → 3.15.1
- Includes **llama.cpp b7836** with hundreds of optimizations
- Better KV cache management and memory efficiency
- Improved context handling and batch processing

### Electron 39.0.0 → 40.1.0
- **Chromium 144** (latest stable)
- **Node.js 24.11.1** with performance improvements
- **V8 14.4** JavaScript engine
- Enhanced security and stability

### Vite 7.1.12 → 7.3.1
- Faster dev server startup
- Improved HMR performance
- Better build optimization

## 📈 Performance Improvements
- Faster LLM inference through llama.cpp optimizations
- Speculative decoding provides additional speedup for appropriate tasks
- Improved dev experience with faster Vite builds

---

## 📥 Downloads

| File | Description |
|------|-------------|
| `SHIELD-0.1.4-x64.exe` | Windows Installer (recommended) |
| `SHIELD-0.1.4-portable.exe` | Portable version (no install required) |

## 🔧 System Requirements
- Windows 10/11 (x64)
- 8GB RAM minimum (16GB recommended for larger models)
- ~500MB disk space (plus space for AI models)

---

*SHIELD is a privacy-first, local AI chatbot. All processing happens on your machine - your data never leaves your PC.*
