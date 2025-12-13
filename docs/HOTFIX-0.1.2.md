# Hotfix 0.1.2 - Model Selector Visibility

## Issue

In production builds (v0.1.1), the model selector dropdown was not visible to users. This created a critical UX problem where users who installed the app had no way to:
- See which models they could download
- Access the "Browse & Download Models" button
- Select or switch between models

The model selector worked perfectly in dev mode but was completely hidden in production installations.

## Root Cause

The `ChatHeader` component had a conditional render that only displayed the `ModelSelector` when `availableModels.length > 0`:

```tsx
{availableModels.length > 0 && onModelSelect && (
  <ModelSelector ... />
)}
```

In fresh production installations:
1. No models are pre-installed (by design - users download via the app)
2. `listInstalledModels()` returns an empty array
3. `availableModels` is empty
4. Model selector doesn't render
5. Users have no way to access the download dialog

## Solution

Modified the component hierarchy to always show the model selector:

### 1. Updated `ModelSelector.tsx`
- Added a "No models installed" message when `models.length === 0`
- Always show the "Browse & Download Models" button regardless of installed models
- Changed button text from "Select Model" to "Download Models" when no models exist

### 2. Updated `ChatHeader.tsx`  
- Removed the `availableModels.length > 0` condition
- Model selector now always renders (as long as `onModelSelect` callback is provided)

## Changes Made

### Files Modified

**src/components/chat/ModelSelector.tsx**
- Added conditional rendering for empty state
- Shows helpful message: "No models installed - Download a model to get started"
- Dynamic button text based on model availability
- Maintains the "Browse & Download Models" button in all cases

**src/components/chat/ChatHeader.tsx**
- Changed from `{availableModels.length > 0 && onModelSelect && ...}`
- To: `{onModelSelect && ...}`
- Ensures model selector always visible when model selection is enabled

**electron/setup/windowSetup.ts**
- Fixed syntax error from previous changes (misplaced closing brace)
- Properly wrapped window.show() in ready-to-show event

### Files Cleaned

**src/hooks/useInstalledModels.ts**
- Removed debug console.logs added during investigation

**electron/services/model-download/ModelFileManager.ts**
- Removed debug console.logs added during investigation

## User Experience Impact

### Before (v0.1.1)
- Fresh installation: Model selector completely hidden
- No obvious way to download models
- Users confused about how to get started
- Dead end for new users

### After (v0.1.2)
- Fresh installation: Model selector always visible
- Button shows "Download Models" 
- Clicking opens model browser immediately
- Clear path to getting started
- Seamless user onboarding

## Testing

Verified fix by:
1. Building production installer
2. Installing on clean system
3. Confirming model selector visible on first launch
4. Clicking "Download Models" opens dialog correctly
5. After downloading a model, selector updates to show installed models

## Prevention

This issue highlights the need for:
- Testing production builds on clean systems
- Considering empty/initial state in all UI components
- Avoiding conditional rendering that blocks critical functionality
- Better UX testing for first-time user experience

## Related Issues

- Part of post-release testing for v0.1.1
- Discovered during laptop testing after release
- Classified as critical UX bug requiring immediate hotfix

## Deployment

- Version bumped: 0.1.1 → 0.1.2
- CHANGELOG.md updated
- New production installer built
- Ready for immediate release
