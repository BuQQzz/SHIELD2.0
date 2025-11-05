# Model Download Feature

## Overview

The Model Download Feature allows users to browse, download, and manage AI models directly from within the SHIELD 2.0 application. Users can access a curated catalog of 12 models from trusted sources (Hugging Face), with real-time download progress tracking and model management capabilities.

## Features

### 1. Model Catalog
- **12 Curated Models**: Premium (tool-calling), High Performance (7B-14B), and Efficient (<5GB) categories
- **Model Metadata**: Display name, provider, size, VRAM requirements, context window, release date
- **Capability Badges**: Visual indicators for model features:
  - ⚡ Tool Calling (green)
  - 💻 Code Generation (blue)
  - 📚 Long Context (purple)
  - 🌍 Multilingual Support (orange)
  - 🧠 Complex Reasoning (indigo)
  - 📋 Structured Output (cyan)

### 2. Model Browser Dialog
- **Access**: Click "Browse & Download Models" button in the Model Selector dropdown
- **Filtering**: 
  - All Models
  - Tool Calling (premium models with function calling)
  - Code Generation (optimized for coding tasks)
  - Efficient (<5GB, suitable for lower-end hardware)
  - Installed (only show downloaded models)
- **Search**: Real-time search by model name, description, or provider
- **Grouped Display**: Models organized by category with collapse/expand animations

### 3. Download Management
- **Real-time Progress**: 
  - Progress bar with percentage
  - Downloaded/total bytes
  - Download speed (KB/s, MB/s)
  - Estimated time remaining (ETA)
- **Download Control**:
  - Start download with single click
  - Cancel active download
  - Pause/resume (via cancel and restart)
- **Status Indicators**:
  - Downloading (blue, animated spinner)
  - Completed (green checkmark)
  - Error (red X with error message)
  - Cancelled (grey)

### 4. Model Management
- **Installation Detection**: Automatically detects installed models on app startup
- **Delete Models**: 
  - Trash icon on installed models
  - Confirmation dialog with model details
  - Permanent deletion from disk
- **Disk Space Tracking**: View total space used by all models

## Usage

### Browsing Models
1. Click the Model Selector dropdown in the chat header
2. Click "Browse & Download Models" at the bottom
3. Use filters or search to find desired model
4. Review model capabilities, size, and VRAM requirements

### Downloading a Model
1. Find the model in the browser dialog
2. Click the "Download" button
3. Monitor download progress in the model card
4. Download continues in background (dialog can be closed)
5. Model automatically appears in Model Selector when complete

### Deleting a Model
1. Open the Model Browser dialog
2. Find an installed model (green checkmark)
3. Click the trash icon
4. Confirm deletion in the dialog
5. Model file is permanently removed from disk

## Technical Implementation

### Architecture
```
Model Download Flow:
1. User clicks download → ModelDownloadDialog
2. useModelDownload hook → IPC call to main process
3. ModelDownloadService → node-llama-cpp resolveModelFile
4. Progress tracking → IPC events back to renderer
5. DownloadProgressBar updates in real-time
```

### Components
- **ModelDownloadDialog**: Main browsing and download UI
- **ModelCard**: Individual model display with actions
- **DownloadProgressBar**: Real-time progress visualization
- **DeleteModelDialog**: Confirmation dialog for model deletion
- **CapabilityBadge**: Visual indicators for model features

### Hooks
- **useModelDownload**: 
  - Manages download state (active downloads, installed models)
  - IPC communication for download operations
  - Real-time progress updates via event listeners
  - Cleanup on unmount

### Services
- **ModelDownloadService** (Electron main process):
  - Wraps node-llama-cpp's resolveModelFile
  - Progress estimation (speed, ETA)
  - Download cancellation via AbortController
  - Model installation detection
  - Model deletion and disk space calculation

### IPC Channels
- `model:download` - Start model download
- `model:cancel` - Cancel active download
- `model:get-progress` - Get current download progress
- `model:list-installed` - List all installed models
- `model:is-installed` - Check if specific model exists
- `model:delete` - Delete model file
- `model:get-disk-space` - Calculate total model storage
- `model:download-progress` - Real-time progress events (event emitter)

## Model Catalog

### Premium (Tool Calling)
1. **Llama 3.3 70B Instruct** - 40GB, 48GB VRAM, 131K context
2. **Qwen 2.5 Coder 32B Instruct** - 20GB, 24GB VRAM, 131K context
3. **Mistral Large 2** - 25GB, 28GB VRAM, 128K context

### High Performance (7B-14B)
4. **Qwen 2.5 7B Instruct** - 4.9GB, 8GB VRAM, 131K context
5. **Mistral 7B Instruct v0.3** - 4.4GB, 8GB VRAM, 32K context
6. **Phi-3 Medium 14B Instruct** - 8.5GB, 12GB VRAM, 128K context

### Efficient (<5GB)
7. **Llama 3.2 3B Instruct** - 1.9GB, 4GB VRAM, 131K context
8. **Llama 3.2 1B Instruct** - 750MB, 2GB VRAM, 131K context
9. **Qwen 2.5 3B Instruct** - 1.9GB, 4GB VRAM, 32K context
10. **DeepSeek Coder 7B Instruct v1.5** - 4.3GB, 8GB VRAM, 16K context
11. **Gemma 2 9B Instruct** - 5.7GB, 10GB VRAM, 8K context

All models sourced from Hugging Face with quantization (Q4_K_M format for efficiency).

## Configuration

### Adding New Models
Edit `src/config/models.ts`:

```typescript
{
  id: 'unique-model-id',
  name: 'model-file-name',
  displayName: 'User-Friendly Name',
  description: 'Brief description of model features',
  uri: 'hf://user/repo/file.gguf',
  provider: 'Provider Name',
  size: '4.9GB',
  releaseDate: '2024-12',
  contextSize: 131072,
  hardware: {
    minVRAM: 8,
    minRAM: 16,
    recommended: 'NVIDIA RTX 3060 or better',
  },
  capabilities: {
    toolCalling: true,
    codeGeneration: true,
    longContext: true,
    multilingual: 'excellent',
    complexReasoning: true,
    structuredOutput: true,
    webSearch: true,
    temperatureRange: { min: 0.1, max: 1.0, default: 0.7 },
  },
}
```

### Model URI Format
```
hf://owner/repository/filename.gguf
```
Example: `hf://Qwen/Qwen2.5-7B-Instruct-GGUF/qwen2.5-7b-instruct-q4_k_m.gguf`

## Storage Location
- **Windows**: `%APPDATA%/shield2.0/models/`
- **macOS**: `~/Library/Application Support/shield2.0/models/`
- **Linux**: `~/.config/shield2.0/models/`

## Error Handling

### Common Errors
1. **Network Failure**: Download automatically retries; user can manually retry
2. **Insufficient Disk Space**: Shows error before download starts
3. **Corrupted Download**: User can delete and re-download
4. **Model Not Found**: Indicates invalid URI or removed model

### User Feedback
- Real-time error messages in download progress bar
- Console logging for debugging
- Error state persists briefly before auto-clearing
- Deletion confirmation prevents accidental removal

## Future Enhancements
- Pause/resume downloads (requires backend support)
- Download queue for multiple models
- Automatic model updates when new versions released
- Model verification (checksum validation)
- Bandwidth throttling options
- Download history and statistics
- Custom model import (from local files)
- Model performance benchmarks

## Testing Checklist
- [ ] Browse models in dialog
- [ ] Filter by category
- [ ] Search functionality
- [ ] Download a small model (<2GB)
- [ ] Monitor download progress
- [ ] Cancel active download
- [ ] Download completion notification
- [ ] Model appears in selector
- [ ] Delete installed model
- [ ] Confirm deletion dialog
- [ ] Model removed from disk
- [ ] Error handling (network failure)
- [ ] Multiple simultaneous downloads
- [ ] App restart with models installed

## Dependencies
- `node-llama-cpp`: Model downloading and inference
- `framer-motion`: UI animations
- `lucide-react`: Icons
- `shadcn/ui`: UI components

## Performance Considerations
- Downloads occur in Electron main process (non-blocking)
- Progress updates throttled to avoid UI lag
- Large models (>20GB) show accurate ETA calculations
- Model detection is fast (filesystem checks only)
- Deletion is immediate (no confirmation delay)
