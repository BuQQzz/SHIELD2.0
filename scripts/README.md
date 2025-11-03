# SHIELD 2.0 - Scripts

Utility scripts for development and testing.

## Model Management

### Download Models

Download GGUF models optimized for RTX 4070 (12GB VRAM):

```bash
npm run download-model <model-key>
```

**Available Models:**

- `qwen-7b` - Qwen2.5-7B-Instruct (4.4GB) - Excellent multilingual, fast
- `llama-3b` - Llama-3.2-3B-Instruct (1.9GB) - Smaller, great for testing
- `mistral-7b` - Mistral-7B-Instruct-v0.3 (4.1GB) - Good general purpose

**Example:**

```bash
npm run download-model qwen-7b
```

Models are downloaded to `models/` directory and excluded from git.

### Test Inference

Verify the model works correctly:

```bash
npm run test:inference
```

This will:

1. Initialize llama.cpp
2. Load the Qwen 7B model
3. Create a context and chat session
4. Run a simple Q&A test
5. Display the response

## Development Scripts

### test-llama.ts

Basic llama.cpp installation test:

```bash
npx tsx scripts/test-llama.ts
```

Checks:

- llama.cpp initialization
- GPU detection

### download-model.ts

Advanced model downloader with progress tracking.

### test-inference.ts

Full inference pipeline test with chat session.

## Notes

- All scripts use ES modules (`.ts` files)
- Run with `tsx` or via npm scripts
- Models are cached after first download
- GPU acceleration is automatic on compatible hardware
