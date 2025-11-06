# Thinking Animation - Chain-of-Thought UI

## Overview

SHIELD 2.0 now features a **thinking animation UI** that displays AI reasoning processes for models that output chain-of-thought analysis. This provides transparency into how the AI arrives at its answers, similar to ChatGPT and Claude's thinking indicators.

## Visual Design

### Components

1. **Collapsible Header**
   - 🧠 Brain icon (purple/violet)
   - "Thinking..." label (while streaming)
   - "AI Reasoning" label (after completion)
   - Three-dot animated loading indicator
   - Expand/collapse chevron

2. **Expandable Content Area**
   - Mono-spaced font for code-like formatting
   - Preserves whitespace and line breaks
   - Smooth fade-in animation
   - Muted color scheme (doesn't distract from answer)

### Animation States

| State         | Visual Indicator                        |
| ------------- | --------------------------------------- |
| **Streaming** | Brain icon pulsing, three dots bouncing |
| **Complete**  | Static brain icon, expandable content   |
| **Expanded**  | Shows full reasoning with scroll        |
| **Collapsed** | Hides reasoning, shows summary          |

## Supported XML Formats

The system automatically detects and parses multiple chain-of-thought XML formats:

### 1. Analysis Tags

```xml
<analysis>
Step 1: Understand the question
Step 2: Consider the context
Step 3: Formulate answer
</analysis>
```

### 2. Thinking Tags

```xml
<thinking>
Let me think through this carefully...
First, I need to...
Then, I should...
</thinking>
```

### 3. Thought Tags

```xml
<thought>
My reasoning process:
- Point 1
- Point 2
- Conclusion
</thought>
```

### 4. Chain of Thought Tags

```xml
<chain_of_thought>
Breaking this down step by step:
1. First observation
2. Second observation
3. Final conclusion
</chain_of_thought>
```

### 5. Complex Nested Format (GPT OSS)

```xml
<start>
<analysis>
We need to respond. No search results provided. So we can answer normally.
</analysis>
<assistant>
<channel>
<message>
<final>
Hello! I'm doing great—thanks for asking. How can I help you today?
</final>
</message>
</channel>
</assistant>
</end>
```

## How It Works

### 1. Detection Phase

When a model responds, the `messageHandler` scans for thinking XML tags:

```typescript
const thinkingPatterns = [
  /<analysis>([\s\S]*?)<\/analysis>/i,
  /<thinking>([\s\S]*?)<\/thinking>/i,
  /<thought>([\s\S]*?)<\/thought>/i,
  /<chain_of_thought>([\s\S]*?)<\/chain_of_thought>/i,
  /<start>[\s\S]*?<analysis>([\s\S]*?)<\/end>/i,
];
```

### 2. Extraction Phase

When a pattern matches:

- Extract thinking content
- Remove thinking XML from visible response
- Clean up wrapper tags (`<start>`, `<channel>`, `<message>`, etc.)
- Store thinking separately in message object

### 3. Display Phase

In the UI:

- Show `ThinkingIndicator` component above final answer
- Default state: collapsed
- User can expand to see reasoning
- Thinking persists in conversation history

### 4. Streaming Support

While thinking is being generated:

- `isThinking: true` flag set on message
- Animated brain icon pulses
- Three-dot loading indicator bounces
- Content streams in real-time when expanded

## User Experience

### Before (Without Thinking UI)

```
You: hi how are you

SHIELD Assistant:
analysis...We need to respond. No search results provided. So we can
answer normally.</end>
<start>>assistant</channel>>final>Hello! I'm doing great—thanks
for asking. How can I help you today?
```

❌ **Problems:**

- Raw XML visible to user
- Confusing and unprofessional
- Reasoning mixed with answer
- Difficult to read

### After (With Thinking UI)

```
You: hi how are you

SHIELD Assistant:
┌─────────────────────────────────────┐
│ 🧠 AI Reasoning              ▼      │ ← Collapsible
├─────────────────────────────────────┤
│ We need to respond. No search       │ ← Hidden by default
│ results provided. So we can answer  │
│ normally.                           │
└─────────────────────────────────────┘

Hello! I'm doing great—thanks for asking. How can I help you today?
```

✅ **Benefits:**

- Clean, professional appearance
- Thinking separated from answer
- User can expand to see reasoning
- Transparent AI process

## Model Compatibility

### Models That Show Thinking

These models output chain-of-thought reasoning automatically:

| Model              | Format               | Notes                 |
| ------------------ | -------------------- | --------------------- |
| **GPT OSS 20B**    | `<analysis>` nested  | Complex XML structure |
| **Qwen 2.5 Coder** | `<thinking>`         | Clean format          |
| **Llama 3.3 70B**  | `<thought>`          | Sometimes outputs CoT |
| **DeepSeek Coder** | `<chain_of_thought>` | Detailed reasoning    |

### Models Without Thinking

These models don't output thinking tags (normal behavior):

- **Qwen 2.5 7B** - Direct answers
- **Llama 3.1 8B** - Standard responses
- Most smaller models (<13B parameters)

## Technical Implementation

### Component Structure

```typescript
<ThinkingIndicator
  thinking="AI's reasoning content"
  isStreaming={true}  // While generating
  defaultExpanded={false}  // Start collapsed
/>
```

### Message Interface

```typescript
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string; // Clean final answer
  thinking?: string; // Extracted reasoning
  isThinking?: boolean; // Streaming state
  // ... other fields
}
```

### Integration Points

1. **messageHandler.ts** - Detects and extracts thinking
2. **ThinkingIndicator.tsx** - Renders collapsible UI
3. **ChatMessage.tsx** - Integrates indicator into messages
4. **conversation.ts** - Persists thinking in storage

## Configuration

### Future Settings (Planned)

```typescript
// In settings UI
{
  thinking: {
    showByDefault: false,  // Start collapsed
    autoExpand: false,  // Don't auto-expand
    preserveInHistory: true,  // Save thinking
    formats: ["analysis", "thinking", "thought"]  // Which tags to detect
  }
}
```

Currently, thinking detection is **always enabled** and **defaults to collapsed**.

## Performance Considerations

### Memory Impact

- Storing thinking increases message size by ~20-50%
- Example: 500 char answer + 200 char thinking = 700 chars total
- Negligible impact on modern systems

### Rendering Performance

- ThinkingIndicator uses lazy rendering
- Collapsed state: minimal DOM
- Expanded state: renders only when visible
- Smooth animations via Framer Motion

## Examples

### Example 1: Simple Analysis

**Model Output:**

```xml
<analysis>
User is greeting. Respond warmly and offer help.
</analysis>
Hello! I'm here to help. What can I assist you with?
```

**UI Display:**

```
🧠 AI Reasoning ▼
Hello! I'm here to help. What can I assist you with?
```

**Expanded:**

```
🧠 AI Reasoning ▼
┌─────────────────────────────────────┐
│ User is greeting. Respond warmly    │
│ and offer help.                     │
└─────────────────────────────────────┘
Hello! I'm here to help. What can I assist you with?
```

### Example 2: Multi-Step Reasoning

**Model Output:**

```xml
<thinking>
Step 1: Identify the question - user wants to know about Python
Step 2: Recall Python basics - interpreted, high-level, versatile
Step 3: Provide concise summary with examples
</thinking>
Python is a high-level, interpreted programming language...
```

**UI Display:**

```
🧠 AI Reasoning ▼
Python is a high-level, interpreted programming language...
```

**Expanded:**

```
🧠 AI Reasoning ▼
┌─────────────────────────────────────┐
│ Step 1: Identify the question -     │
│ user wants to know about Python     │
│ Step 2: Recall Python basics -      │
│ interpreted, high-level, versatile  │
│ Step 3: Provide concise summary     │
│ with examples                       │
└─────────────────────────────────────┘
Python is a high-level, interpreted programming language...
```

## Troubleshooting

### Thinking Not Detected

**Issue**: Model outputs XML but thinking doesn't appear

**Solutions**:

1. Check console logs for parsing errors
2. Verify XML format matches supported patterns
3. Check if model wraps thinking in unusual tags
4. Submit issue with example model output

### Thinking Shows in Answer

**Issue**: XML tags visible in final response

**Solutions**:

1. Check `messageHandler.ts` regex patterns
2. Verify tag extraction logic
3. Ensure wrapper tags are being cleaned
4. Report unhandled format

### Expanded Content Truncated

**Issue**: Long reasoning cut off

**Solutions**:

1. Check CSS `max-height` in ThinkingIndicator
2. Verify scroll overflow is enabled
3. Increase container limits if needed

## Future Enhancements

Potential improvements for future releases:

1. **Streaming Thinking UI**
   - Show thinking as it's being generated
   - Character-by-character animation
   - Pause/resume streaming

2. **Syntax Highlighting**
   - Color-code different reasoning steps
   - Highlight key decisions
   - Visual flow indicators

3. **Thinking Analytics**
   - Track reasoning patterns
   - Identify common thought processes
   - Improve model prompts

4. **Export Options**
   - Include thinking in exports
   - Separate reasoning file
   - Training data format

5. **Custom Thinking Styles**
   - Theme support (light/dark)
   - Font size adjustment
   - Compact/expanded modes

## Related Features

- [Chain-of-Thought Prompting](../PROMPTING.md) - How to encourage reasoning
- [Web Search Reasoning](./WEB_SEARCH.md) - Reasoning for search responses
- [Model Capabilities](./MODEL_CAPABILITIES.md) - Which models support thinking

## References

- [Chain-of-Thought Paper](https://arxiv.org/abs/2201.11903) - Original research
- [GPT-4 Technical Report](https://arxiv.org/abs/2303.08774) - Reasoning capabilities
- [Claude's Thinking](https://www.anthropic.com/news/claude-2-1) - Similar implementation

---

**Last Updated**: 2024 (SHIELD 2.0 v0.1.0)
**Status**: ✅ Implemented and Tested
