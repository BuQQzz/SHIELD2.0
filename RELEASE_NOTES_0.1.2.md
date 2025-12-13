# SHIELD v0.1.2 Release Notes

**Release Date**: December 12, 2024  
**Type**: Hotfix Release

---

## 🚨 Critical Fix

This hotfix resolves a critical issue where new users could not access model downloads after fresh installation.

## What's New

### Model Selector Now Always Visible
- Model picker dropdown now displays even when no models are installed
- New "Download Models" button appears on first launch
- Clear "No models installed" message guides users to download
- Seamless first-time user experience

## Bug Fixes

- **Fixed**: Model selector hidden on fresh installations preventing users from downloading models
- **Fixed**: No access to "Browse & Download Models" button when starting with empty model directory
- **Fixed**: Window initialization syntax error in production builds

## Changes

**User Interface**
- Model selector always visible in chat header
- Dynamic button text: "Download Models" when empty, "Select Model" when models exist
- Empty state message provides clear guidance to new users

**Code Changes**
- Removed conditional rendering that blocked model selector when no models installed
- Added empty state UI to model selector component
- Improved window initialization in electron setup

## Installation

Download the appropriate installer for your system:

- **SHIELD-0.1.2-x64.exe** - Standard Windows installer (recommended)
- **SHIELD-0.1.2-portable.exe** - Portable version (no installation)

### Requirements
- Windows 10 or later (64-bit)
- 8GB RAM minimum (16GB recommended)
- 5GB+ free disk space for models

### Getting Started
1. Run the installer
2. Launch SHIELD
3. Click "Download Models" button in the header
4. Select a model (Qwen2.5-7B-Instruct recommended for first-time users)
5. Wait for download to complete
6. Start chatting!

## Upgrading from v0.1.1

Simply run the new installer - it will automatically upgrade your installation while preserving:
- All settings and preferences
- Conversation history
- Downloaded models

No manual uninstall required.

## What Was Fixed

**The Problem**: In v0.1.1, the model selector only appeared when models were already installed. This created an impossible situation for new users:
1. Install SHIELD
2. No models installed yet
3. Model selector hidden
4. Cannot access download button
5. No way to proceed

**The Solution**: The model selector now always renders and shows a helpful message when empty, providing immediate access to the model download dialog.

## Known Issues

- Web search reasoning text may appear briefly even when web search is disabled
- Build process shows chunk size warnings (performance optimization planned for v0.2.0)

## Coming in v0.2.0

- Enhanced model management
- Performance optimizations
- Additional model support
- UI/UX refinements

---

**Full Changelog**: https://github.com/BuQQzz/SHIELD2.0/blob/main/CHANGELOG.md
