"use client";

import { motion } from "framer-motion";
import { FolderOpen, Library, Loader2, Play } from "lucide-react";
import { folderName } from "@/lib/sessions";
import { osName } from "@/utils/platform";

const SUGGESTED_PROMPTS = [
  "What can you help me with?",
  "Explain how you work",
];

const CODE_PROMPTS = [
  "What's in this project?",
  "Look for bugs and list them by severity",
];

interface ChatPlaceholderProps {
  modelLoaded: boolean;
  isLoading: boolean;
  /** The selected model when none is loaded yet, offered with one click */
  selectedModelName?: string;
  onLoadSelected?: () => void;
  onOpenLibrary?: () => void;
  onPromptClick?: (prompt: string) => void;
  /** A Code session: it works in a project folder, chosen here if unset */
  code?: { folder?: string; onChooseFolder: () => void };
}

/**
 * Nothing is loaded until the user asks (Settings > Model can load the last
 * model at startup), so without a model this offers one instead of example
 * prompts that could not be answered.
 */
function ModelPrompt({
  isLoading,
  selectedModelName,
  onLoadSelected,
  onOpenLibrary,
}: Omit<ChatPlaceholderProps, "modelLoaded" | "onPromptClick">) {
  if (isLoading) {
    return (
      <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading {selectedModelName ?? "model"}…
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-sm text-muted-foreground">
        {selectedModelName
          ? "No model loaded. It takes GPU and system memory, so SHIELD loads one when you ask."
          : "No model installed yet."}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {selectedModelName && onLoadSelected && (
          <button
            onClick={onLoadSelected}
            className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Play className="h-3.5 w-3.5" />
            Load {selectedModelName}
          </button>
        )}
        {onOpenLibrary && (
          <button
            onClick={onOpenLibrary}
            className="flex h-9 items-center gap-2 rounded-lg border border-border/80 px-4 text-sm transition-colors hover:bg-accent"
          >
            <Library className="h-3.5 w-3.5" />
            {selectedModelName ? "Choose another" : "Open the Model Library"}
          </button>
        )}
      </div>
    </div>
  );
}

export function ChatPlaceholder({
  modelLoaded,
  isLoading,
  selectedModelName,
  onLoadSelected,
  onOpenLibrary,
  onPromptClick,
  code,
}: ChatPlaceholderProps) {
  const prompts = code ? CODE_PROMPTS : SUGGESTED_PROMPTS;
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
        <img
          src="./shield-logo.png"
          alt="SHIELD Logo"
          className="h-32 w-32 object-contain mb-4"
        />
        <div className="text-center">
          <p className="text-muted-foreground">
            {!code
              ? `Privacy-first AI Assistant for ${osName()}`
              : code.folder
                ? `Working in ${folderName(code.folder)}`
                : "A code session works in one project folder"}
          </p>
        </div>
      </motion.div>

      {/* Suggested Prompts, or a model to load first */}
      {!modelLoaded ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-8 w-full max-w-2xl"
        >
          <ModelPrompt
            isLoading={isLoading}
            selectedModelName={selectedModelName}
            onLoadSelected={onLoadSelected}
            onOpenLibrary={onOpenLibrary}
          />
        </motion.div>
      ) : code && !code.folder ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-8 flex justify-center"
        >
          <button
            onClick={code.onChooseFolder}
            className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Choose a project folder
          </button>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-8 w-full max-w-2xl"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {prompts.map((prompt, index) => (
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
      )}
    </motion.div>
  );
}
