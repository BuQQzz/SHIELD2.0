# Quick Start Guide

## Get SHIELD 2.0 Running in 5 Minutes

This guide will get you up and running with SHIELD 2.0 as quickly as possible.

## Prerequisites Checklist

Before starting, ensure you have:

- ✅ Windows 10 or 11
- ✅ Node.js 18+ installed ([Download](https://nodejs.org/))
- ✅ Git installed ([Download](https://git-scm.com/))
- ✅ At least 10GB free disk space
- ✅ 8GB+ RAM (16GB recommended)

## Installation Steps

### 1. Clone the Repository

```powershell
git clone https://github.com/BuQQzz/SHIELD2.0.git
cd SHIELD2.0
```

### 2. Install Dependencies

```powershell
npm install
```

This takes ~2-3 minutes and installs:

- React and UI framework
- Electron for desktop app
- node-llama-cpp for AI inference
- All other dependencies

### 3. Start the Application

```powershell
npm run dev:electron
```

**First Launch**:

- Electron window opens
- Shows "Loading model..." in the header
- Model downloads in background (~4.2GB, takes 2-10 min)
- Progress appears in the terminal

**Subsequent Launches**:

- Model loads from cache (~10-30 seconds)
- No download needed

### 4. Start Chatting!

Once you see the SHIELD logo with suggested prompts:

1. Click a suggested prompt, or
2. Type your own message in the input box
3. Press Enter or click Send
4. Watch the response stream in real-time!

## What to Expect

### First Message

- May take a few seconds to start
- Response streams token-by-token
- Typical speed: 5-50 tokens/sec (varies by hardware)

### Performance

- **GPU (RTX 3060+)**: ~30-50 tokens/sec
- **CPU Only**: ~5-10 tokens/sec
- **Memory Usage**: ~6-8GB with model loaded

## Troubleshooting

### "Model won't download"

**Check**: Internet connection, firewall settings
**Try**:

```powershell
# Clear cache and restart
Remove-Item -Recurse -Force models/*
npm run dev:electron
```

### "401 Unauthorized" for Model Downloads

**Cause**: Some models (like Meta Llama) are "gated" and require HuggingFace authentication.

**Solution**:

1. Create a HuggingFace account at [huggingface.co](https://huggingface.co)
2. Go to the model page and accept the license agreement
3. Generate a token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
4. Enable: **"Read access to contents of all public gated repos you can access"**
5. In SHIELD 2.0: **Settings → System → HuggingFace Token** → paste token → Save

Models marked with 🔒 **Gated** in the download dialog require this setup.

### "App won't start"

**Check**: Node.js version is 18+

```powershell
node --version  # Should show v18.x.x or higher
```

**Try**:

```powershell
# Clean rebuild
npm run build
npm run dev:electron
```

### "Slow responses"

**Cause**: CPU inference is slower than GPU
**Solution**:

- Close other memory-heavy applications
- Consider upgrading to a smaller model (future feature)
- Ensure GPU drivers are up to date

### "Out of memory"

**Cause**: 7B model requires ~6-8GB RAM
**Solution**:

- Close other applications
- Restart your computer to free memory
- Use smaller model when selector UI is available

## Next Steps

### Learn More

- [Component API Documentation](../docs/COMPONENT-API.md)
- [LLM Integration Guide](../docs/LLM-INTEGRATION.md)
- [Contributing Guidelines](../.github/copilot-instructions.md)

### Explore Features

- Clear conversation history (Sidebar → Clear History)
- Try different types of questions
- Test streaming performance
- Check model status in header

### Development

```powershell
# Run tests
npm test

# Check code quality
npm run lint

# Build for production
npm run build
```

## Common Questions

### Where is the model stored?

`SHIELD2.0/models/` directory (created automatically)

### Can I use a different model?

Currently auto-loads Qwen 7B. Model selector UI coming soon.

### Does this send data to the cloud?

No! Everything runs locally. Zero external API calls.

### Can I use this offline?

Yes! After the initial model download, everything works offline.

### How much VRAM do I need?

- Qwen 7B: ~5-6GB VRAM recommended
- Llama 3B: ~2-3GB VRAM (future option)
- CPU fallback: No VRAM required (slower)

## Tips for Best Experience

1. **First Time**: Let the model download completely before testing
2. **Performance**: Close other applications for faster inference
3. **Conversations**: Use Clear History to reset context
4. **Updates**: Pull latest code regularly (`git pull origin main`)
5. **Issues**: Check terminal output for detailed error messages

## Still Having Issues?

1. Check the full [README.md](../README.md)
2. Review [LLM-INTEGRATION.md](../docs/LLM-INTEGRATION.md)
3. Open an issue on GitHub with:
   - Your OS version
   - Node.js version (`node --version`)
   - Error messages from terminal
   - Steps to reproduce

---

**You're Ready!** 🚀

Enjoy chatting with your local AI assistant. Remember, everything runs on your machine - your privacy is fully protected.

Happy exploring! 🛡️
