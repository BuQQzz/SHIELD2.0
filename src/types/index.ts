export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

export interface LLMConfig {
  modelPath: string;
  contextSize: number;
  temperature: number;
  topP: number;
  topK: number;
}

export interface ToolPermission {
  toolId: string;
  toolName: string;
  granted: boolean;
  timestamp: Date;
}
