# GPT-OSS Model Configuration Notes

## The Problem

GPT-OSS models (20B, 120B) output chain-of-thought reasoning in a special channel-based format that shows raw XML tags by default:

```
<|start|>assistant<|channel|>analysis<|message|>
...thinking content...
<|end|>
<|start|>assistant<|channel|>final<|message|>
...actual response...
```

## Why Our Current Solution Doesn't Work

1. **Chat Template Issue**: The model uses a specific Jinja chat template that controls output formatting
2. **llama.cpp Handles It**: The llama.cpp library has built-in support for GPT-OSS but requires proper configuration
3. **Grammar Constraint**: Some clients use GBNF grammar files to force specific output formats

## Official Solutions

### Option 1: Use llama.cpp Built-In Support

When loading the model via llama.cpp or llama-server, use the `--jinja` flag:

```bash
llama-server -hf ggml-org/gpt-oss-20b-GGUF --jinja
```

This tells llama.cpp to use the model's built-in chat template which properly handles the channel format.

### Option 2: Grammar File (For Non-Native Tool Calling)

If you want to suppress native tool calls (like in Cline/Roo Code), use this grammar:

**Save as `gpt-oss.gbnf`:**

```gbnf
root ::= analysis? start final .+
analysis ::= "<|channel|>analysis<|message|>" ( [^<] | "<" [^|] | "<|" [^e] )* "<|end|>"
start ::= "<|start|>assistant"
final ::= "<|channel|>final<|message|>"
```

Then load with:

```bash
llama-server --grammar-file gpt-oss.gbnf --jinja
```

### Option 3: System Prompt

Add to your system prompt:

```
Valid channels: analysis, final. Channel must be included for every message.
```

## For SHIELD 2.0

### Short-Term Fix

Since we're using llama.cpp bindings directly, we need to:

1. **Ensure we're passing the right chat template** when initializing the model
2. **Or post-process** to extract thinking (current approach)

### Current Implementation Status

✅ XML parsing patterns added to `messageHandler.ts`  
✅ ThinkingIndicator component created  
✅ Integration complete  
❌ **Pattern not matching actual output** - needs debugging

### Next Steps

1. **Test the regex pattern** against actual model output
2. **Add chat template configuration** to LlamaService
3. **Consider using grammar files** for better control
4. **Or simplify**: Just strip ALL XML tags and show plain text

## References

- [llama.cpp GPT-OSS Guide](https://github.com/ggerganov/llama.cpp/discussions/15396)
- [GPT-OSS Discussion Thread](https://github.com/ggerganov/llama.cpp/discussions/15095)
- [Channel Format Explanation](https://github.com/ggerganov/llama.cpp/discussions/15396#discussioncomment-14145537)

## Recommendation

For now, the **simplest solution** might be to:

1. Keep the current parsing approach
2. Add a debug log to see the EXACT output format
3. Adjust the regex pattern to match
4. OR just visually hide the XML tags with CSS/formatting

The model is working as intended - it's designed to show its thinking process. We just need to present it nicely!
