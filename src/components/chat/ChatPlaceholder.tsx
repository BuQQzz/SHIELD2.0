"use client";

import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

const SUGGESTED_PROMPTS = [
  "Help me organize my files",
  "What can you help me with?",
  "Search my documents for...",
  "Explain how you work",
];

export function ChatPlaceholder() {
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
        </div>
      </div>

      {/* Suggested Prompts */}
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
            >
              {prompt}
            </Button>
          ))}
        </div>
      </div>

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
