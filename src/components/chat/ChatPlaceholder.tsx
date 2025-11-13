"use client";

import { Shield } from "lucide-react";
import { motion } from "framer-motion";

const SUGGESTED_PROMPTS = [
  "What can you help me with?",
  "Explain how you work",
];

interface ChatPlaceholderProps {
  modelLoaded: boolean;
  isLoading: boolean;
  onPromptClick?: (prompt: string) => void;
}

export function ChatPlaceholder({ onPromptClick }: ChatPlaceholderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex h-full flex-col items-center justify-center p-8"
    >
      {/* Logo */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mb-6 flex flex-col items-center gap-4"
      >
        <Shield className="h-16 w-16 text-primary" />
        <div className="text-center">
          <h1 className="text-3xl font-bold">SHIELD 2.0</h1>
          <p className="mt-2 text-muted-foreground">
            Privacy-first AI Assistant for Windows
          </p>
        </div>
      </motion.div>

      {/* Suggested Prompts */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="mt-8 w-full max-w-2xl"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {SUGGESTED_PROMPTS.map((prompt, index) => (
            <motion.button
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.5 + index * 0.1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onPromptClick?.(prompt)}
              className="h-auto justify-start whitespace-normal rounded-md bg-background p-4 text-left transition-colors hover:bg-accent"
            >
              {prompt}
            </motion.button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
