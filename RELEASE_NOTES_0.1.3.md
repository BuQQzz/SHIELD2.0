# SHIELD v0.1.3 Release Notes

**Release Date**: December 13, 2025  
**Type**: Model Download System Overhaul

---

## 🎯 Model Download Management Overhaul

This release fixes critical issues with model downloads and introduces proper authentication handling for gated models.

## What's New

### Gated Model Authentication
- **Proper Detection**: All 7 gated models now correctly identified (Meta Llama, Mistral, Microsoft Phi-3, Google Gemma, DeepSeek)
- **Smart Download Buttons**: Gated models show "Token Required" when HuggingFace token not configured
- **Disabled State**: Download buttons automatically disabled for gated models without authentication
- **Clear Guidance**: Tooltip directs users to Settings → System to add HuggingFace token

### Download Progress Improvements
- **Better Visibility**: Progress bars now have background panel with border for improved contrast
- **Enhanced Details**: Larger, bolder text with better spacing between download stats
- **Precise Progress**: Shows percentage to 1 decimal place (e.g., 45.7% instead of 46%)
- **Professional Layout**: Download information displayed in clean, easy-to-read format

### Download Protection
- **No Re-downloads**: Downloaded models show "Downloaded" status immediately
- **Triple Protection**: Frontend checks + backend validation prevent accidental re-downloads
- **Smart State Management**: Seamless transition from "Downloaded" to "Installed" state
- **Delete Control**: Delete button only appears for fully installed models

## Bug Fixes

### Critical Fixes (New in this Update)
- **Fixed**: Download stuck at 0% - IPC communication issue where mainWindow reference was not set for progress events
- **Fixed**: Download completion state not updating - UI now correctly shows "Downloaded" immediately after finish
- **Fixed**: Model loading ENOENT error - installed models list now properly maps model IDs to catalog entries with correct URIs
- **Fixed**: Model delete showing "undefined" error - proper error messages now displayed

### Model Detection Fixes
- **Fixed**: Filename pattern matching to correctly detect installed models (node-llama-cpp format: `hf_Owner_Repo.Quantization.gguf`)
- **Fixed**: Installed models IPC handler now returns model IDs instead of raw filenames for proper catalog matching

### Earlier Fixes
- **Fixed**: 401 Unauthorized errors when attempting to download gated models without token
- **Fixed**: Gemma 2 9B and Phi-3 Medium 14B incorrectly marked as non-gated
- **Fixed**: Mistral 7B, Mistral Large 2, and DeepSeek Coder missing gating flags
- **Fixed**: Download progress bar difficult to read/see during download
- **Fixed**: Ability to re-download already installed models, causing file overwrites
- **Fixed**: Download button remaining clickable for models requiring authentication

## Technical Changes

**Model Configuration**
- Added `requiresAuth: true` to 5 additional gated models:
  - Mistral Large 2
  - Mistral 7B Instruct
  - Phi-3 Medium 14B
  - Gemma 2 9B
  - DeepSeek Coder 7B

**UI Components**
- ModelCard: Added `hasHfToken` prop and conditional button states
- DownloadProgressBar: Enhanced styling with better contrast and spacing
- ModelDownloadDialog: Passes token status to all model cards

**Download Logic**
- useModelDownload hook: Added pre-download validation and completion state handling
- useInstalledModels hook: Simplified ID-to-catalog mapping for reliable model loading
- electron/main.ts: Added setMainWindow() call after window creation for IPC progress events
- ModelFileManager: Fixed filename pattern detection for node-llama-cpp format
- modelHandlers: List installed now checks catalog and returns model IDs
- Triple-layer protection against re-downloads

## Gated vs Free Models

**🔒 Requires HuggingFace Token (7 models):**
- Meta Llama 3.3 70B, 3.2 3B, 3.2 1B
- Mistral Large 2, Mistral 7B
- Microsoft Phi-3 Medium 14B
- Google Gemma 2 9B
- DeepSeek Coder 7B

**✅ Free to Download (4 models):**
- Qwen 2.5 Coder 32B (Apache 2.0)
- Qwen 2.5 7B Instruct (Apache 2.0)
- Qwen 2.5 3B Instruct (Qwen Research License)

## Installation

Download the appropriate installer for your system:

- **SHIELD-0.1.3-x64.exe** - Standard Windows installer (recommended)
- **SHIELD-0.1.3-portable.exe** - Portable version (no installation)

### Requirements
- Windows 10 or later (64-bit)
- 8GB RAM minimum (16GB recommended)
- 5GB+ free disk space for models

### Getting Started
1. Run the installer
2. Launch SHIELD
3. Click "Download Models" button in the header
4. **Free Models**: Download Qwen models immediately (no token needed)
5. **Gated Models**: Add HuggingFace token in Settings → System first
6. Select and download your preferred model
7. Start chatting!

## Upgrading from v0.1.2

Simply run the new installer - it will automatically upgrade your installation while preserving:
- All settings and preferences
- Conversation history
- Downloaded models
- HuggingFace token configuration

No manual uninstall required.

## Setting Up HuggingFace Token

For gated models (Meta Llama, Mistral, etc.):

1. Create account at [huggingface.co](https://huggingface.co)
2. Visit each model's page and accept license agreement
3. Generate token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
4. Enable: **"Read access to contents of all public gated repos you can access"**
5. In SHIELD: **Settings → System → HuggingFace Token**
6. Paste token and click Save
7. Download buttons will activate for gated models

## Known Issues

- Web search reasoning text may appear briefly even when web search is disabled
- Build process shows chunk size warnings (performance optimization planned for v0.2.0)

## Coming in v0.2.0

- Enhanced model management with batch operations
- Performance optimizations and code splitting
- Additional model support and providers
- UI/UX refinements and accessibility improvements
- Improved error handling and user feedback

---

**Full Changelog**: https://github.com/BuQQzz/SHIELD2.0/blob/main/CHANGELOG.md
