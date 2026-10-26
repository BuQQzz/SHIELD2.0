"use client";

import {
  useState,
  useRef,
  KeyboardEvent,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Send, Square } from "lucide-react";
import { motion } from "framer-motion";
import { PermissionModeSelector } from "./PermissionModeSelector";
import { WorkspaceSelector } from "./WorkspaceSelector";
import { TeamToggle } from "./TeamToggle";
import type { TeamAvailability } from "@/agents/teamFit";
import { ContextRing } from "./ContextRing";

interface ChatInputProps {
  onSend: (message: string) => void;
  isGenerating?: boolean;
  onStop?: () => void;
  disabled?: boolean;
  /** A Code session: show its project folder (chats have no file tools) */
  showFolder?: boolean;
  /** Whether the model in use can lead an agent team (see TeamToggle) */
  teamAvailability?: TeamAvailability;
  modelId?: string;
  modelName?: string;
}

export interface ChatInputRef {
  focus: () => void;
  /** Put text back in the box, before what is there (unsent steer) */
  restore: (text: string) => void;
}

export const ChatInput = forwardRef<ChatInputRef, ChatInputProps>(
  function ChatInput(
    {
      onSend,
      isGenerating = false,
      onStop,
      disabled = false,
      showFolder,
      teamAvailability,
      modelId,
      modelName,
    },
    ref
  ) {
    const [input, setInput] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Expose focus method via ref
    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      restore: (text: string) =>
        setInput((current) => (current ? `${text}\n\n${current}` : text)),
    }));

    // Auto-focus on mount and when not generating
    useEffect(() => {
      if (!isGenerating && !disabled && textareaRef.current) {
        textareaRef.current.focus();
      }
    }, [isGenerating, disabled]);

    const handleSubmit = () => {
      console.log(
        "[ChatInput] handleSubmit called, input:",
        input.substring(0, 50)
      );
      console.log(
        "[ChatInput] isGenerating:",
        isGenerating,
        "disabled:",
        disabled
      );

      // While a turn runs, a message steers it (handlers/steer.ts)
      if (input.trim() && !disabled) {
        onSend(input.trim());
        setInput("");
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
          // Re-focus after sending
          setTimeout(() => textareaRef.current?.focus(), 0);
        }
      } else {
        console.warn(
          "[ChatInput] Cannot submit - input:",
          input.length,
          "isGenerating:",
          isGenerating,
          "disabled:",
          disabled
        );
      }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    };

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      // Auto-resize textarea
      e.target.style.height = "auto";
      e.target.style.height = `${e.target.scrollHeight}px`;
    };

    return (
      <div className="bg-background p-4">
        <div className="mx-auto max-w-3xl">
          <div className="relative flex items-end gap-2 rounded-xl bg-muted/50 p-2 shadow-sm ring-1 ring-black/5 transition-shadow focus-within:shadow-md dark:bg-muted/30 dark:ring-white/5">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={
                isGenerating
                  ? "Add to the task while it works... (it reads this after its next step)"
                  : "Type your message... (Shift+Enter for new line)"
              }
              rows={1}
              className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
              disabled={disabled}
            />

            {isGenerating && input.trim() && (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={handleSubmit}
                disabled={disabled}
                className="shrink-0 rounded-md p-2 transition-colors"
                aria-label="Send while it works"
                title="Send while it works: it reads this after its next step"
              >
                <Send className="h-5 w-5 text-primary transition-colors" />
              </motion.button>
            )}
            {isGenerating ? (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={onStop}
                className="shrink-0 rounded-md p-2 transition-colors"
              >
                <Square className="h-5 w-5 text-destructive transition-colors" />
              </motion.button>
            ) : (
              <motion.button
                whileTap={{ scale: 0.92 }}
                whileHover={{ scale: 1.08 }}
                onClick={handleSubmit}
                disabled={!input.trim() || disabled}
                className="shrink-0 rounded-md p-2 transition-colors disabled:cursor-not-allowed"
              >
                <Send
                  className={`h-5 w-5 transition-colors ${
                    !input.trim() || disabled
                      ? "text-muted-foreground/40"
                      : "text-primary"
                  }`}
                />
              </motion.button>
            )}
          </div>

          {/* Permission mode and folder sit under the composer: visible while
              typing, out of the way of the send action. */}
          <div className="mt-1 flex min-w-0 items-center gap-1 px-1">
            <PermissionModeSelector />
            {showFolder && <WorkspaceSelector />}
            {showFolder && (
              <TeamToggle
                availability={teamAvailability}
                modelId={modelId}
                modelName={modelName}
              />
            )}
            <ContextRing />
          </div>
        </div>
      </div>
    );
  }
);
