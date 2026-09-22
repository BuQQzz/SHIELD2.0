# Model Capabilities System

## Overview

The Model Capabilities system dynamically enables/disables features based on each model's specifications and strengths. This prevents users from attempting features that their current model doesn't support well.

## Architecture

### ModelCapabilities Interface

Located in `src/config/models.ts`:

```typescript
interface ModelCapabilities {
  toolCalling: boolean; // Native function calling support
  complexReasoning: boolean; // Good at multi-step reasoning
  webSearch: boolean; // Works well with web search
  structuredOutput: boolean; // Follows JSON/XML formats
  longContext: boolean; // Utilizes long context effectively
  codeGeneration: boolean; // Good at generating code
  multilingual: "excellent" | "good" | "basic";
  temperatureRange: {
    min: number;
    max: number;
    default: number;
  };
}
```

### useModelCapabilities Hook

Located in `src/hooks/useModelCapabilities.ts`:

```typescript
const { supports, shouldEnable, getWarning, hasCapabilities } = useModelCapabilities(currentModel);

// Check specific capabilities
if (supports.toolCalling) { ... }

// Check if feature should be enabled
if (shouldEnable.mcp) { ... }

// Get warning message for unsupported features
const warning = getWarning('mcp'); // Returns warning string or null
```

## Current Model Capabilities

The catalog has grown to 15 models across four tiers (Premium,
High Performance, Efficient, Specialized) - see
[MODEL_DOWNLOAD.md](MODEL_DOWNLOAD.md#model-catalog) for the full,
current list, or `src/config/models.ts` (`MODEL_CATALOG`) as the
canonical source. Rather than duplicate a per-model table here (which
went stale the first time the catalog grew), this doc tracks the
*system* that reads those capabilities.

**Pre-installed defaults** (`isInstalled: true`) remain Qwen 2.5 7B,
Llama 3.2 3B, and Mistral 7B - none of which support native tool
calling (see below). Everything added since (Qwen3 family, Llama 3.3
70B, Qwen 2.5 Coder 32B, Mistral Large 2) is downloadable through the
Model Browser and several of those *do* support tool calling.

**Recommended for general chat**: Qwen 7B (default) or Mistral 7B.
**Recommended for tool calling**: see the Premium tier in
[MODEL_DOWNLOAD.md](MODEL_DOWNLOAD.md#model-catalog) - all seven
Premium-tier models have `toolCalling: true`.

## UI Integration

### MCP Status Indicator

The MCP status button in the chat header shows different states based on model capabilities:

- **MCP Off** (gray): Feature disabled
- **Initializing...** (gray, spinning): Starting MCP service
- **MCP Ready** (green): Model supports tool calling well, MCP active
- **MCP Limited** (yellow): Model doesn't support tool calling well, but MCP is enabled
- **MCP Error** (red): MCP initialization failed

### Warning Messages

When a model doesn't support a feature well, users see:

**Header tooltip**: "This model may not reliably use file operations. Consider using Qwen 7B or Mistral 7B"

**Settings page**: Yellow warning box with detailed explanation

## Implementation Notes

### Why the Pre-Installed Defaults Don't Support Tool Calling

None of the three pre-installed models (Qwen 7B, Llama 3B, Mistral 7B) have `toolCalling: true` because:

1. **Not trained on XML format**: The models weren't specifically trained to generate XML-based tool calls
2. **No function calling in base training**: They don't have native function calling capabilities
3. **Structured output ≠ tool calling**: While some can follow structured formats, they don't reliably generate tool call syntax

### Current Limitation

With only the pre-installed defaults loaded, MCP tool calling will **not work** out of the box. The MCP status shows "Limited" until the user switches to a tool-calling-capable model.

**Resolved**: the models below are now built into the in-app catalog (Model Browser → Tool Calling filter), not just a suggestion to go find externally:

- **Llama 3.3 70B** - Excellent function calling
- **Qwen 2.5 Coder 32B** - Trained on tool use
- **Qwen3 Coder Next 80B**, **Qwen3 8B**, **Qwen3 4B** - Native tool use (added 2025-08)
- **Qwen3.5 397B A17B** - Flagship MoE (added 2025-10)
- **Mistral Large 2** - Native function calling

Command R+ is not in the catalog - it would need to be added to
`src/config/models.ts` like any other model before it'd show up here.

### Removed Features

**Intent Detection System (Removed November 2025)**

- Previously used regex pattern matching to detect file operations from natural language
- Allowed any model to use MCP through intent recognition
- Removed to simplify architecture and focus on proper tool-calling models
- Future will use only models with native XML/function calling support

## Adding New Models

When adding a new model, define its capabilities:

```typescript
{
  id: 'new-model',
  name: 'New Model',
  size: '7B',
  quantization: 'Q4_K_M',
  capabilities: {
    toolCalling: true,          // If trained on function calling
    complexReasoning: true,     // If good at reasoning
    webSearch: true,            // If works with search
    structuredOutput: true,     // If follows formats well
    longContext: true,          // If uses context effectively
    codeGeneration: true,       // If good at code
    multilingual: 'excellent',  // excellent/good/basic
    temperatureRange: {
      min: 0.1,
      max: 1.5,
      default: 0.7
    }
  }
}
```

## Future Enhancements

1. **Model Download UI**: Show capabilities before downloading
2. **Capability Badges**: Visual indicators in model selector
3. **Smart Recommendations**: Suggest best model for user's task
4. **Capability Matrix**: Comparison table of all models
5. **Auto-Model Switching**: Switch to compatible model when enabling features
6. **More Tool-Calling Models**: Add models with native function calling support

## Related Files

- `src/config/models.ts` - Model definitions and capabilities
- `src/hooks/useModelCapabilities.ts` - Capability checking hook
- `src/components/chat/MCPStatus.tsx` - MCP status with warnings
- `src/components/settings/MCPSettings.tsx` - Settings with warnings
- `src/types/index.ts` - Type definitions
