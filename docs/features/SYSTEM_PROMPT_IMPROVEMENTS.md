# System Prompt Improvements Plan

## Overview

Improve system prompts to make models more responsive, especially for tool calling and web search features. Based on research into modern prompting techniques (ReAct, Chain-of-Thought, function calling best practices).

**Issue**: Models "don't listen well or pick up on subtleties"
**Goal**: Model-specific prompts that leverage each model's strengths

---

## Phase 1: Create Prompt Infrastructure

### 1.1 Create System Prompt Configuration
- [x] Create `src/config/systemPrompts.ts` with:
  - [x] Base system prompt (identity, core behavior)
  - [x] Model-family specific prompts (Qwen, Llama, Mistral, etc.)
  - [x] Capability-based prompt modules (tool calling, web search, reasoning)
  - [x] Prompt builder function that assembles final prompt

### 1.2 Define Prompt Types
- [x] Create `src/types/prompts.ts` with:
  - [x] `SystemPromptConfig` interface
  - [x] `PromptCapability` enum (toolCalling, webSearch, reasoning, etc.)
  - [x] `ModelPromptOverrides` interface

---

## Phase 2: Implement Model-Specific Prompts

### 2.1 Base Prompt (All Models)
- [x] Define SHIELD identity and personality
- [x] Add general helpfulness guidelines
- [x] Include privacy-first principles
- [x] Add truthfulness and uncertainty acknowledgment

### 2.2 Model Family Prompts
- [x] **Qwen**: ChatML-optimized, good at following instructions
- [x] **Llama**: Explicit reasoning encouragement, concise format
- [x] **Mistral**: Function calling optimized, structured outputs
- [x] **Phi**: Compact prompts (smaller context)
- [x] **Gemma**: Google-style formatting
- [x] **DeepSeek**: Code-focused additions

### 2.3 Capability Prompts
- [x] **Tool Calling Prompt**: ReAct format with examples
- [x] **Web Search Prompt**: Result handling, source citation
- [x] **Code Generation Prompt**: Language awareness, best practices
- [x] **Reasoning Prompt**: Chain-of-thought encouragement

---

## Phase 3: Update MCP Tool Prompt

### 3.1 Improve Tool Definitions
- [x] Add clearer tool descriptions
- [x] Include parameter constraints
- [x] Add usage context ("when to use")

### 3.2 Implement ReAct Format
- [x] Add Thought/Action/Observation structure
- [x] Include 2-3 few-shot examples
- [ ] Add stop words configuration

### 3.3 Model-Specific Tool Formats
- [ ] JSON format for Mistral/Qwen (native support)
- [x] XML format fallback for other models
- [ ] Add format detection based on model capabilities

---

## Phase 4: Integration

### 4.1 Update LlamaService
- [ ] Modify `setSystemPrompt` to use new prompt builder (not needed - hook handles it)
- [x] Pass model info for model-specific prompts
- [x] Add capability flags from loaded model

### 4.2 Update useMCPSystemPrompt Hook
- [x] Use new prompt composition system
- [x] Add model-aware MCP prompts
- [x] Maintain backward compatibility

### 4.3 Update Settings
- [x] Update default system prompt in settings
- [ ] Add "prompt mode" option (simple/advanced)? (deferred - future enhancement)
- [ ] Consider per-model prompt overrides in UI (deferred - future enhancement)

---

## Phase 5: Testing & Documentation

### 5.1 Testing
- [ ] Test each model family with new prompts
- [ ] Verify tool calling works correctly
- [ ] Test web search result handling
- [ ] Validate reasoning quality improvements

### 5.2 Documentation
- [x] Update FEATURES.md
- [x] Add usage examples
- [x] Document prompt customization options
- [x] Update CHANGELOG.md

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/config/systemPrompts.ts` | **CREATE** | New prompt configuration module |
| `src/types/prompts.ts` | **CREATE** | Prompt-related types |
| `src/handlers/mcpToolHandler.ts` | **MODIFY** | Improve MCP prompts |
| `src/hooks/useMCPSystemPrompt.ts` | **MODIFY** | Use new prompt system |
| `src/services/LlamaService.ts` | **MODIFY** | Model-aware prompts |
| `src/types/settings.ts` | **MODIFY** | Update default prompt |
| `docs/features/SYSTEM_PROMPTS.md` | **CREATE** | Feature documentation |

---

## Research References

- **ReAct Prompting**: Reasoning + Acting interleaved (Yao et al., 2022)
- **Chain-of-Thought**: Step-by-step reasoning (Wei et al., 2022)
- **Function Calling**: Tool definitions with descriptions
- **Qwen ReAct**: Native tool calling support
- **Mistral Function Calling**: JSON-based tool use

---

## Current Status

**Started**: 2026-01-30
**Current Phase**: Phase 5 (Testing & Documentation)
**Next Step**: Test with models and update documentation

---

## Notes

- Keep prompts concise to save context window
- Test with smallest model first (Llama 3B) to ensure works with limited reasoning
- Preserve user's custom system prompts if they've modified them
- Consider token budget - prompts shouldn't exceed ~500 tokens
