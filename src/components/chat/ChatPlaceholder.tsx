"use client";

import { Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const SUGGESTED_PROMPTS = [
  "Help me organize my files",
  "What can you help me with?",
  "Search my documents for...",
  "Explain how you work",
];

interface ChatPlaceholderProps {
  modelLoaded: boolean;
  isLoading: boolean;
  onPromptClick?: (prompt: string) => void;
}

export function ChatPlaceholder({
  modelLoaded,
  isLoading,
  onPromptClick,
}: ChatPlaceholderProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      {/* Logo */}
      <div className="mb-6 flex flex-col items-center gap-4">
        <Shield className="h-24 w-24 text-primary" />
        <div className="text-center">
          <h1 className="text-3xl font-bold">SHIELD 2.0</h1>
          <p className="mt-2 text-muted-foreground">
            Privacy-first AI Assistant for Windows
          </p>
          {isLoading && (
            <div className="mt-4 flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium">Loading AI model...</p>
                <p className="mt-1 text-xs">This may take a few minutes on first run</p>
                <p className="mt-1 text-xs opacity-70">
                  Downloading and initializing Qwen 7B (4.2GB)
                </p>
              </div>
            </div>
          )}
          {!isLoading && !modelLoaded && (
            <div className="mt-3 text-sm text-muted-foreground">
              <p>Initializing...</p>
            </div>
          )}
        </div>
      </div>

      {/* Suggested Prompts - only show when model is ready */}
      {modelLoaded && !isLoading && (
        <div className="mt-8 w-full max-w-2xl">
          <h2 className="mb-4 text-center text-sm font-medium text-muted-foreground">
            Try asking me about:
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {SUGGESTED_PROMPTS.map((prompt, index) => (
              <Button
                key={index}
                variant="outline"
                className="h-auto justify-start whitespace-normal p-4 text-left"
                onClick={() => onPromptClick?.(prompt)}
              >
                {prompt}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="mt-12 max-w-md text-center text-xs text-muted-foreground">
        <p>
          All AI processing happens locally on your machine. Your data never
          leaves your device.
        </p>
      </div>
    </div>
  );
}
