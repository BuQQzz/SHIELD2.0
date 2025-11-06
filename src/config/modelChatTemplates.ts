/**
 * Model-specific chat template formatters
 * Each model family has its own template format with specific special tokens
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type ChatTemplateFormatter = (
  messages: ChatMessage[]
) => string;

/**
 * Llama 3.x Chat Template
 * Used by: Llama-3.2-1B, Llama-3.2-3B, Llama-3.3-70B
 * 
 * Format:
 * <|begin_of_text|><|start_header_id|>system<|end_header_id|>
 * {content}<|eot_id|><|start_header_id|>user<|end_header_id|>
 * {content}<|eot_id|><|start_header_id|>assistant<|end_header_id|>
 */
export const llamaChatTemplate: ChatTemplateFormatter = (messages) => {
  let prompt = "<|begin_of_text|>";

  for (const msg of messages) {
    prompt += `<|start_header_id|>${msg.role}<|end_header_id|>\n\n`;
    prompt += `${msg.content}<|eot_id|>`;
  }

  // Add assistant prompt to trigger generation
  prompt += "<|start_header_id|>assistant<|end_header_id|>\n\n";

  return prompt;
};

/**
 * Qwen 2.5 Chat Template (ChatML format)
 * Used by: Qwen2.5-3B, Qwen2.5-7B, Qwen2.5-Coder-32B
 * 
 * Format:
 * <|im_start|>system
 * {content}<|im_end|>
 * <|im_start|>user
 * {content}<|im_end|>
 * <|im_start|>assistant
 */
export const qwenChatTemplate: ChatTemplateFormatter = (messages) => {
  let prompt = "";

  for (const msg of messages) {
    prompt += `<|im_start|>${msg.role}\n`;
    prompt += `${msg.content}<|im_end|>\n`;
  }

  // Add assistant prompt to trigger generation
  prompt += "<|im_start|>assistant\n";

  return prompt;
};

/**
 * Mistral Chat Template
 * Used by: Mistral-7B-Instruct, Mistral-Large-2
 * 
 * Format:
 * <s>[INST] {system_content}
 * {user_content} [/INST]
 * 
 * Note: Mistral uses special [INST] tags and combines system+user in first turn
 */
export const mistralChatTemplate: ChatTemplateFormatter = (messages) => {
  let prompt = "<s>";
  let isFirstTurn = true;

  // Mistral combines system message with first user message
  const systemMsg = messages.find((m) => m.role === "system");
  const userMessages = messages.filter((m) => m.role === "user");
  const assistantMessages = messages.filter((m) => m.role === "assistant");

  // Build conversation
  for (let i = 0; i < userMessages.length; i++) {
    const userMsg = userMessages[i];
    const assistantMsg = assistantMessages[i];

    if (isFirstTurn && systemMsg) {
      prompt += `[INST] ${systemMsg.content}\n\n${userMsg!.content} [/INST]`;
      isFirstTurn = false;
    } else {
      prompt += `[INST] ${userMsg!.content} [/INST]`;
    }

    if (assistantMsg) {
      prompt += ` ${assistantMsg.content}</s>`;
      if (i < userMessages.length - 1) {
        prompt += "<s>";
      }
    }
  }

  return prompt;
};

/**
 * Phi-3 Chat Template
 * Used by: Phi-3-Medium-14B
 * 
 * Format:
 * <|system|>
 * {content}<|end|>
 * <|user|>
 * {content}<|end|>
 * <|assistant|>
 */
export const phiChatTemplate: ChatTemplateFormatter = (messages) => {
  let prompt = "";

  for (const msg of messages) {
    prompt += `<|${msg.role}|>\n`;
    prompt += `${msg.content}<|end|>\n`;
  }

  // Add assistant prompt to trigger generation
  prompt += "<|assistant|>\n";

  return prompt;
};

/**
 * Gemma 2 Chat Template
 * Used by: Gemma-2-9B
 * 
 * Format:
 * <start_of_turn>user
 * {content}<end_of_turn>
 * <start_of_turn>model
 * {content}<end_of_turn>
 * 
 * Note: Gemma uses "model" instead of "assistant"
 */
export const gemmaChatTemplate: ChatTemplateFormatter = (messages) => {
  let prompt = "<bos>";

  for (const msg of messages) {
    const role = msg.role === "assistant" ? "model" : msg.role;
    prompt += `<start_of_turn>${role}\n`;
    prompt += `${msg.content}<end_of_turn>\n`;
  }

  // Add model prompt to trigger generation
  prompt += "<start_of_turn>model\n";

  return prompt;
};

/**
 * DeepSeek Coder Chat Template
 * Used by: DeepSeek-Coder-7B
 * 
 * Format: Similar to ChatML (Qwen style)
 * <｜begin▁of▁sentence｜>{system_message}
 * 
 * User: {user_message}
 * 
 * Assistant:
 */
export const deepseekChatTemplate: ChatTemplateFormatter = (messages) => {
  let prompt = "";
  const systemMsg = messages.find((m) => m.role === "system");

  if (systemMsg) {
    prompt += `<｜begin▁of▁sentence｜>${systemMsg.content}\n\n`;
  }

  for (const msg of messages) {
    if (msg.role === "system") continue; // Already handled

    if (msg.role === "user") {
      prompt += `User: ${msg.content}\n\n`;
    } else if (msg.role === "assistant") {
      prompt += `Assistant: ${msg.content}\n\n`;
    }
  }

  // Add assistant prompt to trigger generation
  if (!messages[messages.length - 1] || messages[messages.length - 1]!.role !== "assistant") {
    prompt += "Assistant:";
  }

  return prompt;
};

/**
 * Template registry - maps template IDs to formatter functions
 */
export const CHAT_TEMPLATE_REGISTRY: Record<string, ChatTemplateFormatter> = {
  llama: llamaChatTemplate,
  qwen: qwenChatTemplate,
  mistral: mistralChatTemplate,
  phi: phiChatTemplate,
  gemma: gemmaChatTemplate,
  deepseek: deepseekChatTemplate,
};

/**
 * Get chat template formatter by ID
 */
export function getChatTemplate(templateId: string): ChatTemplateFormatter {
  const template = CHAT_TEMPLATE_REGISTRY[templateId];
  if (!template) {
    console.warn(`Chat template "${templateId}" not found, falling back to Llama template`);
    return llamaChatTemplate;
  }
  return template;
}

/**
 * Format messages using specified template
 */
export function formatChatMessages(
  templateId: string,
  messages: ChatMessage[]
): string {
  const formatter = getChatTemplate(templateId);
  return formatter(messages);
}
