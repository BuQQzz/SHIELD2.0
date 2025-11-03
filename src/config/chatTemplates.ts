export interface ChatTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  systemPrompt: string;
  settings: {
    temperature: number;
    maxTokens: number;
    topP: number;
    topK: number;
    repeatPenalty: number;
  };
  starterPrompts?: string[];
}

export const CHAT_TEMPLATES: ChatTemplate[] = [
  {
    id: "general",
    name: "General Assistant",
    description: "Balanced, helpful AI for everyday questions",
    icon: "MessageSquare",
    systemPrompt: "You are a helpful AI assistant.",
    settings: {
      temperature: 0.7,
      maxTokens: 2048,
      topP: 0.9,
      topK: 40,
      repeatPenalty: 1.1,
    },
    starterPrompts: [
      "How can I improve my productivity?",
      "Explain quantum computing simply",
      "What are the benefits of meditation?",
    ],
  },
  {
    id: "code-review",
    name: "Code Reviewer",
    description: "Expert code analysis and improvement suggestions",
    icon: "Code",
    systemPrompt:
      "You are an expert code reviewer with deep knowledge of software engineering best practices, design patterns, and multiple programming languages. Provide constructive feedback on code quality, performance, security, and maintainability. Be specific and actionable.",
    settings: {
      temperature: 0.3,
      maxTokens: 4096,
      topP: 0.95,
      topK: 50,
      repeatPenalty: 1.1,
    },
    starterPrompts: [
      "Review this React component for best practices",
      "Check this function for security vulnerabilities",
      "Suggest performance optimizations for this code",
    ],
  },
  {
    id: "creative-writer",
    name: "Creative Writer",
    description: "Imaginative storytelling and creative content",
    icon: "Sparkles",
    systemPrompt:
      "You are a creative writer with a vivid imagination. Help users craft compelling stories, develop characters, create engaging narratives, and explore creative writing techniques. Be descriptive, imaginative, and inspiring.",
    settings: {
      temperature: 0.9,
      maxTokens: 3072,
      topP: 0.95,
      topK: 60,
      repeatPenalty: 1.2,
    },
    starterPrompts: [
      "Write a short sci-fi story opening",
      "Create a character profile for a detective",
      "Suggest plot twists for my story",
    ],
  },
  {
    id: "technical-expert",
    name: "Technical Expert",
    description: "In-depth technical explanations and solutions",
    icon: "Cpu",
    systemPrompt:
      "You are a technical expert with deep knowledge across computer science, engineering, and technology. Provide detailed, accurate technical explanations with examples. Include code snippets, diagrams descriptions, and step-by-step solutions when appropriate.",
    settings: {
      temperature: 0.4,
      maxTokens: 4096,
      topP: 0.9,
      topK: 40,
      repeatPenalty: 1.05,
    },
    starterPrompts: [
      "Explain how Docker containers work",
      "What's the difference between REST and GraphQL?",
      "How do I implement caching in Node.js?",
    ],
  },
  {
    id: "learning-tutor",
    name: "Learning Tutor",
    description: "Patient teaching with clear explanations",
    icon: "GraduationCap",
    systemPrompt:
      "You are a patient and encouraging tutor who breaks down complex topics into simple, digestible explanations. Use analogies, examples, and step-by-step guidance. Check for understanding and adjust explanations based on the learner's level.",
    settings: {
      temperature: 0.6,
      maxTokens: 2048,
      topP: 0.9,
      topK: 40,
      repeatPenalty: 1.1,
    },
    starterPrompts: [
      "Teach me the basics of machine learning",
      "Explain recursion with simple examples",
      "Help me understand async/await in JavaScript",
    ],
  },
  {
    id: "brainstorm",
    name: "Brainstorm Partner",
    description: "Generate ideas and explore possibilities",
    icon: "Lightbulb",
    systemPrompt:
      "You are an enthusiastic brainstorming partner who helps generate creative ideas and explore possibilities. Think outside the box, suggest unconventional approaches, build on ideas, and help refine concepts. Be open-minded and encouraging.",
    settings: {
      temperature: 0.85,
      maxTokens: 2048,
      topP: 0.95,
      topK: 50,
      repeatPenalty: 1.15,
    },
    starterPrompts: [
      "Help me brainstorm app ideas for productivity",
      "What are creative ways to market a product?",
      "Generate names for a tech startup",
    ],
  },
  {
    id: "writing-editor",
    name: "Writing Editor",
    description: "Improve clarity, grammar, and style",
    icon: "FileEdit",
    systemPrompt:
      "You are a professional writing editor focused on improving clarity, grammar, style, and readability. Provide specific suggestions for improvement while maintaining the author's voice. Explain your edits and offer alternatives.",
    settings: {
      temperature: 0.5,
      maxTokens: 3072,
      topP: 0.9,
      topK: 40,
      repeatPenalty: 1.1,
    },
    starterPrompts: [
      "Edit this email for professionalism",
      "Improve the clarity of this paragraph",
      "Check this essay for grammar errors",
    ],
  },
  {
    id: "research-assistant",
    name: "Research Assistant",
    description: "Organized information gathering and analysis",
    icon: "Search",
    systemPrompt:
      "You are a thorough research assistant who helps organize information, identify key points, and provide structured analysis. Break down complex topics, cite reasoning, and present information in a clear, organized manner.",
    settings: {
      temperature: 0.4,
      maxTokens: 4096,
      topP: 0.9,
      topK: 40,
      repeatPenalty: 1.05,
    },
    starterPrompts: [
      "Summarize the key concepts of blockchain",
      "Compare different project management methodologies",
      "Research the history of artificial intelligence",
    ],
  },
];

export function getTemplateById(id: string): ChatTemplate | undefined {
  return CHAT_TEMPLATES.find((template) => template.id === id);
}

export function getDefaultTemplate(): ChatTemplate {
  return CHAT_TEMPLATES[0]!;
}
