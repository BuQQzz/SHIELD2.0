# Troubleshooting Guide

## Common Issues and Solutions

### Visual/Display Issues

#### Washed Out Colors or Faded UI
**Symptoms:** Colors appear washed out, low contrast, or hard to read when the app starts.

**Cause:** Electron's hardware acceleration or color space management may conflict with Windows display settings.

**Solutions Applied:**
1. Added `disable-color-correct-rendering` flag to Electron
2. Forced sRGB color profile
3. Disabled background throttling
4. Added proper CSS color space declarations
5. Implemented dark mode support

**If issue persists:**
```powershell
# Try disabling hardware acceleration completely
# Add to electron/main.ts before app.whenReady():
app.disableHardwareAcceleration();
```

Or set Windows color management:
1. Right-click Desktop → Display Settings
2. Advanced Display → Display Adapter Properties
3. Color Management → Advanced
4. Ensure sRGB is selected as default

#### Blurry Text
**Symptoms:** Text appears blurry or fuzzy.

**Solution:**
- Windows scaling may be affecting rendering
- Right-click app → Properties → Compatibility
- Check "Override high DPI scaling behavior"
- Select "Application" from dropdown

**In code (already implemented):**
```typescript
// main.ts sets proper font smoothing
-webkit-font-smoothing: antialiased;
-moz-osx-font-smoothing: grayscale;
```

#### Flickering or Flashing on Startup
**Symptoms:** Window flashes white before content loads.

**Solution (already implemented):**
```typescript
// Window hidden until ready
show: false,
backgroundColor: "#0a0a0a",

mainWindow.once("ready-to-show", () => {
  mainWindow?.show();
});
```

### Performance Issues

#### Slow Model Loading
**Symptoms:** Model takes >5 minutes to load after initial download.

**Causes:**
1. CPU-only inference (no GPU detected)
2. Insufficient RAM
3. Disk I/O bottleneck

**Solutions:**
```powershell
# Check GPU availability
nvidia-smi  # For NVIDIA GPUs

# If no GPU or insufficient VRAM:
# Use smaller model (future: implement model selector)
```

**Check system resources:**
- Task Manager → Performance
- Ensure 8GB+ free RAM
- Close memory-heavy applications

#### Slow Inference (Responses)
**Symptoms:** Responses generate <5 tokens/second.

**CPU Only:**
- Expected: 5-10 tokens/sec
- Normal behavior without GPU

**GPU Issues:**
```powershell
# Update GPU drivers
# For NVIDIA:
# Visit nvidia.com/Download/index.aspx

# Check CUDA compatibility
# node-llama-cpp requires CUDA 11.7+
```

**Memory Issues:**
- Close other applications
- Restart computer to free memory
- Check for memory leaks (Task Manager)

#### High Memory Usage
**Symptoms:** App uses >10GB RAM.

**Normal behavior:**
- Qwen 7B: ~6-8GB RAM
- Plus system: ~2-3GB
- Total: 8-11GB is normal

**If excessive (>15GB):**
```powershell
# Clear cache and restart
Remove-Item -Recurse -Force models/.cache
npm run dev:electron
```

### Model Download Issues

#### Download Fails or Times Out
**Symptoms:** Model download stops or fails partway.

**Solutions:**
1. Check internet connection
2. Check firewall/antivirus
3. Verify disk space (need ~5GB free)

```powershell
# Manual retry - delete partial download
Remove-Item -Recurse -Force models/*
npm run dev:electron
```

**Firewall whitelist:**
- Allow Node.js through Windows Firewall
- Allow connections to huggingface.co

#### Download Progress Not Showing
**Symptoms:** No progress indicator during download.

**Status:** Progress indicator not yet implemented.
**Workaround:** Check terminal output or Task Manager network activity.

### Application Crashes

#### Crash on Startup
**Symptoms:** App closes immediately after opening.

**Check terminal output:**
```powershell
npm run dev:electron
# Look for error messages
```

**Common causes:**
1. Missing dependencies
2. Corrupted model files
3. Insufficient permissions

**Solutions:**
```powershell
# Reinstall dependencies
Remove-Item -Recurse -Force node_modules
npm install

# Clear models cache
Remove-Item -Recurse -Force models/*

# Run with admin rights (if permission errors)
```

#### Crash During Inference
**Symptoms:** App crashes while generating response.

**Causes:**
1. Out of memory
2. Model file corruption
3. GPU driver issue

**Solutions:**
```powershell
# Check model integrity
# Delete and re-download
Remove-Item -Recurse models/Qwen*
npm run dev:electron

# Disable GPU if driver issues
# Add to electron/main.ts:
app.disableHardwareAcceleration();
```

### Build/Development Issues

#### TypeScript Errors
**Symptoms:** Red squiggly lines in VS Code, but build succeeds.

**Common false positives:**
- `Cannot find module './App.tsx'` - Ignore, build works
- `Unknown at rule @theme` - Tailwind CSS 4.x syntax, safe to ignore
- `Unknown at rule @apply` - Tailwind CSS 4.x syntax, safe to ignore

**Solution:**
```
Ctrl+Shift+P → "TypeScript: Restart TS Server"
```

#### Build Fails
**Symptoms:** `npm run build` exits with errors.

**Check:**
```powershell
# Verify Node.js version
node --version  # Should be v18+

# Clean rebuild
npm run build
```

**If still failing:**
```powershell
# Nuclear option - full clean
Remove-Item -Recurse -Force node_modules, dist, dist-electron
npm install
npm run build
```

#### Electron Won't Start in Dev Mode
**Symptoms:** `npm run dev:electron` hangs or crashes.

**Solutions:**
```powershell
# Kill existing processes
taskkill /F /IM electron.exe

# Restart dev server
npm run dev:electron
```

**Port conflict:**
```powershell
# Check if port 5173 is in use
netstat -ano | findstr :5173

# Kill process using the port
taskkill /PID <PID> /F
```

### IPC Communication Issues

#### React Can't Call Electron APIs
**Symptoms:** `window.llama is undefined` errors.

**Check:**
1. Preload script loaded correctly
2. Context isolation enabled
3. TypeScript declarations imported

**Verify preload:**
```typescript
// In browser console:
console.log(window.llama);
// Should show object with methods
```

**If undefined:**
- Check `electron/preload.ts` exports
- Verify `webPreferences.preload` path
- Restart Electron app

#### Streaming Not Working
**Symptoms:** Messages don't stream token-by-token.

**Check:**
1. `sendStreamingMessage` being called
2. Token callback receiving data
3. State updates in React

**Debug:**
```typescript
// Add console logs in callback
await sendStreamingMessage(content, (token) => {
  console.log("Token:", token);
  // ...
});
```

### Deployment Issues

#### Packaged App Won't Start
**Symptoms:** .exe file doesn't launch.

**Check:**
1. Model files included in package
2. Node.js runtime bundled
3. Dependencies properly packaged

**Build installer:**
```powershell
npm run build
npm run package  # When implemented
```

#### Antivirus Blocking
**Symptoms:** Antivirus quarantines or blocks the app.

**Solution:**
- Add exception for app folder
- Code sign the executable (future)

### Getting Help

If none of these solutions work:

1. **Check logs:**
   ```powershell
   # Terminal output when running dev:electron
   # Look for stack traces and error messages
   ```

2. **Create GitHub issue with:**
   - Windows version
   - Node.js version (`node --version`)
   - RAM amount
   - GPU model (if any)
   - Complete error message
   - Steps to reproduce

3. **Include system info:**
   ```powershell
   systeminfo | findstr /B /C:"OS Name" /C:"OS Version" /C:"Total Physical Memory"
   node --version
   npm --version
   ```

4. **Check for updates:**
   ```powershell
   git pull origin main
   npm install
   npm run build
   ```

## Quick Fixes Summary

| Issue | Quick Fix |
|-------|-----------|
| Washed out colors | Restart app (color fix applied) |
| Slow responses | Close other apps, check GPU drivers |
| Download fails | Check internet, firewall, disk space |
| App crashes | Clear models cache, reinstall deps |
| Build errors | Clean rebuild with `npm install` |
| TypeScript errors | Restart TS server (Ctrl+Shift+P) |
| Port conflict | Kill electron.exe processes |

## Prevention Tips

1. **Keep dependencies updated:** `npm update` monthly
2. **Update GPU drivers:** Quarterly for NVIDIA/AMD
3. **Clear cache periodically:** Delete `models/.cache` when issues arise
4. **Monitor disk space:** Ensure 10GB+ free for models
5. **Backup conversations:** Export important chats (when feature available)

---

**Last Updated:** November 3, 2025

For additional help, see:
- [LLM Integration Guide](./LLM-INTEGRATION.md)
- [Component API Reference](./COMPONENT-API.md)
- [Quick Start Guide](./QUICK-START.md)
